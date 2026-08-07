# Pixel Beads Card Backend

卡密后台服务：负责卡密兑换、AI 优化授权（火山引擎）、下载扣次与卡密管理。

## 运行方式

```bash
cd card-backend
npm run dev
```

服务默认监听 `9090`（可用 `PORT` 环境变量覆盖），会同时加载本目录和项目根目录的 `.dev.vars`。

## 环境变量

- `PORT`：可选，默认 `9090`
- `CARD_ADMIN_KEY`：管理员密钥，生产环境必须设置强随机值（默认值仅用于本地开发）
- `CARD_SESSION_SECRET`：会话签名密钥，生产环境必须设置强随机值
- `VOLC_ACCESS_KEY_ID`、`VOLC_SECRET_ACCESS_KEY`：火山引擎 AI 优化密钥
- `ALLOWED_ORIGINS`：可选，额外允许的 CORS 来源（逗号分隔）
- `COOKIE_SECURE=true`：跨站部署且启用 HTTPS 时设置（cookie 使用 SameSite=None + Secure）
- `CLIENT_ORIGIN`：可选，无 Origin 头时的默认来源，默认 `http://127.0.0.1:8789`

生产环境（`NODE_ENV=production`）下，密钥缺失或仍为默认值时会拒绝启动。

## 数据存储

- `卡密/cards.json`：卡密与日志的唯一数据源（已 gitignore）
- 日志中的客户端 IP 已脱敏

## 接口与限制

- `/api/access-status`：恢复授权状态
- `/api/redeem-card`：卡密兑换
- `/api/logout-access`：退出授权
- `/api/ai-optimize`：AI 优化（请求体上限 16MB，全局单任务）；支持未输入卡密时的免费体验：请求体带 `freeTrial: true` 与 `deviceId`，同一设备仅允许一次，成功后写入 `freeTrials` 记录
- `/api/download`：PNG / CSV 下载（请求体上限 40MB）
- `/api/card-admin/*`：管理台（仅接受 `x-admin-key` 请求头）

## 管理界面

- `http://127.0.0.1:9090/卡密/index.html`
- 也可从主站端口访问：`http://127.0.0.1:8789/卡密/index.html`（由前端服务代理）
