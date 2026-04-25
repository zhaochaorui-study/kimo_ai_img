const state = {
  token: localStorage.getItem("create_img_token") ?? "",
  user: null,
  view: "workspace",
  mode: "text-to-image",
  prompt: "",
  modelName: "Kimo Image",
  style: "产品摄影",
  ratio: "1:1",
  quantity: 1,
  referenceImage: "",
  referenceImageName: "",
  gallery: [],
  selectedId: null,
  generatedImages: [],
  isGenerating: false,
  progress: 0,
  toast: "",
  toastType: "",
  modal: "",
  sampler: "DPM++ 2M Karras",
  steps: 30,
  cfgScale: 7.0,
  promptStrength: 0.7,
  highResFix: false,
  denoisingStrength: 0.75,
  seed: -1,
  isPublic: false,
  userMenuOpen: false,
  returnTo: ""
};

const app = document.querySelector("#app");

// 初始化应用，优先恢复本地登录态
async function boot() {
  if (state.token) {
    await loadSession();
  }

  if (!state.user) {
    state.view = "gallery";
  }

  render();
  await refreshData();
}

// 调用后端 API，统一注入登录令牌和错误处理
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers ?? {})
    }
  });
  const payload = await response.json();

  if (!payload.ok) throw new Error(payload.message || "请求失败");

  return payload;
}

// 加载当前会话用户
async function loadSession() {
  try {
    const payload = await api("/api/session");
    state.user = payload.user;
  } catch {
    localStorage.removeItem("create_img_token");
    state.token = "";
  }
}

// 刷新钱包和画廊数据
async function refreshData() {
  if (state.user) {
    await Promise.all([refreshWallet(), refreshGallery()]);
  } else {
    await refreshPublicGallery();
  }
  render();
}

// 刷新钱包余额
async function refreshWallet() {
  const payload = await api("/api/wallet");

  state.user.balanceCents = payload.wallet.balanceCents;
  state.transactions = payload.wallet.transactions;
}

// 刷新图片历史
async function refreshGallery() {
  const payload = await api("/api/gallery");

  state.gallery = payload.items;
  state.selectedId = state.selectedId ?? state.gallery[0]?.id ?? null;
}

// 刷新公共画廊
async function refreshPublicGallery() {
  try {
    const payload = await api("/api/public-gallery");
    state.gallery = payload.items;
    state.selectedId = state.selectedId ?? state.gallery[0]?.id ?? null;
  } catch {
    state.gallery = [];
  }
}

// 渲染整页入口
function render() {
  app.innerHTML = state.view === "auth" ? renderAuth() : renderStudio();
  bindEvents();
}

// 渲染登录注册页
function renderAuth() {
  return `
    <div class="auth-fullscreen">
      <div class="auth-brand">
        <div class="brand-icon-large">🐱</div>
        <h1>创想图像工作室</h1>
        <p>登录后自动获得 50 积分额度</p>
        <div class="auth-deco">用想象力创造无限可能</div>
      </div>
      <div class="auth-card">
        <h2>欢迎回来</h2>
        <div class="auth-tabs">
          <button class="chip is-active" data-auth-mode="login">登录</button>
          <button class="chip" data-auth-mode="register">注册</button>
        </div>
        <form id="authForm" data-auth-form-mode="login">
          <div class="auth-field">
            <label>用户名</label>
            <input name="username" type="text" autocomplete="username" placeholder="请输入用户名">
          </div>
          <div class="auth-field">
            <label>密码</label>
            <input name="password" type="password" autocomplete="current-password" placeholder="请输入密码">
          </div>
          <button class="primary-btn auth-submit" type="submit">登录</button>
        </form>
        <button class="text-btn" data-view="gallery">← 返回画廊浏览</button>
      </div>
      ${renderToast()}
    </div>
  `;
}

// 渲染工作室主框架
function renderStudio() {
  return `
    <div class="studio-frame">
      ${renderTopbar()}
      <div class="layout">
        ${renderSidebar()}
        <main class="workspace">${renderCurrentView()}</main>
      </div>
    </div>
    ${renderRechargeModal()}
    ${renderToast()}
  `;
}

