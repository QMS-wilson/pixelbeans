// 拼豆卡密后端 - Cloudflare Worker + Durable Object 版
// 与 card-backend/server.js 功能等价：
// - 数据存储：Durable Object 事务性键值（cards/logs/freeTrials，JSON 格式不变，无数据库、无需开通 R2）
// - 两段式下载临时文件：DO 实例内存（10 分钟过期）
// - AI 优化：直连火山引擎（签名逻辑一致）

import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import {
  setStorageAdapter,
  configure,
  loadStore,
  readCardStore,
  writeCardStore,
  flushStore,
  upgradeCardStore,
  getAuthorizedCard,
  buildAccessPayload,
  appendCardLog,
  assertCardAction,
  consumeCardAction,
  normalizeImageHash,
  sha256,
  sanitizeCardCode,
  findCardByCode,
  makeCardCode,
  encodeAccessToken,
  requireAdmin,
  getFreeTrialStatus,
  consumeFreeTrial,
  getFreeTrialStatusByIp,
  consumeFreeTrialByIp,
  bindCardImage,
  setAccessCookie,
  clearAccessCookie,
} from "./card-service.js";

let workerEnv = null;

const VOLC_API_HOST = "visual.volcengineapi.com";
const VOLC_API_REGION = "cn-north-1";
const VOLC_API_SERVICE = "cv";
let activeOptimization = null;

// 简单内存限流：按脱敏 IP 限制敏感接口的请求频率（管理台、兑换、免费试用）。
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const rateBuckets = new Map();

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return String(request.socket?.remoteAddress || "");
}

function isRateLimited(request, scope, maxPerWindow) {
  const ip = getClientIp(request);
  if (!ip) return false;
  const now = Date.now();
  const key = `${scope}:${ip}`;
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  if (bucket.count > maxPerWindow) return true;
  if (rateBuckets.size > 5000) {
    for (const [k, b] of rateBuckets) {
      if (now - b.startedAt >= RATE_LIMIT_WINDOW_MS) rateBuckets.delete(k);
    }
  }
  return false;
}

const DEFAULT_PROMPT =
  "将图片优化为适合拼豆图纸的形象：保留主体特征，透明背景，chibi 可爱画风，pixel art style, 16-bit, retro game aesthetic, sharp focus, high contrast, clean lines, detailed pixel art, masterpiece, best quality";

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// ---------- 火山引擎签名（与原 server.js 一致） ----------

