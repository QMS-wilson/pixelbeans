import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8789);
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 9090);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function serveStatic(request, response) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const safePath = path.normalize(relativePath).replace(/^([.]{2}[/\\])+/, "");
  const filePath = path.join(__dirname, safePath);

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const basename = path.basename(filePath).toLowerCase();
  if (
    basename.startsWith(".") ||
    basename === "cards.json" ||
    (basename.startsWith("cards-backup-") && basename.endsWith(".json"))
  ) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  // 入口 HTML 不缓存；静态资源带协商缓存（ETag），避免每次全量下载
  const isHtml = path.extname(filePath).toLowerCase() === ".html";
  const stat = statSync(filePath);
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    "content-type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "cache-control": isHtml ? "no-store" : "public, max-age=3600",
    etag,
    ...SECURITY_HEADERS,
  };
  if (!isHtml && request.headers["if-none-match"] === etag) {
    response.writeHead(304, headers);
    response.end();
    return;
  }
  response.writeHead(200, headers);
  createReadStream(filePath).pipe(response);
}

// /api/* 请求代理到卡密后端，让 8789 单端口也能同时访问前端与管理台接口。
function proxyApi(request, response) {
  const proxyRequest = http.request(
    {
      host: "127.0.0.1",
      port: BACKEND_PORT,
      path: request.url,
      method: request.method,
      headers: {
        ...request.headers,
        host: `127.0.0.1:${BACKEND_PORT}`,
      },
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.on("error", () => {
    response.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Backend unavailable", message: "后端服务未启动，请先运行 card-backend 服务。" }));
  });

  request.pipe(proxyRequest);
}

const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/")) {
    proxyApi(request, response);
    return;
  }
  serveStatic(request, response);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`静态前端服务已启动：http://127.0.0.1:${PORT}`);
});
