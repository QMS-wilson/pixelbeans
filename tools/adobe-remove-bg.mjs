import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const ADOBE_URL = "https://www.adobe.com/express/feature/image/remove-background";

function readArgs(argv) {
  const args = {
    headless: false,
    timeoutMs: 120000,
    debugDir: path.resolve("pixelme_test_outputs", "adobe-debug"),
    channel: undefined,
    pauseAfterUpload: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" || arg === "-i") args.input = argv[++i];
    else if (arg === "--output" || arg === "-o") args.output = argv[++i];
    else if (arg === "--headless") args.headless = true;
    else if (arg === "--headed") args.headless = false;
    else if (arg === "--timeout") args.timeoutMs = Number(argv[++i]);
    else if (arg === "--debug-dir") args.debugDir = path.resolve(argv[++i]);
    else if (arg === "--chrome") args.channel = "chrome";
    else if (arg === "--pause-after-upload") args.pauseAfterUpload = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  npm run adobe:remove-bg -- --input ./image.png --output ./out/removed.png",
    "",
    "Options:",
    "  -i, --input     Source JPEG, PNG, or WebP file.",
    "  -o, --output    Destination PNG path.",
    "  --headed        Show browser window. Default.",
    "  --headless      Run without showing browser.",
    "  --timeout N     Max wait in ms. Default 120000.",
    "  --debug-dir N   Folder for failure screenshots/state.",
    "  --chrome        Use installed Google Chrome instead of bundled Chromium.",
    "  --pause-after-upload",
    "                 Upload the file, then keep the browser open for observation.",
  ].join("\n");
}

async function clickFirstVisible(locator, description) {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) {
      await item.click();
      return true;
    }
  }
  throw new Error(`Could not find visible ${description}.`);
}

async function uploadImage(page, inputPath) {
  await page.locator('input[type="file"]').first().waitFor({ state: "attached", timeout: 15000 }).catch(() => null);

  const fileInput = page.locator('input[type="file"]');
  if ((await fileInput.count()) > 0) {
    const firstInput = fileInput.first();
    await firstInput.setInputFiles(inputPath);
    await firstInput.evaluate((input) => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    return "input[type=file]";
  }

  const uploadControl = page.getByRole("button", { name: /upload your photo|browse|upload/i });
  if ((await uploadControl.count()) === 0) {
    throw new Error("Adobe page did not expose a usable file input or upload button.");
  }

  const chooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
  await clickFirstVisible(uploadControl, "upload control");

  const chooser = await chooserPromise;
  await chooser.setFiles(inputPath);
  return "filechooser";
}

async function saveDownload(download, outputPath) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await download.saveAs(outputPath);
  return outputPath;
}

async function writeDebug(page, debugDir, reason) {
  await fs.promises.mkdir(debugDir, { recursive: true });
  const slug = reason.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "debug";
  const basePath = path.join(debugDir, `${Date.now()}-${slug}`);

  await page.screenshot({ path: `${basePath}.png`, fullPage: true }).catch(() => null);
  const state = await page
    .evaluate(() => ({
      url: location.href,
      title: document.title,
      text: document.body?.innerText?.slice(0, 5000),
      fileInputs: [...document.querySelectorAll('input[type="file"]')].map((input, index) => ({
        index,
        accept: input.accept,
        disabled: input.disabled,
        files: input.files?.length ?? 0,
      })),
      controls: [...document.querySelectorAll("a,button")]
        .slice(0, 200)
        .map((element) => ({
          tag: element.tagName,
          text: (element.innerText || element.textContent || "").trim().slice(0, 120),
          href: element.href || "",
          aria: element.getAttribute("aria-label"),
        })),
    }))
    .catch((error) => ({ error: error.message }));

  await fs.promises.writeFile(`${basePath}.json`, JSON.stringify(state, null, 2), "utf8");
  return basePath;
}

