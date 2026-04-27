import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PUBLIC_APP_PATH = new URL("../public/app.mjs", import.meta.url);
const PUBLIC_STYLE_PATH = new URL("../public/styles.css", import.meta.url);
const SERVER_PATH = new URL("../src/server.mjs", import.meta.url);

// 提取单个 CSS 规则块，避免跨规则正则误判
function extractCssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.matchAll(new RegExp(`${escapedSelector} \\{[^}]*\\}`, "g"))];

  return matches.at(-1)?.[0] ?? "";
}

test("public app defaults to one square image and ten credits per generation", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /ratio:\s*"1:1"/);
  assert.doesNotMatch(source, /ratio:\s*"4:3"/);
  assert.match(source, /quantity:\s*1/);
  assert.match(source, /renderChips\("quantity", \[1, 2\]\)/);
  assert.doesNotMatch(source, /renderChips\("quantity", \[1, 2, 4\]\)/);
  assert.match(source, /const unit = 10;/);
  assert.match(source, /const resolution = getResolution\(ratio\);/);
});

test("public auth page removes third party login entrances", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, />Kimo</);
  assert.match(source, /AI创造无限可能/);
  assert.match(source, /登录你的 Kimo 账户/);
  assert.doesNotMatch(source, /auth-social/);
  assert.doesNotMatch(source, /Google|GitHub|Apple/);
  assert.doesNotMatch(source, /或使用以下方式登录/);
  assert.doesNotMatch(source, /关于我们|帮助中心|隐私政策|服务条款/);
});

test("user avatar menu closes when clicking outside the dropdown", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /let documentClickDelegated = false;/);
  assert.match(source, /document\.addEventListener\("click", handleDocumentClick\);/);
  assert.match(source, /function handleDocumentClick\(event\)/);
  assert.match(source, /event\.target\.closest\("\.avatar-dropdown"\)/);
  assert.match(source, /state\.userMenuOpen = false;/);
});

