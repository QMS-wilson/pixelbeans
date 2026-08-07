const DEFAULT_CANVAS_SIZE = 720;
const MAX_IMPORT_FILE_SIZE = 12 * 1024 * 1024;
const BACKEND_PORT = 9090;
const APP_API_BASE = `${window.location.protocol}//${window.location.hostname}:${BACKEND_PORT}`;
const AI_OPTIMIZE_ENDPOINT = `${APP_API_BASE}/api/ai-optimize`;
const DEFAULT_AI_PROMPT =
  "将图片优化为适合拼豆图纸的形象：保留主体特征，白色干净背景，chibi 可爱画风，pixel art style, 16-bit, retro game aesthetic, sharp focus, high contrast, clean lines, detailed pixel art, masterpiece, best quality";
const PREVIEW_PROTECTION_MODE = "watermark";
const ACCESS_STATUS_ENDPOINT = `${APP_API_BASE}/api/access-status`;
const REDEEM_CARD_ENDPOINT = `${APP_API_BASE}/api/redeem-card`;
const LOGOUT_ACCESS_ENDPOINT = `${APP_API_BASE}/api/logout-access`;
const PATTERN_STORAGE_KEY = "pixelWorkshopPattern";
const PROJECTS_STORAGE_KEY = "pixelWorkshopProjects";

// 前端全局状态：统一维护当前图像、图纸网格、编辑器、导出与卡密授权状态。
const state = {
  image: null,
  originalImage: null,
  sourceName: "",
  sourceType: "none",
  cells: [],
  cols: 64,
  rows: 64,
  counts: new Map(),
  error: "",
  editorTool: "brush",
  selectedColorCode: "",
  history: [],
  redoHistory: [],
  isDrawing: false,
  renderMetrics: null,
  exportBusy: false,
  processToken: 0,
  aiOptimizeCacheKey: "",
  aiOptimizeCacheImage: null,
  aiOptimizeInFlightKey: "",
  aiOptimizeInFlightPromise: null,
  confirmedAiPrompt: DEFAULT_AI_PROMPT,
  paletteFilter: "全部",
  paidAccess: false,
  cardCode: "",
  accessToken: localStorage.getItem("pixelWorkshopAccessToken") || "",
  sourceFingerprint: "",
  aiOptimizeCount: 0,
  aiOptimizeRemaining: 0,
  downloadCount: 0,
  downloadRemaining: 0,
  cardStatus: "none",
  pendingProtectedAction: null,
  pendingCardError: "",
};

const fileInput = document.querySelector("#fileInput");
const toolCard = document.querySelector("#tool");
const toolGrid = document.querySelector("#toolGrid");
const toolTopbarActions = document.querySelector("#toolTopbarActions");
const topbarBlankBoardButton = document.querySelector("#topbarBlankBoard");
const topbarPreprocessButton = document.querySelector("#topbarPreprocess");
const preprocessOverlay = document.querySelector("#preprocessOverlay");
const preprocessPanel = document.querySelector("#preprocessPanel");
const dropZone = document.querySelector("#dropZone");
const uploadTitle = document.querySelector("#uploadTitle");
const uploadHint = document.querySelector("#uploadHint");
const blankBoardButton = document.querySelector("#blankBoard");
const demoPatternButton = document.querySelector("#demoPattern");
const canvasFrame = document.querySelector("#canvasFrame");
const canvas = document.querySelector("#previewCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const comparePanel = document.querySelector("#comparePanel");
const compareSummary = document.querySelector("#compareSummary");
const sourcePreviewCanvas = document.querySelector("#sourcePreviewCanvas");
const sourcePreviewCtx = sourcePreviewCanvas.getContext("2d", { willReadFrequently: true });
const processedPreviewCanvas = document.querySelector("#processedPreviewCanvas");
const processedPreviewCtx = processedPreviewCanvas.getContext("2d", { willReadFrequently: true });
const processedPreviewLabel = document.querySelector("#processedPreviewLabel");
const canvasHint = document.querySelector("#canvasHint");
const statusText = document.querySelector("#statusText");
const gridSize = document.querySelector("#gridSize");
const gridOutput = document.querySelector("#gridOutput");
const mergeLevel = document.querySelector("#mergeLevel");
const mergeOutput = document.querySelector("#mergeOutput");
const gridLine = document.querySelector("#gridLine");
const paletteSelect = document.querySelector("#paletteSelect");
const palettePreview = document.querySelector("#palettePreview");
const paletteFilters = document.querySelector("#paletteFilters");
const aiOptimizeSelect = document.querySelector("#aiOptimize");
const aiPromptInput = document.querySelector("#aiPrompt");
const aiPromptPreset = document.querySelector("#aiPromptPreset");
const confirmAiPrompt = document.querySelector("#confirmAiPrompt");
const aiOverlay = document.querySelector("#aiOverlay");
const aiWaitText = document.querySelector("#aiWaitText");
const cancelAiButton = document.querySelector("#cancelAiButton");
const brushTool = document.querySelector("#brushTool");
const eraserTool = document.querySelector("#eraserTool");
const undoEditButton = document.querySelector("#undoEdit");
const redoEditButton = document.querySelector("#redoEdit");
const clearBoardButton = document.querySelector("#clearBoard");
const clearSaveButton = document.querySelector("#clearSave");
const projectLibraryButton = document.querySelector("#projectLibrary");
const projectOverlay = document.querySelector("#projectOverlay");
const projectNameInput = document.querySelector("#projectNameInput");
const saveProjectButton = document.querySelector("#saveProjectButton");
const closeProjectButton = document.querySelector("#closeProjectButton");
const projectList = document.querySelector("#projectList");
const downloadConfirmOverlay = document.querySelector("#downloadConfirmOverlay");
const downloadConfirmRemaining = document.querySelector("#downloadConfirmRemaining");
const confirmDownloadButton = document.querySelector("#confirmDownloadButton");
const cancelDownloadButton = document.querySelector("#cancelDownloadButton");
const csvPreviewOverlay = document.querySelector("#csvPreviewOverlay");
const csvPreviewBody = document.querySelector("#csvPreviewBody");
const closeCsvPreviewButton = document.querySelector("#closeCsvPreviewButton");
const confirmCsvDownloadButton = document.querySelector("#confirmCsvDownloadButton");
const copyCsvButton = document.querySelector("#copyCsvButton");
const editorPalette = document.querySelector("#editorPalette");
const editorModeText = document.querySelector("#editorModeText");
const activeColorChip = document.querySelector("#activeColorChip");
const activeColorText = document.querySelector("#activeColorText");
const controlNote = document.querySelector("#controlNote");
const downloadCodePng = document.querySelector("#downloadCodePng");
const downloadCleanPng = document.querySelector("#downloadCleanPng");
const downloadCsv = document.querySelector("#downloadCsv");
const printPatternButton = document.querySelector("#printPattern");
const paletteList = document.querySelector("#paletteList");
const copyPaletteListButton = document.querySelector("#copyPaletteList");
const copyPaletteListText = document.querySelector("#copyPaletteListText");
const totalBeads = document.querySelector("#totalBeads");
const sizeHint = document.querySelector("#sizeHint");
let copyFeedbackTimer = null;
const accessStatusBadge = document.querySelector("#accessStatusBadge");
const paymentUsageSummary = document.querySelector("#paymentUsageSummary");
const accessStatusBadgeModal = document.querySelector("#accessStatusBadgeModal");
const cardCodeInput = document.querySelector("#cardCodeInput");
const redeemCardButton = document.querySelector("#redeemCardButton");
const logoutAccessButton = document.querySelector("#logoutAccessButton");
const closeCardModalButton = document.querySelector("#closeCardModalButton");
const cardModalOverlay = document.querySelector("#cardModalOverlay");
const cardRedeemMessage = document.querySelector("#cardRedeemMessage");
const errorOverlay = document.querySelector("#errorOverlay");
const errorOverlayMessage = document.querySelector("#errorOverlayMessage");
const closeErrorOverlayButton = document.querySelector("#closeErrorOverlayButton");
const protectedAssetSelector = "canvas, img";

// 初始化拼豆色板下拉菜单，数据来源于 palettes.js。
function initializePaletteSelect() {
  Object.entries(window.BEAD_PALETTES).forEach(([key, palette]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = palette.label;
    paletteSelect.append(option);
  });
}

function getPaletteColorByCode(code) {
  return getActivePalette().find((color) => color.code === code) || getActivePalette()[0];
}

function cloneCells(cells) {
  return cells.map((line) => line.slice());
}

function setStatus(message, type = "idle") {
  statusText.textContent = message;
  statusText.dataset.state = type;
}

function setError(message) {
  state.error = message;
  setStatus("处理失败", "error");
  canvasHint.textContent = message;
  controlNote.textContent = "请重新选择图片，或压缩图片后再试。";
}

function clearError() {
  state.error = "";
}

function setAiOverlayVisible(visible) {
  aiOverlay.hidden = !visible;
}

// AI 优化等待计时：每秒更新已等待时长。
let aiWaitTimer = null;
let aiWaitStartAt = 0;

function startAiWaitTimer() {
  if (!aiWaitText) return;
  clearAiWaitTimer();
  aiWaitStartAt = Date.now();
  const tick = () => {
    if (!aiWaitText) return;
    const seconds = Math.floor((Date.now() - aiWaitStartAt) / 1000);
    aiWaitText.textContent = `已等待 ${seconds} 秒，通常需要 30 秒 ~ 2 分钟`;
  };
  tick();
  aiWaitTimer = window.setInterval(tick, 1000);
}

function clearAiWaitTimer() {
  if (aiWaitTimer) {
    window.clearInterval(aiWaitTimer);
    aiWaitTimer = null;
  }
  if (aiWaitText) aiWaitText.textContent = "";
}

// 取消 AI 优化：使当前流程失效并关闭遮罩（后端任务可能已扣次，无法退回）。
function cancelAiOptimization() {
  state.processToken += 1;
  clearAiWaitTimer();
  setAiOverlayVisible(false);
  setStatus("已取消 AI 优化", "idle");
  canvasHint.textContent = "已取消 AI 优化。若任务已提交，AI 次数可能已扣减且无法退回。";
}

function openErrorOverlay(message) {
  if (!errorOverlay || !errorOverlayMessage) return;
  errorOverlayMessage.textContent = message || "出现未知错误，请稍后重试。";
  errorOverlay.hidden = false;
  document.body.classList.add("modal-open");
}

function closeErrorOverlay() {
  if (!errorOverlay) return;
  errorOverlay.hidden = true;
  document.body.classList.remove("modal-open");
}

function hasPaidAccess() {
  return Boolean(state.paidAccess);
}

function hasPreviewProtection() {
  return !hasPaidAccess();
}

function syncPreviewProtectionState() {
  document.body.classList.toggle("preview-protected", hasPreviewProtection());
}

function setRedeemMessage(message, type = "info") {
  if (!cardRedeemMessage) return;
  cardRedeemMessage.textContent = message;
  cardRedeemMessage.dataset.state = type;
}

// 请求 JSON 接口的通用封装，统一处理异常文本和非 JSON 返回。
async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: "include", ...options });
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new Error(text || "接口返回异常，请确认已通过 npm run dev 启动本地服务。");
    }
    throw new Error("接口返回了非 JSON 数据。");
  }

  if (!response.ok) {
    throw new Error(data?.message || data?.error || text || "请求失败");
  }

  return data;
}

// 同步下载授权相关 UI：顶部提示、弹窗状态和剩余次数展示。
function syncAccessUi() {
  const statusTextValue = hasPaidAccess()
    ? `已解锁${state.cardCode ? ` · ${state.cardCode}` : ""} · AI ${state.aiOptimizeRemaining}/3 · 下载 ${state.downloadRemaining}/3`
    : state.cardStatus === "exhausted"
      ? "当前卡密已失效，请更换新卡密"
      : "当前尚未解锁下载权限";
  const paymentSummaryValue = hasPaidAccess()
    ? `AI 剩余 ${state.aiOptimizeRemaining}/3 次 · 下载剩余 ${state.downloadRemaining}/3 次${
        state.aiOptimizeRemaining === 1 || state.downloadRemaining === 1 ? " · 注意：次数即将用完" : ""
      }`
    : state.cardStatus === "exhausted"
      ? "当前卡密已作废，请更换新卡密"
      : "AI 剩余 0/3 次 · 下载剩余 0/3 次";
  if (accessStatusBadge) accessStatusBadge.textContent = statusTextValue;
  if (paymentUsageSummary) paymentUsageSummary.textContent = paymentSummaryValue;
  if (accessStatusBadgeModal) accessStatusBadgeModal.textContent = statusTextValue;
  if (redeemCardButton) {
    redeemCardButton.disabled = hasPaidAccess();
    redeemCardButton.textContent = hasPaidAccess() ? "已完成解锁" : "立即解锁下载";
  }
  if (cardCodeInput) {
    cardCodeInput.disabled = hasPaidAccess();
  }
  if (logoutAccessButton) {
    logoutAccessButton.hidden = !hasPaidAccess();
  }
}