async function waitForResult(page, outputPath, timeoutMs) {
  const started = Date.now();
  let lastText = "";

  while (Date.now() - started < timeoutMs) {
    const currentUrl = page.url();
    if (/helpx\.adobe\.com\/download-install\/apps\.html/i.test(currentUrl)) {
      throw new Error(
        `Adobe redirected to its download/install help page after upload: ${currentUrl}`,
      );
    }

    const downloadPromise = page.waitForEvent("download", { timeout: 1500 }).catch(() => null);

    const downloadButton = page
      .getByRole("link", { name: /download/i })
      .or(page.getByRole("button", { name: /download/i }));

    const downloadCount = await downloadButton.count().catch(() => 0);
    for (let i = 0; i < downloadCount; i += 1) {
      const candidate = downloadButton.nth(i);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click().catch(() => null);
        const download = await downloadPromise;
        if (download) return saveDownload(download, outputPath);
      }
    }

    const directDownload = await page
      .locator('a[download], a[href^="blob:"], a[href^="data:image/png"]')
      .first();
    if ((await directDownload.count().catch(() => 0)) && (await directDownload.isVisible().catch(() => false))) {
      const directPromise = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
      await directDownload.click().catch(() => null);
      const directResult = await directPromise;
      if (directResult) return saveDownload(directResult, outputPath);
    }

    lastText = (await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")).slice(0, 2000);
    if (/helpx\.adobe\.com/i.test(lastText) && /ERR_CONNECTION_CLOSED|download-install/i.test(lastText)) {
      throw new Error("Adobe redirected to its download/install help page after upload.");
    }
    if (/captcha|verify you are human/i.test(lastText)) {
      throw new Error("Adobe showed a verification challenge. Manual action is required.");
    }
    if (/sign in to download|log in to download|create an account to download/i.test(lastText)) {
      throw new Error("Adobe requires sign-in before downloading the processed image.");
    }

    await page.waitForTimeout(1500);
  }

  throw new Error(`Timed out waiting for a downloadable result. Last page text:\n${lastText}`);
}

async function main() {
  const args = readArgs(process.argv);
  if (args.help || !args.input || !args.output) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = path.resolve(args.input);
  const outputPath = path.resolve(args.output);
  if (!fs.existsSync(inputPath)) throw new Error(`Input file does not exist: ${inputPath}`);

  const browser = await chromium.launch({
    headless: args.headless,
    downloadsPath: path.dirname(outputPath),
    channel: args.channel,
  });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const runtimeLog = [];
  page.on("console", (message) => {
    const text = `[console:${message.type()}] ${message.text()}`;
    runtimeLog.push(text);
    if (message.type() === "error" || message.type() === "warning") console.error(text);
  });
  page.on("pageerror", (error) => {
    const text = `[pageerror] ${error.message}`;
    runtimeLog.push(text);
    console.error(text);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const text = `[requestfailed] ${request.method()} ${request.url()} ${failure?.errorText || ""}`;
    runtimeLog.push(text);
    if (/adobe|express|cc|upload|asset/i.test(request.url())) console.error(text);
  });

  try {
    console.log(`Opening ${ADOBE_URL}`);
    await page.goto(ADOBE_URL, { waitUntil: "domcontentloaded", timeout: 45000 });

    console.log(`Uploading ${inputPath}`);
    const method = await uploadImage(page, inputPath);
    console.log(`Upload method: ${method}`);

    if (args.pauseAfterUpload) {
      console.log("Paused after upload. Leave this process running while observing the browser.");
      await new Promise(() => {});
    }

    console.log("Waiting for Adobe result/download...");
    const savedTo = await waitForResult(page, outputPath, args.timeoutMs);
    console.log(`Saved processed image: ${savedTo}`);
  } catch (error) {
    const debugPath = await writeDebug(page, args.debugDir, error.message);
    await fs.promises.writeFile(`${debugPath}.log`, runtimeLog.join("\n"), "utf8");
    console.error(`Debug files written with prefix: ${debugPath}`);
    throw error;
  } finally {
    if (args.pauseAfterUpload) return;
    await Promise.race([
      browser.close(),
      new Promise((resolve) => {
        setTimeout(resolve, 5000);
      }),
    ]);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
