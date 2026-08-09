# 拼豆图纸生成器 - 微信小程序

Web 版「像素工坊」的同风格微信小程序版本，核心功能一致：

- 上传图片 / 新建空白画布，网格化采样并映射拼豆色板
- 手绘编辑（画笔 / 橡皮 / 撤销 / 清空）
- 可选 AI 优化（走本地卡密后端的火山引擎接口）
- 色号用量统计
- 卡密兑换后下载带 Code 图纸、无 Code 图纸与 CSV 清单
- 未输入卡密时也可免费体验一次 AI 优化（按设备限制一次）
- 未解锁时预览画布带「未付款预览」水印
- 图纸方案本地自动存档 / 恢复 / 清除

## 调试运行

1. 先启动本地卡密后端：

   ```powershell
   cd C:\Users\24773\Documents\拼豆\card-backend
   npm run dev   # 默认监听 127.0.0.1:9090
   ```

2. 用微信开发者工具打开本目录 `D:\pixelbeans-wechat`。

3. 在开发者工具「详情 → 本地设置」中勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**（`project.config.json` 已设置 `urlCheck: false`，一般无需再操作）。

4. 编译运行即可。模拟器可直接访问 `127.0.0.1:9090`；真机调试时请把
   [config.js](config.js) 中的 `apiBase` 改为电脑局域网 IP，并确保手机与电脑在同一网络。

## 真机预览（重要）

手机上 `127.0.0.1` 指向手机自己，连不到电脑上的后端（通常表现为请求 503/失败）。请按下面步骤操作：

1. 手机和电脑连接**同一个 WiFi**；
2. 查看电脑局域网 IP（如 `ipconfig`，示例 `192.168.1.109`），把 [config.js](config.js) 的 `apiBase` 改成
   `http://<局域网IP>:9090`；
3. **以管理员身份**运行 PowerShell 放行 9090 端口（Windows 防火墙默认拦截，这是真机连不上的常见原因）：

   ```powershell
   netsh advfirewall firewall add rule name="Pixel Beads Backend 9090" dir=in action=allow protocol=TCP localport=9090
   ```

4. 微信开发者工具勾选「不校验合法域名」后，点「预览」扫码；
5. 后端服务保持运行（`cd card-backend; npm run dev`，监听 0.0.0.0）。

注意：局域网 IP 可能随路由器分配变化，换网络后需要同步修改 `config.js`。

## 与后端的对接方式

- 授权状态：`GET /api/access-status`
- 卡密兑换：`POST /api/redeem-card`（body: `{ cardCode }`）
- AI 优化：`POST /api/ai-optimize`（body: `{ imageBase64, prompt, imageHash, accessToken }`）
- 下载：`POST /api/download`（body: `{ filename, dataUrl|text, imageHash, accessToken }`，返回二进制）

小程序不依赖 Cookie，全部通过返回的 `accessToken` 显式传参鉴权。

## 发布前需要注意

- 将 `apiBase` 改为线上 HTTPS 域名，并在微信公众平台配置 request 合法域名。
- 替换 `project.config.json` 中的 `appid`（当前为游客模式 `touristappid`）。
- 保存图片到相册需要申请 `scope.writePhotosAlbum` 权限（`wx.saveImageToPhotosAlbum` 会自动弹授权）。