// 将服务端返回的授权状态写回前端状态树。
function syncAccessState(result = null) {
  const wasPaid = state.paidAccess;
  state.paidAccess = Boolean(result?.paid);
  state.cardCode = result?.cardCode || "";
  state.cardStatus = result?.cardStatus || (state.paidAccess ? "active" : "none");
  state.aiOptimizeCount = Number(result?.aiOptimizeCount) || 0;
  state.aiOptimizeRemaining = Number.isFinite(Number(result?.aiOptimizeRemaining))
    ? Math.max(0, Number(result.aiOptimizeRemaining))
    : 0;
  state.downloadCount = Number(result?.downloadCount) || 0;
  state.downloadRemaining = Number.isFinite(Number(result?.downloadRemaining))
    ? Math.max(0, Number(result.downloadRemaining))
    : 0;
  state.accessToken = result?.accessToken || state.accessToken || "";
  if (result && result.paid === false) {
    // 服务端确认未授权时，同步清除本地残留 token，避免“退出后仍被恢复”。
    state.accessToken = "";
    localStorage.removeItem("pixelWorkshopAccessToken");
  } else if (state.accessToken) {
    localStorage.setItem("pixelWorkshopAccessToken", state.accessToken);
  }
  if (state.paidAccess !== wasPaid) {
    // 授权状态变化后立即重绘，让预览水印同步出现/消失。
    renderCanvas();
    updateComparePreview();
  }
}

// 记录一项受保护动作，待卡密兑换成功后自动继续执行。
function queueProtectedAction(action) {
  state.pendingProtectedAction = action;
  openCardModal();
}

async function runPendingProtectedAction() {
  const action = state.pendingProtectedAction;
  state.pendingProtectedAction = null;
  if (typeof action === "function") {
    await action();
  }
}

// 卡密兑换弹窗：下载、AI 优化等需要授权的动作都会从这里进入。
function openCardModal() {
  if (!cardModalOverlay) return;
  syncAccessUi();
  cardModalOverlay.hidden = false;
  document.body.classList.add("modal-open");
  window.setTimeout(() => cardCodeInput?.focus(), 0);
}

function closeCardModal() {
  if (!cardModalOverlay) return;
  cardModalOverlay.hidden = true;
  document.body.classList.remove("modal-open");
}

// 导出扣次确认：每次导出前提示将消耗 1 次下载额度。
let pendingExportAction = null;

function confirmDownload(action) {
  pendingExportAction = action;
  if (downloadConfirmRemaining) {
    downloadConfirmRemaining.textContent = `剩余下载次数：${state.downloadRemaining}`;
  }
  if (downloadConfirmOverlay) {
    downloadConfirmOverlay.hidden = false;
    document.body.classList.add("modal-open");
  }
}

function closeDownloadConfirm() {
  pendingExportAction = null;
  if (downloadConfirmOverlay) {
    downloadConfirmOverlay.hidden = true;
    document.body.classList.remove("modal-open");
  }
}

function runPendingExport() {
  const action = pendingExportAction;
  closeDownloadConfirm();
  if (typeof action === "function") action();
}

// CSV 预览：生成清单后先展示内容，确认再下载（避免直接下载文件）。
let pendingCsv = null;

function openCsvPreview(filename, text) {
  pendingCsv = { filename, text };
  if (csvPreviewBody) csvPreviewBody.textContent = text;
  if (csvPreviewOverlay) {
    csvPreviewOverlay.hidden = false;
    document.body.classList.add("modal-open");
  }
}

function closeCsvPreview() {
  pendingCsv = null;
  if (csvPreviewOverlay) {
    csvPreviewOverlay.hidden = true;
    document.body.classList.remove("modal-open");
  }
}

async function confirmCsvDownload() {
  if (!pendingCsv) return;
  const { filename, text } = pendingCsv;
  closeCsvPreview();
  try {
    setExportBusy(true, "正在下载 CSV 清单");
    await submitDownloadForm({
      filename,
      text,
      target: isLikelyMobileBrowser() ? "_blank" : null,
    });
    await loadAccessStatus();
    setStatus("导出开始，正在下载…", "working");
  } catch (error) {
    if (isCardDeniedError(error)) {
      handleCardDenied(error.message);
      openErrorOverlay(`导出未完成：${error.message || "当前卡密已失效，请使用新卡密。"}`);
    } else {
      openErrorOverlay(`导出 CSV 失败：${error.message || "请稍后重试"}`);
    }
  } finally {
    setExportBusy(false);
    if (!state.error && state.cells.length) setStatus("图纸已生成", "ready");
  }
}

function copyCsvText() {
  if (!pendingCsv) return;
  const text = pendingCsv.text;
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    }
  };
  doCopy().then((ok) => {
    if (copyCsvButton) {
      copyCsvButton.textContent = ok ? "已复制 ✓" : "复制失败";
      window.setTimeout(() => {
        if (copyCsvButton) copyCsvButton.textContent = "复制文本";
      }, 1600);
    }
  });
}

// 页面加载时拉取当前授权状态，恢复卡密与剩余次数。
async function loadAccessStatus() {
  try {
    const url = state.accessToken
      ? `${ACCESS_STATUS_ENDPOINT}?accessToken=${encodeURIComponent(state.accessToken)}`
      : ACCESS_STATUS_ENDPOINT;
    const result = await requestJson(url, { cache: "no-store" });
    syncAccessState(result);
    syncPreviewProtectionState();
    syncAccessUi();
    updateExportState();
    if (hasPaidAccess()) {
      setRedeemMessage(`当前卡密可继续使用：AI 剩余 ${state.aiOptimizeRemaining} 次，下载剩余 ${state.downloadRemaining} 次。`, "success");
    }
  } catch {
    syncAccessUi();
  }
}

// 卡密兑换：成功后更新授权状态，并续跑之前排队的受保护动作。
async function redeemCard() {
  const cardCode = cardCodeInput?.value.trim() || "";
  if (!cardCode) {
    setRedeemMessage("请输入有效卡密后再解锁下载。", "error");
    return;
  }

  if (redeemCardButton) redeemCardButton.disabled = true;
  setRedeemMessage("正在验证卡密，请稍候…", "info");

  try {
    const result = await requestJson(REDEEM_CARD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardCode }),
    });
    if (!result?.success) {
      throw new Error(result?.message || "卡密兑换失败，请稍后重试。");
    }

    syncAccessState(result);
    syncPreviewProtectionState();
    syncAccessUi();
    updateExportState();
    setRedeemMessage(result.message || `卡密已激活：AI 剩余 ${state.aiOptimizeRemaining} 次，下载剩余 ${state.downloadRemaining} 次。`, "success");
    closeCardModal();
    await runPendingProtectedAction();
  } catch (error) {
    if (redeemCardButton) redeemCardButton.disabled = false;
    setRedeemMessage(error instanceof Error ? error.message : "卡密验证失败。", "error");
  }
}

async function logoutAccess() {
  try {
    await fetch(LOGOUT_ACCESS_ENDPOINT, { method: "POST", credentials: "include" });
  } catch {
    // ignore
  }
  state.accessToken = "";
  localStorage.removeItem("pixelWorkshopAccessToken");
  syncAccessState(null);
  state.pendingProtectedAction = null;
  if (cardCodeInput) cardCodeInput.value = "";
  syncPreviewProtectionState();
  syncAccessUi();
  updateExportState();
  setRedeemMessage("已退出当前授权，可重新输入卡密解锁下载。", "info");
}

// 卡密被拒绝（失效/作废/绑定冲突）时：展示错误并把授权状态降级，
// 用户再次点击导出时会进入卡密兑换弹窗输入新卡密。
function handleCardDenied(message) {
  state.paidAccess = false;
  state.cardStatus = "exhausted";
  state.cardCode = "";
  state.accessToken = "";
  localStorage.removeItem("pixelWorkshopAccessToken");
  state.pendingCardError = message || "当前卡密已失效，请使用新卡密。";
  state.error = state.pendingCardError;
  setRedeemMessage(state.pendingCardError, "error");
  syncPreviewProtectionState();
  syncAccessUi();
  updateExportState();
  setStatus("下载权限已失效", "error");
  canvasHint.textContent = state.pendingCardError;
  // 同时清理服务端会话 cookie，避免旧授权继续生效。
  fetch(LOGOUT_ACCESS_ENDPOINT, { method: "POST", credentials: "include" }).catch(() => {});
}

function isCardDeniedError(error) {
  return error?.status === 403 || error?.status === 409;
}

function isProtectedAssetTarget(target) {
  return target instanceof Element && Boolean(target.closest(protectedAssetSelector));
}

function preventProtectedAssetAction(event) {
  if (!isProtectedAssetTarget(event.target)) return;
  event.preventDefault();
}