test("mobile layout reserves safe areas and uses touch-friendly navigation", async () => {
  const source = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /--mobile-topbar-height:\s*56px;/);
  assert.match(source, /--mobile-bottom-nav-height:\s*calc\(68px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(source, /height:\s*calc\(100dvh - var\(--mobile-topbar-height\) - var\(--mobile-bottom-nav-height\)\);/);
  assert.match(source, /padding:\s*14px 14px calc\(16px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(source, /height:\s*var\(--mobile-bottom-nav-height\);/);
  assert.match(source, /touch-action:\s*manipulation;/);
});

test("mobile core content and feedback surfaces adapt to small screens", async () => {
  const source = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /grid-template-columns:\s*minmax\(0, 1fr\);/);
  assert.match(source, /min-height:\s*clamp\(280px, 48dvh, 460px\);/);
  assert.match(source, /font-size:\s*16px;/);
  assert.match(source, /top:\s*50%;/);
  assert.match(source, /left:\s*50%;/);
  assert.match(source, /transform:\s*translate\(-50%, -50%\);/);
  assert.match(source, /white-space:\s*normal;/);
  assert.match(source, /max-height:\s*calc\(100dvh - 44px\);/);
  assert.match(source, /border-radius:\s*24px 24px 0 0;/);
});

test("mobile auth page centers the form under a balanced logo area", async () => {
  const source = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /\.auth-page \{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(source, /\.auth-wrapper \{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;[\s\S]*?align-items:\s*center;/);
  assert.match(source, /\.auth-left \{[\s\S]*?flex:\s*0 0 clamp\(104px, 16dvh, 132px\);[\s\S]*?justify-content:\s*center;/);
  assert.match(source, /\.auth-logo-row \{[\s\S]*?margin-bottom:\s*0;[\s\S]*?justify-content:\s*center;/);
  assert.match(source, /\.auth-hero,[\s\S]*?\.auth-celestial,[\s\S]*?\.auth-footer \{[\s\S]*?display:\s*none;/);
  assert.match(source, /\.auth-right \{[\s\S]*?flex:\s*0 1 auto;[\s\S]*?width:\s*min\(calc\(100% - 32px\), 420px\);[\s\S]*?margin:\s*0 auto auto;/);
  assert.match(source, /\.auth-tab \{[\s\S]*?height:\s*40px;[\s\S]*?font-size:\s*18px;/);
  assert.match(source, /\.auth-input-wrap input \{[\s\S]*?height:\s*46px;/);
});

test("gallery always uses public items and history uses current user items", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /await Promise\.all\(\[refreshWallet\(\), refreshPublicGallery\(\), refreshMyGallery\(\), refreshHistory\(\)\]\);/);
  assert.match(source, /history:\s*\[\]/);
  assert.match(source, /const payload = await api\("\/api\/public-gallery"\);/);
  assert.match(source, /const payload = await api\("\/api\/gallery"\);/);
  assert.match(source, /function selectedGalleryItem\(\) {\s*return findSelectedItem\(galleryItems\(\), state\.selectedId\);/);
  assert.match(source, /function selectedHistoryItem\(\) {\s*return findSelectedItem\(state\.history, state\.historySelectedId\);/);
});

test("my gallery shows current user public items and can remove gallery flag", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /myGallery:\s*\[\]/);
  assert.match(source, /\["my-gallery", "grid", "我的画廊"\]/);
  assert.match(source, /const payload = await api\("\/api\/my-gallery"\);/);
  assert.match(source, /await api\(`\/api\/my-gallery\/\$\{item\.id\}`,\s*\{ method: "DELETE" \}\);/);
  assert.match(source, /data-action="remove-from-my-gallery"/);
  assert.match(source, /function selectedMyGalleryItem\(\) {\s*return findSelectedItem\(myGalleryItems\(\), state\.selectedMyGalleryId\);/);
});

test("workbench mode is only switched from sidebar navigation", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.doesNotMatch(source, /renderCurrentModuleTab\(\)/);
  assert.doesNotMatch(source, /currentModuleLabel\(\)/);
  assert.doesNotMatch(source, /module-tabs/);
  assert.doesNotMatch(source, /data-mode=/);
  assert.doesNotMatch(source, /event\.target\.closest\("\[data-mode\]"\)/);
});

test("default preview uses a neutral empty state instead of the old mock still life", async () => {
  const appSource = await readFile(PUBLIC_APP_PATH, "utf8");
  const source = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(appSource, /function renderEmptyPreview\(\)/);
  assert.match(appSource, /return image \? renderImageTag\("generated-image", image, "生成结果"\) : renderEmptyPreview\(\);/);
  assert.match(source, /\.image-empty-state/);
  assert.doesNotMatch(appSource, /return image \? renderImageTag\("generated-image", image, "生成结果"\) : "<div class=\\"mock-still-life\\"><\/div>";/);
  assert.doesNotMatch(source, /radial-gradient\(circle at 50% 54%/);
  assert.doesNotMatch(source, /linear-gradient\(90deg, transparent 0 27%, #8b6f4e/);
});

test("generating preview renders animated image aura", async () => {
  const appSource = await readFile(PUBLIC_APP_PATH, "utf8");
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(appSource, /if \(state\.generatingMode === state\.mode\) return renderGeneratingPreview\(\);/);
  assert.match(appSource, /function renderGeneratingPreview\(\)/);
  assert.match(appSource, /class="image-generation-state"/);
  assert.match(appSource, /预计等待约 2 分钟，请勿关闭或刷新页面/);
  assert.match(appSource, /renderGenerationWaitHint\(\)/);
  assert.match(styleSource, /\.image-generation-state/);
  assert.match(styleSource, /\.generation-wait-hint/);
  assert.match(styleSource, /@keyframes generationAura/);
  assert.match(styleSource, /@keyframes generationSweep/);
  assert.match(styleSource, /prefers-reduced-motion: reduce/);
});

test("generating aura uses composited smooth loop animations", async () => {
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");
  const stateBlock = extractCssRule(styleSource, ".image-generation-state");
  const auraBlock = extractCssRule(styleSource, ".image-generation-state::before");
  const spanBlock = extractCssRule(styleSource, ".generation-aura span");

  assert.match(stateBlock, /contain: paint;/);
  assert.match(auraBlock, /animation: generationAura 8s linear infinite;/);
  assert.match(auraBlock, /transform: translate3d/);
  assert.doesNotMatch(auraBlock, /filter: blur/);
  assert.match(spanBlock, /animation: generationBreathe/);
  assert.match(styleSource, /@keyframes generationBreathe/);
  assert.match(styleSource, /@keyframes generationAura \{[\s\S]*translate3d/);
});

test("generation progress updates do not remount the whole app", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /function updateGenerationProgress\(\)/);
  assert.match(source, /function updateGenerationVisualState\(\)/);
  assert.match(source, /data-generation-progress/);
  assert.match(source, /data-generation-progress-bar/);
  assert.match(source, /function advanceProgress\(\) \{\s*state\.progress = Math\.min\(92, state\.progress \+ 9\);\s*updateGenerationVisualState\(\);\s*\}/);
  assert.match(source, /function updateGenerationProgress\(\) \{\s*updateGenerationVisualState\(\);\s*\}/);
  assert.doesNotMatch(source, /function advanceProgress\(\) \{\s*state\.progress = Math\.min\(92, state\.progress \+ 9\);\s*render\(\);\s*\}/);
});

test("generation progress bar uses energetic layered motion", async () => {
  const appSource = await readFile(PUBLIC_APP_PATH, "utf8");
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(appSource, /class="progress-track progress-track-energy"/);
  assert.match(appSource, /class="progress-bar progress-bar-energy"/);
  assert.match(styleSource, /\.progress-track-energy::before/);
  assert.match(styleSource, /\.progress-bar-energy::before/);
  assert.match(styleSource, /\.progress-bar-energy::after/);
  assert.match(styleSource, /@keyframes progressEnergyFlow/);
  assert.match(styleSource, /@keyframes progressSparkRun/);
  assert.match(styleSource, /prefers-reduced-motion: reduce[\s\S]*\.progress-bar-energy::before/);
});

test("generation panel exposes image quality and compression controls", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /outputQuality:\s*"auto"/);
  assert.match(source, /outputFormat:\s*"png"/);
  assert.match(source, /outputCompression:\s*100/);
  assert.match(source, /renderSelect\("outputQuality", \["auto", "low", "medium", "high"\]\)/);
  assert.match(source, /renderSelect\("outputFormat", \["png", "jpeg", "webp"\]\)/);
  assert.match(source, /data-slider="outputCompression"/);
  assert.match(source, /quality: state\.outputQuality/);
  assert.match(source, /outputFormat: state\.outputFormat/);
  assert.match(source, /outputCompression: state\.outputCompression/);
});

test("generation panel removes realtime preview controls and stream payload", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.doesNotMatch(source, /realtimePreview:\s*false/);
  assert.doesNotMatch(source, /partialImages:\s*2/);
  assert.doesNotMatch(source, /data-toggle="realtimePreview"/);
  assert.doesNotMatch(source, /renderPartialImagesField\(\)/);
  assert.doesNotMatch(source, /data-slider="partialImages"/);
  assert.doesNotMatch(source, /stream: state\.realtimePreview/);
  assert.doesNotMatch(source, /partialImages: state\.realtimePreview \? state\.partialImages : 0/);
  assert.doesNotMatch(source, /syncGeneratedImagesFromRunningHistory\(\)/);
});

test("desktop workbench keeps dense generation controls inside the viewport", async () => {
  const source = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /\.workbench-grid \{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/);
  assert.match(source, /\.tool-panel \{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-gutter:\s*stable;/);
  assert.match(source, /\.preview-wrap \{[\s\S]*?overflow:\s*hidden;/);
  assert.match(source, /@media \(min-width: 1101px\) and \(max-height: 1120px\)/);
});

test("generation submit applies queue status and refreshes data", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /const payload = await runGeneratingAction\(async \(\) => \{/);
  assert.match(source, /applyGenerationQueueState\(payload\);/);
  assert.match(source, /await refreshGenerationStatus\(\);/);
  assert.match(source, /showGenerationQueueToast\(payload\);/);
});

test("generation queue position is refreshed while a task is active", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /const GENERATION_STATUS_REFRESH_MS = 2500;/);
  assert.match(source, /function scheduleGenerationStatusRefresh\(\)/);
  assert.match(source, /setTimeout\(async \(\) => \{\s*await refreshGenerationStatus\(\);\s*\}, GENERATION_STATUS_REFRESH_MS\)/);
  assert.match(source, /state\.queuePosition = running\.queuePosition \?\? null;/);
  assert.match(source, /第 \$\{state\.queuePosition\} 位/);
});

test("generation polling skips wallet refresh and keeps active aura mounted", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");
  const refreshStatusBlock = source.slice(
    source.indexOf("async function refreshGenerationStatus()"),
    source.indexOf("// 判断当前生成任务是否仍可通过局部 DOM 更新延续动画")
  );

  assert.match(source, /async function refreshGenerationStatus\(\)/);
  assert.match(source, /const payload = await api\("\/api\/gallery"\);/);
  assert.match(source, /applyHistoryItems\(payload\.items\);/);
  assert.match(source, /if \(shouldPatchActiveGeneration\(previousGeneratingMode\)\) \{[\s\S]*updateGenerationVisualState\(\);[\s\S]*return;/);
  assert.doesNotMatch(refreshStatusBlock, /refreshWallet\(/);
  assert.doesNotMatch(source, /setTimeout\(async \(\) => \{\s*await refreshData\(\);\s*\}, GENERATION_STATUS_REFRESH_MS\)/);
});

test("history refresh only restores workbench preview after an in-session generation flow", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /allowLatestHistoryPreviewSync:\s*false/);
  assert.match(source, /state\.allowLatestHistoryPreviewSync = true;/);
  assert.match(source, /if \(!state\.allowLatestHistoryPreviewSync\) return;/);
});

test("generation submit applies returned balance without wallet loading refresh", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /applyGenerationBalance\(payload\);/);
  assert.match(source, /function applyGenerationBalance\(payload\)/);
  assert.match(source, /state\.user\.balanceCents = payload\.balanceCents;/);
});

test("toast updates do not remount an active generation preview", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");
  const showToastBlock = source.slice(
    source.indexOf("function showToast(message, type = \"\")"),
    source.indexOf("// 渲染 toast 变化，生成中只局部更新避免重启动画")
  );

  assert.match(source, /function renderToastChange\(\)/);
  assert.match(source, /function updateToastView\(\)/);
  assert.match(showToastBlock, /renderToastChange\(\);/);
  assert.match(showToastBlock, /setTimeout\(\(\) => \{[\s\S]*renderToastChange\(\);/);
  assert.doesNotMatch(showToastBlock, /render\(\);/);
});

test("compare reference card shows the uploaded reference image", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /const aspectRatio = getAspectRatio\(state\.ratio\);/);
  assert.match(source, /const primaryPreview = renderPrimaryImage\(\);/);
  assert.match(source, /const referenceLightboxImage = state\.referenceImage \?\? "";/);
  assert.match(source, /const referencePreview = state\.referenceImage/);
  assert.match(source, /renderImageTag\("generated-image", state\.referenceImage, "参考图"\)/);
  assert.match(source, /class="image-preview compare-card compare-reference-card" style="aspect-ratio:\$\{aspectRatio\}" data-lightbox="\$\{referenceLightboxImage\}">\$\{referencePreview\}<\/div>/);
  assert.match(source, /class="image-preview compare-card compare-result-card" style="aspect-ratio:\$\{aspectRatio\}" data-lightbox="\$\{primaryLightboxImage\}">\$\{primaryPreview\}<span class="preview-badge">/);
});

test("compare preview cards keep selected ratio and show full images", async () => {
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");
  const compareCardBlock = extractCssRule(styleSource, ".compare-card");
  const compareImageBlock = extractCssRule(styleSource, ".compare-card .generated-image");

  assert.match(compareCardBlock, /min-height:\s*0;/);
  assert.match(compareCardBlock, /width:\s*100%;/);
  assert.match(compareImageBlock, /object-fit:\s*contain;/);
  assert.match(compareImageBlock, /background:/);
  assert.doesNotMatch(compareCardBlock, /min-height:\s*340px;/);
});

test("reference upload field stays a file picker instead of image preview", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /function renderUploadField\(\)/);
  assert.match(source, /const uploadAction = state\.referenceImageName \? "重新选择" : "选择文件";/);
  assert.match(source, /class="upload-box \$\{state\.referenceImageName \? "is-ready" : ""\}"/);
  assert.match(source, /<span class="upload-title">\$\{uploadTitle\}<\/span>/);
  assert.match(source, /<span class="upload-hint">\$\{uploadHint\}<\/span>/);
  assert.match(source, /<span class="upload-action">\$\{uploadAction\}<\/span>/);
  assert.doesNotMatch(source, /renderImageTag\("reference-preview", state\.referenceImage, "参考图"\)/);
  assert.match(styleSource, /\.upload-icon/);
  assert.match(styleSource, /\.upload-copy/);
  assert.match(styleSource, /\.upload-action/);
  assert.match(styleSource, /\.upload-box\.is-ready/);
  assert.match(styleSource, /\.upload-box input \{[\s\S]*z-index: 2;[\s\S]*width: 100%;[\s\S]*height: 100%;/);
  assert.match(styleSource, /\.upload-placeholder \{[\s\S]*pointer-events: none;/);
});

test("tool panel option groups have comfortable vertical spacing", async () => {
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(styleSource, /\.tool-panel \{[\s\S]*gap: 14px;/);
  assert.match(styleSource, /\.field \{[\s\S]*gap: 8px;/);
});

test("rendered image tags use lazy loading and async decoding", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /const IMAGE_LOAD_ATTRIBUTES = 'loading="lazy" decoding="async"'/);
  assert.match(source, /function renderImageTag\(className, source, alt\)/);
  assert.match(source, /<img\$\{classAttribute\} \$\{IMAGE_LOAD_ATTRIBUTES\} src="\$\{source\}"/);
  assert.match(source, /value\.startsWith\("\/"\)/);
});

test("server streams static files and caches generated images", async () => {
  const source = await readFile(SERVER_PATH, "utf8");

  assert.match(source, /createReadStream/);
  assert.match(source, /resolveStaticAssetHeaders/);
  assert.match(source, /return "public, max-age=31536000, immutable"/);
  assert.doesNotMatch(source, /const content = await readFile\(safePath\)/);
});

test("upload limits are raised for larger reference images", async () => {
  const publicSource = await readFile(PUBLIC_APP_PATH, "utf8");
  const serverSource = await readFile(SERVER_PATH, "utf8");

  assert.match(publicSource, /REFERENCE_IMAGE_MAX_BYTES\s*=\s*48\s*\*\s*1024\s*\*\s*1024/);
  assert.match(publicSource, /参考图不能超过 \$\{formatFileSize\(REFERENCE_IMAGE_MAX_BYTES\)\}/);
  assert.match(serverSource, /APP_CONFIG\.server\.imageUploadMaxBytes/);
  assert.doesNotMatch(serverSource, /readJsonBody\(this\.request,\s*16\s*\*\s*1024\s*\*\s*1024\)/);
});

test("gallery and history images open a lightbox preview", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");
  const lightboxIndex = source.indexOf("const lightboxTrigger = event.target.closest(\"[data-lightbox]\")");
  const gallerySelectIndex = source.indexOf("const select = event.target.closest(\"[data-select]\")");
  const historySelectIndex = source.indexOf("const historySelect = event.target.closest(\"[data-history-select]\")");

  assert.match(source, /function renderLightbox\(\)/);
  assert.match(source, /\$\{renderLightbox\(\)\}/);
  assert.match(source, /function openLightboxFromTrigger\(trigger\)/);
  assert.match(source, /function closeLightbox\(event\)/);
  assert.ok(lightboxIndex >= 0 && lightboxIndex < gallerySelectIndex);
  assert.ok(lightboxIndex >= 0 && lightboxIndex < historySelectIndex);
  assert.match(source, /if \(name === "close-lightbox"\) closeLightbox\(event\);/);
});

test("gallery lightbox click also selects the item for the detail panel", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");
  const lightboxSelectIndex = source.indexOf("selectItemFromLightboxTrigger(lightboxTrigger)");
  const openLightboxIndex = source.indexOf("openLightboxFromTrigger(lightboxTrigger)");

  assert.match(source, /function selectItemFromLightboxTrigger\(trigger\)/);
  assert.match(source, /if \(trigger\.dataset\.select\) \{/);
  assert.match(source, /state\.selectedId = Number\(trigger\.dataset\.select\);/);
  assert.match(source, /state\.selectedMyGalleryId = Number\(trigger\.dataset\.select\);/);
  assert.match(source, /state\.historySelectedId = Number\(trigger\.dataset\.historySelect\);/);
  assert.ok(lightboxSelectIndex >= 0 && lightboxSelectIndex < openLightboxIndex);
});

test("gallery detail panel follows the same visible items as image previews", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /function selectedGalleryItem\(\) {\s*return findSelectedItem\(galleryItems\(\), state\.selectedId\);/);
  assert.match(source, /function selectedMyGalleryItem\(\) {\s*return findSelectedItem\(myGalleryItems\(\), state\.selectedMyGalleryId\);/);
  assert.doesNotMatch(source, /function selectedGalleryItem\(\) {\s*return findSelectedItem\(state\.gallery, state\.selectedId\);/);
  assert.doesNotMatch(source, /function selectedMyGalleryItem\(\) {\s*return findSelectedItem\(state\.myGallery, state\.selectedMyGalleryId\);/);
});

test("gallery date formatting tolerates missing and mysql dates", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /createdAt: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /function formatDate\(value\) \{[\s\S]*const date = parseDateValue\(value\);[\s\S]*if \(!date\) return "暂无时间";/);
  assert.match(source, /function parseDateValue\(value\)/);
  assert.match(source, /Number\.isNaN\(date\.getTime\(\)\) \? null : date;/);
  assert.match(source, /function normalizeDateValue\(value\)/);
  assert.match(source, /String\(value\)\.trim\(\)\.replace\(" ", "T"\);/);
  assert.doesNotMatch(source, /\.format\(new Date\(value\)\)/);
});

test("gallery cards update the detail panel on hover", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /let hoverDelegated = false;/);
  assert.match(source, /app\.addEventListener\("mouseover", handleGalleryPreviewHover\);/);
  assert.match(source, /function handleGalleryPreviewHover\(event\)/);
  assert.match(source, /function selectPreviewItemFromCard\(card\)/);
  assert.match(source, /if \(selectPreviewItemFromCard\(previewCard\)\) updatePreviewDetailFromHover\(previewCard\);/);
  assert.match(source, /function updatePreviewDetailFromHover\(card\)/);
  assert.match(source, /function replacePreviewDetailPanel\(\)/);
  assert.match(source, /panel\.replaceWith\(nextPanel\);/);
  assert.match(source, /panel\?\.classList\.remove\("content-fade-in"\);/);
  assert.doesNotMatch(source, /if \(selectPreviewItemFromCard\(previewCard\)\) render\(\);/);
  assert.match(source, /data-preview-scope="gallery" data-preview-id="\$\{item\.id\}"/);
  assert.match(source, /data-preview-scope="my-gallery" data-preview-id="\$\{item\.id\}"/);
  assert.match(source, /data-preview-scope="history" data-preview-id="\$\{item\.id\}"/);
});

test("data refreshes render fade-in loading states", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /loadingScopes: new Set\(\)/);
  assert.match(source, /revealScopes: new Set\(\)/);
  assert.match(source, /const loadingJobs = new Map\(\);/);
  assert.match(source, /const LOADING_SCOPE_GALLERY = "gallery";/);
  assert.match(source, /await loadDataWithFade\(LOADING_SCOPE_GALLERY, async \(\) => \{/);
  assert.match(source, /await loadDataWithFade\(LOADING_SCOPE_MY_GALLERY, async \(\) => \{/);
  assert.match(source, /await loadDataWithFade\(LOADING_SCOPE_HISTORY, async \(\) => \{/);
  assert.match(source, /await loadDataWithFade\(LOADING_SCOPE_WALLET, async \(\) => \{/);
  assert.match(source, /if \(loadingJobs\.has\(scope\)\) return loadingJobs\.get\(scope\);/);
  assert.match(source, /function runScopedDataLoad\(scope, work\)/);
  assert.match(source, /markRevealScope\(scope\);/);
  assert.match(source, /function clearRenderedRevealScopes\(\)/);
  assert.match(source, /function renderGalleryLoadingGrid\(\)/);
  assert.match(source, /function renderDetailLoadingPanel\(label\)/);
  assert.match(source, /function renderHistoryLoadingLayout\(\)/);
  assert.match(source, /function renderGalleryGrid\(items, renderer, scope\)/);
  assert.match(source, /class="gallery-grid\$\{revealClass\}"/);
  assert.match(source, /class="detail-panel content-fade-in"/);
  assert.match(styleSource, /\.content-fade-in/);
  assert.match(styleSource, /@keyframes contentFadeIn/);
  assert.match(styleSource, /@keyframes loadingShimmer/);
  assert.match(styleSource, /prefers-reduced-motion: reduce/);
});

test("gallery image lists reveal cards progressively once per data load", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /function renderGalleryItem\(item, index = 0\)/);
  assert.match(source, /function renderMyGalleryItem\(item, index = 0\)/);
  assert.match(source, /function renderHistoryGridItem\(item, index = 0\)/);
  assert.match(source, /class="gallery-item gallery-entry/);
  assert.match(source, /style="\$\{createGalleryEntryStyle\(index\)\}"/);
  assert.match(source, /function createGalleryEntryStyle\(index\)/);
  assert.match(styleSource, /\.gallery-grid\.is-revealing \.gallery-entry/);
  assert.match(styleSource, /animation-delay: calc\(var\(--gallery-index, 0\) \* 58ms\);/);
  assert.match(styleSource, /@keyframes galleryEntryReveal/);
  assert.match(styleSource, /prefers-reduced-motion: reduce[\s\S]*\.gallery-entry/);
});

test("wallet clicks and active navigation do not repeat loading animations", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /const balanceClass = isLoadingScope\(LOADING_SCOPE_WALLET\) \? "is-syncing" : "";/);
  assert.match(source, /const walletClass = isLoadingScope\(LOADING_SCOPE_WALLET\) \? "is-syncing" : "";/);
  assert.doesNotMatch(source, /const walletClass = isLoadingScope\(LOADING_SCOPE_WALLET\) \? "is-syncing" : "content-fade-in";/);
  assert.match(source, /if \(state\.view === view\) return;/);
  assert.match(source, /if \(resolveSideActive\(target\)\) return;/);
});

test("gallery photos use an inset premium frame without exterior borders", async () => {
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(styleSource, /\.gallery-item\.is-active \{[\s\S]*box-shadow: none;/);
  assert.match(styleSource, /\.gallery-item > button:not\(\.gallery-card-action\) \{[\s\S]*width: 100%;[\s\S]*border: 0;/);
  assert.match(styleSource, /\.gallery-item > button:not\(\.gallery-card-action\)::before/);
  assert.match(styleSource, /-webkit-mask-composite: xor;/);
  assert.match(styleSource, /mask-composite: exclude;/);
  assert.match(styleSource, /\.gallery-item \.mock-still-life \{[\s\S]*inset: 2px;[\s\S]*border: 0;/);
});

test("history public toggle uses compact gallery card action styling", async () => {
  const appSource = await readFile(PUBLIC_APP_PATH, "utf8");
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(appSource, /class="gallery-card-action gallery-toggle-btn \$\{isPublic \? "is-active" : ""\}"/);
  assert.match(appSource, /class="gallery-card-action gallery-remove-btn"/);
  assert.match(styleSource, /\.gallery-item > button:not\(\.gallery-card-action\)/);
  assert.match(styleSource, /\.gallery-card-action/);
  assert.doesNotMatch(styleSource, /\.gallery-item button\s*\{/);
});

test("history public toggle api is wired through the authed server routes", async () => {
  const appSource = await readFile(PUBLIC_APP_PATH, "utf8");
  const serverSource = await readFile(SERVER_PATH, "utf8");

  assert.match(appSource, /await api\(`\/api\/history\/\$\{itemId\}\/toggle-public`,\s*\{ method: "POST" \}\);/);
  assert.match(serverSource, /request\.method === "POST" && url\.pathname\.startsWith\("\/api\/history\/"\) && url\.pathname\.endsWith\("\/toggle-public"\)/);
  assert.match(serverSource, /return routes\.togglePublic\(url\);/);
});

test("settings sidebar button is disabled until the settings view is ready", async () => {
  const appSource = await readFile(PUBLIC_APP_PATH, "utf8");
  const styleSource = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(appSource, /const DISABLED_SIDE_TARGETS = new Set\(\["settings"\]\);/);
  assert.match(appSource, /function isDisabledSideTarget\(target\)/);
  assert.match(appSource, /if \(isDisabledSideTarget\(target\)\) return;/);
  assert.match(appSource, /aria-disabled="\$\{disabled\}"/);
  assert.match(appSource, /\$\{disabled \? "disabled" : ""\}/);
  assert.match(styleSource, /\.side-nav button:disabled/);
});

test("auth register mode updates selected tab and submits register form", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /class="auth-tab \$\{state\.authMode === "login" \? "is-active" : ""\}" data-auth-mode="login"/);
  assert.match(source, /class="auth-tab \$\{state\.authMode === "register" \? "is-active" : ""\}" data-auth-mode="register"/);
  assert.match(source, /<form id="authForm" data-auth-form-mode="\$\{state\.authMode\}" novalidate>/);
  assert.match(source, /state\.authMode === "register" \? renderVerificationCodeField\(\) : ""/);
  assert.match(source, /const path = form\.dataset\.authFormMode === "register" \? "\/api\/auth\/register" : "\/api\/auth\/login";/);
});

test("auth form owns validation and converts auth errors to friendly Chinese messages", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /<form id="authForm" data-auth-form-mode="\$\{state\.authMode\}" novalidate>/);
  assert.match(source, /const AUTH_EMAIL_PATTERN =/);
  assert.match(source, /function createAuthFormPayload\(form\)/);
  assert.match(source, /function validateAuthFormPayload\(payload, mode\)/);
  assert.match(source, /const validationMessage = validateAuthFormPayload\(payload, form\.dataset\.authFormMode\);/);
  assert.match(source, /showToast\(validationMessage, "error"\);/);
  assert.match(source, /toFriendlyAuthErrorMessage\(error, "登录注册失败，请稍后重试"\)/);
  assert.match(source, /toFriendlyAuthErrorMessage\(error, "验证码发送失败，请稍后重试"\)/);
  assert.doesNotMatch(source, /showToast\(error\.message \|\| "发送失败", "error"\);/);
});

test("auth page refresh keeps the current tab on auth instead of gallery", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /const AUTH_VIEW_SESSION_KEY = "create_img_auth_view";/);
  assert.match(source, /if \(!state\.user && shouldRestoreAuthView\(\)\) \{/);
  assert.match(source, /state\.view = "auth";/);
  assert.match(source, /function persistCurrentView\(view\)/);
  assert.match(source, /sessionStorage\.setItem\(AUTH_VIEW_SESSION_KEY, view\);/);
  assert.match(source, /sessionStorage\.removeItem\(AUTH_VIEW_SESSION_KEY\);/);
  assert.match(source, /persistCurrentView\(view\);/);
});
