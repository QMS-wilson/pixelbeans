/**
 * 从 maxcleme/beadcolors 的 CSV 生成真实品牌色板，并同步写入：
 *   - Web 端:   palettes.js                (window.BEAD_PALETTES)
 *   - 小程序端: D:\pixelbeans-wechat\utils\palettes.js (module.exports)
 *
 * 用法: node tools/generate-brand-palettes.cjs <csv目录>
 * CSV 格式(前4列): code,name,?,R,G,B,...
 */
const fs = require("fs");
const path = require("path");

const WEB_OUT = path.resolve(__dirname, "..", "palettes.js");
const MINI_OUT = "D:\\pixelbeans-wechat\\utils\\palettes.js";

// 自定义色板（保持原有，不覆盖）
const CUSTOM_PALETTES = {
  classic: {
    label: "经典 24 色",
    colors: [
      { code: "C01", hex: "#ffffff", rgb: [255, 255, 255] },
      { code: "C02", hex: "#111827", rgb: [17, 24, 39] },
      { code: "C03", hex: "#d8dee9", rgb: [216, 222, 233] },
      { code: "C04", hex: "#8b95a7", rgb: [139, 149, 167] },
      { code: "C05", hex: "#ef4444", rgb: [239, 68, 68] },
      { code: "C06", hex: "#f97316", rgb: [249, 115, 22] },
      { code: "C07", hex: "#facc15", rgb: [250, 204, 21] },
      { code: "C08", hex: "#84cc16", rgb: [132, 204, 22] },
      { code: "C09", hex: "#22c55e", rgb: [34, 197, 94] },
      { code: "C10", hex: "#14b8a6", rgb: [20, 184, 166] },
      { code: "C11", hex: "#06b6d4", rgb: [6, 182, 212] },
      { code: "C12", hex: "#3b82f6", rgb: [59, 130, 246] },
      { code: "C13", hex: "#6366f1", rgb: [99, 102, 241] },
      { code: "C14", hex: "#a855f7", rgb: [168, 85, 247] },
      { code: "C15", hex: "#ec4899", rgb: [236, 72, 153] },
      { code: "C16", hex: "#f9a8d4", rgb: [249, 168, 212] },
      { code: "C17", hex: "#fed7aa", rgb: [254, 215, 170] },
      { code: "C18", hex: "#fde68a", rgb: [253, 230, 138] },
      { code: "C19", hex: "#bbf7d0", rgb: [187, 247, 208] },
      { code: "C20", hex: "#bfdbfe", rgb: [191, 219, 254] },
      { code: "C21", hex: "#c4b5fd", rgb: [196, 181, 253] },
      { code: "C22", hex: "#78350f", rgb: [120, 53, 15] },
      { code: "C23", hex: "#166534", rgb: [22, 101, 52] },
      { code: "C24", hex: "#1e3a8a", rgb: [30, 58, 138] },
    ],
  },
  soft: {
    label: "柔和 18 色",
    colors: [
      { code: "S01", hex: "#fffaf0", rgb: [255, 250, 240] },
      { code: "S02", hex: "#2d3748", rgb: [45, 55, 72] },
      { code: "S03", hex: "#cbd5e1", rgb: [203, 213, 225] },
      { code: "S04", hex: "#fca5a5", rgb: [252, 165, 165] },
      { code: "S05", hex: "#fdba74", rgb: [253, 186, 116] },
      { code: "S06", hex: "#fde68a", rgb: [253, 230, 138] },
      { code: "S07", hex: "#bef264", rgb: [190, 242, 100] },
      { code: "S08", hex: "#86efac", rgb: [134, 239, 172] },
      { code: "S09", hex: "#99f6e4", rgb: [153, 246, 228] },
      { code: "S10", hex: "#a5f3fc", rgb: [165, 243, 252] },
      { code: "S11", hex: "#bfdbfe", rgb: [191, 219, 254] },
      { code: "S12", hex: "#c7d2fe", rgb: [199, 210, 254] },
      { code: "S13", hex: "#ddd6fe", rgb: [221, 214, 254] },
      { code: "S14", hex: "#fbcfe8", rgb: [251, 207, 232] },
      { code: "S15", hex: "#e7c8a0", rgb: [231, 200, 160] },
      { code: "S16", hex: "#94a3b8", rgb: [148, 163, 184] },
      { code: "S17", hex: "#64748b", rgb: [100, 116, 139] },
      { code: "S18", hex: "#475569", rgb: [71, 85, 105] },
    ],
  },
  vivid: {
    label: "高饱和 20 色",
    colors: [
      { code: "V01", hex: "#ffffff", rgb: [255, 255, 255] },
      { code: "V02", hex: "#000000", rgb: [0, 0, 0] },
      { code: "V03", hex: "#ff1744", rgb: [255, 23, 68] },
      { code: "V04", hex: "#ff6d00", rgb: [255, 109, 0] },
      { code: "V05", hex: "#ffd600", rgb: [255, 214, 0] },
      { code: "V06", hex: "#76ff03", rgb: [118, 255, 3] },
      { code: "V07", hex: "#00e676", rgb: [0, 230, 118] },
      { code: "V08", hex: "#00bfa5", rgb: [0, 191, 165] },
      { code: "V09", hex: "#00e5ff", rgb: [0, 229, 255] },
      { code: "V10", hex: "#2979ff", rgb: [41, 121, 255] },
      { code: "V11", hex: "#304ffe", rgb: [48, 79, 254] },
      { code: "V12", hex: "#651fff", rgb: [101, 31, 255] },
      { code: "V13", hex: "#d500f9", rgb: [213, 0, 249] },
      { code: "V14", hex: "#ff4081", rgb: [255, 64, 129] },
      { code: "V15", hex: "#795548", rgb: [121, 85, 72] },
      { code: "V16", hex: "#607d8b", rgb: [96, 125, 139] },
      { code: "V17", hex: "#b0bec5", rgb: [176, 190, 197] },
      { code: "V18", hex: "#ffab91", rgb: [255, 171, 145] },
      { code: "V19", hex: "#ccff90", rgb: [204, 255, 144] },
      { code: "V20", hex: "#80d8ff", rgb: [128, 216, 255] },
    ],
  },
};

