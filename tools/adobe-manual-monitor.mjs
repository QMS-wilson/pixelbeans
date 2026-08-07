import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ADOBE_URL = "https://www.adobe.com/express/feature/image/remove-background";

function now() {
  return new Date().toISOString();
}

async function main() {
  const outDir = path.resolve("pixelme_test_outputs", "adobe-manual-monitor", String(Date.now()));
  await fs.promises.mkdir(outDir, { recursive: true });
  const logPath = path.join(outDir, "monitor.log");
  const append = async (line) => {
    await fs.promises.appendFile(logPath, `[${now()}] ${line}\n`, "utf8");
  };

  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    downloadsPath: outDir,
  });

  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  });

  const watchPage = async (page, label) => {
    await append(`${label} opened`);

    page.on("console", (message) => {
      const text = message.text().replace(/\s+/g, " ").slice(0, 1000);
      append(`${label} console:${message.type()} ${text}`);
    });

    page.on("pageerror", (error) => {
      append(`${label} pageerror ${error.message}`);
    });

    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) append(`${label} navigated ${frame.url()}`);
    });

    page.on("request", (request) => {
      const url = request.url();
      if (/adobe|express|quick-actions|upload|asset|hz-|ccx|storage|download/i.test(url)) {
        append(`${label} request ${request.method()} ${url}`);
      }
    });

    page.on("response", (response) => {
      const url = response.url();
      if (/adobe|express|quick-actions|upload|asset|hz-|ccx|storage|download/i.test(url)) {
        append(`${label} response ${response.status()} ${url}`);
      }
    });

    page.on("requestfailed", (request) => {
      const failure = request.failure();
      append(`${label} requestfailed ${request.method()} ${request.url()} ${failure?.errorText || ""}`);
    });

    page.on("download", async (download) => {
      append(`${label} download-start ${download.suggestedFilename()}`);
      const savePath = path.join(outDir, download.suggestedFilename());
      await download.saveAs(savePath).catch((error) => append(`${label} download-save-failed ${error.message}`));
      append(`${label} download-saved ${savePath}`);
    });
  };

  context.on("page", async (page) => {
    await watchPage(page, `page-${context.pages().length}`);
  });

  const page = await context.newPage();
  await watchPage(page, "page-1");
  await append(`debug-dir ${outDir}`);
  await page.goto(ADOBE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  console.log(`Manual monitor is running.`);
  console.log(`Debug dir: ${outDir}`);
  console.log(`Log file: ${logPath}`);
  console.log(`Use the Chrome window manually. Stop this process when done.`);

  setInterval(async () => {
    const pages = context.pages();
    for (let i = 0; i < pages.length; i += 1) {
      const item = pages[i];
      const title = await item.title().catch(() => "");
      const url = item.url();
      await append(`heartbeat page-${i + 1} title=${title} url=${url}`);
    }
  }, 5000);

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
