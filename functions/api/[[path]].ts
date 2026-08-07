interface Env {
  BACKEND_ORIGIN?: string;
}

// 把 /api/* 请求代理到卡密后端（保留方法、请求体、Cookie 与响应头）。
// BACKEND_ORIGIN 在 Cloudflare Pages 项目设置的环境变量中配置，
// 例如 https://api.your-domain.com 或 Cloudflare Tunnel 地址。
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const backendOrigin = env.BACKEND_ORIGIN ?? "http://127.0.0.1:9090";

  const url = new URL(request.url);
  const target = new URL(url.pathname + url.search, backendOrigin);

  const headers = new Headers(request.headers);
  headers.set("host", target.host);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    duplex: "half",
  };

  if (!["GET", "HEAD"].includes(request.method)) {
    init.body = request.body;
  }

  const backendResponse = await fetch(target.toString(), init);

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: backendResponse.headers,
  });
};
