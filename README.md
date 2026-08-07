# 拼豆图纸生成器（像素工坊）

上传图片 → 可选 AI 优化（火山引擎即梦）→ 网格化采样并映射拼豆色板 → 手绘微调 → 统计色号 → 导出 PNG / CSV / 打印。

## 目录结构

- `server.js`：前端静态服务（默认 8789），并把 `/api/*` 代理到卡密后端
- `card-backend/`：卡密后端服务（默认 9090），包含卡密兑换、AI 优化、下载扣次、管理台接口
- `card-backend/卡密/`：管理台页面与卡密数据（`cards.json` 是唯一数据源，已加入 gitignore）
- `script.js` / `index.html` / `styles.css` / `palettes.js`：前端代码
- `tools/`：Playwright 冒烟测试与 Adobe 背景移除实验脚本

## 本地运行

两个服务都要启动：

```powershell
# 终端 1：卡密后端（AI 优化、卡密、下载授权）
cd card-backend
npm run dev

# 终端 2：前端静态服务（8789，自动代理 /api 到 9090）
npm run dev
```

访问 `http://127.0.0.1:8789` 使用主站；管理台可从 `http://127.0.0.1:8789/卡密/index.html` 或 `http://127.0.0.1:9090/卡密/index.html` 打开。

## 环境变量

把根目录的 `.dev.vars.example` 复制为 `.dev.vars` 并填写真实值（生产环境务必设置强随机密钥）：

- `VOLC_ACCESS_KEY_ID` / `VOLC_SECRET_ACCESS_KEY`：火山引擎密钥（AI 优化必需）
- `CARD_ADMIN_KEY`：管理台密钥，生产环境必须改为强随机值
- `CARD_SESSION_SECRET`：会话签名密钥，生产环境必须改为强随机值
- `ALLOWED_ORIGINS`：可选，额外允许的 CORS 来源，逗号分隔
- `COOKIE_SECURE=true`：仅当 API 与前端跨站部署（不同域名）且已启用 HTTPS 时设置
- `CLIENT_ORIGIN`：可选，无 Origin 头请求时使用的默认来源
- `PORT` / `BACKEND_PORT`：端口覆盖

生产环境（`NODE_ENV=production`）下，以上密钥缺失或仍为默认值时后端会拒绝启动。

## 卡密体系

一张卡密提供 3 次 AI 优化 + 3 次下载，并绑定首次使用的图片指纹。卡密数据只存放在 `card-backend/卡密/cards.json`，日志中的 IP 已脱敏。