// 未付款预览保护：当前主要负责在预览阶段叠加水印层。
function applyPreviewProtection(context) {
  if (!hasPreviewProtection()) return;

  const { width, height } = context.canvas;
  if (!width || !height) return;

  if (PREVIEW_PROTECTION_MODE.includes("watermark")) {
    const diagonal = Math.sqrt(width * width + height * height);
    context.save();
    context.translate(width / 2, height / 2);
    context.rotate(-Math.PI / 5);
    context.fillStyle = "rgba(17, 24, 39, 0.18)";
    context.font = `800 ${Math.max(16, Math.floor(width * 0.04))}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const stepX = Math.max(180, Math.floor(width * 0.28));
    const stepY = Math.max(96, Math.floor(height * 0.16));

    for (let y = -diagonal; y <= diagonal; y += stepY) {
      for (let x = -diagonal; x <= diagonal; x += stepX) {
        context.fillText("未付款预览", x, y);
      }
    }
    context.restore();
  }
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function quantize(value, level) {
  if (level <= 0) return value;
  const step = Math.max(1, Math.round(level / 8));
  return Math.round(value / step) * step;
}

function colorDistance(a, b) {
  const redMean = (a[0] + b[0]) / 2;
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return Math.sqrt(
    (2 + redMean / 256) * red * red +
      4 * green * green +
      (2 + (255 - redMean) / 256) * blue * blue,
  );
}



function getActivePalette() {
  return window.BEAD_PALETTES[paletteSelect.value].colors;
}

// 色系分类：基于 HSL 把 RGB 颜色归入实用色系，用于色带筛选。
function classifyColorFamily(rgb) {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max === 0 ? 0 : (max - min) / max;
  if (v > 0.92 && s < 0.12) return "白";
  if (v < 0.16) return "黑";
  if (s < 0.12) return "灰";
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  h = Math.round((h * 60 + 360) % 360);
  // 低亮度的暖色归入棕色系
  if (v < 0.5 && ((h >= 15 && h < 70) || (h >= 340))) return "棕";
  if (h < 15 || h >= 345) return "红";
  if (h < 45) return "橙";
  if (h < 70) return "黄";
  if (h < 160) return "绿";
  if (h < 200) return "青";
  if (h < 260) return "蓝";
  if (h < 300) return "紫";
  if (h < 345) return "粉";
  return "红";
}

const PALETTE_FILTERS = ["全部", "红", "橙", "黄", "绿", "青", "蓝", "紫", "粉", "棕", "灰", "白", "黑"];

// 当前色板代表色预览（下拉框下方一排小圆点）。
function renderPalettePreview() {
  if (!palettePreview) return;
  const colors = getActivePalette();
  const samples = colors.filter((c, i) => i % Math.max(1, Math.ceil(colors.length / 8)) === 0).slice(0, 8);
  palettePreview.innerHTML = samples
    .map((c) => `<i style="background:${c.hex}" title="${c.code}"></i>`)
    .join("");
}

// 色系筛选按钮组。
function renderPaletteFilters() {
  if (!paletteFilters) return;
  paletteFilters.innerHTML = PALETTE_FILTERS.map(
    (family) =>
      `<button type="button" class="palette-filter ${family === state.paletteFilter ? "active" : ""}" data-family="${family}">${family}</button>`,
  ).join("");
  paletteFilters.querySelectorAll(".palette-filter").forEach((button) => {
    button.addEventListener("click", () => {
      state.paletteFilter = button.dataset.family;
      renderPaletteFilters();
      renderEditorPalette();
    });
  });
}

function nearestPaletteColor(rgb) {
  const palette = getActivePalette();
  return palette.reduce((best, color) => {
    const distance = colorDistance(rgb, color.rgb);
    return distance < best.distance ? { ...color, distance } : best;
  }, { distance: Infinity });
}

// 切换色板时，把当前网格中的所有格子重映射到新色板的最接近颜色，
// 保证手绘内容不会丢失且画布立即按新色板重绘。
function remapCellsToActivePalette() {
  if (!state.cells.length) return false;
  const palette = getActivePalette();
  const nearest = new Map();
  const blankColor = getBlankColor();
  state.cells.forEach((line) => {
    line.forEach((cell) => {
      if (!cell) return;
      const key = `${cell.hex}`;
      if (!nearest.has(key)) {
        nearest.set(key, palette.reduce((best, color) => {
          const distance = colorDistance(cell.rgb || hexToRgb(cell.hex), color.rgb);
          return distance < best.distance ? { ...color, distance } : best;
        }, { distance: Infinity }));
      }
    });
  });
  state.cells.forEach((line, row) => {
    line.forEach((cell, col) => {
      if (!cell) return;
      const matched = nearest.get(`${cell.hex}`);
      if (matched) line[col] = matched;
    });
  });
  recomputeCounts();
  renderCanvas();
  syncUiSummary();
  schedulePatternSave();
  return true;
}

function syncPreprocessControls() {
  const aiEnabled = aiOptimizeSelect.value === "on";
  aiPromptInput.disabled = !aiEnabled;
  confirmAiPrompt.disabled = !aiEnabled;
  processedPreviewLabel.textContent = describePreprocessOptions().length ? "预处理后" : "当前生成源";
}

function setPreprocessPanelOpen(open) {
  preprocessOverlay.hidden = !open;
  topbarPreprocessButton.setAttribute("aria-expanded", String(open));
}

// AI 提示词快捷模板：选中即填入输入框并确认。
function applyAiPromptPreset() {
  if (!aiPromptPreset || !aiPromptInput) return;
  const value = aiPromptPreset.value;
  if (!value) return;
  aiPromptInput.value = value;
  aiPromptPreset.value = "";
}

function togglePreprocessPanel() {
  setPreprocessPanelOpen(preprocessOverlay.hidden);
}

function describePreprocessOptions() {
  const labels = [];
  if (aiOptimizeSelect.value === "on") labels.push("AI 优化");
  return labels;
}

function canvasToDataUrl(canvasElement, maxSizeKB = 4096) {
  let dataUrl = canvasElement.toDataURL("image/png");
  let sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);

  if (sizeKB > maxSizeKB) {
    let quality = 0.9;
    while (sizeKB > maxSizeKB && quality > 0.35) {
      dataUrl = canvasElement.toDataURL("image/jpeg", quality);
      sizeKB = Math.round((dataUrl.length * 3) / 4 / 1024);
      quality -= 0.1;
    }
  }

  if (sizeKB <= maxSizeKB) return dataUrl;

  const scale = Math.sqrt(maxSizeKB / sizeKB) * 0.9;
  const resizedCanvas = document.createElement("canvas");
  const resizedContext = resizedCanvas.getContext("2d", { willReadFrequently: true });
  resizedCanvas.width = Math.max(1, Math.floor(canvasElement.width * scale));
  resizedCanvas.height = Math.max(1, Math.floor(canvasElement.height * scale));
  resizedContext.imageSmoothingEnabled = true;
  resizedContext.imageSmoothingQuality = "high";
  resizedContext.drawImage(canvasElement, 0, 0, resizedCanvas.width, resizedCanvas.height);
  return canvasToDataUrl(resizedCanvas, maxSizeKB);
}

function loadImageSource(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error("AI 优化结果图片解析失败。")), { once: true });
    image.src = src;
  });
}

// AI 优化入口：统一走本地服务端接口，并受卡密次数与图片绑定限制约束。
function getAiCacheInfo(image) {
  const sourceCanvas = normalizeSourceImage(image, 2048);
  const imageBase64 = canvasToDataUrl(sourceCanvas);
  const prompt = state.confirmedAiPrompt || DEFAULT_AI_PROMPT;
  const cacheKey = `${state.sourceName}:${image.width}x${image.height}:${imageBase64.length}:${prompt}`;
  return { imageBase64, prompt, cacheKey };
}

async function optimizeImageWithAI(image, aiInfo = null) {
  if (!state.sourceFingerprint) {
    throw new Error("未识别到当前图片，请重新上传后再试。");
  }
  const info = aiInfo || getAiCacheInfo(image);
  const { imageBase64, prompt, cacheKey } = info;

  if (state.aiOptimizeCacheKey === cacheKey && state.aiOptimizeCacheImage) {
    return state.aiOptimizeCacheImage;
  }

  if (state.aiOptimizeInFlightKey === cacheKey && state.aiOptimizeInFlightPromise) {
    return state.aiOptimizeInFlightPromise;
  }

  // 只有真正发起新的 AI 优化（缓存未命中）时才校验卡密
  if (!hasPaidAccess()) {
    queueProtectedAction(() => processCurrentImage());
    throw new Error("请先兑换卡密后再使用 AI 优化。");
  }

  state.aiOptimizeInFlightKey = cacheKey;
  state.aiOptimizeInFlightPromise = (async () => {
    let response;
    try {
      response = await fetch(AI_OPTIMIZE_ENDPOINT, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          prompt,
          imageHash: state.sourceFingerprint,
          accessToken: state.accessToken || undefined,
        }),
      });
    } catch {
      throw new Error("连接 AI 优化服务失败，请确认已通过 npm run dev 启动");
    }

    let result = null;
    try {
      result = await response.json();
    } catch {
      throw new Error(`AI 优化接口返回异常：${response.status}`);
    }

    if (!response.ok || !result?.success || !result?.imageUrl) {
      const aiError = new Error(result?.message || result?.error || `AI 优化失败：${response.status}`);
      aiError.status = response.status;
      throw aiError;
    }

    syncAccessState(result);
    syncAccessUi();
    const optimizedImage = await loadImageSource(result.imageUrl);
    state.aiOptimizeCacheKey = cacheKey;
    state.aiOptimizeCacheImage = optimizedImage;
    return optimizedImage;
  })();

  try {
    return await state.aiOptimizeInFlightPromise;
  } finally {
    if (state.aiOptimizeInFlightKey === cacheKey) {
      state.aiOptimizeInFlightKey = "";
      state.aiOptimizeInFlightPromise = null;
    }
  }
}

function normalizeSourceImage(image, maxSide = 1600) {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvasElement = document.createElement("canvas");
  const context = canvasElement.getContext("2d", { willReadFrequently: true });
  canvasElement.width = width;
  canvasElement.height = height;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvasElement;
}

function computeBackgroundColor(context, width, height) {
  const sampleSize = Math.max(4, Math.floor(Math.min(width, height) * 0.04));
  const regions = [
    [0, 0],
    [Math.max(0, width - sampleSize), 0],
    [0, Math.max(0, height - sampleSize)],
    [Math.max(0, width - sampleSize), Math.max(0, height - sampleSize)],
  ];
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  regions.forEach(([x, y]) => {
    const data = context.getImageData(x, y, sampleSize, sampleSize).data;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      red += data[index] * alpha + 255 * (1 - alpha);
      green += data[index + 1] * alpha + 255 * (1 - alpha);
      blue += data[index + 2] * alpha + 255 * (1 - alpha);
      count += 1;
    }
  });

  return [Math.round(red / count), Math.round(green / count), Math.round(blue / count)];
}

function applyBackgroundRemoval(canvasElement, tolerance) {
  const context = canvasElement.getContext("2d", { willReadFrequently: true });
  const width = canvasElement.width;
  const height = canvasElement.height;
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  const background = computeBackgroundColor(context, width, height);
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;
  const borderBand = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) * 0.012)));

  function getPixelMetrics(pixelIndex) {
    const offset = pixelIndex * 4;
    const alpha = data[offset + 3];
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    return {
      offset,
      alpha,
      red,
      green,
      blue,
      saturation: max - min,
      brightness: (red + green + blue) / 3,
      distance: Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]),
    };
  }

  function matchesBackground(pixelIndex, mode = "strict") {
    const metrics = getPixelMetrics(pixelIndex);
    if (metrics.alpha < 10) return true;

    const brightnessGap = Math.abs(metrics.brightness - ((background[0] + background[1] + background[2]) / 3));
    const isNearNeutral = metrics.saturation <= tolerance * 2.8;
    const strictDistance = tolerance * 3.8;
    const relaxedDistance = tolerance * 5.4;
    const fringeDistance = tolerance * 6.2;

    if (mode === "strict") {
      return metrics.distance <= strictDistance && metrics.saturation <= tolerance * 1.9;
    }

    if (mode === "relaxed") {
      return (
        metrics.distance <= relaxedDistance &&
        isNearNeutral &&
        brightnessGap <= tolerance * 2.6
      );
    }

    return (
      metrics.distance <= fringeDistance &&
      metrics.saturation <= tolerance * 3.4 &&
      brightnessGap <= tolerance * 3.1
    );
  }

  function enqueue(pixelIndex, mode = "strict") {
    if (!visited[pixelIndex] && matchesBackground(pixelIndex, mode)) {
      visited[pixelIndex] = 1;
      queue[tail] = pixelIndex;
      tail += 1;
    }
  }

  for (let band = 0; band < borderBand; band += 1) {
    for (let x = 0; x < width; x += 1) {
      enqueue(band * width + x, "relaxed");
      enqueue((height - 1 - band) * width + x, "relaxed");
    }
    for (let y = 0; y < height; y += 1) {
      enqueue(y * width + band, "relaxed");
      enqueue(y * width + (width - 1 - band), "relaxed");
    }
  }

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const offset = pixelIndex * 4;
    data[offset + 3] = 0;
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < width - 1) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y < height - 1) enqueue(pixelIndex + width);
  }

  for (let pixelIndex = 0; pixelIndex < total; pixelIndex += 1) {
    if (visited[pixelIndex]) continue;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const { offset } = getPixelMetrics(pixelIndex);
    let removedNeighbors = 0;
    if (x > 0 && visited[pixelIndex - 1]) removedNeighbors += 1;
    if (x < width - 1 && visited[pixelIndex + 1]) removedNeighbors += 1;
    if (y > 0 && visited[pixelIndex - width]) removedNeighbors += 1;
    if (y < height - 1 && visited[pixelIndex + width]) removedNeighbors += 1;

    if (removedNeighbors >= 3 && matchesBackground(pixelIndex, "relaxed")) {
      visited[pixelIndex] = 1;
      data[offset + 3] = 0;
      continue;
    }

    if (removedNeighbors >= 1 && matchesBackground(pixelIndex, "fringe")) {
      data[offset + 3] = Math.min(data[offset + 3], removedNeighbors >= 2 ? 40 : 72);
    }
  }

  context.putImageData(imageData, 0, 0);
}

async function buildProcessedSource(image, aiInfo = null) {
  const options = {
    aiOptimize: aiOptimizeSelect.value === "on",
  };

  if (!options.aiOptimize) {
    return image;
  }

  return optimizeImageWithAI(image, aiInfo);
}

function drawPreviewThumbnail(context, source) {
  const width = context.canvas.width;
  const height = context.canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);

  if (!source) {
    context.fillStyle = "#94a3b8";
    context.font = "600 16px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("等待图片", width / 2, height / 2);
    return;
  }

  const scale = Math.min(width / source.width, height / source.height);
  const drawWidth = Math.max(1, Math.round(source.width * scale));
  const drawHeight = Math.max(1, Math.round(source.height * scale));
  const offsetX = Math.round((width - drawWidth) / 2);
  const offsetY = Math.round((height - drawHeight) / 2);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
  applyPreviewProtection(context);
}

// 构建对比面板预览：用于展示原图与预处理结果之间的差异。
function updateComparePreview(originalSource = null, processedSource = null) {
  const hasUploadedImage = state.sourceType === "image" && state.originalImage;
  comparePanel.hidden = !hasUploadedImage;

  if (!hasUploadedImage) {
    drawPreviewThumbnail(sourcePreviewCtx, null);
    drawPreviewThumbnail(processedPreviewCtx, null);
    compareSummary.textContent = "上传图片后查看原图与预处理结果差异";
    processedPreviewLabel.textContent = "预处理后";
    return;
  }

  const preprocessLabels = describePreprocessOptions();
  drawPreviewThumbnail(sourcePreviewCtx, originalSource || state.originalImage);
  drawPreviewThumbnail(processedPreviewCtx, processedSource || state.image || state.originalImage);
  compareSummary.textContent = preprocessLabels.length
    ? `当前预处理：${preprocessLabels.join(" / ")}`
    : "当前未开启预处理，右侧显示当前生成源";
  processedPreviewLabel.textContent = preprocessLabels.length ? "预处理后" : "当前生成源";
}

function resizePreviewCanvas() {
  const frameSize = Math.max(320, Math.floor(canvasFrame.clientWidth));
  if (!frameSize || frameSize === canvas.width) return;
  canvas.width = frameSize;
  canvas.height = frameSize;
  renderCanvas();
}

function fitImage(image, targetCols) {
  const ratio = image.height / image.width;
  return Math.max(1, Math.round(targetCols * ratio));
}

// 从边缘连通区域识别白底背景，用来避免白底被计入拼豆统计数。
function buildSampleBackgroundMask(imageData, cols, rows) {
  const total = cols * rows;
  const visited = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;
  const cornerIndexes = [
    0,
    Math.max(0, cols - 1),
    Math.max(0, (rows - 1) * cols),
    Math.max(0, rows * cols - 1),
  ];

  let avgRed = 0;
  let avgGreen = 0;
  let avgBlue = 0;
  cornerIndexes.forEach((pixelIndex) => {
    const offset = pixelIndex * 4;
    avgRed += imageData[offset];
    avgGreen += imageData[offset + 1];
    avgBlue += imageData[offset + 2];
  });
  avgRed /= cornerIndexes.length;
  avgGreen /= cornerIndexes.length;
  avgBlue /= cornerIndexes.length;
  const avgBrightness = (avgRed + avgGreen + avgBlue) / 3;

  function isBackground(pixelIndex) {
    const offset = pixelIndex * 4;
    const alpha = imageData[offset + 3];
    if (alpha < 12) return true;

    const red = imageData[offset];
    const green = imageData[offset + 1];
    const blue = imageData[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const saturation = max - min;
    const brightness = (red + green + blue) / 3;
    const distance = Math.abs(red - avgRed) + Math.abs(green - avgGreen) + Math.abs(blue - avgBlue);
    const brightnessGap = Math.abs(brightness - avgBrightness);

    return (
      brightness >= 238 &&
      saturation <= 22 &&
      distance <= 52 &&
      brightnessGap <= 18
    );
  }

  function enqueue(pixelIndex) {
    if (!visited[pixelIndex] && isBackground(pixelIndex)) {
      visited[pixelIndex] = 1;
      queue[tail] = pixelIndex;
      tail += 1;
    }
  }

  for (let x = 0; x < cols; x += 1) {
    enqueue(x);
    enqueue((rows - 1) * cols + x);
  }
  for (let y = 0; y < rows; y += 1) {
    enqueue(y * cols);
    enqueue(y * cols + (cols - 1));
  }

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const x = pixelIndex % cols;
    const y = Math.floor(pixelIndex / cols);
    if (x > 0) enqueue(pixelIndex - 1);
    if (x < cols - 1) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - cols);
    if (y < rows - 1) enqueue(pixelIndex + cols);
  }

  return visited;
}

// 核心取样逻辑：缩放源图到目标网格、映射色板并生成颜色统计。
function sampleImage(image, cols) {
  const rows = fitImage(image, cols);
  const sourceCanvas = document.createElement("canvas");
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

  sourceCanvas.width = cols;
  sourceCanvas.height = rows;
  sourceContext.fillStyle = "#ffffff";
  sourceContext.fillRect(0, 0, cols, rows);
  sourceContext.imageSmoothingEnabled = true;
  sourceContext.imageSmoothingQuality = "high";
  sourceContext.drawImage(image, 0, 0, cols, rows);

  const imageData = sourceContext.getImageData(0, 0, cols, rows).data;
  const backgroundMask = buildSampleBackgroundMask(imageData, cols, rows);
  const cells = [];
  const counts = new Map();
  const merge = Number(mergeLevel.value);
  const blankColor = getBlankColor();

  for (let row = 0; row < rows; row += 1) {
    const line = [];
    for (let col = 0; col < cols; col += 1) {
      const index = (row * cols + col) * 4;
      const alpha = imageData[index + 3] / 255;
      const raw = [
        Math.round(imageData[index] * alpha + 255 * (1 - alpha)),
        Math.round(imageData[index + 1] * alpha + 255 * (1 - alpha)),
        Math.round(imageData[index + 2] * alpha + 255 * (1 - alpha)),
      ].map((value) => Math.max(0, Math.min(255, quantize(value, merge))));
      const color = backgroundMask[row * cols + col] ? blankColor : nearestPaletteColor(raw);

      line.push(color);
      if (color.code !== blankColor.code) {
        counts.set(color.code, {
          code: color.code,
          label: color.label || "",
          hex: color.hex,
          count: (counts.get(color.code)?.count || 0) + 1,
        });
      }
    }
    cells.push(line);
  }

  state.cells = cells;
  state.cols = cols;
  state.rows = rows;
  state.counts = counts;
}

// 手绘或擦除后重新统计颜色数量；这里会跳过被视为背景的白色格子。
function recomputeCounts() {
  const counts = new Map();
  const blankColor = getBlankColor();

  state.cells.forEach((line) => {
    line.forEach((color) => {
      if (color.code === blankColor.code) return;
      counts.set(color.code, {
        code: color.code,
        label: color.label || "",
        hex: color.hex,
        count: (counts.get(color.code)?.count || 0) + 1,
      });
    });
  });

  state.counts = counts;
}

function pushHistorySnapshot() {
  if (!state.cells.length) return;
  state.history.push(cloneCells(state.cells));
  if (state.history.length > 40) {
    state.history.shift();
  }
}

function updateEditorActions() {
  const hasCells = state.cells.length > 0;
  const exportLocked = state.exportBusy;
  undoEditButton.disabled = !state.history.length || exportLocked;
  if (redoEditButton) redoEditButton.disabled = !state.redoHistory.length || exportLocked;
  clearBoardButton.disabled = !hasCells;
  if (projectLibraryButton) projectLibraryButton.disabled = !hasCells || exportLocked;
  brushTool.disabled = !hasCells || exportLocked;
  eraserTool.disabled = !hasCells || exportLocked;
  if (clearSaveButton) clearSaveButton.disabled = !hasCells;
}

function updateWorkspaceLayout() {
  const hasPattern = state.cells.length > 0;
  toolCard.classList.toggle("pattern-ready", hasPattern);
  toolGrid.dataset.mode = hasPattern ? "pattern-ready" : "idle";
  toolTopbarActions.hidden = !hasPattern;
}

function setSelectedColor(code) {
  state.selectedColorCode = code;
  const color = getPaletteColorByCode(code);
  activeColorChip.style.background = color.hex;
  activeColorText.textContent = `${color.code} · ${color.hex.toUpperCase()}`;

  editorPalette.querySelectorAll(".palette-swatch").forEach((button) => {
    button.classList.toggle("active", button.dataset.code === code);
  });
}

function setEditorTool(tool) {
  state.editorTool = tool;
  brushTool.classList.toggle("active", tool === "brush");
  eraserTool.classList.toggle("active", tool === "eraser");
  brushTool.classList.toggle("secondary", tool !== "brush");
  eraserTool.classList.toggle("secondary", tool !== "eraser");
  editorModeText.textContent = tool === "brush" ? "画笔模式" : "橡皮模式";
}

function renderEditorPalette() {
  editorPalette.innerHTML = "";
  let colors = getActivePalette();
  if (state.paletteFilter && state.paletteFilter !== "全部") {
    colors = colors.filter((color) => classifyColorFamily(color.rgb) === state.paletteFilter);
  }
  // 当前图纸用到的颜色置顶（按用量排序），其余按原顺序跟在后面，方便手绘时快速取色。
  const used = new Map();
  state.counts.forEach((row) => used.set(row.code, row.count));
  colors = colors
    .map((color) => ({ color, used: used.get(color.code) || 0 }))
    .sort((a, b) => b.used - a.used)
    .map((item) => item.color);

  colors.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "palette-swatch";
    button.dataset.code = color.code;
    const colorLabel = color.label ? ` ${color.label}` : "";
    button.title = `${color.code}${colorLabel} ${color.hex.toUpperCase()}`;
    button.setAttribute("aria-label", `${color.code}${colorLabel} ${color.hex.toUpperCase()}`);
    button.innerHTML = `<i style="background:${color.hex}"></i><span>${color.code}</span>`;
    button.addEventListener("click", () => {
      setSelectedColor(color.code);
      setEditorTool("brush");
    });
    editorPalette.append(button);
  });

  if (!colors.length) {
    editorPalette.innerHTML = '<p class="palette-empty">该色系下暂无颜色</p>';
  }

  const fallbackCode = colors.some((color) => color.code === state.selectedColorCode)
    ? state.selectedColorCode
    : colors[0]?.code || getActivePalette()[0].code;
  setSelectedColor(fallbackCode);
  updateEditorActions();
}

function drawEmptyPreview() {
  const grid = 16;
  const cell = canvas.width / grid;

  for (let row = 0; row < grid; row += 1) {
    for (let col = 0; col < grid; col += 1) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#f1f5f9" : "#ffffff";
      ctx.fillRect(col * cell, row * cell, cell, cell);
    }
  }

  ctx.fillStyle = "#3157d5";
  ctx.font = `700 ${Math.max(22, Math.floor(canvas.width * 0.045))}px system-ui`;
  ctx.textAlign = "center";
  ctx.fillText("上传图片生成图纸", canvas.width / 2, canvas.height / 2);
  updateComparePreview();
}

function updateExportState() {
  const hasPattern = state.cells.length > 0;
  [downloadCodePng, downloadCleanPng, downloadCsv, printPatternButton].forEach((button) => {
    button.disabled = !hasPattern || state.exportBusy;
    if (button && hasPattern) {
      button.title = button.title || "导出将消耗 1 次下载额度";
    }
  });
  updateWorkspaceLayout();
  updateEditorActions();
}

function isLikelyMobileBrowser() {
  const userAgent = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Windows Phone/i.test(userAgent);
}

function isIOSBrowser() {
  const userAgent = navigator.userAgent || "";
  const isTouchMac = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/i.test(userAgent) || isTouchMac;
}

function setExportBusy(isBusy, label = "") {
  state.exportBusy = isBusy;
  updateExportState();
  if (isBusy) {
    setStatus(label || "正在导出", "working");
  }
}

function createExportWindow(title) {
  if (!isLikelyMobileBrowser()) return null;

  const windowName = `export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const exportWindow = window.open("", windowName, "noopener,noreferrer");
  if (!exportWindow) return null;

  exportWindow.document.title = title;
  exportWindow.document.write(`<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif; margin: 0; padding: 24px 18px 40px; color: #111827; background: #f8fafc; }
        h1 { font-size: 20px; margin: 0 0 12px; }
        p { line-height: 1.7; color: #475569; }
        .card { max-width: 860px; margin: 0 auto; padding: 18px; border-radius: 20px; background: white; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08); }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${title}</h1>
        <p>如果导出的文件没有自动下载，请不要关闭此页面。</p>
      </div>
    </body>
  </html>`);
  exportWindow.document.close();
  return exportWindow;
}

async function renderBlobInExportWindow(exportWindow, filename, blob, kind) {
  if (!exportWindow || exportWindow.closed) return;

  const objectUrl = URL.createObjectURL(blob);
  try {
    exportWindow.location.href = objectUrl;
    exportWindow.document.title = filename;
  } catch {
    if (typeof exportWindow.open === "function") {
      exportWindow.open(objectUrl, "_blank", "noopener,noreferrer");
    }
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

async function shareBlobIfSupported(filename, blob) {
  if (typeof navigator.share !== "function" || typeof File === "undefined") {
    return false;
  }

  try {
    const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [file] })) {
      return false;
    }
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (error) {
    return false;
  }
}

async function downloadBlob(filename, blob, options = {}) {
  const { openFallback = false, exportWindow = null, kind = "file" } = options;
  if (exportWindow) {
    await renderBlobInExportWindow(exportWindow, filename, blob, kind);
    return;
  }

  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const shouldOpenFallback = openFallback && isLikelyMobileBrowser();

  link.href = objectUrl;
  if (!shouldOpenFallback) {
    link.download = filename;
  } else {
    link.target = "_blank";
    link.rel = "noopener";
  }

  document.body.append(link);
  link.click();
  link.remove();

  if (shouldOpenFallback) {
    canvasHint.textContent = "当前浏览器可能不支持直接下载，已改为打开结果页面，请长按或使用系统分享保存。";
  }

  setTimeout(() => URL.revokeObjectURL(objectUrl), shouldOpenFallback ? 60_000 : 5_000);
}

function canvasToBlob(canvasElement, type = "image/png") {
  return new Promise((resolve, reject) => {
    if (!canvasElement) {
      reject(new Error("浏览器不支持读取图片"));
      return;
    }

    if (typeof canvasElement.toBlob === "function") {
      canvasElement.toBlob((blob) => {
        if (!blob) {
          reject(new Error("导出失败，浏览器没有返回文件数据"));
          return;
        }
        resolve(blob);
      }, type);
      return;
    }

    try {
      const dataUrl = canvasElement.toDataURL(type);
      const [meta, base64] = dataUrl.split(",");
      const mime = meta.match(/data:(.*?);base64/)?.[1] || type;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      resolve(new Blob([bytes], { type: mime }));
    } catch (error) {
      reject(error);
    }
  });
}

// Convert a Blob to a data URL (base64), used for server POST form submission
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    try {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });
}

