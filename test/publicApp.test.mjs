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
  assert.match(source, /\$\{getResolution\(item\.ratio\)\}/);
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
  assert.match(source, /function selectedHistoryItem\(\) {\s*return findSelectedItem\(state\.history, state\.selectedHistoryId\);/);
});

test("my gallery shows current user public items and can remove gallery flag", async () => {
  const source = await readFile(PUBLIC_APP_PATH, "utf8");

  assert.match(source, /myGallery:\s*\[\]/);
  assert.match(source, /topButton\("my-gallery", "我的画廊"\)/);
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

test("default preview uses UI empty state instead of mock still life", async () => {
  const source = await readFile(PUBLIC_STYLE_PATH, "utf8");

  assert.match(source, /content:\s*"等待生成"/);
  assert.match(source, /\.mock-still-life::before/);
  assert.match(source, /border:\s*1px dashed rgba\(255, 143, 163, 0\.38\)/);
  assert.doesNotMatch(source, /radial-gradient\(circle at 50% 54%/);
  assert.doesNotMatch(source, /linear-gradient\(90deg, transparent 0 27%, #8b6f4e/);
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
