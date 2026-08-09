const config = require("./config.js");

App({
  globalData: {
    // 调试阶段指向本地卡密后端；发布时改为线上 https 域名并配置合法域名白名单。
    apiBase: config.apiBase,
  },
});
