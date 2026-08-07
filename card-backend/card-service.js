import crypto from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACCESS_COOKIE_NAME = "pixel_workshop_access";
const SESSION_SECRET = process.env.CARD_SESSION_SECRET || "pixel-workshop-dev-secret";
const CARD_ADMIN_KEY = process.env.CARD_ADMIN_KEY || "pixel-admin-2026";
const CARD_DIR = path.join(__dirname, "卡密");
const CARD_DATA_PATH = path.join(CARD_DIR, "cards.json");
const BACKUP_DIR = path.join(CARD_DIR, "backup");
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const BACKUP_KEEP = 30;
let lastBackupAt = 0;

// cards.json 自动备份：每 6 小时最多备份一次，保留最近 30 份。
function backupCardStore() {
  const now = Date.now();
  if (now - lastBackupAt < BACKUP_INTERVAL_MS) return;
  try {
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    copyFileSync(CARD_DATA_PATH, path.join(BACKUP_DIR, `cards-backup-${stamp}.json`));
    const backups = readdirSync(BACKUP_DIR)
      .filter((name) => name.startsWith("cards-backup-") && name.endsWith(".json"))
      .sort();
    while (backups.length > BACKUP_KEEP) {
      unlinkSync(path.join(BACKUP_DIR, backups.shift()));
    }
    lastBackupAt = now;
  } catch {
    // 备份失败不影响主流程
  }
}

function ensureCardStore() {
  if (!existsSync(CARD_DIR)) mkdirSync(CARD_DIR, { recursive: true });
  if (!existsSync(CARD_DATA_PATH)) {
    writeFileSync(CARD_DATA_PATH, JSON.stringify({ cards: [], logs: [] }, null, 2), "utf8");
  }
}

function sanitizeCardCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function normalizeCardRecord(card) {
  if (!card || typeof card !== "object") return null;
  const normalizedStatus = card.status === "used" ? "active" : card.status;
  const rawImageHash = normalizeImageHash(card.imageHash);
  const boundImages = Array.isArray(card.boundImages)
    ? card.boundImages.map(normalizeImageHash).filter(Boolean).slice(0, 3)
    : rawImageHash
      ? [rawImageHash]
      : [];
  return {
    code: sanitizeCardCode(card.code),
    status: normalizedStatus === "exhausted" ? "exhausted" : normalizedStatus === "active" ? "active" : "unused",
    note: String(card.note || ""),
    createdAt: card.createdAt || "",
    usedAt: card.usedAt || card.redeemedAt || "",
    redeemedAt: card.redeemedAt || card.usedAt || "",
    exhaustedAt: card.exhaustedAt || "",
    imageHash: boundImages[boundImages.length - 1] || rawImageHash || "",
    boundImages,
    aiOptimizeCount: Number(card.aiOptimizeCount) || 0,
    downloadCount: Number(card.downloadCount) || 0,
  };
}

function normalizeLogRecord(log) {
  if (!log || typeof log !== "object") return null;
  return {
    id: String(log.id || crypto.randomUUID()),
    type: String(log.type || "unknown"),
    cardCode: sanitizeCardCode(log.cardCode || ""),
    imageHash: String(log.imageHash || ""),
    detail: String(log.detail || ""),
    createdAt: log.createdAt || new Date().toISOString(),
    ip: String(log.ip || ""),
    userAgent: String(log.userAgent || ""),
  };
}

function normalizeFreeTrials(freeTrials) {
  const normalized = {};
  if (freeTrials && typeof freeTrials === "object") {
    Object.entries(freeTrials).forEach(([deviceId, trial]) => {
      if (deviceId === "byIp") return; // byIp 单独处理，避免混入普通设备维度
      normalized[String(deviceId)] = {
        count: Math.max(0, Number(trial?.count) || 0),
        lastUsedAt: String(trial?.lastUsedAt || ""),
        imageHash: String(trial?.imageHash || ""),
      };
    });
    // 兼容旧结构：byIp 单独存放 IP 维度限制
    if (freeTrials.byIp && typeof freeTrials.byIp === "object") {
      normalized.byIp = {};
      Object.entries(freeTrials.byIp).forEach(([ipKey, trial]) => {
        normalized.byIp[String(ipKey)] = {
          count: Math.max(0, Number(trial?.count) || 0),
          lastUsedAt: String(trial?.lastUsedAt || ""),
          imageHash: String(trial?.imageHash || ""),
        };
      });
    }
  }
  return normalized;
}

