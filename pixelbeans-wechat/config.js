// 后端调试地址配置
// - 开发者工具模拟器：http://127.0.0.1:9090（当前使用）
// - 真机预览/调试：必须改成电脑的局域网 IP（手机连同一 WiFi），
//   当前电脑 IP 为 http://192.168.10.11:9090（IP 变化时请用 ipconfig 重新确认）
//   并确保 Windows 防火墙放行 9090 端口（需管理员运行）：
//   netsh advfirewall firewall add rule name="Pixel Beads Backend 9090" dir=in action=allow protocol=TCP localport=9090
module.exports = {
  apiBase: "http://127.0.0.1:9090",
};
