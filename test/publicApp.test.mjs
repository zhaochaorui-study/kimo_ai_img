import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PUBLIC_APP_PATH = new URL("../public/app.mjs", import.meta.url);
const PUBLIC_STYLE_PATH = new URL("../public/styles.css", import.meta.url);
const SERVER_PATH = new URL("../src/server.mjs", import.meta.url);

test("public app defaults to one square image and ten credits per generation", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /ratio:\s*"1:1"/);
  assert.doesNotMatch(source, /ratio:\s*"4:3"/);
  assert.match(source, /quantity:\s*1/);
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

  assert.match(source, /renderCurrentModuleTab\(\)/);
  assert.match(source, /currentModuleLabel\(\)/);
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
  assert.match(styleSource, /\.image-generation-state/);
  assert.match(styleSource, /@keyframes generationAura/);
  assert.match(styleSource, /@keyframes generationSweep/);
  assert.match(styleSource, /prefers-reduced-motion: reduce/);
});

test("generation progress updates do not remount the whole app", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /function updateGenerationProgress\(\)/);
  assert.match(source, /data-generation-progress/);
  assert.match(source, /data-generation-progress-bar/);
  assert.match(source, /function advanceProgress\(\) \{\s*state\.progress = Math\.min\(92, state\.progress \+ 9\);\s*updateGenerationProgress\(\);\s*\}/);
  assert.doesNotMatch(source, /function advanceProgress\(\) \{\s*state\.progress = Math\.min\(92, state\.progress \+ 9\);\s*render\(\);\s*\}/);
});

test("generation refreshes wallet data after leaving the active generation state", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /await runGeneratingAction\(async \(\) => \{\s*const path = state\.mode === "image-prompt" \? "\/api\/images\/edits" : "\/api\/images\/generations";\s*const payload = await api\(path, \{ method: "POST", body: JSON\.stringify\(createGenerationPayload\(\)\) \}\);\s*state\.generatedImages = payload\.images;\s*\}\);\s*await refreshData\(\);/);
});

test("compare reference card shows the uploaded reference image", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /const primaryPreview = renderPrimaryImage\(\);/);
  assert.match(source, /const referenceLightboxImage = state\.referenceImage \?\? "";/);
  assert.match(source, /const referencePreview = state\.referenceImage/);
  assert.match(source, /renderImageTag\("generated-image", state\.referenceImage, "参考图"\)/);
  assert.match(source, /data-lightbox="\$\{referenceLightboxImage\}">\$\{referencePreview\}<\/div>/);
  assert.match(source, /data-lightbox="\$\{primaryLightboxImage\}">\$\{primaryPreview\}<span class="preview-badge">/);
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
  assert.match(source, /<form id="authForm" data-auth-form-mode="\$\{state\.authMode\}">/);
  assert.match(source, /state\.authMode === "register" \? renderVerificationCodeField\(\) : ""/);
  assert.match(source, /const path = form\.dataset\.authFormMode === "register" \? "\/api\/auth\/register" : "\/api\/auth\/login";/);
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