// 渲染顶部导航栏
function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand"><span class="brand-icon">🐱</span><span>创想图像工作室</span></div>
      <nav class="top-nav">
        ${state.user ? topButton("workspace", "工作台") : ""}
        ${topButton("gallery", "画廊")}
        ${state.user ? topButton("history", "历史") : ""}
        ${state.user ? topButton("resources", "资源") : ""}
      </nav>
      <div class="top-actions">
        <button class="icon-btn" title="通知">${icon("bell")}</button>
        ${state.user ? renderUserMenu() : `<button class="primary-btn" data-action="open-auth" style="width:auto;padding:0 18px;height:36px;font-size:13px">登录</button>`}
      </div>
    </header>
  `;
}

// 渲染用户头像下拉菜单
function renderUserMenu() {
  return `
    <div class="avatar-dropdown">
      <span class="avatar" data-action="toggle-user-menu">${state.user.username.slice(0, 1).toUpperCase()}</span>
      ${state.userMenuOpen ? `
        <div class="avatar-menu">
          <button data-action="user-profile">个人中心</button>
          <button data-action="logout">退出登录</button>
        </div>
      ` : ""}
    </div>
  `;
}

// 渲染顶部导航按钮
function topButton(view, label) {
  return `<button data-view="${view}" class="${state.view === view ? "is-active" : ""}">${label}</button>`;
}

// 渲染左侧导航栏
function renderSidebar() {
  const buttons = state.user ? [
    ["workspace", "text", "文生图"],
    ["workspace-edit", "image", "图文生图"],
    ["gallery", "grid", "画廊"],
    ["history", "clock", "历史"],
    ["models", "box", "模型"],
    ["styles", "flower", "风格库"],
    ["settings", "settings", "设置"],
    ["feedback", "help", "帮助与反馈"]
  ] : [
    ["gallery", "grid", "画廊"]
  ];

  return `
    <aside class="sidebar">
      <nav class="side-nav">
        ${buttons.map((item, index) => renderSideButton(item, index)).join("")}
      </nav>
      ${state.user ? `
        <section class="wallet-card">
          <small>积分余额</small>
          <div class="wallet-amount">${state.user.balanceCents ?? 0}</div>
          <button class="secondary-btn" data-action="open-recharge">升级套餐</button>
        </section>
      ` : `
        <section class="wallet-card">
          <p style="font-size:13px;color:var(--muted);margin:0 0 12px">登录后即可生成图片并保存到个人画廊。</p>
          <button class="primary-btn" data-action="open-auth">登录 / 注册</button>
        </section>
      `}
    </aside>
  `;
}

// 渲染单个侧边栏按钮
function renderSideButton(item, index) {
  const [target, iconName, label] = item;
  const active = resolveSideActive(target);
  const divider = index === 2 || index === 4 || index === 6 ? "<div class=\"side-divider\"></div>" : "";

  return `${divider}<button data-side="${target}" class="${active ? "is-active" : ""}">${icon(iconName)}<span>${label}</span></button>`;
}

// 判断侧边栏按钮是否处于选中态
function resolveSideActive(target) {
  if (target === "workspace-edit") return state.view === "workspace" && state.mode === "image-prompt";
  if (target === "workspace") return state.view === "workspace" && state.mode === "text-to-image";

  return state.view === target;
}

// 渲染当前主视图
function renderCurrentView() {
  if (state.view === "gallery") return renderGallery();
  if (state.view === "history") return renderDetail();

  return renderWorkbench();
}

// 渲染工作台
function renderWorkbench() {
  return `
    <section class="workbench-grid">
      ${renderPromptPanel()}
      ${state.mode === "image-prompt" ? renderCompareStage() : renderTextStage()}
    </section>
  `;
}

// 渲染提示词面板
function renderPromptPanel() {
  return `
    <aside class="tool-panel">
      <div class="tabs">
        ${modeTab("text-to-image", "文生图")}
        ${modeTab("image-prompt", "图文生图")}
      </div>
      ${state.mode === "image-prompt" ? renderUploadField() : ""}
      <div class="field">
        <label>提示词${state.mode === "image-prompt" ? "（可选）" : ""}</label>
        <textarea id="promptInput" maxlength="1000" placeholder="描述你想生成的画面...">${escapeHtml(state.prompt)}</textarea>
        <div class="counter">${state.prompt.length} / 1000</div>
      </div>
      <div class="field"><label>模型</label>${renderSelect("modelName", ["Kimo Image", "Aurora XL v2"])}</div>
      <div class="field"><label>宽高比</label>${renderChips("ratio", ["1:1", "3:4", "4:3", "16:9", "9:16"])}</div>
      <div class="field"><label>生成数量</label>${renderChips("quantity", [1, 2, 4])}</div>
      ${state.mode === "image-prompt" ? renderSimilaritySlider() : ""}
      <div class="toggle-field">
        <label>加入公共画廊</label>
        <div class="toggle-switch ${state.isPublic ? "is-on" : ""}" data-toggle="isPublic"></div>
      </div>
      <button class="primary-btn" data-action="generate" ${state.isGenerating || !state.user ? "disabled" : ""}>${state.isGenerating ? "生成中..." : state.user ? "开始生成" : "请登录后生成"}</button>
      <div class="cost">预计消耗 ${calculateCostCents()} 积分</div>
    </aside>
  `;
}

// 渲染模式页签
function modeTab(mode, label) {
  return `<button class="tab-btn ${state.mode === mode ? "is-active" : ""}" data-mode="${mode}">${label}</button>`;
}

// 渲染参考图上传区域
function renderUploadField() {
  return `
    <div class="field">
      <span class="upload-label">参考图像</span>
      <div class="upload-box">
        ${state.referenceImage ? `<img class="reference-preview" src="${state.referenceImage}" alt="参考图">` : "<div class=\"upload-placeholder\">上传 JPG / PNG，最大 10MB</div>"}
        <input id="referenceInput" type="file" accept="image/png,image/jpeg,image/webp">
      </div>
    </div>
  `;
}

// 渲染文本生成预览区
function renderTextStage() {
  const quantity = state.quantity;

  const ratio = state.ratio;
  const resolution = getResolution(ratio);
  const aspectRatio = getAspectRatio(ratio);

  if (quantity === 1) {
    return `
      <section class="stage">
        <div class="preview-wrap preview-grid-1" style="position:relative">
          <div class="image-preview" style="aspect-ratio:${aspectRatio}">
            ${renderPrimaryImage()}
            <span class="preview-badge">${resolution}</span>
          </div>
          <div class="deco-sticker top-right">🐱</div>
          <div class="deco-sticker bottom-left">🌸</div>
        </div>
      </section>
    `;
  }

  const baseImages = state.generatedImages.length ? state.generatedImages : [];
  const mocks = mockThumbs();
  const images = Array.from({ length: quantity }, (_, i) => baseImages[i] ?? mocks[i % mocks.length]);
  const gridClass = quantity === 2 ? "preview-grid-2" : "preview-grid-4";

  return `
    <section class="stage">
      <div class="preview-wrap ${gridClass}" style="position:relative">
        ${images.map((image) => `
          <div class="image-preview">
            ${renderImageContent(image)}
            <span class="preview-badge">${resolution}</span>
          </div>
        `).join("")}
        <div class="deco-sticker top-right">🐱</div>
        <div class="deco-sticker bottom-left">🌸</div>
      </div>
    </section>
  `;
}

// 渲染参考相似度滑块
function renderSimilaritySlider() {
  return `
    <div class="field">
      <label>参考相似度（保留程度）</label>
      <div class="slider-field">
        <div class="slider-header"><span>更自由</span><span>更保守</span></div>
        <input type="range" min="0" max="1" step="0.05" value="${state.denoisingStrength}" data-slider="denoisingStrength">
        <div class="slider-header" style="margin-top:4px"><span></span><span style="background:transparent;padding:0;color:var(--muted);font-weight:500">${state.denoisingStrength}</span></div>
      </div>
    </div>
  `;
}

// 渲染右侧生成设置面板
function renderSettingsPanel() {
  return `
    <aside class="settings-panel">
      <h3>生成设置</h3>
      <div class="field">
        <label>采样方法</label>
        ${renderSelect("sampler", ["DPM++ 2M Karras", "Euler a", "DPM++ SDE Karras", "DDIM"])}
      </div>
      <div class="slider-field">
        <div class="slider-header"><label>迭代步数</label><span>${state.steps}</span></div>
        <input type="range" min="10" max="50" step="1" value="${state.steps}" data-slider="steps">
      </div>
      <div class="slider-field">
        <div class="slider-header"><label>CFG 强度</label><span>${state.cfgScale}</span></div>
        <input type="range" min="1" max="15" step="0.5" value="${state.cfgScale}" data-slider="cfgScale">
      </div>
      <div class="slider-field">
        <div class="slider-header"><label>提示词相关性</label><span>${state.promptStrength}</span></div>
        <input type="range" min="0" max="1" step="0.05" value="${state.promptStrength}" data-slider="promptStrength">
      </div>
      <div class="toggle-field">
        <label>高分率修复</label>
        <div class="toggle-switch ${state.highResFix ? "is-on" : ""}" data-toggle="highResFix"></div>
      </div>
      <div class="field">
        <label>缩放因子</label>
        <input type="number" min="1" max="4" step="0.1" value="${state.seed === -1 ? -1 : state.seed}" data-number="seed" placeholder="-1 为随机">
      </div>
      <div class="field">
        <label>高级设置</label>
        <button class="secondary-btn" style="width:auto;padding:0 16px;font-size:13px;height:36px">展开选项 ▼</button>
      </div>
    </aside>
  `;
}

// 渲染图文生成对比区
function renderCompareStage() {
  const resolution = getResolution(state.ratio);
  return `
    <section class="stage">
      <div class="preview-wrap" style="min-height:auto;padding:20px">
        <h2 style="margin:0 0 16px;width:100%;font-size:16px;color:var(--ink-dark)">生成结果对比</h2>
        <div class="compare-grid">
          <div>
            <h3>原图（参考）</h3>
            <div class="image-preview compare-card">${state.referenceImage ? `<img class="generated-image" src="${state.referenceImage}" alt="参考图">` : "<div class=\"mock-still-life\"></div>"}</div>
          </div>
          <div class="arrow-circle">${icon("arrow-right")}</div>
          <div>
            <h3>生成结果</h3>
            <div class="image-preview compare-card">${renderPrimaryImage()}<span class="preview-badge">${resolution}</span></div>
          </div>
        </div>
      </div>
      ${renderProgress()}
    </section>
  `;
}

// 渲染主预览图片
function renderPrimaryImage() {
  const image = state.generatedImages[0] ?? selectedGalleryItem()?.images?.[0];

  return image ? `<img class="generated-image" src="${image}" alt="生成结果">` : "<div class=\"mock-still-life\"></div>";
}

// 根据宽高比获取分辨率字符串
function getResolution(ratio) {
  const map = {
    "1:1": "1024 x 1024",
    "3:4": "768 x 1024",
    "4:3": "1024 x 768",
    "16:9": "1024 x 576",
    "9:16": "576 x 1024"
  };
  return map[ratio] || "1024 x 768";
}

// 根据宽高比获取 aspect-ratio 字符串
function getAspectRatio(ratio) {
  const [w, h] = ratio.split(":").map(Number);
  return `${w} / ${h}`;
}

// 渲染图片或占位图
function renderImageContent(image) {
  if (image && (image.startsWith("data:image/") || image.startsWith("http"))) {
    return `<img class="generated-image" src="${image}" alt="生成结果">`;
  }
  return `<div class="mock-still-life"></div>`;
}

// 渲染缩略图条
function renderThumbStrip() {
  const images = state.generatedImages.length ? state.generatedImages : mockThumbs();

  return `
    <div class="thumb-strip">
      <button class="icon-btn">${icon("chevron-left")}</button>
      ${images.slice(0, 4).map((image, index) => renderThumb(image, index)).join("")}
      <button class="icon-btn">${icon("chevron-right")}</button>
    </div>
  `;
}

// 渲染单个缩略图
function renderThumb(image, index) {
  const content = image.startsWith("data:image/") ? `<img class="generated-image" src="${image}" alt="缩略图">` : "<div class=\"mock-still-life\"></div>";

  return `<div class="thumb ${index === 0 ? "is-active" : ""}">${content}</div>`;
}

// 渲染生成进度
function renderProgress() {
  return `
    <div class="progress-area">
      <strong>${state.isGenerating ? "生成中..." : "等待生成"}</strong>
      <span style="float:right">${state.progress}%</span>
      <div class="progress-track"><div class="progress-bar" style="--progress:${state.progress}%"></div></div>
      <p class="empty-state">预计消耗 ${calculateCostCents()} 积分</p>
    </div>
  `;
}

// 渲染画廊页面
function renderGallery() {
  return `
    <section class="gallery-layout">
      <div>
        <div class="gallery-toolbar">
          <h2 class="gallery-title">画廊</h2>
          <button class="chip is-active">全部</button>
          <button class="chip">收藏</button>
          <button class="chip">产品摄影</button>
          <button class="chip">极简</button>
          <button class="chip">概念设计</button>
          <button class="chip">建筑</button>
          <button class="chip">3D渲染</button>
        </div>
        <div class="gallery-grid">${galleryItems().map(renderGalleryItem).join("")}</div>
      </div>
      ${renderDetailPanel()}
    </section>
  `;
}

// 渲染画廊单个项目
function renderGalleryItem(item) {
  const image = item.images?.[0] ?? "";

  return `
    <article class="gallery-item">
      <button data-select="${item.id}">${image ? `<img src="${image}" alt="生成图">` : "<div class=\"mock-still-life\"></div>"}</button>
      <span class="gallery-fav">${icon("heart")}</span>
    </article>
  `;
}

// 渲染右侧详情面板
function renderDetailPanel() {
  const item = selectedGalleryItem();

  if (!item) return "<aside class=\"detail-panel\"><p class=\"empty-state\">暂无生成记录</p></aside>";

  return `
    <aside class="detail-panel">
      <div class="thumb">${item.images?.[0] ? `<img class="generated-image" src="${item.images[0]}" alt="选中图">` : "<div class=\"mock-still-life\"></div>"}</div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${escapeHtml(item.prompt || "未填写提示词")}</p>
      <div class="meta-list">
        <span>模型</span><strong>${escapeHtml(item.modelName)}</strong>
        <span>风格</span><strong>${escapeHtml(item.style || "产品摄影")}</strong>
        <span>比例</span><strong>${escapeHtml(item.ratio)}</strong>
        <span>生成时间</span><strong>${formatDate(item.createdAt)}</strong>
        <span>种子</span><strong>${item.id}</strong>
        <span>步数</span><strong>30</strong>
        <span>CFG</span><strong>7.0</strong>
        <span>费用</span><strong>${item.costCents ?? 0} 积分</strong>
      </div>
      <div class="tag-row" style="margin:14px 0">
        <span class="tag">极简</span>
        <span class="tag">产品摄影</span>
        <span class="tag">自然光</span>
        <span class="tag">米色</span>
      </div>
      <button class="secondary-btn" data-action="reuse-prompt" style="margin-bottom:8px">复用提示词</button>
      <button class="secondary-btn" data-action="download" style="margin-bottom:8px">下载</button>
      <button class="danger-btn" data-action="delete-item">删除</button>
    </aside>
  `;
}

// 渲染历史详情页
function renderDetail() {
  const item = selectedGalleryItem();

  if (!item) return "<p class=\"empty-state\">暂无历史记录，先去生成一张。</p>";

  const images = item.images ?? [];
  const variants = images.length > 1 ? images.slice(1) : [];

  return `
    <section class="detail-hero">
      <div>
        <h2>
          <button class="icon-btn" style="width:32px;height:32px" data-view="gallery">←</button>
          ${formatDate(item.createdAt)}
          <span style="margin-left:auto;display:flex;gap:8px">
            <button class="icon-btn" style="width:32px;height:32px" title="收藏">${icon("heart")}</button>
            <button class="icon-btn" style="width:32px;height:32px" title="下载" data-action="download">↓</button>
            <button class="icon-btn" style="width:32px;height:32px" title="更多">⋯</button>
          </span>
        </h2>
        <div class="detail-image">${images[0] ? `<img src="${images[0]}" alt="历史详情">` : "<div class=\"mock-still-life\"></div>"}</div>
        ${variants.length ? `
          <div style="margin-top:8px">
            <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">生成变体</div>
            <div class="variants-row">
              ${images.map((img, i) => `<div class="variant-thumb ${i === 0 ? "is-active" : ""}">${img ? `<img class="generated-image" src="${img}">` : "<div class=\"mock-still-life\"></div>"}</div>`).join("")}
            </div>
          </div>
        ` : ""}
      </div>
      <aside class="detail-panel">
        <h3 style="margin:0 0 12px;font-size:15px;color:var(--ink-dark)">提示词</h3>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px">${escapeHtml(item.prompt)}</p>
        <h3 style="margin:0 0 12px;font-size:15px;color:var(--ink-dark)">负面提示词</h3>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:var(--muted)">低清晰度、模糊、杂乱、文字、水印</p>
        <div class="meta-list">
          <span>模型</span><strong>${escapeHtml(item.modelName)}</strong>
          <span>风格</span><strong>${escapeHtml(item.style || "产品摄影")}</strong>
          <span>比例</span><strong>${escapeHtml(item.ratio)} (${getResolution(item.ratio)})</strong>
          <span>种子</span><strong>${item.id}</strong>
          <span>CFG</span><strong>7.0</strong>
          <span>采样器</span><strong>DPM++ 2M Karras</strong>
          <span>步数</span><strong>30</strong>
          <span>生成时间</span><strong>${formatDate(item.createdAt)}</strong>
          <span>消耗积分</span><strong>${item.costCents ?? 0}</strong>
        </div>
        <div class="tag-row" style="margin-top:16px">
          <span class="tag">极简</span>
          <span class="tag">产品摄影</span>
          <span class="tag">自然光</span>
          <span class="tag">石材</span>
          <span class="tag">几何</span>
        </div>
      </aside>
    </section>
  `;
}

// 渲染选择控件
function renderSelect(key, options) {
  return `<select data-select-key="${key}">${options.map((item) => `<option ${state[key] === item ? "selected" : ""}>${item}</option>`).join("")}</select>`;
}

// 渲染可选芯片组
function renderChips(key, values) {
  const rowClass = key === "ratio" ? "is-ratio" : key === "quantity" ? "is-quantity" : "";
  return `<div class="chip-row ${rowClass}">${values.map((value) => `<button class="chip ${String(state[key]) === String(value) ? "is-active" : ""}" data-chip="${key}" data-value="${value}">${value}</button>`).join("")}</div>`;
}

let clickDelegated = false;

// 绑定页面事件
function bindEvents() {
  if (!clickDelegated) {
    app.addEventListener("click", handleAppClick);
    clickDelegated = true;
  }

  app.querySelectorAll("[data-select-key]").forEach((node) => node.addEventListener("change", () => { updateState(node.dataset.selectKey, node.value); render(); }));
  app.querySelectorAll("[data-slider]").forEach((node) => {
    node.addEventListener("input", (e) => {
      state[node.dataset.slider] = Number(e.target.value);
      const label = node.parentElement.querySelector(".slider-header span:last-child");
      if (label) label.textContent = state[node.dataset.slider];
    });
    node.addEventListener("change", () => render());
  });
  app.querySelectorAll("[data-number]").forEach((node) => node.addEventListener("change", () => { updateState(node.dataset.number, Number(node.value)); render(); }));
  bindDirectInputs();
  bindAuth();
}

// 事件委托处理所有点击
function handleAppClick(event) {
  const view = event.target.closest("[data-view]");
  if (view) { setView(view.dataset.view); return; }

  const side = event.target.closest("[data-side]");
  if (side) { setSide(side.dataset.side); return; }

  const mode = event.target.closest("[data-mode]");
  if (mode) { setMode(mode.dataset.mode); return; }

  const chip = event.target.closest("[data-chip]");
  if (chip) { setChip(chip); return; }

  const select = event.target.closest("[data-select]");
  if (select) { selectGallery(Number(select.dataset.select)); return; }

  const toggle = event.target.closest("[data-toggle]");
  if (toggle) { toggleSetting(toggle.dataset.toggle); return; }

  const action = event.target.closest("[data-action]");
  if (!action) return;

  const name = action.dataset.action;
  if (name === "generate") generateImage();
  else if (name === "open-recharge") showModal("recharge");
  else if (name === "open-auth") { state.returnTo = ""; setView("auth"); }
  else if (name === "close-modal") showModal("");
  else if (name === "submit-recharge") submitRecharge();
  else if (name === "toggle-user-menu") { event.stopPropagation(); state.userMenuOpen = !state.userMenuOpen; render(); }
  else if (name === "user-profile") { state.userMenuOpen = false; showToast("个人中心开发中", "success"); }
  else if (name === "logout") { state.userMenuOpen = false; logout(); }
  else if (name === "reuse-prompt") reusePrompt();
  else if (name === "download") downloadSelectedImage();
  else if (name === "delete-item") deleteSelectedItem();
}

// 绑定直接输入控件
function bindDirectInputs() {
  app.querySelector("#promptInput")?.addEventListener("input", (event) => updateState("prompt", event.target.value));
  app.querySelector("#referenceInput")?.addEventListener("change", handleReferenceFile);
}

// 绑定登录注册表单
function bindAuth() {
  const form = app.querySelector("#authForm");

  app.querySelectorAll("[data-auth-mode]").forEach((node) => node.addEventListener("click", () => switchAuthMode(node.dataset.authMode)));
  form?.addEventListener("submit", handleAuthSubmit);
}

// 切换登录注册模式
function switchAuthMode(mode) {
  const form = app.querySelector("#authForm");
  const button = form.querySelector("button");

  form.dataset.authFormMode = mode;
  button.textContent = mode === "login" ? "登录" : "注册";
  app.querySelectorAll("[data-auth-mode]").forEach((node) => node.classList.toggle("is-active", node.dataset.authMode === mode));
}

// 提交登录或注册
async function handleAuthSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  const path = form.dataset.authFormMode === "register" ? "/api/auth/register" : "/api/auth/login";

  await runAction(async () => {
    const result = await api(path, { method: "POST", body: JSON.stringify(payload) });
    state.token = result.token;
    state.user = result.user;
    state.modal = "";
    localStorage.setItem("create_img_token", state.token);
    await refreshData();
    const backTo = state.returnTo || "workspace";
    state.returnTo = "";
    state.view = backTo;
    render();
  });
}

// 生成图片
async function generateImage() {
  if (!state.prompt.trim() && state.mode === "text-to-image") {
    showToast("提示词不能为空", "error");
    return;
  }

  if (!state.referenceImage && state.mode === "image-prompt") {
    showToast("图文生图需要先上传参考图", "error");
    return;
  }

  try {
    await runGeneratingAction(async () => {
      const path = state.mode === "image-prompt" ? "/api/images/edits" : "/api/images/generations";
      const payload = await api(path, { method: "POST", body: JSON.stringify(createGenerationPayload()) });
      state.generatedImages = payload.images;
      await refreshData();
      showToast("生成成功！图片已保存到历史", "success");
    });
  } catch (error) {
    showToast(error.message || "生成失败，请稍后重试", "error");
  }
}

// 创建图片生成请求体
function createGenerationPayload() {
  return {
    prompt: state.prompt,
    modelName: state.modelName,
    ratio: state.ratio,
    quantity: state.quantity,
    referenceImage: state.referenceImage,
    imageName: state.referenceImageName,
    isPublic: state.isPublic
  };
}

// 执行带进度的生成动作
async function runGeneratingAction(work) {
  state.isGenerating = true;
  state.progress = 12;
  render();
  const timer = setInterval(() => advanceProgress(), 700);

  try {
    await work();
    state.progress = 100;
  } catch (error) {
    state.progress = 0;
    throw error;
  } finally {
    clearInterval(timer);
    state.isGenerating = false;
    render();
  }
}

// 推进生成进度条，远端未返回前最多走到 92
function advanceProgress() {
  state.progress = Math.min(92, state.progress + 9);
  render();
}

// 上传参考图并转成 data URL
function handleReferenceFile(event) {
  const file = event.target.files?.[0];

  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    showToast("参考图不能超过 10MB", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.referenceImage = reader.result;
    state.referenceImageName = file.name;
    render();
  };
  reader.readAsDataURL(file);
}

// 需要登录才能访问的视图
const AUTH_REQUIRED_VIEWS = new Set(["workspace", "history", "resources"]);
const AUTH_REQUIRED_SIDES = new Set(["workspace", "workspace-edit", "history", "models", "styles", "settings"]);

// 切换主视图
function setView(view) {
  if (AUTH_REQUIRED_VIEWS.has(view) && !state.user) {
    state.returnTo = view;
    state.view = "auth";
    render();
    return;
  }
  state.view = view;
  render();
}

// 切换侧边栏目标
function setSide(target) {
  if (AUTH_REQUIRED_SIDES.has(target) && !state.user) {
    state.returnTo = target === "workspace-edit" ? "workspace" : target;
    state.view = "auth";
    render();
    return;
  }
  if (target === "workspace-edit") {
    state.view = "workspace";
    state.mode = "image-prompt";
  } else {
    state.view = target;
    if (target === "workspace") state.mode = "text-to-image";
  }

  render();
}

// 切换生成模式
function setMode(mode) {
  state.mode = mode;
  render();
}

// 更新芯片组选中值
function setChip(node) {
  const value = node.dataset.value;
  const key = node.dataset.chip;

  state[key] = Number.isNaN(Number(value)) ? value : Number(value);
  render();
}

// 更新状态字段
function updateState(key, value) {
  state[key] = value;
}

// 切换布尔设置
function toggleSetting(key) {
  state[key] = !state[key];
  render();
}

// 选择画廊项目
function selectGallery(id) {
  state.selectedId = id;
  render();
}

// 复用历史提示词
function reusePrompt() {
  const item = selectedGalleryItem();

  if (!item) return;
  state.prompt = item.prompt;
  state.view = "workspace";
  state.mode = item.mode;
  render();
}

// 下载当前选中图片
function downloadSelectedImage() {
  const image = selectedGalleryItem()?.images?.[0] ?? state.generatedImages[0];

  if (!image) return showToast("暂无可下载图片", "error");

  const link = document.createElement("a");
  link.href = image;
  link.download = `create-img-${Date.now()}.png`;
  link.click();
}

// 删除当前选中的历史记录
async function deleteSelectedItem() {
  const item = selectedGalleryItem();

  if (!item || item.id < 0) return;

  await runAction(async () => {
    await api(`/api/gallery/${item.id}`, { method: "DELETE" });
    state.selectedId = null;
    await refreshGallery();
    showToast("已删除", "success");
  });
}

// 提交充值意向
async function submitRecharge() {
  const input = app.querySelector("#rechargeAmount");
  const amountCents = Math.round(Number(input.value));

  await runAction(async () => {
    const result = await api("/api/wallet/recharge", { method: "POST", body: JSON.stringify({ amountCents }) });
    state.modal = "";
    await refreshWallet();
    showToast(`充值需人工确认，请联系 ${result.contact}`);
  });
}

// 退出登录并清理本地令牌
function logout() {
  localStorage.removeItem("create_img_token");
  state.token = "";
  state.user = null;
  state.userMenuOpen = false;
  state.view = "auth";
  render();
}

// 执行业务动作并展示错误提示
async function runAction(work) {
  try {
    await work();
  } catch (error) {
    showToast(error.message, "error");
  }
}

// 展示提示信息
function showToast(message, type = "") {
  state.toast = message;
  state.toastType = type;
  render();
  setTimeout(() => {
    state.toast = "";
    state.toastType = "";
    render();
  }, 3000);
}

// 展示弹窗
function showModal(name) {
  state.modal = name;
  render();
}

// 渲染充值弹窗
function renderRechargeModal() {
  if (state.modal !== "recharge") return "";

  return `
    <div class="modal-backdrop">
      <section class="modal">
        <h3>额度充值</h3>
        <p>当前充值需要人工确认，请联系 QQ1351491099。提交后会记录充值意向。</p>
        <div class="field"><label>充值金额（美元）</label><input id="rechargeAmount" type="number" min="1" max="1000" value="10"></div>
        <div class="modal-actions">
          <button class="secondary-btn" data-action="close-modal">取消</button>
          <button class="primary-btn" data-action="submit-recharge">提交意向</button>
        </div>
      </section>
    </div>
  `;
}

// 渲染 toast
function renderToast() {
  if (!state.toast) return "";
  const typeClass = state.toastType ? ` is-${state.toastType}` : "";
  return `<div class="toast${typeClass}">${escapeHtml(state.toast)}</div>`;
}

// 获取当前选中的历史项
function selectedGalleryItem() {
  return state.gallery.find((item) => Number(item.id) === Number(state.selectedId)) ?? state.gallery[0] ?? null;
}

// 获取画廊项目，空数据时展示本地静物占位
function galleryItems() {
  const succeededItems = state.gallery.filter((item) => item.status === "succeeded" && item.images?.length);

  if (succeededItems.length) {
    return succeededItems;
  }

  return mockThumbs().map((image, index) => ({
    id: -index - 1,
    prompt: "极简产品摄影，柔和自然光，米色背景，陶瓷花瓶和石材构图",
    modelName: "Kimo Image",
    ratio: "1:1",
    costCents: 0,
    status: "demo",
    images: [image]
  }));
}

// 创建本地占位缩略图标识
function mockThumbs() {
  return ["mock-a", "mock-b", "mock-c", "mock-d"];
}

// 计算预计扣费
function calculateCostCents() {
  const unit = 10;

  return unit * state.quantity;
}

// 格式化金额
function formatMoney(cents) {
  return `$${(Number(cents ?? 0) / 100).toFixed(2)}`;
}

// 格式化日期
function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

// 转义 HTML，避免提示词注入页面
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

// 渲染统一线性图标
function icon(name) {
  const paths = {
    sparkles: "M12 3l1.6 4.2L18 9l-4.4 1.8L12 15l-1.6-4.2L6 9l4.4-1.8L12 3zM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14z",
    bell: "M18 16H6l1.2-2V9a4.8 4.8 0 019.6 0v5L18 16zM10 18h4",
    text: "M5 6h14M8 6v12M16 6v12M7 18h4M13 18h4",
    image: "M5 5h14v14H5zM8 15l3-3 2 2 2-3 3 4M9 9h.1",
    grid: "M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z",
    clock: "M12 5a7 7 0 100 14 7 7 0 000-14zM12 8v5l3 2",
    box: "M5 8l7-4 7 4v8l-7 4-7-4zM5 8l7 4 7-4M12 12v8",
    flower: "M12 12c3-5 6-3 4 1 5-1 5 3 1 4 1 5-3 5-4 1-3 5-6 3-4-1-5 1-5-3-1-4-5 1-5-3-1-4 3-6 4-1z",
    settings: "M12 8a4 4 0 100 8 4 4 0 000-8zM4 12h2M18 12h2M12 4v2M12 18v2",
    help: "M12 18h.1M9.5 9a2.7 2.7 0 115 1.8c-.7 1.1-2.5 1.5-2.5 3.2",
    "arrow-right": "M5 12h14M13 6l6 6-6 6",
    "chevron-left": "M15 6l-6 6 6 6",
    "chevron-right": "M9 6l6 6-6 6",
    heart: "M12 20s-7-4.5-7-10a4 4 0 017-2 4 4 0 017 2c0 5.5-7 10-7 10z"
  };

  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.sparkles}"/></svg>`;
}

boot();
