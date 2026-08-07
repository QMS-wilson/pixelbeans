// 回归测试：AI 优化前端流程。
// 场景 A：AI 接口成功返回 → 图纸应生成、遮罩消失；
// 场景 B：AI 接口报错 → 错误应展示、遮罩消失。
// 运行前需先启动前端服务（npm run dev）。
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE_URL = process.env.TEST_BASE_URL || "http://127.0.0.1:8789";
const SVG_RED =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#ef4444"/></svg>',
    "utf8",
  ).toString("base64");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pixel-beads-ai-"));
const imagePath = path.join(tempDir, "test-image.svg");
fs.writeFileSync(
  imagePath,
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#ef4444"/></svg>',
  "utf8",
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

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

let aiCalls = 0;

async function runScenario(mode) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("Failed to load resource")) {
      errors.push(`console: ${message.text()}`);
    }
  });

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

  await page.route("**/api/ai-optimize", (route) => {
    aiCalls += 1;
    if (mode === "success") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Access-Control-Allow-Origin": "http://127.0.0.1:8789",
          "Access-Control-Allow-Credentials": "true",
        },
        body: JSON.stringify({ success: true, imageUrl: SVG_RED }),
      });
    }
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": "http://127.0.0.1:8789",
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({ error: "AI optimization failed", message: "模拟的 AI 接口错误" }),
    });
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.setInputFiles("#fileInput", imagePath);
  await page.waitForSelector("#downloadCodePng:not([disabled])", { timeout: 10000 });

  // 开启 AI 优化
  await page.click("#topbarPreprocess");
  await page.selectOption("#aiOptimize", "on");

  if (mode === "success") {
    await page.waitForFunction(
      () => document.querySelector("#statusText")?.textContent === "图纸已生成",
      { timeout: 15000 },
    );
    const hint = await page.textContent("#canvasHint");
    const overlayState = await page.evaluate(() => ({
      aiHidden: document.querySelector("#aiOverlay").hidden,
      preHidden: document.querySelector("#preprocessOverlay").hidden,
    }));
    if (!overlayState.aiHidden) throw new Error("AI 成功后遮罩未隐藏");
    if (!overlayState.preHidden) throw new Error("AI 成功后预处理面板未关闭");
    if (!hint.includes("预处理")) throw new Error(`成功提示异常：${hint}`);
    console.log("PASS: AI 成功流程完成，图纸已生成，遮罩已关闭");
  } else {
    await page.waitForFunction(
      () => document.querySelector("#statusText")?.dataset?.state === "error",
      { timeout: 15000 },
    );
    const hint = await page.textContent("#canvasHint");
    const aiHidden = await page.evaluate(() => document.querySelector("#aiOverlay").hidden);
    if (!aiHidden) throw new Error("AI 失败后遮罩未隐藏");
    if (!hint.includes("模拟的 AI 接口错误")) throw new Error(`错误提示异常：${hint}`);
    console.log("PASS: AI 失败流程展示错误，遮罩已关闭");
  }

  if (errors.length) throw new Error(`页面出现错误：\n${errors.join("\n")}`);
  await context.close();
}

await runScenario("success");
await runScenario("error");

console.log("ALL PASS, aiCalls =", aiCalls);
await browser.close();
fs.rmSync(tempDir, { recursive: true, force: true });