// Submit a download request via fetch so the front end can display backend messages.
async function submitDownloadForm({ filename, dataUrl = null, text = null, target = null }) {
  const payload = {
    filename: filename ? filename.replace(/\.[^/.]+$/, "") : "export",
    imageHash: state.sourceFingerprint,
    accessToken: state.accessToken || "",
  };

  if (dataUrl) payload.dataUrl = dataUrl;
  if (text !== null && text !== undefined) payload.text = text;

  const response = await fetch(`${APP_API_BASE}/api/download`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "下载失败，请稍后重试。";
    try {
      const data = await response.json();
      if (data?.message) message = data.message;
      else if (data?.error) message = data.error;
    } catch {
      const bodyText = await response.text();
      if (bodyText) message = bodyText;
    }
    const downloadError = new Error(message);
    downloadError.status = response.status;
    throw downloadError;
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const inferredName = filename || "download";
  const downloadName = parseFilenameFromContentDisposition(contentDisposition) || inferredName;
  const objectUrl = URL.createObjectURL(blob);

  try {
    if (target === "_blank") {
      const win = window.open(objectUrl, "_blank", "noopener,noreferrer");
      if (win) {
        win.focus();
      } else {
        download(downloadName, objectUrl);
      }
    } else {
      download(downloadName, objectUrl);
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  }
}

function parseFilenameFromContentDisposition(headerValue) {
  if (!headerValue) return null;
  // 优先解析 RFC 5987 的 UTF-8 文件名（filename*=UTF-8''...），保证中文文件名正确。
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // 解码失败时回退到 ASCII 文件名
    }
  }
  const asciiMatch = /filename="?([^";]+)"?/i.exec(headerValue);
  return asciiMatch ? asciiMatch[1].trim() : null;
}