function upgradeCardStore(store) {
  let changed = false;
  const cards = Array.isArray(store?.cards) ? store.cards : [];
  const logs = Array.isArray(store?.logs) ? store.logs : [];
  const freeTrials = normalizeFreeTrials(store?.freeTrials);
  const normalizedCards = cards.map((card) => {
    const normalized = normalizeCardRecord(card);
    if (JSON.stringify(normalized) !== JSON.stringify(card)) changed = true;
    return normalized;
  });
  const normalizedLogs = logs
    .map((log) => normalizeLogRecord(log))
    .filter(Boolean);
  if (!Array.isArray(store?.logs) || JSON.stringify(normalizedLogs) !== JSON.stringify(logs)) changed = true;
  if (!store?.freeTrials || typeof store.freeTrials !== "object" || JSON.stringify(freeTrials) !== JSON.stringify(store.freeTrials)) {
    changed = true;
  }
  return { store: { cards: normalizedCards, logs: normalizedLogs, freeTrials }, changed };
}

function readCardStore() {
  ensureCardStore();
  try {
    const parsed = JSON.parse(readFileSync(CARD_DATA_PATH, "utf8"));
    const upgraded = upgradeCardStore(Array.isArray(parsed.cards) ? parsed : { cards: [] });
    if (upgraded.changed) writeCardStore(upgraded.store);
    return upgraded.store;
  } catch {
    return { cards: [] };
  }
}

function writeCardStore(store) {
  ensureCardStore();
  writeFileSync(CARD_DATA_PATH, JSON.stringify(store, null, 2), "utf8");
  backupCardStore();
}

function maskIpAddress(ip) {
  const raw = String(ip || "").trim();
  if (!raw) return "";

  // IPv4-mapped IPv6（如 ::ffff:1.2.3.4）先还原成 IPv4 再脱敏。
  if (raw.toLowerCase().startsWith("::ffff:")) {
    return maskIpAddress(raw.slice(7));
  }

  if (raw.includes(".")) {
    const parts = raw.split(".");
    if (parts.length === 4) {
      parts[3] = "0";
      return parts.join(".");
    }
    return raw;
  }

  if (raw.includes(":")) {
    const groups = raw.replace(/^\[|\]$/g, "").split(":");
    return `${groups.slice(0, 4).join(":")}::`;
  }

  return raw;
}

function getRequestIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return maskIpAddress(forwarded.split(",")[0]);
  }
  return maskIpAddress(request.socket?.remoteAddress);
}

function appendCardLog(store, request, { type, cardCode = "", imageHash = "", detail = "" }) {
  if (!Array.isArray(store.logs)) store.logs = [];
  store.logs.push(
    normalizeLogRecord({
      type,
      cardCode,
      imageHash,
      detail,
      ip: getRequestIp(request),
      userAgent: String(request.headers["user-agent"] || ""),
    }),
  );
  if (store.logs.length > 1000) {
    store.logs = store.logs.slice(-1000);
  }
}

function sha256(data) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

function signValue(value) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(value, "utf8").digest("hex");
}

function encodeAccessToken(payload) {
  const json = JSON.stringify(payload);
  const base = Buffer.from(json, "utf8").toString("base64url");
  const signature = signValue(base);
  return `${base}.${signature}`;
}

