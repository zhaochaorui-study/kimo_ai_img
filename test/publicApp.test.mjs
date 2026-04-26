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
  assert.match(source, /function selectedGalleryItem\(\) {\s*return findSelectedItem\(state\.gallery, state\.selectedId\);/);
  assert.match(source, /function selectedHistoryItem\(\) {\s*return findSelectedItem\(state\.history, state\.historySelectedId\);/);
});

test("my gallery shows current user public items and can remove gallery flag", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /myGallery:\s*\[\]/);
  assert.match(source, /\["my-gallery", "grid", "我的画廊"\]/);
  assert.match(source, /const payload = await api\("\/api\/my-gallery"\);/);
  assert.match(source, /await api\(`\/api\/my-gallery\/\$\{item\.id\}`,\s*\{ method: "DELETE" \}\);/);
  assert.match(source, /data-action="remove-from-my-gallery"/);
  assert.match(source, /function selectedMyGalleryItem\(\) {\s*return findSelectedItem\(state\.myGallery, state\.selectedMyGalleryId\);/);
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