function showMobileDownloadOverlay(filename, dataUrl, kind) {
  // Remove existing overlay if present
  const existing = document.getElementById('mobile-download-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mobile-download-overlay';
  overlay.style.position = 'fixed';
  overlay.style.left = '0';
  overlay.style.top = '0';
  overlay.style.right = '0';
  overlay.style.bottom = '0';
  overlay.style.background = 'rgba(0,0,0,0.6)';
  overlay.style.zIndex = '999999';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '18px';

  const card = document.createElement('div');
  card.style.maxWidth = '960px';
  card.style.width = '100%';
  card.style.background = '#fff';
  card.style.borderRadius = '14px';
  card.style.padding = '16px';
  card.style.boxSizing = 'border-box';

  const title = document.createElement('h2');
  title.textContent = filename;
  title.style.margin = '0 0 8px 0';
  title.style.fontSize = '18px';
  card.appendChild(title);

  if (kind === 'image') {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.borderRadius = '12px';
    img.setAttribute('draggable', 'false');
    card.appendChild(img);

    const p = document.createElement('p');
    p.textContent = "当前预览已禁止右键保存，请使用平台授权流程获取正式下载结果。";
    p.style.marginTop = '10px';
    card.appendChild(p);
  } else {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.textContent = "打开下载结果（会在新标签页打开后使用系统保存/分享）";
    link.target = '_blank';
    link.style.display = 'inline-block';
    link.style.margin = '8px 0';
    link.style.color = '#3157d5';
    card.appendChild(link);

    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.wordBreak = 'break-word';
    pre.style.padding = '12px';
    pre.style.borderRadius = '12px';
    pre.style.background = '#f8fafc';
    pre.textContent = dataUrl.slice(0, 2000);
    card.appendChild(pre);
  }

  const close = document.createElement('button');
  close.textContent = "关闭";
  close.style.marginTop = '12px';
  close.className = 'secondary';
  close.addEventListener('click', () => overlay.remove());
  card.appendChild(close);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// 统计面板渲染：刷新总颗粒数与右侧颜色清单。
function updateStats() {
  const rows = Array.from(state.counts.values()).sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  totalBeads.textContent = `${total} 颗`;
  if (sizeHint) {
    sizeHint.textContent = state.cells.length
      ? `成品约 ${(state.cols * 0.5).toFixed(1)} × ${(state.rows * 0.5).toFixed(1)} cm（按 5mm 豆径估算）`
      : "";
  }
  if (copyPaletteListButton) copyPaletteListButton.disabled = !rows.length;

  if (!rows.length) {
    paletteList.innerHTML = '<p class="empty-state">暂无色号统计，上传图片或开始绘制后显示。</p>';
    return;
  }

  paletteList.innerHTML = rows.map((row) => `
    <div class="palette-row">
      <i style="background:${row.hex}"></i>
      <strong>${row.code}</strong>
      <span>${row.label ? `${row.label} · ` : ""}${row.hex.toUpperCase()}</span>
      <b>${row.count}</b>
    </div>
  `).join("");
}

// 复制色号清单文本到剪贴板，方便发到微信群/笔记。
async function copyPaletteList() {
  const rows = Array.from(state.counts.values()).sort((a, b) => b.count - a.count);
  if (!rows.length) return;
  const lines = [
    `拼豆图纸 · ${state.cols} x ${state.rows} · 共 ${rows.reduce((sum, row) => sum + row.count, 0)} 颗`,
    `色板：${window.BEAD_PALETTES[paletteSelect.value].label}`,
    "",
    "色号 | 颜色 | 数量",
    ...rows.map((row) => `${row.code} | ${row.label || row.hex.toUpperCase()} | ${row.count}`),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showCopyFeedback();
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = lines.join("\n");
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
    showCopyFeedback();
  }
}

// 复制成功反馈：按钮短暂变为「已复制 ✓」。
function showCopyFeedback() {
  if (!copyPaletteListButton || !copyPaletteListText) return;
  if (copyFeedbackTimer) window.clearTimeout(copyFeedbackTimer);
  copyPaletteListButton.classList.add("copied");
  copyPaletteListText.textContent = "已复制 ✓";
  copyFeedbackTimer = window.setTimeout(() => {
    copyPaletteListButton.classList.remove("copied");
    copyPaletteListText.textContent = "复制清单";
    copyFeedbackTimer = null;
  }, 1600);
}

// 主画布渲染：负责把 state.cells 画成可见图纸，并叠加网格与保护层。
function renderCanvas() {
  const cells = state.cells;
  const rows = cells.length;
  const cols = cells[0]?.length || 0;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!rows || !cols) {
    drawEmptyPreview();
    updateStats();
    updateExportState();
    return;
  }

  const padding = Math.max(6, Math.floor(canvas.width * 0.012));
  // 用浮点格宽精确均分可用区域，避免格数大时向下取整导致图案缩小
  const cellSize = Math.max(
    1,
    Math.min((canvas.width - padding * 2) / cols, (canvas.height - padding * 2) / rows),
  );
  const chartWidth = cellSize * cols;
  const chartHeight = cellSize * rows;
  const offsetX = Math.round((canvas.width - chartWidth) / 2);
  const offsetY = Math.round((canvas.height - chartHeight) / 2);
  state.renderMetrics = { padding, cellSize, chartWidth, chartHeight, offsetX, offsetY, cols, rows };

  cells.forEach((line, row) => {
    const y0 = Math.round(offsetY + row * cellSize);
    const y1 = Math.round(offsetY + (row + 1) * cellSize);
    line.forEach((cell, col) => {
      const x0 = Math.round(offsetX + col * cellSize);
      const x1 = Math.round(offsetX + (col + 1) * cellSize);
      ctx.fillStyle = cell.hex;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    });
  });

  if (gridLine.value === "on" && cellSize >= 3) {
    ctx.strokeStyle = "rgba(17, 24, 39, 0.2)";
    ctx.lineWidth = 1;
    for (let col = 0; col <= cols; col += 1) {
      const x = offsetX + col * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + chartHeight);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = offsetY + row * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + chartWidth, y);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = "rgba(17, 24, 39, 0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(offsetX, offsetY, chartWidth, chartHeight);
  applyPreviewProtection(ctx);

  updateStats();
  updateExportState();
}

// 右侧摘要文案同步：展示色板、预处理与下载授权状态。
function syncUiSummary() {
  gridOutput.textContent = gridSize.value;
  mergeOutput.textContent = mergeLevel.value;
  syncPreprocessControls();

  if (!state.cells.length) {
    controlNote.textContent = hasPreviewProtection()
      ? "当前预览版未解锁下载权限，请先兑换卡密后再下载图纸。"
      : "上传图片后会自动生成图纸，也可选 AI 优化预处理。";
    return;
  }

  const preprocessLabels = describePreprocessOptions();
  const preprocessText = preprocessLabels.length ? ` · 预处理：${preprocessLabels.join(" / ")}` : "";
  const protectionText = hasPreviewProtection() ? " · 下载权限未解锁" : " · 下载权限已解锁";
  controlNote.textContent = `当前使用 ${window.BEAD_PALETTES[paletteSelect.value].label} 色板，共 ${state.counts.size} 种颜色${preprocessText}${protectionText}`;
}

// 读取空白背景色：当前统一取最接近纯白的色板颜色。
function getBlankColor() {
  return nearestPaletteColor([255, 255, 255]);
}

function getCellFromPointer(event) {
  if (!state.renderMetrics || !state.cells.length) return null;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (event.clientX - rect.left) * scaleX;
  const y = (event.clientY - rect.top) * scaleY;
  const { offsetX, offsetY, cellSize, cols, rows } = state.renderMetrics;
  const col = Math.floor((x - offsetX) / cellSize);
  const row = Math.floor((y - offsetY) / cellSize);

  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return { row, col };
}

function applyCellPaint(row, col) {
  const line = state.cells[row];
  if (!line) return false;

  const nextColor = state.editorTool === "eraser"
    ? getBlankColor()
    : getPaletteColorByCode(state.selectedColorCode);
  const currentColor = line[col];

  if (!currentColor || currentColor.code === nextColor.code) return false;

  line[col] = nextColor;
  return true;
}

function commitEdit() {
  recomputeCounts();
  renderCanvas();
  syncUiSummary();
  schedulePatternSave();
  canvasHint.textContent = `手绘编辑已更新，当前图纸为 ${state.cols} x ${state.rows}。`;
  setStatus("编辑中", "ready");
}

function beginPaint(event) {
  if (!state.cells.length) return;
  const hit = getCellFromPointer(event);
  if (!hit) return;

  pushHistorySnapshot();
  state.isDrawing = true;
  if (canvas.setPointerCapture) {
    canvas.setPointerCapture(event.pointerId);
  }

  const changed = applyCellPaint(hit.row, hit.col);
  if (!changed) {
    state.history.pop();
    updateEditorActions();
    return;
  }

  commitEdit();
}

function movePaint(event) {
  if (!state.isDrawing || !state.cells.length) return;
  const hit = getCellFromPointer(event);
  if (!hit) return;

  if (applyCellPaint(hit.row, hit.col)) {
    commitEdit();
  }
}

function endPaint(event) {
  state.isDrawing = false;
  if (canvas.hasPointerCapture && canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function undoEdit() {
  const previous = state.history.pop();
  if (!previous) return;
  state.redoHistory.push(cloneCells(state.cells));
  if (state.redoHistory.length > 40) state.redoHistory.shift();
  state.cells = cloneCells(previous);
  state.rows = state.cells.length;
  state.cols = state.cells[0]?.length || state.cols;
  recomputeCounts();
  renderCanvas();
  syncUiSummary();
  schedulePatternSave();
  canvasHint.textContent = "已撤销上一步编辑。";
  setStatus("编辑中", "ready");
}

function redoEdit() {
  const next = state.redoHistory.pop();
  if (!next) return;
  state.history.push(cloneCells(state.cells));
  if (state.history.length > 40) state.history.shift();
  state.cells = cloneCells(next);
  state.rows = state.cells.length;
  state.cols = state.cells[0]?.length || state.cols;
  recomputeCounts();
  renderCanvas();
  syncUiSummary();
  schedulePatternSave();
  canvasHint.textContent = "已重做下一步编辑。";
  setStatus("编辑中", "ready");
}

function clearBoard() {
  if (!state.cells.length) return;
  pushHistorySnapshot();
  const blank = getBlankColor();
  state.cells = Array.from({ length: state.rows }, () => Array.from({ length: state.cols }, () => blank));
  commitEdit();
  canvasHint.textContent = "图纸已清空，现在可以从空白网格继续绘制。";
}

// 主图处理流程：串联 AI 优化、网格采样、预览刷新与状态更新。
async function processCurrentImage() {
  const token = (state.processToken += 1);
  const usesAi = aiOptimizeSelect.value === "on";
  clearError();
  state.history = [];
  state.redoHistory = [];
  syncUiSummary();

  if (state.sourceType === "blank") {
    createBlankBoard({ preserveHistory: false, preserveSourceFingerprint: true });
    return;
  }

  if (!state.originalImage) {
    renderCanvas();
    return;
  }

  let aiInfo = null;
  try {
    if (usesAi) {
      aiInfo = getAiCacheInfo(state.originalImage);
      const cacheHit =
        (state.aiOptimizeCacheKey === aiInfo.cacheKey && state.aiOptimizeCacheImage) ||
        (state.aiOptimizeInFlightKey === aiInfo.cacheKey && state.aiOptimizeInFlightPromise);
      if (cacheHit) {
        // 复用已有 AI 结果，不需要再次请求，也不展示优化中的遮罩
        setStatus("正在生成图纸", "working");
      } else {
        setStatus("正在 AI 优化图片，请稍等", "working");
        canvasHint.textContent = "系统正在根据提示词优化图片，通常需要几十秒到 1-2 分钟，请不要频繁切换参数。";
        controlNote.textContent = "AI 优化处理中：完成后会自动生成拼豆图纸。";
        setAiOverlayVisible(true);
        startAiWaitTimer();
      }
    } else {
      setStatus("正在生成图纸", "working");
    }
    const sourceForSampling = await buildProcessedSource(state.originalImage, aiInfo);
    if (token !== state.processToken) return;

    state.image = sourceForSampling;
    sampleImage(sourceForSampling, Number(gridSize.value));
    renderCanvas();
    renderEditorPalette();
    updateComparePreview(state.originalImage, sourceForSampling);
    if (usesAi) {
      setPreprocessPanelOpen(false);
    }
    const preprocessLabels = describePreprocessOptions();
    const preprocessText = preprocessLabels.length ? ` · 预处理：${preprocessLabels.join(" / ")}` : "";
    canvasHint.textContent = `当前 ${state.cols} x ${state.rows}，共 ${state.cols * state.rows} 颗${preprocessText}。`;
    setStatus("图纸已生成", "ready");
    syncUiSummary();
    schedulePatternSave();
  } catch (error) {
    if (token !== state.processToken) return;
    if (isCardDeniedError(error)) {
      handleCardDenied(error.message);
      openErrorOverlay(`AI 优化未完成：${error.message || "当前卡密已失效，请使用新卡密。"}`);
      return;
    }
    setError(error.message || "生成失败，请稍后重试。");
    updateComparePreview(state.originalImage, state.image || state.originalImage);
  } finally {
    clearAiWaitTimer();
    if (token === state.processToken && usesAi) {
      setAiOverlayVisible(false);
    }
  }
}

// 将页面恢复到初始空状态：清空图像、网格、统计与提示文案。
function resetToEmptyState() {
  state.image = null;
  state.originalImage = null;
  state.sourceName = "";
  state.sourceType = "none";
  state.sourceFingerprint = "";
  state.cells = [];
  state.counts = new Map();
  state.history = [];
  state.redoHistory = [];
  clearError();
  uploadTitle.textContent = "上传图片开始生成";
  uploadHint.textContent = "支持 JPG / PNG / WebP，可点击选择或拖拽图片";
  canvasHint.textContent = "上传后会生成带网格线的拼豆预览图，可用于确认布局和配色。";
  setStatus("等待图片", "idle");
  syncUiSummary();
  updateComparePreview();
  renderCanvas();
}

function validateFile(file) {
  if (!file) {
    setError("没有读取到文件，请重新选择。");
    return false;
  }

  if (!file.type.startsWith("image/")) {
    setError("当前文件不是图片，请上传 JPG、PNG 或 WebP。");
    return false;
  }

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    setError("图片体积超过 12MB，建议压缩后再导入。");
    return false;
  }

  return true;
}

// 计算原图指纹：卡密绑定“是否换原图”就依赖这个值。
async function computeFileFingerprint(file) {
  if (window.crypto?.subtle && typeof file.arrayBuffer === "function") {
    try {
      const buffer = await file.arrayBuffer();
      const digest = await window.crypto.subtle.digest("SHA-256", buffer);
      return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
    } catch {
      // ignore and use fallback
    }
  }

  return [file.name || "image", file.size || 0, file.lastModified || 0].join(":");
}

function createBlankBoardFingerprint(cols, rows) {
  return `blank:${cols}x${rows}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

// 原图上传入口：载入图像、生成指纹并触发主处理流程。
function loadFile(file) {
  if (!validateFile(file)) return;

  const reader = new FileReader();
  setStatus("正在读取图片", "working");

  reader.addEventListener("error", () => {
    setError("读取图片失败，请更换文件后重试。");
  });

  reader.addEventListener("load", () => {
    const image = new Image();

    image.addEventListener("error", () => {
      setError("图片解析失败，请确认文件未损坏。");
    });

    image.addEventListener("load", async () => {
      state.originalImage = image;
      state.image = image;
      state.aiOptimizeCacheKey = "";
      state.aiOptimizeCacheImage = null;
      state.aiOptimizeInFlightKey = "";
      state.aiOptimizeInFlightPromise = null;
      state.sourceName = file.name;
      state.sourceType = "image";
      state.sourceFingerprint = await computeFileFingerprint(file);
      uploadTitle.textContent = "图片已载入";
      uploadHint.textContent = `${file.name} · ${image.width} x ${image.height}`;
      processCurrentImage();
    });

    image.src = reader.result;
  });

  reader.readAsDataURL(file);
}

// 创建空白图纸：用于纯手绘场景，同时分配独立画布指纹。
function createBlankBoard(options = {}) {
  const { preserveHistory = false, preserveSourceFingerprint = false } = options;
  clearError();
  if (!preserveHistory) {
    state.history = [];
    state.redoHistory = [];
  }
  const cols = Number(gridSize.value);
  const rows = cols;
  const blank = getBlankColor();

  state.image = null;
  state.originalImage = null;
  state.sourceName = "blank-board";
  state.sourceType = "blank";
  if (!preserveSourceFingerprint || !state.sourceFingerprint) {
    state.sourceFingerprint = createBlankBoardFingerprint(cols, rows);
  }
  state.cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => blank));
  state.cols = cols;
  state.rows = rows;
  // 与上传图片口径保持一致：空白背景不计入色号统计。
  state.counts = new Map();

  uploadTitle.textContent = "已创建空白图纸";
  uploadHint.textContent = `${cols} x ${rows}，适合作为后续手工绘制基础`;
  canvasHint.textContent = "空白图纸已创建，现在可以直接选择颜色并在网格上手绘。";
  setStatus("空白图纸", "ready");
  syncUiSummary();
  schedulePatternSave();
  updateComparePreview();
  renderCanvas();
}

// 载入内置示例图纸：让新用户无需上传图片即可体验完整流程。
function loadDemoPattern() {
  const size = 16;
  const demoRows = [
    "................",
    ".XXXX......XXXX.",
    ".XXXXXX..XXXXXX.",
    ".XXXXXXXXXXXXXX.",
    ".XXXXXXXXXXXXXX.",
    ".XXXXXXXXXXXXXX.",
    "..XXXXXXXXXXXX..",
    "..XXXXXXXXXXXX..",
    "...XXXXXXXXXX...",
    "....XXXXXXXX....",
    ".....XXXXXX.....",
    "......XXXX......",
    ".......XX.......",
    "................",
    "................",
    "................",
  ];
  const blank = getBlankColor();
  // 从当前色板里选一个"看起来是红色"的颜色，保证任何色板下示例都清晰可见。
  const palette = getActivePalette();
  const red =
    palette.find((c) => c.rgb[0] > 180 && c.rgb[1] < 110 && c.rgb[2] < 110) ||
    palette.find((c) => c.rgb[0] > 150 && c.rgb[1] < c.rgb[0] - 60 && c.rgb[2] < c.rgb[0] - 60) ||
    palette[1] ||
    palette[0];
  state.cells = demoRows.map((line) =>
    line.split("").map((ch) => (ch === "X" ? red : { ...blank })),
  );
  state.cols = size;
  state.rows = size;
  state.history = [];
  state.redoHistory = [];
  state.sourceType = "blank";
  state.sourceName = "demo-pattern";
  state.originalImage = null;
  state.image = null;
  state.sourceFingerprint = createBlankBoardFingerprint(size, size);
  recomputeCounts();
  renderCanvas();
  updateWorkspaceLayout();
  canvasHint.textContent = `已载入示例图纸（${size} x ${size}），可以直接开始手绘或导出。`;
  setStatus("示例图纸", "ready");
  syncUiSummary();
  schedulePatternSave();
  updateComparePreview();
}

function download(filename, href) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  link.target = "_blank";
  link.style.display = "none";
  document.body.append(link);

  window.setTimeout(() => {
    link.click();
    window.setTimeout(() => {
      link.remove();
      if (typeof href === "string" && href.startsWith("blob:")) {
        URL.revokeObjectURL(href);
      }
    }, 1000);
  }, 0);
}

function getTextColor(hex) {
  const [red, green, blue] = hexToRgb(hex);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}

function drawWrappedCode(chartContext, code, x, y, cellSize, color) {
  chartContext.fillStyle = color;
  chartContext.textAlign = "center";
  chartContext.textBaseline = "middle";

  if (cellSize >= 36) {
    chartContext.font = `800 ${Math.max(10, Math.floor(cellSize * 0.28))}px system-ui, sans-serif`;
    chartContext.fillText(code, x + cellSize / 2, y + cellSize / 2, cellSize - 6);
    return;
  }

  if (cellSize >= 24) {
    chartContext.font = `800 ${Math.max(8, Math.floor(cellSize * 0.32))}px system-ui, sans-serif`;
    chartContext.fillText(code.replace(/[A-Z]+/, ""), x + cellSize / 2, y + cellSize / 2, cellSize - 4);
  }
}

function buildLegendRows() {
  return Array.from(state.counts.values()).sort((a, b) => b.count - a.count);
}

// CSV 字段安全转义：防止公式注入（= + - @ 开头）与逗号/引号破坏列结构。
function sanitizeCsvField(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

// 导出高清图纸画布：包含主图、网格、编号与颜色清单。
function renderExportCanvas(showCodes) {
  const rows = state.cells.length;
  const cols = state.cells[0]?.length || 0;

  if (!rows || !cols) return null;

  const maxDimension = 30000;
  const maxCanvasPixels = 200_000_000;
  const preferredCellSize = showCodes ? 48 : 30;
  const minCellSize = showCodes ? 24 : 12;
  const cellSize = Math.max(
    minCellSize,
    Math.min(
      preferredCellSize,
      Math.floor(maxDimension / Math.max(cols, rows)),
      Math.floor(Math.sqrt(maxCanvasPixels / Math.max(1, cols * rows))),
    ),
  );
  const titleHeight = 96;
  const legendWidth = 340;
  const padding = 36;
  const chartWidth = cols * cellSize;
  const chartHeight = rows * cellSize;
  const exportWidth = padding * 2 + chartWidth + legendWidth;
  const exportHeight = padding * 2 + titleHeight + chartHeight;
  if (exportWidth > maxDimension || exportHeight > maxDimension || exportWidth * exportHeight > maxCanvasPixels) {
    throw new Error("图纸尺寸过大，浏览器无法生成导出画布，请降低横向格数后重试。");
  }
  const exportCanvas = document.createElement("canvas");
  const exportContext = exportCanvas.getContext("2d");
  const legendRows = buildLegendRows();

  exportCanvas.width = exportWidth;
  exportCanvas.height = exportHeight;
  exportContext.imageSmoothingEnabled = false;
  exportContext.fillStyle = "#ffffff";
  exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

  exportContext.fillStyle = "#111827";
  exportContext.font = "900 30px system-ui, sans-serif";
  exportContext.textAlign = "left";
  exportContext.textBaseline = "alphabetic";
  exportContext.fillText(`拼豆图纸 ${cols}x${rows}`, padding, 46);
  exportContext.fillStyle = "#687385";
  exportContext.font = "500 16px system-ui, sans-serif";
  exportContext.fillText(
    showCodes ? "带 Code 图纸，便于按编号定位制作。" : "纯色图纸，适合打印或快速查看整体效果。",
    padding,
    74,
  );

  const chartX = padding;
  const chartY = padding + titleHeight;

  state.cells.forEach((line, row) => {
    line.forEach((cell, col) => {
      const x = chartX + col * cellSize;
      const y = chartY + row * cellSize;
      exportContext.fillStyle = cell.hex;
      exportContext.fillRect(x, y, cellSize, cellSize);
      if (showCodes) {
        drawWrappedCode(exportContext, cell.code, x, y, cellSize, getTextColor(cell.hex));
      }
    });
  });

  exportContext.strokeStyle = "rgba(17, 24, 39, 0.28)";
  exportContext.lineWidth = 1;
  for (let col = 0; col <= cols; col += 1) {
    const x = chartX + col * cellSize + 0.5;
    exportContext.beginPath();
    exportContext.moveTo(x, chartY);
    exportContext.lineTo(x, chartY + chartHeight);
    exportContext.stroke();
  }

  for (let row = 0; row <= rows; row += 1) {
    const y = chartY + row * cellSize + 0.5;
    exportContext.beginPath();
    exportContext.moveTo(chartX, y);
    exportContext.lineTo(chartX + chartWidth, y);
    exportContext.stroke();
  }

  exportContext.strokeStyle = "#111827";
  exportContext.lineWidth = 2;
  exportContext.strokeRect(chartX, chartY, chartWidth, chartHeight);

  const legendX = chartX + chartWidth + 28;
  exportContext.fillStyle = "#111827";
  exportContext.font = "900 22px system-ui, sans-serif";
  exportContext.fillText("颜色清单", legendX, chartY + 4);
  exportContext.font = "600 14px system-ui, sans-serif";
  exportContext.fillStyle = "#687385";
  exportContext.fillText(`总计 ${cols * rows} 颗 · ${legendRows.length} 色`, legendX, chartY + 30);

  legendRows.slice(0, Math.floor((chartHeight - 58) / 28)).forEach((item, index) => {
    const y = chartY + 62 + index * 28;
    exportContext.fillStyle = item.hex;
    exportContext.fillRect(legendX, y - 16, 18, 18);
    exportContext.strokeStyle = "rgba(17, 24, 39, 0.22)";
    exportContext.strokeRect(legendX, y - 16, 18, 18);
    exportContext.fillStyle = "#111827";
    exportContext.font = "800 14px system-ui, sans-serif";
    exportContext.fillText(item.code, legendX + 28, y);
    exportContext.fillStyle = "#687385";
    exportContext.font = "600 13px system-ui, sans-serif";
    exportContext.fillText(`${item.hex.toUpperCase()} · ${item.count} 颗`, legendX + 78, y);
  });

  if (legendRows.length > Math.floor((chartHeight - 58) / 28)) {
    exportContext.fillStyle = "#687385";
    exportContext.font = "600 13px system-ui, sans-serif";
    exportContext.fillText("更多颜色请查看 CSV 清单", legendX, chartY + chartHeight - 8);
  }

  return exportCanvas;
}

async function saveBlobWithMobileFallback(filename, blob, kind = 'file', exportWindow = null) {
  // Try Web Share API (files) first
  try {
    const shared = await shareBlobIfSupported(filename, blob);
    if (shared) return true;
  } catch (e) {
    // ignore
  }

  const isIOS = isIOSBrowser();
  const isMobile = isLikelyMobileBrowser();
  const objectUrl = URL.createObjectURL(blob);

  // iOS Safari and some mobile browsers don't support download attr for blob/data URLs
  if (isIOS || isMobile) {
    // If caller already opened a window synchronously (preferred), reuse it
    let win = exportWindow;
    try {
      if (!win || win.closed) {
        win = window.open('', '_blank');
      }
    } catch (e) {
      win = null;
    }

    if (!win) {
      // Fallback: show an in-page overlay with the result so users can long-press/save without a popup
      try {
        const dataUrl = kind === 'image' && isIOS ? await blobToDataUrl(blob) : objectUrl;
        showMobileDownloadOverlay(filename, dataUrl, kind);
      } catch (e) {
        // Last resort: try programmatic click
        download(filename, objectUrl);
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      return false;
    }

    if (kind === 'image') {
      // Use data URL on iOS to improve compatibility
      const imgUrl = isIOS ? await blobToDataUrl(blob) : objectUrl;
      win.document.open();
      win.document.write(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${filename}</title></head><body style="margin:0;padding:18px;font-family:system-ui, -apple-system;">` +
        `<div style="max-width:980px;margin:0 auto"><h2 style="font-size:18px">${filename}</h2><p>长按图片并选择“保存图片”以保存到设备。</p><img src="${imgUrl}" style="width:100%;height:auto;border-radius:12px;" alt="${filename}"/></div></body></html>`);
      win.document.close();
    } else {
      // text / csv: open as plain text with a link to open
      const text = await blobToDataUrl(blob);
      win.document.open();
      win.document.write(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${filename}</title></head><body style="font-family:system-ui, -apple-system; padding:18px;"><h2>${filename}</h2><p>点击下方链接打开或保存文件：</p><a href="${text}" target="_blank">打开导出结果</a><pre style="white-space:pre-wrap;border-radius:12px;padding:12px;background:#f8fafc;margin-top:12px;">${text.slice(0,2000)}</pre></body></html>`);
      win.document.close();
    }

    // revoke objectUrl later
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return true;
  }

  // Desktop-like browsers: create object URL and trigger download
  download(filename, objectUrl);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
  return true;
}

// 图纸方案本地存档：自动保存，避免退出页面后丢失。
const patternSaveTimer = { id: null };

function savePatternToStorage() {
  if (!state.cells.length) return;
  const payload = {
    version: 1,
    savedAt: Date.now(),
    cells: state.cells,
    cols: state.cols,
    rows: state.rows,
    palette: paletteSelect.value,
    gridSize: gridSize.value,
    mergeLevel: mergeLevel.value,
    gridLine: gridLine.value,
    sourceFingerprint: state.sourceFingerprint || "",
  };
  try {
    localStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 隐私模式或存储满时静默失败
  }
}

function schedulePatternSave() {
  if (patternSaveTimer.id) window.clearTimeout(patternSaveTimer.id);
  patternSaveTimer.id = window.setTimeout(savePatternToStorage, 400);
}

// ---------- 项目库：多图纸存档 ----------
function readProjects() {
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.projects) ? parsed.projects : [];
  } catch {
    return [];
  }
}

function writeProjects(projects) {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify({ projects }));
  } catch {
    // 存储满时静默失败
  }
}

// 轻量 toast 提示（页面内浮层，2 秒自动消失）。
let toastTimer = null;
function showToast(message) {
  let toast = document.querySelector("#appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2000);
}

function renderProjectList() {
  if (!projectList) return;
  const projects = readProjects();
  if (!projects.length) {
    projectList.innerHTML = '<p class="empty-state">暂无保存的项目。</p>';
    return;
  }
  projectList.innerHTML = projects
    .map(
      (project, index) => `
        <div class="project-row">
          <div class="project-info">
            <strong>${project.name || "未命名项目"}</strong>
            <span>${project.cols || 0} x ${project.rows || 0} · ${new Date(project.savedAt || Date.now()).toLocaleString()}</span>
          </div>
          <div class="project-actions">
            <button type="button" data-project-index="${index}" data-action="load">载入</button>
            <button type="button" class="secondary" data-project-index="${index}" data-action="rename">重命名</button>
            <button type="button" class="secondary danger" data-project-index="${index}" data-action="delete">删除</button>
          </div>
        </div>
      `,
    )
    .join("");
}

function saveCurrentProject() {
  if (!state.cells.length) {
    openErrorOverlay("当前没有图纸可保存，请先生成图纸。");
    return;
  }
  const name = (projectNameInput?.value || "").trim() || `项目 ${new Date().toLocaleDateString()}`;
  const projects = readProjects();
  projects.push({
    id: `p${Date.now().toString(36)}`,
    name,
    savedAt: Date.now(),
    cols: state.cols,
    rows: state.rows,
    palette: paletteSelect.value,
    gridSize: gridSize.value,
    mergeLevel: mergeLevel.value,
    gridLine: gridLine.value,
    sourceFingerprint: state.sourceFingerprint || "",
    sourceType: state.sourceType || "blank",
    cells: state.cells,
  });
  writeProjects(projects);
  if (projectNameInput) projectNameInput.value = "";
  renderProjectList();
  showToast(`已保存项目「${name}」`);
}

function loadProject(index) {
  const projects = readProjects();
  const project = projects[index];
  if (!project || !Array.isArray(project.cells) || !project.cells.length) return;
  if (!window.BEAD_PALETTES[project.palette]) {
    openErrorOverlay("该项目使用的色板不存在，无法载入。");
    return;
  }
  paletteSelect.value = project.palette;
  gridSize.value = project.gridSize || state.cols;
  mergeLevel.value = project.mergeLevel || mergeLevel.value;
  gridLine.value = project.gridLine || gridLine.value;
  gridOutput.textContent = gridSize.value;
  mergeOutput.textContent = mergeLevel.value;
  state.cells = project.cells;
  state.cols = project.cols || (project.cells[0] || []).length;
  state.rows = project.rows || project.cells.length;
  state.sourceFingerprint = project.sourceFingerprint || "";
  state.sourceType = project.sourceType || "blank";
  state.originalImage = null;
  state.image = null;
  state.history = [];
  state.redoHistory = [];
  renderEditorPalette();
  recomputeCounts();
  renderCanvas();
  updateWorkspaceLayout();
  syncUiSummary();
  schedulePatternSave();
  canvasHint.textContent = `已载入项目「${project.name || "未命名项目"}」。`;
  setStatus("项目已载入", "ready");
  showToast(`已载入项目「${project.name || "未命名项目"}」`);
  closeProjectOverlay();
}

function renameProject(index) {
  const projects = readProjects();
  const project = projects[index];
  if (!project) return;
  const name = window.prompt("输入新的项目名称：", project.name || "");
  if (name === null) return;
  project.name = name.trim() || project.name;
  project.savedAt = Date.now();
  writeProjects(projects);
  renderProjectList();
}

function deleteProject(index) {
  const projects = readProjects();
  const project = projects[index];
  if (!project) return;
  if (!window.confirm(`确定删除项目「${project.name || "未命名项目"}」吗？`)) return;
  projects.splice(index, 1);
  writeProjects(projects);
  renderProjectList();
}

function openProjectOverlay() {
  if (!projectOverlay) return;
  renderProjectList();
  projectOverlay.hidden = false;
  document.body.classList.add("modal-open");
}

function closeProjectOverlay() {
  if (!projectOverlay) return;
  projectOverlay.hidden = true;
  document.body.classList.remove("modal-open");
}

function restorePatternFromStorage() {
  let payload = null;
  try {
    const raw = localStorage.getItem(PATTERN_STORAGE_KEY);
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!payload || !Array.isArray(payload.cells) || !payload.cells.length) return false;
  if (!window.BEAD_PALETTES[payload.palette]) return false;

  state.cells = payload.cells;
  state.cols = payload.cols || (payload.cells[0] || []).length;
  state.rows = payload.rows || payload.cells.length;
  state.sourceType = "saved";
  state.sourceName = "saved-pattern";
  state.sourceFingerprint = payload.sourceFingerprint || `saved:${payload.savedAt}`;
  paletteSelect.value = payload.palette;
  renderEditorPalette();
  gridSize.value = payload.gridSize || gridSize.value;
  mergeLevel.value = payload.mergeLevel ?? mergeLevel.value;
  gridLine.value = payload.gridLine || gridLine.value;
  recomputeCounts();
  renderCanvas();
  syncUiSummary();
  canvasHint.textContent = "已恢复上次保存的图纸方案，可直接继续编辑或上传新图覆盖。";
  setStatus("已恢复存档", "ready");
  showToast("已恢复上次未完成的图纸");
  return true;
}

function clearSavedPattern() {
  localStorage.removeItem(PATTERN_STORAGE_KEY);
  setStatus("已清除本地存档", "idle");
  canvasHint.textContent = "本地存档已清除，下次进入页面将恢复空白状态。";
  updateEditorActions();
}

// 打印排版：把图纸按 A4 比例切成多页，便于大图打印或另存为 PDF。
const PRINT_CELL_SIZE = 20;
const PRINT_MARGIN = 80;
const PRINT_HEADER_HEIGHT = 150;
const PRINT_FOOTER_HEIGHT = 120;

function buildPrintPages() {
  const rows = state.cells.length;
  const cols = state.cells[0]?.length || 0;
  if (!rows || !cols) return [];

  const landscape = cols > rows;
  const pageWidth = landscape ? 2339 : 1654; // A4 @ 200dpi
  const pageHeight = landscape ? 1654 : 2339;
  const contentWidth = pageWidth - PRINT_MARGIN * 2;
  const contentHeight = pageHeight - PRINT_MARGIN * 2 - PRINT_HEADER_HEIGHT - PRINT_FOOTER_HEIGHT;
  const colsPerPage = Math.max(1, Math.floor(contentWidth / PRINT_CELL_SIZE));
  const rowsPerPage = Math.max(1, Math.floor(contentHeight / PRINT_CELL_SIZE));
  const pageCols = Math.ceil(cols / colsPerPage);
  const pageRows = Math.ceil(rows / rowsPerPage);
  const pages = [];

  for (let pr = 0; pr < pageRows; pr += 1) {
    for (let pc = 0; pc < pageCols; pc += 1) {
      const colStart = pc * colsPerPage;
      const rowStart = pr * rowsPerPage;
      const colEnd = Math.min(cols, colStart + colsPerPage);
      const rowEnd = Math.min(rows, rowStart + rowsPerPage);
      const blockWidth = (colEnd - colStart) * PRINT_CELL_SIZE;
      const blockHeight = (rowEnd - rowStart) * PRINT_CELL_SIZE;
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = pageWidth;
      pageCanvas.height = pageHeight;
      const pageContext = pageCanvas.getContext("2d");
      pageContext.fillStyle = "#ffffff";
      pageContext.fillRect(0, 0, pageWidth, pageHeight);

      const pageIndex = pc + pr * pageCols + 1;
      const pageTotal = pageCols * pageRows;
      pageContext.fillStyle = "#111827";
      pageContext.font = "800 34px system-ui, sans-serif";
      pageContext.textAlign = "left";
      pageContext.textBaseline = "alphabetic";
      pageContext.fillText(`拼豆图纸 ${cols}x${rows} · 第 ${pageIndex}/${pageTotal} 页`, PRINT_MARGIN, 70);
      pageContext.fillStyle = "#687385";
      pageContext.font = "500 22px system-ui, sans-serif";
      pageContext.fillText(`本页范围：第 ${colStart + 1}-${colEnd} 列，第 ${rowStart + 1}-${rowEnd} 行`, PRINT_MARGIN, 108);

      const drawX = PRINT_MARGIN;
      const drawY = PRINT_MARGIN + PRINT_HEADER_HEIGHT;
      for (let row = rowStart; row < rowEnd; row += 1) {
        const line = state.cells[row];
        for (let col = colStart; col < colEnd; col += 1) {
          const x = drawX + (col - colStart) * PRINT_CELL_SIZE;
          const y = drawY + (row - rowStart) * PRINT_CELL_SIZE;
          pageContext.fillStyle = line[col].hex;
          pageContext.fillRect(x, y, PRINT_CELL_SIZE, PRINT_CELL_SIZE);
        }
      }

      pageContext.strokeStyle = "rgba(17, 24, 39, 0.25)";
      pageContext.lineWidth = 1;
      for (let c = 0; c <= colEnd - colStart; c += 1) {
        const x = drawX + c * PRINT_CELL_SIZE + 0.5;
        pageContext.beginPath();
        pageContext.moveTo(x, drawY);
        pageContext.lineTo(x, drawY + blockHeight);
        pageContext.stroke();
      }
      for (let r = 0; r <= rowEnd - rowStart; r += 1) {
        const y = drawY + r * PRINT_CELL_SIZE + 0.5;
        pageContext.beginPath();
        pageContext.moveTo(drawX, y);
        pageContext.lineTo(drawX + blockWidth, y);
        pageContext.stroke();
      }
      pageContext.strokeStyle = "#111827";
      pageContext.lineWidth = 2;
      pageContext.strokeRect(drawX, drawY, blockWidth, blockHeight);

      pages.push({ canvas: pageCanvas, dataUrl: pageCanvas.toDataURL("image/png") });
    }
  }
  return pages;
}

function buildPrintHtml(pages) {
  const body = pages
    .map(
      (page, index) => `
    <section class="print-page">
      <img src="${page.dataUrl}" alt="拼豆图纸第 ${index + 1} 页" />
    </section>`,
    )
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>拼豆图纸打印</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }
      .print-page { background: #fff; margin: 0 auto 12px; max-width: 100%; text-align: center; }
      .print-page img { width: 100%; height: auto; }
      @media print {
        body { background: #fff; }
        .print-page { margin: 0; page-break-after: always; }
        @page { margin: 6mm; }
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

async function printPattern() {
  if (!state.cells.length) return;
  if (!hasPaidAccess()) {
    queueProtectedAction(() => printPattern());
    setRedeemMessage("请先兑换卡密，解锁下载权限后再打印图纸。", "error");
    return;
  }

  try {
    setExportBusy(true, "正在生成打印排版");
    const pages = buildPrintPages();
    if (!pages.length) throw new Error("打印排版生成失败。");
    const printWindow = window.open("", `print-${Date.now()}-${Math.random().toString(36).slice(2)}`, "noopener,noreferrer");
    if (!printWindow) {
      openErrorOverlay("浏览器拦截了打印窗口，请允许弹窗后重试。");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(pages));
    printWindow.document.close();
    printWindow.addEventListener("load", () => {
      window.setTimeout(() => {
        try {
          printWindow.print();
        } catch {
          // 用户手动选择打印也可以
        }
      }, 300);
    });
    setStatus("打印窗口已打开，可在打印对话框中选择保存为 PDF", "working");
  } catch (error) {
    openErrorOverlay(`打印失败：${error.message || "请稍后重试"}`);
  } finally {
    setExportBusy(false);
  }
}

// PNG 导出：统一走服务端下载接口，确保后端正确扣减下载次数。
async function exportPng(showCodes) {
  if (!state.cells.length) return;
  if (!hasPaidAccess()) {
    queueProtectedAction(() => exportPng(showCodes));
    setRedeemMessage("请先兑换卡密，解锁下载权限后再导出图纸。", "error");
    return;
  }
  if (!state.sourceFingerprint) {
    setRedeemMessage("未识别到当前图片，请重新上传后再试。", "error");
    return;
  }
  const suffix = showCodes ? "with-code" : "clean";
  const statusLabel = showCodes ? "正在生成带编号图纸" : "正在生成纯色图纸";
  let exportWindow = null;

  try {
    clearError();
    setExportBusy(true, statusLabel);
    exportWindow = isLikelyMobileBrowser()
      ? window.open("", `export-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      : null;
    const exportCanvas = renderExportCanvas(showCodes);
    const filename = `拼豆图纸-${suffix}-${state.cols}x${state.rows}.png`;
    const blob = await new Promise((resolve, reject) => {
      exportCanvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("导出 PNG 失败，浏览器没有返回文件数据"));
      }, "image/png");
    });
    const dataUrl = await blobToDataUrl(blob);
    await submitDownloadForm({ filename, dataUrl, target: exportWindow?.name || (isLikelyMobileBrowser() ? "_blank" : null) });
    await loadAccessStatus();
    setStatus("导出开始，正在下载…", "working");
    canvasHint.textContent = "图纸导出请求已发送。";
  } catch (error) {
    if (exportWindow && !exportWindow.closed) {
      exportWindow.close();
    }
    if (isCardDeniedError(error)) {
      handleCardDenied(error.message);
      openErrorOverlay(`下载未完成：${error.message || "当前卡密已失效，请使用新卡密。"}`);
    } else {
      openErrorOverlay(`导出 PNG 失败：${error.message || "请稍后重试"}`);
    }
  } finally {
    setExportBusy(false);
    if (!state.error && state.cells.length) setStatus("图纸已生成", "ready");
  }
}