function decodeAccessToken(token) {
  if (!token || !token.includes(".")) return null;
  const [base, signature] = token.split(".");
  if (!base || !signature) return null;
  if (signValue(base) !== signature) return null;
  try {
    return JSON.parse(Buffer.from(base, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return header.split(";").reduce((acc, item) => {
    const [rawKey, ...rawValue] = item.trim().split("=");
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join("=") || "");
    return acc;
  }, {});
}

function getAccessSession(request, accessToken = null) {
  const cookies = parseCookies(request);
  const token = String(accessToken || cookies[ACCESS_COOKIE_NAME] || "");
  return decodeAccessToken(token);
}

function getCookieSameSite() {
  // 前后端同站点部署时用 Lax 即可（端口不影响 SameSite）。
  // 跨站部署（如 API 域名与前端域名不同）时设置 COOKIE_SECURE=true 走 None + Secure。
  return process.env.COOKIE_SECURE === "true" ? "None" : "Lax";
}

function getCookieSecureFlag() {
  return process.env.COOKIE_SECURE === "true" ? "; Secure" : "";
}

function setAccessCookie(response, payload) {
  const token = encodeAccessToken(payload);
  response.setHeader(
    "Set-Cookie",
    `${ACCESS_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=${getCookieSameSite()}${getCookieSecureFlag()}; Max-Age=${60 * 60 * 24 * 30}`,
  );
}

function clearAccessCookie(response) {
  response.setHeader(
    "Set-Cookie",
    `${ACCESS_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=${getCookieSameSite()}${getCookieSecureFlag()}; Max-Age=0`,
  );
}

function findCardByCode(store, code) {
  return store.cards.find((item) => item.code === sanitizeCardCode(code));
}

function getAuthorizedCard(request, accessToken = null) {
  const session = getAccessSession(request, accessToken);
  if (!session?.paid || !session.cardCode) return null;
  const store = readCardStore();
  const card = findCardByCode(store, session.cardCode);
  if (!card) return null;
  return { session, store, card };
}

function getCardRemaining(card) {
  return {
    aiOptimizeCount: Number(card.aiOptimizeCount) || 0,
    downloadCount: Number(card.downloadCount) || 0,
    aiOptimizeRemaining: Math.max(0, 3 - (Number(card.aiOptimizeCount) || 0)),
    downloadRemaining: Math.max(0, 3 - (Number(card.downloadCount) || 0)),
  };
}

function buildAccessPayload(card) {
  if (!card) {
    return {
      paid: false,
      redeemed: false,
      cardCode: "",
      redeemedAt: "",
      cardStatus: "none",
      imageHash: "",
      aiOptimizeCount: 0,
      aiOptimizeRemaining: 0,
      downloadCount: 0,
      downloadRemaining: 0,
      exhausted: false,
    };
  }

  const counters = getCardRemaining(card);
  return {
    paid: card.status === "active",
    redeemed: Boolean(card.redeemedAt || card.usedAt),
    cardCode: card.code || "",
    redeemedAt: card.redeemedAt || card.usedAt || "",
    cardStatus: card.status,
    imageHash: card.imageHash || "",
    aiOptimizeCount: counters.aiOptimizeCount,
    aiOptimizeRemaining: counters.aiOptimizeRemaining,
    downloadCount: counters.downloadCount,
    downloadRemaining: counters.downloadRemaining,
    exhausted: card.status === "exhausted",
  };
}

function exhaustCard(card) {
  card.status = "exhausted";
  card.exhaustedAt = new Date().toISOString();
}

function consumeCardAction(card, actionType) {
  if (actionType === "ai") {
    card.aiOptimizeCount = (Number(card.aiOptimizeCount) || 0) + 1;
    return;
  }

  if (actionType === "download") {
    card.downloadCount = (Number(card.downloadCount) || 0) + 1;
  }
}

function normalizeImageHash(value) {
  return String(value || "").trim();
}

function assertCardAction(card, imageHash, actionType) {
  if (!card) {
    return { ok: false, status: 403, message: "请先兑换卡密后再操作。" };
  }

  if (card.status === "exhausted") {
    return { ok: false, status: 403, message: "当前卡密已失效，请使用新卡密。" };
  }

  if (card.status !== "active") {
    return { ok: false, status: 403, message: "当前卡密尚未激活，请重新兑换。" };
  }

  const normalizedHash = normalizeImageHash(imageHash);
  if (!normalizedHash) {
    return { ok: false, status: 400, message: "未识别到当前图片，请重新上传后重试。" };
  }

  const boundImages = Array.isArray(card.boundImages) ? card.boundImages : [];
  if (boundImages.length >= 3 && !boundImages.includes(normalizedHash)) {
    return { ok: false, status: 409, message: "当前卡密已绑定多张图片（最多 3 张），请更换新卡密。" };
  }

  const currentCount = actionType === "ai" ? Number(card.aiOptimizeCount) || 0 : Number(card.downloadCount) || 0;
  if (currentCount >= 3) {
    exhaustCard(card);
    return { ok: false, status: 403, message: "当前卡密已超过使用上限，现已作废。" };
  }

  return { ok: true, imageHash: normalizedHash };
}

// 把图片指纹绑定到卡密（最多 3 张）；重复绑定同一图幂等。
function bindCardImage(card, imageHash) {
  const normalizedHash = normalizeImageHash(imageHash);
  if (!card || !normalizedHash) return { ok: true };
  if (!Array.isArray(card.boundImages)) card.boundImages = [];
  if (!card.boundImages.includes(normalizedHash)) {
    if (card.boundImages.length >= 3) {
      return { ok: false, status: 409, message: "当前卡密已绑定多张图片（最多 3 张），请更换新卡密。" };
    }
    card.boundImages.push(normalizedHash);
  }
  card.imageHash = normalizedHash;
  return { ok: true };
}

function makeCardCode(prefix = "PB", length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let body = "";
  for (let index = 0; index < length; index += 1) {
    body += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

function getFreeTrialStatus(store, deviceId) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) return null;
  const trial = store?.freeTrials?.[normalizedDeviceId];
  return {
    deviceId: normalizedDeviceId,
    used: Boolean(trial && Number(trial.count) >= 1),
    count: Number(trial?.count) || 0,
  };
}

function consumeFreeTrial(store, deviceId, imageHash) {
  const normalizedDeviceId = String(deviceId || "").trim();
  if (!normalizedDeviceId) return;
  if (!store.freeTrials) store.freeTrials = {};
  store.freeTrials[normalizedDeviceId] = {
    count: (Number(store.freeTrials[normalizedDeviceId]?.count) || 0) + 1,
    lastUsedAt: new Date().toISOString(),
    imageHash: String(imageHash || ""),
  };
}

// IP 维度免费试用：同一 IP 只允许一次，防止伪造 deviceId 无限刷免费 AI。
function getFreeTrialStatusByIp(store, ipKey) {
  const normalizedKey = String(ipKey || "").trim();
  if (!normalizedKey) return null;
  const trial = store?.freeTrials?.byIp?.[normalizedKey];
  return {
    deviceId: `ip:${normalizedKey}`,
    used: Boolean(trial && Number(trial.count) >= 1),
    count: Number(trial?.count) || 0,
  };
}

function consumeFreeTrialByIp(store, ipKey, imageHash) {
  const normalizedKey = String(ipKey || "").trim();
  if (!normalizedKey) return;
  if (!store.freeTrials) store.freeTrials = {};
  if (!store.freeTrials.byIp) store.freeTrials.byIp = {};
  store.freeTrials.byIp[normalizedKey] = {
    count: (Number(store.freeTrials.byIp[normalizedKey]?.count) || 0) + 1,
    lastUsedAt: new Date().toISOString(),
    imageHash: String(imageHash || ""),
  };
}

function requireAdmin(request) {
  // 只接受请求头中的管理员密钥，避免密钥出现在 URL（日志/历史记录/Referrer 泄露）。
  return request.headers["x-admin-key"] === CARD_ADMIN_KEY;
}

export {
  ACCESS_COOKIE_NAME,
  SESSION_SECRET,
  CARD_ADMIN_KEY,
  ensureCardStore,
  normalizeCardRecord,
  normalizeLogRecord,
  upgradeCardStore,
  normalizeFreeTrials,
  getFreeTrialStatus,
  consumeFreeTrial,
  getFreeTrialStatusByIp,
  consumeFreeTrialByIp,
  readCardStore,
  writeCardStore,
  getRequestIp,
  appendCardLog,
  sha256,
  signValue,
  encodeAccessToken,
  decodeAccessToken,
  parseCookies,
  getAccessSession,
  setAccessCookie,
  clearAccessCookie,
  findCardByCode,
  getAuthorizedCard,
  getCardRemaining,
  buildAccessPayload,
  exhaustCard,
  consumeCardAction,
  normalizeImageHash,
  assertCardAction,
  bindCardImage,
  sanitizeCardCode,
  makeCardCode,
  requireAdmin,
};
