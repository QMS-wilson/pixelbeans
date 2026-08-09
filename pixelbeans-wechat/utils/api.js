const config = require("../config.js");

const API_BASE = (config && config.apiBase) || "http://127.0.0.1:9090";

function requestJson(path, options = {}) {
  const { method = "GET", data = null, header = {} } = options;
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method,
      data,
      header: {
        "content-type": "application/json",
        ...header,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        const error = new Error(
          (res.data && (res.data.message || res.data.error)) || `请求失败（${res.statusCode}）`,
        );
        error.status = res.statusCode;
        reject(error);
      },
      fail: () => {
        reject(
          new Error("连接后端服务失败，请确认后端已启动；真机预览请把 config.js 的 apiBase 改为电脑局域网 IP"),
        );
      },
    });
  });
}

module.exports = {
  API_BASE,
  requestJson,
};