// CSV 导出：导出色号统计和网格点位，同样需要走服务端计数。
async function exportCsv() {
  if (!state.cells.length) return;
  if (!hasPaidAccess()) {
    queueProtectedAction(() => exportCsv());
    setRedeemMessage("请先兑换卡密，解锁下载权限后再导出 CSV 清单。", "error");
    return;
  }
  if (!state.sourceFingerprint) {
    setRedeemMessage("未识别到当前图片，请重新上传后再试。", "error");
    return;
  }
  try {
    clearError();
    setExportBusy(true, "正在生成 CSV 清单");
    const pointRows = state.cells.flatMap((line, rowIndex) =>
      line.map((cell, colIndex) => [rowIndex + 1, colIndex + 1, cell.code, cell.hex.toUpperCase()]),
    );

    const rows = [
      ["code", "hex", "count"],
      ...buildLegendRows().map((row) => [row.code, row.hex.toUpperCase(), row.count]),
      [],
      ["points"],
      ["row", "col", "code", "hex"],
      ...pointRows,
      [],
      ["grid", `${state.cols}x${state.rows}`],
      ["note", "下方网格与带 Code 图纸一一对应，可直接用于制作或二次排版。"],
      ...state.cells.map((line) => line.map((cell) => cell.code)),
    ];

    const csvText = rows.map((row) => row.map(sanitizeCsvField).join(",")).join("\n");
    const filename = `拼豆清单-${state.cols}x${state.rows}.csv`;
    // 先预览清单内容，用户确认后再下载（下载时才消耗额度）。
    openCsvPreview(filename, `\uFEFF${csvText}`);
    setStatus("CSV 清单已生成，可预览后下载。", "ready");
  } catch (error) {
    if (isCardDeniedError(error)) {
      handleCardDenied(error.message);
      openErrorOverlay(`导出未完成：${error.message || "当前卡密已失效，请使用新卡密。"}`);
    } else {
      openErrorOverlay(`导出 CSV 失败：${error.message || "请稍后重试"}`);
    }
  } finally {
    setExportBusy(false);
    if (!state.error && state.cells.length) setStatus("图纸已生成", "ready");
  }
}

