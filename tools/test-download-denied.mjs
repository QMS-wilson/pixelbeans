// 回归测试：下载接口返回卡密类错误（403）时，
// 前端应展示错误消息，并在再次点击下载时弹出卡密兑换框。
// 运行前需先启动前端服务（npm run dev）与卡密后端（cd card-backend; npm run dev）。
import { chromium } from "playwright";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:8789";
const DENIED_MESSAGE = "当前卡密已失效，请使用新卡密。";

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];

page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
page.on("console", (message) => {
  // 模拟 403 时浏览器会记录一条资源加载错误，属预期行为，不视为页面缺陷。
  if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
    errors.push(`console: ${message.text()}`);
  }
});

let downloadCalls = 0;

// 模拟已解锁的授权状态
await page.route("**/api/access-status", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      paid: true,
      redeemed: true,
      cardCode: "PB-TEST-0000-0001",
      cardStatus: "active",
      aiOptimizeRemaining: 3,
      downloadRemaining: 3,
    }),
  }),
);

// 模拟下载接口返回卡密失效错误
await page.route("**/api/download", (route) => {
  downloadCalls += 1;
  return route.fulfill({
    status: 403,
    contentType: "application/json",
    headers: {
      "Access-Control-Allow-Origin": "http://127.0.0.1:8789",
      "Access-Control-Allow-Credentials": "true",
    },
    body: JSON.stringify({ error: "Download denied", message: DENIED_MESSAGE }),
  });
});

await page.goto(BASE_URL, { waitUntil: "networkidle" });
await page.click("#blankBoard");
await page.waitForSelector("#downloadCodePng:not([disabled])", { timeout: 10000 });

// 第一次点击：应弹出错误遮罩并展示后端消息
await page.click("#downloadCodePng");
await page.waitForSelector("#errorOverlay:not([hidden])", { timeout: 5000 });
const overlayText = await page.textContent("#errorOverlayMessage");
if (!overlayText.includes(DENIED_MESSAGE)) {
  throw new Error(`错误遮罩未展示后端消息，实际内容：${overlayText}`);
}
console.log("PASS: 错误遮罩展示后端消息");

// 关闭错误遮罩后再次点击：应弹出卡密兑换框，且不再调用下载接口
await page.click("#closeErrorOverlayButton");
await page.waitForSelector("#errorOverlay[hidden]", { state: "attached", timeout: 5000 });
await page.click("#downloadCodePng");
await page.waitForSelector("#cardModalOverlay:not([hidden])", { timeout: 5000 });
const modalMessage = await page.textContent("#cardRedeemMessage");
if (!modalMessage.includes(DENIED_MESSAGE)) {
  throw new Error(`兑换框未展示卡密错误消息，实际内容：${modalMessage}`);
}
if (downloadCalls !== 1) {
  throw new Error(`再次点击不应调用下载接口，实际调用次数：${downloadCalls}`);
}
console.log("PASS: 再次点击弹出兑换框并展示错误消息，未重复请求下载");

if (errors.length) {
  throw new Error(`页面出现错误：\n${errors.join("\n")}`);
}

console.log("ALL PASS");
await browser.close();