// 真实品牌色板：key -> { csv, label }
const BRAND_PALETTES = [
  { key: "perler", csv: "perler.csv", label: "Perler 标准 103 色" },
  { key: "hamaMidi", csv: "hama.csv", label: "Hama Midi 92 色" },
  { key: "artkalS", csv: "artkal_s.csv", label: "Artkal S 199 色" },
  { key: "artkalC", csv: "artkal_c.csv", label: "Artkal C 174 色" },
  { key: "artkalR", csv: "artkal_r.csv", label: "Artkal R 89 色" },
  { key: "nabbi", csv: "nabbi.csv", label: "Nabbi 30 色" },
  { key: "yant", csv: "yant.csv", label: "Yant 119 色" },
];

function parseCsvPalette(file, label) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const colors = lines.map((line) => {
    const parts = line.split(",");
    const code = parts[0].trim();
    const name = parts[1].trim();
    const r = Number(parts[3]);
    const g = Number(parts[4]);
    const b = Number(parts[5]);
    const hex =
      "#" +
      [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    return {
      code,
      label: name,
      hex,
      rgb: [r, g, b],
    };
  });
  const dup = colors.length - new Set(colors.map((c) => c.code)).size;
  if (dup > 0) throw new Error(`${file} 含 ${dup} 个重复色号`);
  return { label, colors };
}

function buildPalettes(csvDir) {
  const palettes = { ...CUSTOM_PALETTES };
  for (const { key, csv, label } of BRAND_PALETTES) {
    palettes[key] = parseCsvPalette(path.join(csvDir, csv), label);
  }
  return palettes;
}

function serialize(palettes) {
  const lines = [];
  for (const [key, palette] of Object.entries(palettes)) {
    lines.push(`  ${key}: {`);
    lines.push(`    label: ${JSON.stringify(palette.label)},`);
    lines.push(`    colors: [`);
    for (const c of palette.colors) {
      const labelPart = c.label !== undefined ? ` label: ${JSON.stringify(c.label)},` : "";
      lines.push(
        `      { code: ${JSON.stringify(c.code)},${labelPart} hex: "${c.hex}", rgb: [${c.rgb.join(", ")}] },`
      );
    }
    lines.push(`    ],`);
    lines.push(`  },`);
  }
  return lines.join("\n");
}

function writeFiles(palettes) {
  const body = serialize(palettes);
  const web = `window.BEAD_PALETTES = Object.freeze({\n${body}\n});\n`;
  const mini = `const BEAD_PALETTES = Object.freeze({\n${body}\n});\n\nmodule.exports = { BEAD_PALETTES };\n`;
  fs.writeFileSync(WEB_OUT, web, "utf8");
  fs.writeFileSync(MINI_OUT, mini, "utf8");
}

const csvDir = process.argv[2];
if (!csvDir || !fs.existsSync(csvDir)) {
  console.error("用法: node tools/generate-brand-palettes.js <csv目录>");
  process.exit(1);
}

const palettes = buildPalettes(csvDir);
writeFiles(palettes);

const totalColors = Object.values(palettes).reduce(
  (n, p) => n + p.colors.length,
  0
);
console.log(
  `已写入 ${Object.keys(palettes).length} 套色板 / ${totalColors} 色：`
);
for (const [key, p] of Object.entries(palettes)) {
  console.log(`  - ${key}: ${p.label} (${p.colors.length} 色)`);
}
console.log(`  Web:  ${WEB_OUT}`);
console.log(`  小程序: ${MINI_OUT}`);