// 统一绑定页面事件，方便后续维护所有交互入口。
function bindEvents() {
  fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
  blankBoardButton.addEventListener("click", createBlankBoard);
  demoPatternButton?.addEventListener("click", loadDemoPattern);
  topbarBlankBoardButton.addEventListener("click", createBlankBoard);
  topbarPreprocessButton.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePreprocessPanel();
  });
  cancelAiButton?.addEventListener("click", cancelAiOptimization);
  preprocessPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  preprocessOverlay.addEventListener("click", () => setPreprocessPanelOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setPreprocessPanelOpen(false);
    const mod = event.ctrlKey || event.metaKey;
    if (mod && (event.key === "z" || event.key === "Z")) {
      event.preventDefault();
      if (event.shiftKey) redoEdit();
      else undoEdit();
    } else if (mod && (event.key === "y" || event.key === "Y")) {
      event.preventDefault();
      redoEdit();
    }
  });
  downloadCodePng.addEventListener("click", () => (hasPaidAccess() ? confirmDownload(() => exportPng(true)) : queueProtectedAction(() => exportPng(true))));
  downloadCleanPng.addEventListener("click", () => (hasPaidAccess() ? confirmDownload(() => exportPng(false)) : queueProtectedAction(() => exportPng(false))));
  downloadCsv.addEventListener("click", () => (hasPaidAccess() ? confirmDownload(() => exportCsv()) : queueProtectedAction(() => exportCsv())));
  printPatternButton?.addEventListener("click", () => (hasPaidAccess() ? confirmDownload(() => printPattern()) : queueProtectedAction(() => printPattern())));
  copyPaletteListButton?.addEventListener("click", copyPaletteList);
  confirmDownloadButton?.addEventListener("click", runPendingExport);
  cancelDownloadButton?.addEventListener("click", closeDownloadConfirm);
  confirmCsvDownloadButton?.addEventListener("click", confirmCsvDownload);
  copyCsvButton?.addEventListener("click", copyCsvText);
  closeCsvPreviewButton?.addEventListener("click", closeCsvPreview);
  clearSaveButton?.addEventListener("click", clearSavedPattern);
  projectLibraryButton?.addEventListener("click", openProjectOverlay);
  saveProjectButton?.addEventListener("click", saveCurrentProject);
  closeProjectButton?.addEventListener("click", closeProjectOverlay);
  projectNameInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveCurrentProject();
  });
  projectList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-project-index]");
    if (!button) return;
    const index = Number(button.dataset.projectIndex);
    const action = button.dataset.action;
    if (action === "load") loadProject(index);
    else if (action === "rename") renameProject(index);
    else if (action === "delete") deleteProject(index);
  });
  redeemCardButton?.addEventListener("click", redeemCard);
  logoutAccessButton?.addEventListener("click", logoutAccess);
  cardCodeInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") redeemCard();
  });
  closeCardModalButton?.addEventListener("click", closeCardModal);
  cardModalOverlay?.addEventListener("click", (event) => {
    if (event.target === cardModalOverlay) closeCardModal();
  });
  closeErrorOverlayButton?.addEventListener("click", closeErrorOverlay);
  errorOverlay?.addEventListener("click", (event) => {
    if (event.target === errorOverlay) closeErrorOverlay();
  });
  brushTool.addEventListener("click", () => setEditorTool("brush"));
  eraserTool.addEventListener("click", () => setEditorTool("eraser"));
  undoEditButton.addEventListener("click", undoEdit);
  redoEditButton?.addEventListener("click", redoEdit);
  redoEditButton?.addEventListener("click", redoEdit);
  clearBoardButton.addEventListener("click", clearBoard);
  confirmAiPrompt.addEventListener("click", () => {
    state.confirmedAiPrompt = aiPromptInput.value.trim() || DEFAULT_AI_PROMPT;
    state.aiOptimizeCacheKey = "";
    state.aiOptimizeCacheImage = null;
    processCurrentImage();
  });
  aiPromptPreset?.addEventListener("change", applyAiPromptPreset);

  let sliderDebounceTimer = null;
  [gridSize, mergeLevel].forEach((control) => {
    control.addEventListener("input", () => {
      // 拖动时只即时更新数字显示，松手后防抖重算，避免连续全量处理卡顿。
      gridOutput.textContent = gridSize.value;
      mergeOutput.textContent = mergeLevel.value;
      if (sliderDebounceTimer) window.clearTimeout(sliderDebounceTimer);
      sliderDebounceTimer = window.setTimeout(processCurrentImage, 250);
    });
  });

  [gridLine, aiOptimizeSelect].forEach((control) => {
    control.addEventListener("change", processCurrentImage);
  });

  paletteSelect.addEventListener("change", () => {
    renderEditorPalette();
    renderPalettePreview();
    // 有原始图片时按新色板重新采样（背景空白判定更准）；
    // 空白/手绘/存档图纸则把现有格子重映射到新色板，保留手工内容并立即重绘。
    if (state.sourceType === "image" && state.originalImage) {
      processCurrentImage();
    } else if (state.cells.length) {
      remapCellsToActivePalette();
    }
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("dragging");
    });
  });

  dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));
  canvas.addEventListener("pointerdown", beginPaint);
  canvas.addEventListener("pointermove", movePaint);
  canvas.addEventListener("pointerup", endPaint);
  canvas.addEventListener("pointerleave", endPaint);
  canvas.addEventListener("pointercancel", endPaint);
  document.addEventListener("contextmenu", preventProtectedAssetAction);
  document.addEventListener("dragstart", preventProtectedAssetAction);
  document.addEventListener("copy", preventProtectedAssetAction);
  document.addEventListener("cut", preventProtectedAssetAction);
  document.addEventListener("selectstart", preventProtectedAssetAction);

  window.addEventListener("resize", resizePreviewCanvas);
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(() => resizePreviewCanvas());
    observer.observe(canvasFrame);
  }
}

// 页面启动入口：初始化色板、事件、默认 UI，并拉取授权状态。
function initialize() {
  state.paidAccess = false;
  state.cardCode = "";
  initializePaletteSelect();
  paletteSelect.value = "nabbi";
  renderPalettePreview();
  renderPaletteFilters();
  aiOptimizeSelect.value = "off";
  aiPromptInput.value = state.confirmedAiPrompt;
  syncPreviewProtectionState();
  syncAccessUi();
  syncPreprocessControls();
  renderEditorPalette();
  setEditorTool("brush");
  canvas.width = DEFAULT_CANVAS_SIZE;
  canvas.height = DEFAULT_CANVAS_SIZE;
  bindEvents();
  resetToEmptyState();
  resizePreviewCanvas();
  restorePatternFromStorage();
  loadAccessStatus();
}

initialize();