function getDateTimeNow() {
  return new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function uriEscape(value) {
  return encodeURIComponent(value)
    .replace(/[^A-Za-z0-9_.~\-%]+/g, (char) => char)
    .replace(/[*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function queryParamsToString(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${uriEscape(key)}=${uriEscape(params[key])}`)
    .join("&");
}

function getSignHeaders(headers) {
  const keys = Object.keys(headers)
    .filter((key) => !["authorization", "content-length", "content-type", "user-agent"].includes(key.toLowerCase()))
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));
  const signedHeaders = keys.map((key) => key.toLowerCase()).join(";");
  const canonicalHeaders = keys
    .map((key) => `${key.toLowerCase()}:${String(headers[key]).trim().replace(/\s+/g, " ")}`)
    .join("\n");
  return { signedHeaders, canonicalHeaders };
}

function generateSignature({ method, pathName, query, headers, bodySha, accessKeyId, secretAccessKey }) {
  const datetime = headers["X-Date"] || headers["x-date"];
  const date = datetime.substring(0, 8);
  const { signedHeaders, canonicalHeaders } = getSignHeaders(headers);
  const canonicalRequest = [
    method.toUpperCase(),
    pathName,
    queryParamsToString(query),
    `${canonicalHeaders}\n`,
    signedHeaders,
    bodySha || sha256(""),
  ].join("\n");

  const credentialScope = [date, VOLC_API_REGION, VOLC_API_SERVICE, "request"].join("/");
  const stringToSign = ["HMAC-SHA256", datetime, credentialScope, sha256(canonicalRequest)].join("\n");
  const kDate = hmac(secretAccessKey, date);
  const kRegion = hmac(kDate, VOLC_API_REGION);
  const kService = hmac(kRegion, VOLC_API_SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return [
    "HMAC-SHA256",
    `Credential=${accessKeyId}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`,
  ].join(" ");
}

function normalizeProviderError(status, text) {
  if (text.includes("50430") || text.includes("Concurrent Limit")) {
    return "当前已有 AI 优化任务在处理中，请等待一个任务完成后再试。";
  }
  if (text.includes("50400") || text.includes("Access Denied")) {
    return "鉴权失败，请确认 AccessKey/SecretKey 配置正确，并已开通 jimeng_t2i_v40 权限。";
  }
  if (text.includes("50411") || text.includes("Risk")) {
    return "图片未通过内容安全检测，请更换一张图片后再试。";
  }
  return `AI 优化接口失败：${status} ${text}`;
}

async function callVolc(action, requestBody) {
  const accessKeyId = workerEnv?.VOLC_ACCESS_KEY_ID;
  const secretAccessKey = workerEnv?.VOLC_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("缺少鉴权密钥，请配置 VOLC_ACCESS_KEY_ID 和 VOLC_SECRET_ACCESS_KEY。");
  }

  const body = JSON.stringify(requestBody);
  const query = {
    Action: action,
    Version: "2022-08-31",
  };
  const xDate = getDateTimeNow();
  const headers = {
    host: VOLC_API_HOST,
    "X-Date": xDate,
    "content-type": "application/json",
  };
  const authorization = generateSignature({
    method: "POST",
    pathName: "/",
    query,
    headers,
    bodySha: sha256(body),
    accessKeyId,
    secretAccessKey,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(`https://${VOLC_API_HOST}/?${queryParamsToString(query)}`, {
      method: "POST",
      headers: {
        ...headers,
        Authorization: authorization,
        "Content-Length": Buffer.byteLength(body).toString(),
      },
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("AI 优化接口请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(normalizeProviderError(response.status, responseText));
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(`AI 优化接口返回异常：${responseText}`);
  }

  if (data.status && data.status !== 10000) {
    throw new Error(normalizeProviderError(response.status, responseText));
  }

  return data;
}

async function imageUrlToDataUrl(imageUrl) {
  if (imageUrl.startsWith("data:")) return imageUrl;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(imageUrl, { signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("AI 优化结果拉取超时，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`AI 优化结果拉取失败：${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function optimizeImage(imageBase64, prompt = DEFAULT_PROMPT) {
  const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
  const submitResult = await callVolc("CVSync2AsyncSubmitTask", {
    req_key: "jimeng_t2i_v40",
    binary_data_base64: [base64Data],
    prompt,
    scale: 0.5,
    force_single: true,
  });

  const taskId = submitResult.data?.task_id || submitResult.task_id;
  if (!taskId) {
    throw new Error("AI 优化任务提交失败：未返回 task_id。");
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const result = await callVolc("CVSync2AsyncGetResult", {
      req_key: "jimeng_t2i_v40",
      task_id: taskId,
      req_json: JSON.stringify({ return_url: true }),
    });

    const taskStatus = result.data?.task_status || result.data?.status;
    if (taskStatus === "success" || taskStatus === "done") {
      const imageUrl = result.data?.images?.[0]?.url || result.data?.image_urls?.[0];
      const imageBase64Result = result.data?.binary_data_base64?.[0];
      if (imageBase64Result) return { imageUrl: `data:image/jpeg;base64,${imageBase64Result}`, taskId };
      if (imageUrl) return { imageUrl: await imageUrlToDataUrl(imageUrl), taskId };
      throw new Error("AI 优化完成，但没有返回图片。");
    }

    if (taskStatus === "failed") {
      throw new Error(result.message || "AI 优化任务失败。");
    }
  }

  throw new Error("AI 优化超时，请稍后重试。");
}

// ---------- 请求体读取 ----------

const MAX_SMALL_BODY_BYTES = 1 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 16 * 1024 * 1024;
const MAX_DOWNLOAD_BODY_BYTES = 40 * 1024 * 1024;

function bodyTooLargeError() {
  const error = new Error("请求体过大，请减小内容后重试。");
  error.statusCode = 413;
  return error;
}

function invalidJsonError() {
  const error = new Error("请求体不是合法的 JSON。");
  error.statusCode = 400;
  return error;
}

async function readBodyLimited(request, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) throw bodyTooLargeError();
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request, maxBytes = MAX_SMALL_BODY_BYTES) {
  const raw = await readBodyLimited(request, maxBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw invalidJsonError();
  }
}

async function readRequestBodyAsText(request, maxBytes = MAX_DOWNLOAD_BODY_BYTES) {
  return readBodyLimited(request, maxBytes);
}

// ---------- CORS / 响应 ----------

function getExtraAllowedOrigins() {
  return String(workerEnv?.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins() {
  const set = new Set([
    "http://127.0.0.1:8789",
    "http://localhost:8789",
    "http://127.0.0.1:9090",
    "http://localhost:9090",
    "http://127.0.0.1:80",
    "http://localhost:80",
    "http://114.134.186.36",
    "http://114.134.186.36:9090",
    ...getExtraAllowedOrigins(),
  ]);
  return set;
}

function getCorsOrigin(request) {
  const origin = String(request?.headers?.origin || "").trim();
  if (origin && getAllowedOrigins().has(origin)) return origin;
  return null;
}

function buildCorsHeaders(request, extra = {}) {
  const origin = getCorsOrigin(request);
  if (!origin) return extra;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    ...extra,
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...buildCorsHeaders(response.req, {
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, x-admin-key",
    }),
  });
  response.end(JSON.stringify(payload));
}

function sendJsonWithHeaders(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...buildCorsHeaders(response.req, {
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, x-admin-key",
      ...extraHeaders,
    }),
  });
  response.end(JSON.stringify(payload));
}

function buildContentDisposition(filename) {
  const sanitized = filename.replace(/[\r\n"\\/]/g, "_");
  const safeFilename = sanitized.replace(/[^\x20-\x7E]/g, "_") || "download";
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encoded}`;
}

// ---------- 两段式下载临时文件（DO 实例内存，10 分钟过期） ----------

const DOWNLOAD_TMP_TTL_MS = 10 * 60 * 1000;
const downloadTmp = new Map();

function cleanStaleDownloadFiles() {
  const now = Date.now();
  for (const [key, entry] of downloadTmp) {
    if (now - entry.createdAt > DOWNLOAD_TMP_TTL_MS) {
      downloadTmp.delete(key);
    }
  }
}

function putDownloadTmp(fileId, ext, buffer) {
  cleanStaleDownloadFiles();
  downloadTmp.set(`${fileId}${ext}`, { buffer, createdAt: Date.now() });
}

function getDownloadTmp(fileId) {
  const candidates = [fileId, `${fileId}.png`, `${fileId}.csv`];
  for (const key of candidates) {
    const entry = downloadTmp.get(key);
    if (entry) {
      if (Date.now() - entry.createdAt <= DOWNLOAD_TMP_TTL_MS) {
        const ext = key.endsWith(".csv") ? ".csv" : key.endsWith(".png") ? ".png" : "";
        return { buffer: entry.buffer, ext };
      }
      downloadTmp.delete(key);
    }
  }
  return null;
}

// ---------- 各 API 处理 ----------

async function handleDownload(request, response) {
  const corsHeaders = buildCorsHeaders(request, {
    "access-control-expose-headers": "Content-Disposition",
  });

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...corsHeaders,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    response.end();
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8", ...corsHeaders });
    response.end(JSON.stringify({ error: "Method not allowed", message: "Method not allowed" }));
    return;
  }

  try {
    const raw = await readRequestBodyAsText(request, MAX_DOWNLOAD_BODY_BYTES);
    const contentType = String(request.headers["content-type"] || "").split(";")[0].trim();
    let params;
    if (contentType === "application/json") {
      try {
        params = new URLSearchParams(
          Object.entries(JSON.parse(raw) || {}).map(([key, value]) => [key, String(value || "")]),
        );
      } catch {
        throw invalidJsonError();
      }
    } else {
      params = new URLSearchParams(raw);
    }
    const accessToken = params.get("accessToken") || "";
    const filenameRaw = params.get("filename") || "export";
    const imageHash = params.get("imageHash") || "";
    const filename = filenameRaw.replace(/[/\\\r\n\0]/g, "_");
    const authorized = getAuthorizedCard(request, accessToken);
    if (!authorized) {
      response.writeHead(403, { "content-type": "application/json; charset=utf-8", ...corsHeaders });
      response.end(JSON.stringify({ error: "Access denied", message: "Access denied" }));
      return;
    }
    const allowed = assertCardAction(authorized.card, imageHash, "download");
    if (!allowed.ok) {
      writeCardStore(authorized.store);
      response.writeHead(allowed.status, { "content-type": "application/json; charset=utf-8", ...corsHeaders });
      response.end(JSON.stringify({ error: "Download denied", message: allowed.message }));
      return;
    }
    const bindResult = bindCardImage(authorized.card, allowed.imageHash);
    if (!bindResult.ok) {
      writeCardStore(authorized.store);
      sendJson(response, bindResult.status, { error: "Download denied", message: bindResult.message });
      return;
    }

    const dataUrl = params.get("dataUrl");
    const text = params.get("text");

    if (dataUrl) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        response.writeHead(400, { "content-type": "application/json; charset=utf-8", ...corsHeaders });
        response.end(JSON.stringify({ error: "Invalid dataUrl", message: "Invalid dataUrl" }));
        return;
      }
      const mime = match[1] || "application/octet-stream";
      const b64 = match[2];
      const buffer = Buffer.from(b64, "base64");
      const contentDisposition = buildContentDisposition(`${filename}.png`);
      response.writeHead(200, {
        "content-type": mime,
        "content-disposition": contentDisposition,
        "cache-control": "no-store",
        "content-length": buffer.length.toString(),
        ...corsHeaders,
      });
      consumeCardAction(authorized.card, "download");
      appendCardLog(authorized.store, request, {
        type: "download",
        cardCode: authorized.card.code,
        imageHash: authorized.card.imageHash || allowed.imageHash,
        detail: `${filename}.png`,
      });
      writeCardStore(authorized.store);
      response.end(buffer);
      return;
    }

    if (text !== null && text !== undefined) {
      const csvText = text;
      const contentDisposition = buildContentDisposition(`${filename}.csv`);
      response.writeHead(200, {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": contentDisposition,
        "cache-control": "no-store",
        "content-length": Buffer.byteLength(csvText, "utf8").toString(),
        ...corsHeaders,
      });
      consumeCardAction(authorized.card, "download");
      appendCardLog(authorized.store, request, {
        type: "download",
        cardCode: authorized.card.code,
        imageHash: authorized.card.imageHash || allowed.imageHash,
        detail: `${filename}.csv`,
      });
      writeCardStore(authorized.store);
      response.end(Buffer.from(csvText, "utf8"));
      return;
    }

    response.writeHead(400, { "content-type": "application/json; charset=utf-8", ...corsHeaders });
    response.end(JSON.stringify({ error: "Missing data", message: "Missing dataUrl or text" }));
  } catch (err) {
    const statusCode = err?.statusCode || 500;
    response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", ...corsHeaders });
    response.end(
      JSON.stringify({
        error: "Download failed",
        message: err instanceof Error ? err.message : "Internal server error",
      }),
    );
  }
}

async function handleDownloadPrepare(request, response) {
  const corsHeaders = buildCorsHeaders(request, {});
  if (request.method === "OPTIONS") {
    response.writeHead(204, { ...corsHeaders, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" });
    response.end();
    return;
  }
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    if (isRateLimited(request, "download", 30)) {
      sendJson(response, 429, { error: "Too many requests", message: "下载过于频繁，请稍后再试。" });
      return;
    }
    const raw = await readRequestBodyAsText(request, MAX_DOWNLOAD_BODY_BYTES);
    const contentType = String(request.headers["content-type"] || "").split(";")[0].trim();
    let params;
    if (contentType === "application/json") {
      try {
        params = new URLSearchParams(Object.entries(JSON.parse(raw) || {}).map(([key, value]) => [key, String(value || "")]));
      } catch {
        throw invalidJsonError();
      }
    } else {
      params = new URLSearchParams(raw);
    }
    const accessToken = params.get("accessToken") || "";
    const filenameRaw = params.get("filename") || "export";
    const imageHash = params.get("imageHash") || "";
    const filename = filenameRaw.replace(/[/\\\r\n\0]/g, "_");
    const authorized = getAuthorizedCard(request, accessToken);
    if (!authorized) {
      sendJson(response, 403, { error: "Access denied", message: "Access denied" });
      return;
    }
    const allowed = assertCardAction(authorized.card, imageHash, "download");
    if (!allowed.ok) {
      writeCardStore(authorized.store);
      sendJson(response, allowed.status, { error: "Download denied", message: allowed.message });
      return;
    }
    if (!authorized.card.imageHash) authorized.card.imageHash = allowed.imageHash;

    const dataUrl = params.get("dataUrl");
    const text = params.get("text");
    let buffer = null;
    let ext = "";
    let mime = "";
    if (dataUrl) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        sendJson(response, 400, { error: "Invalid dataUrl", message: "Invalid dataUrl" });
        return;
      }
      mime = match[1] || "image/png";
      buffer = Buffer.from(match[2], "base64");
      ext = ".png";
    } else if (text !== null && text !== undefined) {
      buffer = Buffer.from(text, "utf8");
      ext = ".csv";
      mime = "text/csv; charset=utf-8";
    } else {
      sendJson(response, 400, { error: "Missing data", message: "Missing dataUrl or text" });
      return;
    }

    consumeCardAction(authorized.card, "download");
    appendCardLog(authorized.store, request, {
      type: "download",
      cardCode: authorized.card.code,
      imageHash: authorized.card.imageHash || allowed.imageHash,
      detail: `${filename}${ext}`,
    });
    writeCardStore(authorized.store);

    const fileId = crypto.randomUUID();
    putDownloadTmp(fileId, ext, buffer);
    sendJson(response, 200, {
      success: true,
      fileId,
      downloadUrl: `/api/download-file?fileId=${fileId}`,
      mime,
      filename: `${filename}${ext}`,
    });
  } catch (error) {
    sendJson(response, error?.statusCode || 500, {
      error: "Download prepare failed",
      message: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

async function handleDownloadFile(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const fileId = url.searchParams.get("fileId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Invalid fileId" }));
    return;
  }
  const found = getDownloadTmp(fileId);
  if (!found) {
    response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "File not found or expired", message: "下载文件不存在或已过期，请重新导出。" }));
    return;
  }
  const mime = found.ext === ".csv" ? "text/csv; charset=utf-8" : "image/png";
  const contentDisposition = buildContentDisposition(`download${found.ext}`);
  response.writeHead(200, {
    "content-type": mime,
    "content-disposition": contentDisposition,
    "cache-control": "no-store",
    ...buildCorsHeaders(request, {}),
  });
  response.end(found.buffer);
}

async function handleAccessStatus(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const accessToken = url.searchParams.get("accessToken") || undefined;
  const authorized = getAuthorizedCard(request, accessToken);
  const payload = buildAccessPayload(authorized?.card);
  if (authorized?.card) {
    const accessTokenValue = encodeAccessToken({
      paid: authorized.card.status === "active",
      cardCode: authorized.card.code,
      redeemedAt: authorized.card.redeemedAt || authorized.card.usedAt,
    });
    payload.accessToken = accessTokenValue;
  }

  if (!authorized?.card || authorized.card.status !== "active") {
    clearAccessCookie(response);
    sendJsonWithHeaders(response, 200, payload);
    return;
  }

  sendJsonWithHeaders(response, 200, payload);
}

async function handleRedeemCard(request, response) {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    if (isRateLimited(request, "redeem-card", 20)) {
      sendJson(response, 429, { error: "Too many requests", message: "兑换尝试过于频繁，请稍后再试。" });
      return;
    }
    const { cardCode } = await readJsonBody(request);
    const sanitizedCode = sanitizeCardCode(cardCode);
    if (!sanitizedCode) {
      sendJson(response, 400, { error: "Missing card code", message: "请输入有效卡密。" });
      return;
    }

    const store = readCardStore();
    const card = findCardByCode(store, sanitizedCode);
    if (!card) {
      sendJson(response, 404, { error: "Card not found", message: "卡密不存在，请检查后重试。" });
      return;
    }
    if (card.status === "active") {
      sendJson(response, 409, { error: "Card used", message: "该卡密已被使用。" });
      return;
    }
    if (card.status === "exhausted") {
      sendJson(response, 409, { error: "Card exhausted", message: "该卡密已失效，请使用新卡密。" });
      return;
    }

    card.status = "active";
    card.usedAt = new Date().toISOString();
    card.redeemedAt = card.usedAt;
    card.exhaustedAt = "";
    card.imageHash = "";
    card.boundImages = [];
    card.aiOptimizeCount = 0;
    card.downloadCount = 0;
    appendCardLog(store, request, {
      type: "redeem",
      cardCode: card.code,
      detail: "card redeemed",
    });
    writeCardStore(store);
    const tokenPayload = {
      paid: true,
      cardCode: card.code,
      redeemedAt: card.redeemedAt,
    };
    setAccessCookie(response, tokenPayload);
    const accessToken = encodeAccessToken(tokenPayload);
    sendJsonWithHeaders(response, 200, {
      success: true,
      accessToken,
      ...buildAccessPayload(card),
      message: "卡密兑换成功，可开始使用。",
    });
  } catch (error) {
    sendJson(response, error?.statusCode || 500, {
      error: "Redeem failed",
      message: error instanceof Error ? error.message : "兑换失败",
    });
  }
}

async function handleLogoutAccess(_request, response) {
  clearAccessCookie(response);
  sendJson(response, 200, { success: true, paid: false });
}

async function handleCardAdmin(request, response) {
  try {
    if (!requireAdmin(request)) {
      sendJson(response, 403, { error: "Forbidden", message: "管理员密钥无效。" });
      return;
    }
    if (isRateLimited(request, "card-admin", 30)) {
      sendJson(response, 429, { error: "Too many requests", message: "操作过于频繁，请稍后再试。" });
      return;
    }

    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const action = url.pathname.split("/").pop();

    if (request.method === "GET" && action === "list") {
      const store = readCardStore();
      sendJson(response, 200, { cards: store.cards, logs: (store.logs || []).slice().reverse().slice(0, 200) });
      return;
    }

    if (request.method === "POST" && action === "generate") {
      const payload = await readJsonBody(request, MAX_SMALL_BODY_BYTES);
      const count = Math.min(200, Math.max(1, Number(payload.count) || 10));
      const prefix = sanitizeCardCode(payload.prefix || "PB").replace(/-/g, "") || "PB";
      const note = String(payload.note || "").trim();
      const store = readCardStore();
      const codes = new Set(store.cards.map((item) => item.code));
      const created = [];

      while (created.length < count) {
        const code = makeCardCode(prefix.slice(0, 6), 12);
        if (codes.has(code)) continue;
        const card = {
          code,
          status: "unused",
          note,
          createdAt: new Date().toISOString(),
          usedAt: "",
          redeemedAt: "",
          exhaustedAt: "",
          imageHash: "",
          aiOptimizeCount: 0,
          downloadCount: 0,
        };
        store.cards.push(card);
        appendCardLog(store, request, {
          type: "generate",
          cardCode: card.code,
          detail: note || "card generated",
        });
        created.push(card);
        codes.add(code);
      }

      writeCardStore(store);
      sendJson(response, 200, { success: true, cards: created });
      return;
    }

    if (request.method === "POST" && action === "reset") {
      const { cardCode } = await readJsonBody(request, MAX_SMALL_BODY_BYTES);
      const code = sanitizeCardCode(cardCode);
      const store = readCardStore();
      const card = store.cards.find((item) => item.code === code);
      if (!card) {
        sendJson(response, 404, { error: "Card not found" });
        return;
      }
      card.status = "unused";
      card.usedAt = "";
      card.redeemedAt = "";
      card.exhaustedAt = "";
      card.imageHash = "";
      card.boundImages = [];
      card.aiOptimizeCount = 0;
      card.downloadCount = 0;
      appendCardLog(store, request, {
        type: "reset",
        cardCode: card.code,
        detail: "card reset",
      });
      writeCardStore(store);
      sendJson(response, 200, { success: true, card });
      return;
    }

    if (request.method === "POST" && action === "import") {
      const payload = await readJsonBody(request, MAX_JSON_BODY_BYTES);
      if (!payload || !Array.isArray(payload.cards)) {
        sendJson(response, 400, { error: "Invalid payload", message: "缺少 cards 数组。" });
        return;
      }
      const upgraded = upgradeCardStore({
        cards: payload.cards,
        logs: Array.isArray(payload.logs) ? payload.logs : [],
        freeTrials: payload.freeTrials || {},
      });
      writeCardStore(upgraded.store);
      appendCardLog(upgraded.store, request, {
        type: "import",
        cardCode: "",
        detail: `imported ${upgraded.store.cards.length} cards`,
      });
      writeCardStore(upgraded.store);
      sendJson(response, 200, {
        success: true,
        cards: upgraded.store.cards.length,
        logs: upgraded.store.logs.length,
      });
      return;
    }

    sendJson(response, 404, { error: "Unknown admin action" });
  } catch (error) {
    sendJson(response, error?.statusCode || 500, {
      error: "Card admin failed",
      message: error instanceof Error ? error.message : "后台操作失败",
    });
  }
}

async function handleApi(request, response) {
  let currentOptimization = null;

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { imageBase64, prompt, imageHash, accessToken, freeTrial, deviceId } = await readJsonBody(
      request,
      MAX_JSON_BODY_BYTES,
    );
    if (!imageBase64) {
      sendJson(response, 400, { error: "Missing imageBase64 parameter" });
      return;
    }

    const authorized = getAuthorizedCard(request, accessToken);
    const isTrial = !authorized && freeTrial === true;

    let trialStore = null;
    let trialDeviceId = "";
    let trialIpKey = "";
    if (isTrial) {
      if (isRateLimited(request, "free-trial", 3)) {
        sendJson(response, 429, { error: "Too many requests", message: "免费体验请求过于频繁，请稍后再试。" });
        return;
      }
      trialStore = readCardStore();
      const trialStatus = getFreeTrialStatus(trialStore, deviceId);
      const ipKey = getClientIp(request);
      const ipTrialStatus = getFreeTrialStatusByIp(trialStore, ipKey);
      if (!trialStatus || trialStatus.used || (ipTrialStatus && ipTrialStatus.used)) {
        sendJson(response, 403, {
          error: "AI optimization denied",
          message: "免费 AI 体验次数已用完，请兑换卡密后继续使用。",
        });
        return;
      }
      trialDeviceId = trialStatus.deviceId;
      trialIpKey = ipKey;
    } else if (!authorized) {
      sendJson(response, 403, { error: "AI optimization denied", message: "请先兑换卡密后再操作。" });
      return;
    }

    const allowed = isTrial
      ? { ok: true, imageHash: normalizeImageHash(imageHash) }
      : assertCardAction(authorized.card, imageHash, "ai");
    if (!allowed.ok) {
      if (authorized?.store) writeCardStore(authorized.store);
      sendJson(response, allowed.status, { error: "AI optimization denied", message: allowed.message });
      return;
    }
    if (!allowed.imageHash) {
      sendJson(response, 400, { error: "AI optimization denied", message: "未识别到当前图片，请重新上传后重试。" });
      return;
    }
    if (!isTrial) {
      const bindResult = bindCardImage(authorized.card, allowed.imageHash);
      if (!bindResult.ok) {
        writeCardStore(authorized.store);
        sendJson(response, bindResult.status, { error: "AI optimization denied", message: bindResult.message });
        return;
      }
    }

    if (activeOptimization) {
      sendJson(response, 429, {
        error: "AI optimization busy",
        message: "当前已有 AI 优化任务在处理中，请稍后再试。",
      });
      return;
    }

    currentOptimization = optimizeImage(imageBase64, prompt);
    activeOptimization = currentOptimization;
    const result = await currentOptimization;

    if (isTrial) {
      consumeFreeTrial(trialStore, trialDeviceId, allowed.imageHash);
      if (trialIpKey) consumeFreeTrialByIp(trialStore, trialIpKey, allowed.imageHash);
      appendCardLog(trialStore, request, {
        type: "ai_free_trial",
        cardCode: "",
        imageHash: allowed.imageHash,
        detail: "free trial ai optimize",
      });
      writeCardStore(trialStore);
      sendJson(response, 200, { success: true, ...result, freeTrialUsed: true });
      return;
    }

    consumeCardAction(authorized.card, "ai");
    appendCardLog(authorized.store, request, {
      type: "ai_optimize",
      cardCode: authorized.card.code,
      imageHash: authorized.card.imageHash || allowed.imageHash,
      detail: "ai optimize success",
    });
    writeCardStore(authorized.store);
    sendJson(response, 200, { success: true, ...result, ...buildAccessPayload(authorized.card) });
  } catch (error) {
    sendJson(response, error?.statusCode || 500, {
      error: "AI optimization failed",
      message: error instanceof Error ? error.message : "未知错误",
    });
  } finally {
    if (activeOptimization === currentOptimization) {
      activeOptimization = null;
    }
  }
}

// ---------- Node 风格请求/响应适配 ----------

async function toNodeRequest(request) {
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  if (!headers["x-forwarded-for"]) {
    headers["x-forwarded-for"] = request.headers.get("cf-connecting-ip") || "";
  }
  const parsedUrl = new URL(request.url);
  const chunks = [];
  if (request.body) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > 0) chunks.push(new Uint8Array(buffer));
  }
  const nodeReq = {
    method: request.method,
    url: parsedUrl.pathname + parsedUrl.search,
    headers,
    socket: { remoteAddress: request.headers.get("cf-connecting-ip") || "" },
  };
  nodeReq[Symbol.asyncIterator] = async function* () {
    for (const chunk of chunks) yield chunk;
  };
  return nodeReq;
}

class ResponseShim {
  constructor(req) {
    this.req = req;
    this.status = 200;
    this.headers = {};
    this.body = null;
  }

  writeHead(status, headers = {}) {
    this.status = status;
    Object.assign(this.headers, headers);
  }

  setHeader(name, value) {
    this.headers[name] = value;
  }

  end(data) {
    if (data !== undefined && data !== null) this.body = data;
  }

  build() {
    const headers = new Headers();
    for (const [key, value] of Object.entries(this.headers)) {
      headers.set(key, String(value));
    }
    if (this.body === null || this.body === undefined) {
      return new Response(null, { status: this.status, headers });
    }
    return new Response(this.body, { status: this.status, headers });
  }
}

async function dispatch(request, response) {
  if (request.url?.startsWith("/api/")) {
    if (request.method === "OPTIONS") {
      response.writeHead(
        204,
        buildCorsHeaders(request, {
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "Content-Type, x-admin-key",
        }),
      );
      response.end();
      return;
    }
  }

  if (request.url?.startsWith("/api/access-status")) {
    await handleAccessStatus(request, response);
    return;
  }
  if (request.url?.startsWith("/api/redeem-card")) {
    await handleRedeemCard(request, response);
    return;
  }
  if (request.url?.startsWith("/api/logout-access")) {
    await handleLogoutAccess(request, response);
    return;
  }
  if (request.url?.startsWith("/api/card-admin/")) {
    await handleCardAdmin(request, response);
    return;
  }
  if (request.url?.startsWith("/api/download-prepare")) {
    await handleDownloadPrepare(request, response);
    return;
  }
  if (request.url?.startsWith("/api/download-file")) {
    await handleDownloadFile(request, response);
    return;
  }
  if (request.url?.startsWith("/api/download")) {
    await handleDownload(request, response);
    return;
  }
  if (request.url?.startsWith("/api/ai-optimize")) {
    await handleApi(request, response);
    return;
  }

  // 非 API 路径：静态资源（卡密管理台）由 assets 提供，其余返回 404。
  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ error: "Not found", message: "接口不存在，请检查路径。" }));
}

// 入口 Worker：所有请求转发到唯一的 CardStore Durable Object（强一致、免费、无需 R2）。
export default {
  async fetch(request, env) {
    const id = env.CARD_STORE.idFromName("global");
    const stub = env.CARD_STORE.get(id);
    return stub.fetch(request);
  },
};

// 卡密数据 Durable Object：单实例串行处理，内存缓存 + 事务性持久化。
export class CardStore {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const adapter = {
      get: (key) => this.state.storage.get(key),
      put: (key, value) => this.state.storage.put(key, value),
      delete: (key) => this.state.storage.delete(key),
      list: async (options) => {
        const result = await this.state.storage.list(options);
        return { objects: (result.keys || []).map((item) => ({ key: item.name })) };
      },
    };
    workerEnv = this.env;
    setStorageAdapter(adapter);
    configure(this.env);
    await loadStore();

    const nodeReq = await toNodeRequest(request);
    const shim = new ResponseShim(nodeReq);
    try {
      await dispatch(nodeReq, shim);
    } catch (error) {
      shim.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      shim.end(JSON.stringify({ error: "Internal error", message: error instanceof Error ? error.message : "未知错误" }));
    }

    await flushStore();
    return shim.build();
  }
}
