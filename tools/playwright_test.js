(async () => {
  const pw = await import('playwright');
  const { chromium } = pw;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
  });
  const page = await context.newPage();
  page.on('console', (m) => console.log('PAGE_LOG:', m.text()));
  page.on('pageerror', (e) => console.log('PAGE_ERR:', e.toString()));
  try {
    console.log('navigating to site');
    await page.goto('http://114.134.186.36', { waitUntil: 'networkidle' });
    await page.waitForSelector('#blankBoard', { timeout: 10000 });
    console.log('creating blank board');
    await page.click('#blankBoard');

    async function clickAndWait(selector, name) {
      console.log('clicking', selector);
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await page.click(selector);
      const download = await downloadPromise;
      if (download) {
        let path = null;
        try { path = await download.path(); } catch (e) { path = null; }
        console.log(`${name}:downloaded filename=${download.suggestedFilename()} path=${path}`);
      } else {
        console.log(`${name}:no-download (possibly opened in new tab or blocked)`);
      }
    }

    await clickAndWait('#downloadCodePng', 'code');
    await clickAndWait('#downloadCleanPng', 'clean');
    await clickAndWait('#downloadCsv', 'csv');

    await browser.close();
    console.log('done');
  } catch (err) {
    console.error('ERROR', err);
    await browser.close();
    process.exit(1);
  }
})();
