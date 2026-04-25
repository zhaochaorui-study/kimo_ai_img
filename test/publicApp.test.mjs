import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const PUBLIC_APP_PATH = new URL("../public/app.mjs", import.meta.url);

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

  assert.match(source, /await Promise\.all\(\[refreshWallet\(\), refreshPublicGallery\(\), refreshHistory\(\)\]\);/);
  assert.match(source, /history:\s*\[\]/);
  assert.match(source, /const payload = await api\("\/api\/public-gallery"\);/);
  assert.match(source, /const payload = await api\("\/api\/gallery"\);/);
  assert.match(source, /function selectedGalleryItem\(\) {\s*return findSelectedItem\(state\.gallery, state\.selectedId\);/);
  assert.match(source, /function selectedHistoryItem\(\) {\s*return findSelectedItem\(state\.history, state\.selectedHistoryId\);/);
});
