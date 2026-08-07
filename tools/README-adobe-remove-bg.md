# Adobe Express Background Removal Smoke Test

This is a temporary automation smoke test for Adobe Express' web page flow. It is not a production integration contract and can break if Adobe changes the page, requires sign-in, shows a verification challenge, or blocks automated downloads.

Install dependencies:

```powershell
npm install
```

Run with a local test image:

```powershell
npm run adobe:remove-bg -- --input .\pixelme_test_outputs\adobe-bg-test.png --output .\pixelme_test_outputs\adobe-bg-removed.png
```

Use `--headless` for background runs after the headed flow works. For your site, keep this behind an adapter such as `removeBackground(inputPath, outputPath)` so it can be replaced later by a local model or paid API without changing the rest of the image pipeline.

Observed on 2026-07-27: the upload handoff can redirect to Adobe's download/install help page instead of returning a processed PNG. The script treats that as a hard failure because it means Adobe did not expose a stable web-download flow for automation in this environment.
