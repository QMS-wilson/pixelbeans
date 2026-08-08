// Cloudflare Pages 构建脚本：把前端静态资源复制到 dist/ 目录。
import { mkdir, copyFile } from "node:fs/promises";

const FILES = [
  "index.html",
  "script.js",
  "styles.css",
  "palettes.js",
  "favicon.png",
  "apple-touch-icon.png",
];

await mkdir("dist", { recursive: true });
for (const file of FILES) {
  await copyFile(file, `dist/${file}`);
}

console.log(`已复制 ${FILES.length} 个静态文件到 dist/`);
