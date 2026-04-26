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
  myGallery: [],
  history: [],
  selectedId: null,
  selectedMyGalleryId: null,
  generatedImages: [],
  generatingMode: "",
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
  returnTo: "",
  historyPage: 1,
  historyPageSize: 8,
  historySelectedId: null,
  lightboxImage: null,
  authMode: "login",
  email: "",
  verificationCode: "",
  codeCountdown: 0,
  codeSending: false,
  loadingScopes: new Set(),
  revealScopes: new Set()
};

const app = document.querySelector("#app");
const IMAGE_LOAD_ATTRIBUTES = 'loading="lazy" decoding="async"';
const REFERENCE_IMAGE_MAX_BYTES = 48 * 1024 * 1024;
const DISABLED_SIDE_TARGETS = new Set(["settings"]);
const AUTH_VIEW_SESSION_KEY = "create_img_auth_view";
const LOADING_SCOPE_WALLET = "wallet";
const LOADING_SCOPE_GALLERY = "gallery";
const LOADING_SCOPE_MY_GALLERY = "my-gallery";
const LOADING_SCOPE_HISTORY = "history";
const loadingJobs = new Map();

// 初始化应用，优先恢复本地登录态
async function boot() {
  if (state.token) {
    await loadSession();
  }

  if (!state.user && shouldRestoreAuthView()) {
    state.view = "auth";
  } else if (!state.user) {
    state.view = "gallery";
  }

  render();
  await refreshData();
}

// 判断刷新后是否需要停留在登录注册页
function shouldRestoreAuthView() {
  return sessionStorage.getItem(AUTH_VIEW_SESSION_KEY) === "auth";
}

// 持久化当前视图状态，让登录页刷新后不会被默认画廊覆盖
function persistCurrentView(view) {
  if (view === "auth") {
    sessionStorage.setItem(AUTH_VIEW_SESSION_KEY, view);
    return;
  }

  sessionStorage.removeItem(AUTH_VIEW_SESSION_KEY);
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

// 刷新钱包、公共画廊和个人历史数据
async function refreshData() {
  if (state.user) {
    // 同时拉取公共画廊和个人历史，避免登录后公共画廊被空历史覆盖
    await Promise.all([refreshWallet(), refreshPublicGallery(), refreshMyGallery(), refreshHistory()]);
  } else {
    await refreshPublicGallery();
  }
  render();
}

// 刷新钱包余额
async function refreshWallet() {
  await loadDataWithFade(LOADING_SCOPE_WALLET, async () => {
    const payload = await api("/api/wallet");

    state.user.balanceCents = payload.wallet.balanceCents;
    state.transactions = payload.wallet.transactions;
  });
}

// 刷新个人图片历史
async function refreshHistory() {
  await loadDataWithFade(LOADING_SCOPE_HISTORY, async () => {
    const payload = await api("/api/gallery");

    state.history = payload.items;
    state.historySelectedId = selectExistingOrFirst(state.historySelectedId, state.history);
    syncGeneratingStateFromHistory();
  });
}

// 根据历史记录中的 pending/processing 状态同步生成按钮状态
function syncGeneratingStateFromHistory() {
  const running = state.history.find((item) => item.status === "pending" || item.status === "processing");
  if (running) {
    state.generatingMode = running.mode;
    state.progress = 48;
  } else {
    state.generatingMode = "";
  }
}

// 刷新当前用户已加入公共画廊的图片
async function refreshMyGallery() {
  await loadDataWithFade(LOADING_SCOPE_MY_GALLERY, async () => {
    const payload = await api("/api/my-gallery");

    state.myGallery = payload.items;
    state.selectedMyGalleryId = selectExistingOrFirst(state.selectedMyGalleryId, state.myGallery);
  });
}

// 刷新公共画廊
async function refreshPublicGallery() {
  await loadDataWithFade(LOADING_SCOPE_GALLERY, async () => {
    try {
      const payload = await api("/api/public-gallery");
      state.gallery = payload.items;
      state.selectedId = selectExistingOrFirst(state.selectedId, state.gallery);
    } catch {
      state.gallery = [];
      state.selectedId = null;
    }
  });
}

// 包装数据加载动作，统一展示渐入加载反馈
async function loadDataWithFade(scope, work) {
  if (loadingJobs.has(scope)) return loadingJobs.get(scope);

  const job = runScopedDataLoad(scope, work);
  loadingJobs.set(scope, job);

  return job;
}

// 执行指定数据域的加载任务，并在完成后触发单次渐进 reveal
async function runScopedDataLoad(scope, work) {
  // 调用加载状态切换函数，让当前视图先展示骨架屏
  setLoadingScope(scope, true);

  try {
    await work();
    markRevealScope(scope);
  } finally {
    loadingJobs.delete(scope);
    // 调用加载状态切换函数，让新数据渲染后执行淡入动画
    setLoadingScope(scope, false);
  }
}

// 标记指定数据域需要在下一次渲染时渐进展示
function markRevealScope(scope) {
  state.revealScopes.add(scope);
}

// 判断指定数据域是否需要执行渐进展示
function shouldRevealScope(scope) {
  return state.revealScopes.has(scope);
}

// 清理已经渲染过的渐进展示标记，避免普通点击重复播放
function clearRenderedRevealScopes() {
  if (!state.revealScopes.size) return;

  state.revealScopes.clear();
}

// 切换指定数据域的加载状态
function setLoadingScope(scope, isLoading) {
  const alreadyLoading = state.loadingScopes.has(scope);

  if (alreadyLoading === isLoading) return;
  if (isLoading) {
    state.loadingScopes.add(scope);
  } else {
    state.loadingScopes.delete(scope);
  }
  render();
}

// 判断指定数据域是否正在加载
function isLoadingScope(scope) {
  return state.loadingScopes.has(scope);
}

// 渲染整页入口
function render() {
  app.innerHTML = state.view === "auth" ? renderAuth() : renderStudio();
  bindEvents();
  clearRenderedRevealScopes();
}

// 渲染图片放大弹窗（Lightbox）
function renderLightbox() {
  if (!state.lightboxImage) return "";

  return `
    <div class="lightbox-backdrop" data-action="close-lightbox">
      <button class="lightbox-close" data-action="close-lightbox" aria-label="关闭图片预览">x</button>
      <div class="lightbox-content" role="dialog" aria-modal="true" aria-label="图片预览">
        <img src="${state.lightboxImage}" alt="放大预览" loading="eager" decoding="async">
      </div>
    </div>
  `;
}

// 渲染登录注册页
function renderAuth() {
  return `
    <div class="auth-page">
      <div class="auth-wrapper">
        <div class="auth-left">
          <div class="auth-left-inner">
            <div class="auth-logo-row" aria-label="Kimo">
              <div class="auth-logo-mark"><span></span><span></span><span></span></div>
              <span class="auth-logo-text">Kimo</span>
            </div>
            <div class="auth-hero">
              <h1>Kimo</h1>
              <p class="auth-hero-sub">AI创造无限可能</p>
              <div class="auth-hero-line"></div>
              <p class="auth-hero-desc">探索 AI 的边界，释放你的创造力，让每一个想法都能变成现实。</p>
            </div>
            <div class="auth-celestial">
              <span class="auth-planet"></span>
              <span class="auth-ring auth-ring-one"></span>
              <span class="auth-ring auth-ring-two"></span>
              <span class="auth-castle">
                <i></i><i></i><i></i><i></i><i></i>
              </span>
            </div>
            <div class="auth-features">
              <div class="auth-feature">
                <div class="auth-feature-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                </div>
                <div class="auth-feature-text">
                  <div class="auth-feature-title">智能高效</div>
                  <div class="auth-feature-desc">先进AI模型<br>高效处理</div>
                </div>
              </div>
              <div class="auth-feature">
                <div class="auth-feature-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 9h18M9 21V9"/></svg>
                </div>
                <div class="auth-feature-text">
                  <div class="auth-feature-title">无限创造</div>
                  <div class="auth-feature-desc">激发灵感<br>创造无限</div>
                </div>
              </div>
              <div class="auth-feature">
                <div class="auth-feature-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div class="auth-feature-text">
                  <div class="auth-feature-title">安全可靠</div>
                  <div class="auth-feature-desc">数据加密<br>隐私保护</div>
                </div>
              </div>
            </div>
          </div>
          <div class="auth-footer">
            <div class="auth-footer-copy">© 2024 Kimo. All rights reserved.</div>
          </div>
        </div>
        <div class="auth-right">
          <div class="auth-tabs-row">
            <button class="auth-tab ${state.authMode === "login" ? "is-active" : ""}" data-auth-mode="login">登录</button>
            <button class="auth-tab ${state.authMode === "register" ? "is-active" : ""}" data-auth-mode="register">注册</button>
          </div>
          <div class="auth-form-header">
            <h2>${state.authMode === "register" ? "创建账户" : "欢迎回来 👋"}</h2>
            <p>${state.authMode === "register" ? "注册 Kimo 账户，开启你的 AI 创造之旅" : "登录你的 Kimo 账户，继续你的 AI 创造之旅"}</p>
          </div>
          <form id="authForm" data-auth-form-mode="${state.authMode}">
            <div class="auth-input-group">
              <label>邮箱</label>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </span>
                <input name="email" type="email" autocomplete="email" placeholder="请输入邮箱" value="${escapeHtml(state.email)}">
              </div>
            </div>
            ${state.authMode === "register" ? renderVerificationCodeField() : ""}
            <div class="auth-input-group">
              <label>密码</label>
              <div class="auth-input-wrap">
                <span class="auth-input-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                </span>
                <input name="password" type="password" autocomplete="current-password" placeholder="请输入密码">
                <span class="auth-input-eye" data-action="toggle-password">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </span>
              </div>
            </div>
            <div class="auth-options">
              <label class="auth-remember">
                <input type="checkbox">
                <span>记住我</span>
              </label>
              <a href="#" class="auth-forgot">忘记密码?</a>
            </div>
            <button class="auth-login-btn" type="submit">${state.authMode === "register" ? "注册" : "登录"}</button>
          </form>
          <div class="auth-register-link">${state.authMode === "register" ? "已有账户？" : "还没有账户？"}<button class="auth-link" data-auth-mode="${state.authMode === "register" ? "login" : "register"}">${state.authMode === "register" ? "立即登录" : "立即注册"}</button></div>
        </div>
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
      ${renderBottomNav()}
    </div>
    ${renderRechargeModal()}
    ${renderToast()}
    ${renderLightbox()}
  `;
}

// 渲染顶部导航栏
function renderTopbar() {
  const balanceClass = isLoadingScope(LOADING_SCOPE_WALLET) ? "is-syncing" : "";

  return `
    <header class="topbar">
      <div class="brand"><span class="brand-icon">🐱</span><span>创想图像工作室</span></div>
      <nav class="top-nav" style="display:none">
        ${topButton("gallery", "画廊")}
      </nav>
      <div class="top-actions">
        <button class="icon-btn" title="通知">${icon("bell")}</button>
        ${state.user ? `<span class="mobile-balance ${balanceClass}">${state.user.balanceCents ?? 0} 积分</span>` : ""}
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
    ["my-gallery", "grid", "我的画廊"],
    ["history", "clock", "历史"],
    ["settings", "settings", "设置"],
    ["feedback", "help", "帮助与反馈"]
  ] : [
    ["gallery", "grid", "画廊"]
  ];
  const walletClass = isLoadingScope(LOADING_SCOPE_WALLET) ? "is-syncing" : "";

  return `
    <aside class="sidebar">
      <nav class="side-nav">
        ${buttons.map((item, index) => renderSideButton(item, index)).join("")}
      </nav>
      ${state.user ? `
        <section class="wallet-card ${walletClass}">
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

// 渲染移动端底部导航栏
function renderBottomNav() {
  if (state.view === "auth") return "";

  const items = state.user ? [
    ["workspace", "text", "文生图"],
    ["workspace-edit", "image", "图文生图"],
    ["gallery", "grid", "画廊"],
    ["my-gallery", "grid", "我的画廊"],
    ["history", "clock", "历史"]
  ] : [
    ["gallery", "grid", "画廊"]
  ];

  return `
    <nav class="bottom-nav">
      ${items.map(([target, iconName, label]) => {
        const isActive = resolveSideActive(target) || state.view === target;
        const attr = target.startsWith("workspace") ? `data-side="${target}"` : `data-view="${target}"`;
        return `<button class="${isActive ? "is-active" : ""}" ${attr}>${icon(iconName)}<span>${label}</span></button>`;
      }).join("")}
    </nav>
  `;
}

// 渲染单个侧边栏按钮
function renderSideButton(item, index) {
  const [target, iconName, label] = item;
  const active = resolveSideActive(target);
  const disabled = isDisabledSideTarget(target);
  const divider = index === 2 || index === 4 || index === 6 ? "<div class=\"side-divider\"></div>" : "";

  return `${divider}<button data-side="${target}" class="${active ? "is-active" : ""}" aria-disabled="${disabled}" ${disabled ? "disabled" : ""}>${icon(iconName)}<span>${label}</span></button>`;
}

// 判断侧边栏目标是否暂不可用
function isDisabledSideTarget(target) {
  return DISABLED_SIDE_TARGETS.has(target);
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
  if (state.view === "my-gallery") return renderMyGallery();
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
      ${renderCurrentModuleTab()}
      ${state.mode === "image-prompt" ? renderUploadField() : ""}
      <div class="field">
        <label>提示词${state.mode === "image-prompt" ? "（可选）" : ""}</label>
        <textarea id="promptInput" maxlength="1000" placeholder="描述你想生成的画面...">${escapeHtml(state.prompt)}</textarea>
        <div class="counter">${state.prompt.length} / 1000</div>
      </div>
      <div class="field"><label>模型</label>${renderSelect("modelName", ["Kimo Image", "Aurora XL v2"])}</div>
      <div class="field"><label>宽高比</label>${renderChips("ratio", ["1:1", "4:3", "16:9"])}</div>
      <div class="field"><label>生成数量</label>${renderChips("quantity", [1, 2, 4])}</div>

      <div class="toggle-field">
        <label>加入公共画廊</label>
        <div class="toggle-switch ${state.isPublic ? "is-on" : ""}" data-toggle="isPublic"></div>
      </div>
      <button class="primary-btn" data-action="generate" ${state.generatingMode === state.mode || !state.user ? "disabled" : ""}>${state.generatingMode === state.mode ? "生成中..." : state.user ? "开始生成" : "请登录后生成"}</button>
      <div class="cost">预计消耗 ${calculateCostCents()} 积分</div>
    </aside>
  `;
}

// 渲染当前模块标识，模块切换统一交给左侧导航
function renderCurrentModuleTab() {
  return `<div class="tabs module-tabs"><span class="tab-btn is-active">${currentModuleLabel()}</span></div>`;
}

// 获取当前工作台模块名称，保持和左侧导航一致
function currentModuleLabel() {
  return state.mode === "image-prompt" ? "图文生图" : "文生图";
}

// 渲染参考图上传区域
function renderUploadField() {
  const uploadLimitMb = REFERENCE_IMAGE_MAX_BYTES / 1024 / 1024;
  const uploadTitle = state.referenceImageName ? "已选择参考图" : "点击上传参考图";
  const uploadHint = state.referenceImageName
    ? escapeHtml(state.referenceImageName)
    : `支持 JPG / PNG / WebP，最大 ${uploadLimitMb}MB`;
  const uploadAction = state.referenceImageName ? "重新选择" : "选择文件";

  return `
    <div class="field">
      <span class="upload-label">参考图像</span>
      <div class="upload-box ${state.referenceImageName ? "is-ready" : ""}">
        <div class="upload-placeholder">
          <span class="upload-icon">${icon("image")}</span>
          <span class="upload-copy">
            <span class="upload-title">${uploadTitle}</span>
            <span class="upload-hint">${uploadHint}</span>
          </span>
          <span class="upload-action">${uploadAction}</span>
        </div>
        <input id="referenceInput" type="file" accept="image/png,image/jpeg,image/webp" aria-label="上传参考图像">
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
  const primaryLightboxImage = resolvePrimaryPreviewImage();

  if (quantity === 1) {
    return `
      <section class="stage">
        <div class="preview-wrap preview-grid-1" style="position:relative">
          <div class="image-preview" style="aspect-ratio:${aspectRatio}" data-lightbox="${primaryLightboxImage}">
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
          <div class="image-preview" data-lightbox="${state.generatingMode === state.mode ? "" : image ?? ""}">
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
  const primaryLightboxImage = resolvePrimaryPreviewImage();
  const primaryPreview = renderPrimaryImage();
  const referenceLightboxImage = state.referenceImage ?? "";
  const referencePreview = state.referenceImage
    ? renderImageTag("generated-image", state.referenceImage, "参考图")
    : renderEmptyPreview();

  return `
    <section class="stage">
      <div class="preview-wrap" style="min-height:auto;padding:20px">
        <h2 style="margin:0 0 16px;width:100%;font-size:16px;color:var(--ink-dark)">生成结果对比</h2>
        <div class="compare-grid">
          <div>
            <h3>原图（参考）</h3>
            <div class="image-preview compare-card" data-lightbox="${referenceLightboxImage}">${referencePreview}</div>
          </div>
          <div class="arrow-circle">${icon("arrow-right")}</div>
          <div>
            <h3>生成结果</h3>
            <div class="image-preview compare-card" data-lightbox="${primaryLightboxImage}">${primaryPreview}<span class="preview-badge">${resolution}</span></div>
          </div>
        </div>
      </div>
      ${renderProgress()}
    </section>
  `;
}

// 渲染主预览图片，只展示当前用户自己的生成结果
function renderPrimaryImage() {
  if (state.generatingMode === state.mode) return renderGeneratingPreview();

  const image = state.generatedImages[0];

  return image ? renderImageTag("generated-image", image, "生成结果") : renderEmptyPreview();
}

// 获取主预览图地址，生成中禁用点击放大
function resolvePrimaryPreviewImage() {
  if (state.generatingMode === state.mode) return "";

  return state.generatedImages[0] ?? "";
}

// 根据宽高比获取分辨率字符串
function getResolution(ratio) {
  const map = {
    "1:1": "1024 x 1024",
    "4:3": "1024 x 768",
    "16:9": "1024 x 576"
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
  if (state.generatingMode === state.mode) return renderGeneratingPreview();

  if (isRenderableImage(image)) {
    return renderImageTag("generated-image", image, "生成结果");
  }
  return renderEmptyPreview();
}

// 渲染默认空预览，替换旧版模拟图片占位
function renderEmptyPreview() {
  return `
    <div class="image-empty-state" aria-label="等待生成">
      <span class="image-empty-mark"></span>
      <span class="image-empty-copy">等待生成</span>
    </div>
  `;
}

// 渲染生成中预览，用光晕和扫光提示任务正在进行
function renderGeneratingPreview() {
  return `
    <div class="image-generation-state" aria-live="polite" aria-label="图片正在生成">
      <div class="generation-aura">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="generation-core">
        <span></span>
      </div>
      <div class="generation-status">
        <strong>正在生成</strong>
        <span>${Math.max(1, Math.round(state.progress))}%</span>
      </div>
    </div>
  `;
}

// 渲染图片标签，统一开启懒加载和异步解码，支持点击放大
function renderImageTag(className, source, alt) {
  const classAttribute = className ? ` class="${className}"` : "";

  return `<img${classAttribute} ${IMAGE_LOAD_ATTRIBUTES} src="${source}" alt="${alt}" data-lightbox="${source}">`;
}

// 判断图片地址是否可以直接交给浏览器渲染
function isRenderableImage(image) {
  const value = String(image ?? "");

  return value.startsWith("data:image/") || value.startsWith("http") || value.startsWith("/");
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
  const content = isRenderableImage(image) ? renderImageTag("generated-image", image, "缩略图") : "<div class=\"mock-still-life\"></div>";

  return `<div class="thumb ${index === 0 ? "is-active" : ""}" data-lightbox="${image ?? ""}">${content}</div>`;
}

// 渲染生成进度
function renderProgress() {
  return `
    <div class="progress-area">
      <strong>${state.generatingMode === state.mode ? "生成中..." : "等待生成"}</strong>
      <span style="float:right">${state.progress}%</span>
      <div class="progress-track"><div class="progress-bar" style="--progress:${state.progress}%"></div></div>
      <p class="empty-state">预计消耗 ${calculateCostCents()} 积分</p>
    </div>
  `;
}

// 渲染画廊页面
function renderGallery() {
  const isLoading = isLoadingScope(LOADING_SCOPE_GALLERY);

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
        ${isLoading ? renderGalleryLoadingGrid() : renderGalleryGrid(galleryItems(), renderGalleryItem, LOADING_SCOPE_GALLERY)}
      </div>
      ${isLoading ? renderDetailLoadingPanel("正在加载画廊详情") : renderDetailPanel()}
    </section>
  `;
}

// 渲染我的画廊页面，只展示当前用户已公开的图片
function renderMyGallery() {
  const isLoading = isLoadingScope(LOADING_SCOPE_MY_GALLERY);

  return `
    <section class="gallery-layout">
      <div>
        <div class="gallery-toolbar">
          <h2 class="gallery-title">我的画廊</h2>
          <button class="chip is-active">已加入画廊</button>
        </div>
        ${isLoading ? renderGalleryLoadingGrid() : renderMyGalleryGrid()}
      </div>
      ${isLoading ? renderDetailLoadingPanel("正在加载我的画廊") : renderMyGalleryDetailPanel()}
    </section>
  `;
}

// 渲染我的画廊图片网格，空数据时展示明确空态
function renderMyGalleryGrid() {
  const items = myGalleryItems();

  if (!items.length) {
    return "<p class=\"empty-state\">暂无加入画廊的图片。</p>";
  }

  return renderGalleryGrid(items, renderMyGalleryItem, LOADING_SCOPE_MY_GALLERY);
}

// 渲染图片网格，数据加载完成后仅播放一次逐项入场动画
function renderGalleryGrid(items, renderer, scope) {
  const revealClass = shouldRevealScope(scope) ? " is-revealing" : "";

  return `<div class="gallery-grid${revealClass}">${items.map(renderer).join("")}</div>`;
}

// 渲染画廊数据加载中的骨架网格
function renderGalleryLoadingGrid() {
  const placeholders = Array.from({ length: 8 }, (_, index) => renderGalleryLoadingCard(index));

  return `<div class="gallery-grid loading-grid" aria-busy="true">${placeholders.join("")}</div>`;
}

// 渲染单个加载中的图片卡片
function renderGalleryLoadingCard(index) {
  return `<article class="gallery-item loading-card" style="--loading-index:${index}"><div class="loading-image"></div></article>`;
}

// 渲染画廊单个项目
function renderGalleryItem(item, index = 0) {
  const image = item.images?.[0] ?? "";
  const isActive = Number(state.selectedId) === Number(item.id);

  return `
    <article class="gallery-item gallery-entry ${isActive ? "is-active" : ""}" style="${createGalleryEntryStyle(index)}" data-preview-scope="gallery" data-preview-id="${item.id}">
      <button data-select="${item.id}" data-lightbox="${image}">${image ? renderImageTag("", image, "生成图") : "<div class=\"mock-still-life\"></div>"}</button>
    </article>
  `;
}

// 渲染我的画廊单个项目，提供移出画廊入口
function renderMyGalleryItem(item, index = 0) {
  const image = item.images?.[0] ?? "";
  const isActive = Number(state.selectedMyGalleryId) === Number(item.id);

  return `
    <article class="gallery-item gallery-entry my-gallery-item ${isActive ? "is-active" : ""}" style="${createGalleryEntryStyle(index)}" data-preview-scope="my-gallery" data-preview-id="${item.id}">
      <button data-select="${item.id}" data-lightbox="${image}">${image ? renderImageTag("", image, "我的画廊生成图") : "<div class=\"mock-still-life\"></div>"}</button>
      <button class="gallery-card-action gallery-remove-btn" data-action="remove-from-my-gallery" data-remove-gallery="${item.id}">移除画廊</button>
    </article>
  `;
}

// 创建图片卡片渐进动画所需的 CSS 变量
function createGalleryEntryStyle(index) {
  return `--gallery-index:${Math.max(0, Number(index) || 0)}`;
}

// 渲染右侧详情面板
function renderDetailPanel() {
  const item = selectedGalleryItem();

  if (!item) return "<aside class=\"detail-panel\"><p class=\"empty-state\">暂无生成记录</p></aside>";

  return `
    <aside class="detail-panel content-fade-in">
      <div class="thumb" data-lightbox="${item.images?.[0] ?? ""}">${item.images?.[0] ? renderImageTag("generated-image", item.images[0], "选中图") : "<div class=\"mock-still-life\"></div>"}</div>
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
    </aside>
  `;
}

// 渲染我的画廊右侧详情面板
function renderMyGalleryDetailPanel() {
  const item = selectedMyGalleryItem();

  if (!item) return "<aside class=\"detail-panel\"><p class=\"empty-state\">暂无加入画廊的图片</p></aside>";

  return `
    <aside class="detail-panel content-fade-in">
      <div class="thumb" data-lightbox="${item.images?.[0] ?? ""}">${item.images?.[0] ? renderImageTag("generated-image", item.images[0], "我的画廊选中图") : "<div class=\"mock-still-life\"></div>"}</div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${escapeHtml(item.prompt || "未填写提示词")}</p>
      <div class="meta-list">
        <span>模型</span><strong>${escapeHtml(item.modelName)}</strong>
        <span>风格</span><strong>${escapeHtml(item.style || "产品摄影")}</strong>
        <span>比例</span><strong>${escapeHtml(item.ratio)}</strong>
        <span>生成时间</span><strong>${formatDate(item.createdAt)}</strong>
        <span>费用</span><strong>${item.costCents ?? 0} 积分</strong>
      </div>
      <button class="secondary-btn" data-action="download" style="margin-top:14px;margin-bottom:8px">下载</button>
      <button class="danger-btn" data-action="remove-from-my-gallery" data-remove-gallery="${item.id}">移除画廊</button>
    </aside>
  `;
}

// 渲染历史页面（瀑布流网格 + 右侧详情面板 + 分页）
function renderDetail() {
  const isLoading = isLoadingScope(LOADING_SCOPE_HISTORY);
  const items = state.history.filter((item) => item.status === "succeeded" && item.images?.length);
  const total = items.length;

  if (isLoading) return renderHistoryLoadingLayout();
  if (!total) return "<p class=\"empty-state\">暂无历史记录，先去生成一张。</p>";

  const totalPages = Math.max(1, Math.ceil(total / state.historyPageSize));
  const page = Math.min(state.historyPage, totalPages);
  const start = (page - 1) * state.historyPageSize;
  const pageItems = items.slice(start, start + state.historyPageSize);

  return `
    <section class="gallery-layout">
      <div>
        <div class="gallery-toolbar">
          <h2 class="gallery-title">生成历史</h2>
          <span class="history-count">共 ${total} 条</span>
        </div>
        ${renderGalleryGrid(pageItems, renderHistoryGridItem, LOADING_SCOPE_HISTORY)}
        ${renderHistoryPagination(page, totalPages, total)}
      </div>
      ${renderHistoryDetailPanel()}
    </section>
  `;
}

// 渲染历史数据加载中的整体布局
function renderHistoryLoadingLayout() {
  return `
    <section class="gallery-layout">
      <div>
        <div class="gallery-toolbar">
          <h2 class="gallery-title">生成历史</h2>
          <span class="history-count">加载中</span>
        </div>
        ${renderGalleryLoadingGrid()}
      </div>
      ${renderDetailLoadingPanel("正在加载历史详情")}
    </section>
  `;
}

// 渲染历史瀑布流网格项
function renderHistoryGridItem(item, index = 0) {
  const image = item.images?.[0] ?? "";
  const isActive = state.historySelectedId === item.id;
  const isPublic = item.isPublic;

  return `
    <article class="gallery-item gallery-entry ${isActive ? "is-active" : ""}" style="${createGalleryEntryStyle(index)}" data-preview-scope="history" data-preview-id="${item.id}">
      <button data-history-select="${item.id}" data-lightbox="${image}">${image ? renderImageTag("", image, "历史图片") : "<div class=\"mock-still-life\"></div>"}</button>
      <button class="gallery-card-action gallery-toggle-btn ${isPublic ? "is-active" : ""}" data-action="toggle-public" data-toggle-public="${item.id}">${isPublic ? "移出画廊" : "加入公共画廊"}</button>
    </article>
  `;
}

// 渲染历史右侧详情面板
function renderHistoryDetailPanel() {
  const item = selectedHistoryItem();

  if (!item) return "<aside class=\"detail-panel\"><p class=\"empty-state\">选择一张图片查看详情</p></aside>";

  const images = item.images ?? [];
  const variants = images.length > 1 ? images.slice(1) : [];

  return `
    <aside class="detail-panel content-fade-in">
      <div class="thumb" data-lightbox="${images[0] ?? ""}">${images[0] ? renderImageTag("generated-image", images[0], "选中图") : "<div class=\"mock-still-life\"></div>"}</div>
      <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${escapeHtml(item.prompt || "未填写提示词")}</p>
      <div class="meta-list">
        <span>模型</span><strong>${escapeHtml(item.modelName)}</strong>
        <span>风格</span><strong>${escapeHtml(item.style || "产品摄影")}</strong>
        <span>比例</span><strong>${escapeHtml(item.ratio)}</strong>
        <span>生成时间</span><strong>${formatDate(item.createdAt)}</strong>
        <span>消耗积分</span><strong>${item.costCents ?? 0}</strong>
      </div>
      <button class="secondary-btn" data-action="download" style="margin-top:14px;margin-bottom:8px">下载</button>
      <button class="danger-btn" data-action="delete-item">删除</button>
      ${variants.length ? `
        <div style="margin-top:16px">
          <div style="font-size:13px;font-weight:600;color:var(--muted);margin-bottom:8px">生成变体</div>
          <div class="variants-row">
            ${images.map((img, i) => `<div class="variant-thumb ${i === 0 ? "is-active" : ""}" data-lightbox="${img ?? ""}">${img ? renderImageTag("generated-image", img, "生成变体") : "<div class=\"mock-still-life\"></div>"}</div>`).join("")}
          </div>
        </div>
      ` : ""}
    </aside>
  `;
}

// 渲染右侧详情数据加载中的骨架面板
function renderDetailLoadingPanel(label) {
  return `
    <aside class="detail-panel detail-loading-panel" aria-busy="true" aria-label="${label}">
      <div class="loading-detail-thumb"></div>
      <div class="loading-line is-wide"></div>
      <div class="loading-line"></div>
      <div class="loading-meta-list">
        ${Array.from({ length: 8 }, () => "<span></span><strong></strong>").join("")}
      </div>
      <div class="loading-button"></div>
      <div class="loading-button"></div>
    </aside>
  `;
}

// 渲染历史分页控件
function renderHistoryPagination(page, totalPages, total) {
  if (totalPages <= 1) return "";

  const pages = [];
  const maxVisible = 5;
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(`<button class="page-btn ${i === page ? "is-active" : ""}" data-history-page="${i}">${i}</button>`);
  }

  return `
    <div class="history-pagination" style="margin-top:12px">
      <button class="page-btn" data-history-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>上一页</button>
      ${startPage > 1 ? "<span class=\"page-ellipsis\">…</span>" : ""}
      ${pages.join("")}
      ${endPage < totalPages ? "<span class=\"page-ellipsis\">…</span>" : ""}
      <button class="page-btn" data-history-page="${page + 1}" ${page >= totalPages ? "disabled" : ""}>下一页</button>
      <span class="page-info">${page} / ${totalPages} 页</span>
    </div>
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
let keydownDelegated = false;
let hoverDelegated = false;

// 绑定页面事件
function bindEvents() {
  if (!clickDelegated) {
    app.addEventListener("click", handleAppClick);
    clickDelegated = true;
  }
  if (!keydownDelegated) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.lightboxImage) {
        state.lightboxImage = null;
        render();
      }
    });
    keydownDelegated = true;
  }
  if (!hoverDelegated) {
    // 调用悬停预览处理函数，让右侧详情跟随当前图片卡片切换
    app.addEventListener("mouseover", handleGalleryPreviewHover);
    hoverDelegated = true;
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

  const chip = event.target.closest("[data-chip]");
  if (chip) { setChip(chip); return; }

  const lightboxTrigger = event.target.closest("[data-lightbox]");
  if (lightboxTrigger) {
    selectItemFromLightboxTrigger(lightboxTrigger);
    if (openLightboxFromTrigger(lightboxTrigger)) return;
  }

  const select = event.target.closest("[data-select]");
  if (select) { selectGallery(Number(select.dataset.select)); return; }

  const toggle = event.target.closest("[data-toggle]");
  if (toggle) { toggleSetting(toggle.dataset.toggle); return; }

  const historyPageBtn = event.target.closest("[data-history-page]");
  if (historyPageBtn) {
    const page = Number(historyPageBtn.dataset.historyPage);
    if (page >= 1) { state.historyPage = page; render(); }
    return;
  }

  const historySelect = event.target.closest("[data-history-select]");
  if (historySelect) {
    state.historySelectedId = Number(historySelect.dataset.historySelect);
    render();
    return;
  }

  const action = event.target.closest("[data-action]");
  if (!action) return;

  const name = action.dataset.action;
  if (name === "close-lightbox") closeLightbox(event);
  else if (name === "generate") generateImage();
  else if (name === "open-recharge") showModal("recharge");
  else if (name === "open-auth") { state.returnTo = ""; setView("auth"); }
  else if (name === "close-modal") showModal("");
  else if (name === "submit-recharge") submitRecharge();
  else if (name === "send-code") sendVerificationCode();
  else if (name === "toggle-user-menu") { event.stopPropagation(); state.userMenuOpen = !state.userMenuOpen; render(); }
  else if (name === "user-profile") { state.userMenuOpen = false; showToast("个人中心开发中", "success"); }
  else if (name === "logout") { state.userMenuOpen = false; logout(); }
  else if (name === "reuse-prompt") reusePrompt();
  else if (name === "download") downloadSelectedImage();
  else if (name === "remove-from-my-gallery") removeFromMyGallery(action);
  else if (name === "toggle-public") togglePublic(action);
  else if (name === "delete-item") deleteSelectedItem();
}

// 处理画廊图片悬停预览，避免用户必须点击后才能看到详情
function handleGalleryPreviewHover(event) {
  const previewCard = event.target.closest("[data-preview-id]");

  if (!previewCard || !app.contains(previewCard)) return;

  // 调用局部预览更新函数，避免整页重渲染造成刷新感
  if (selectPreviewItemFromCard(previewCard)) updatePreviewDetailFromHover(previewCard);
}

// 根据悬停卡片所属页面更新右侧详情的当前图片
function selectPreviewItemFromCard(card) {
  const id = Number(card.dataset.previewId);
  const scope = card.dataset.previewScope;

  if (!Number.isFinite(id)) return false;
  if (scope === "history") return updateSelectedId("historySelectedId", id);
  if (scope === "my-gallery") return updateSelectedId("selectedMyGalleryId", id);

  return updateSelectedId("selectedId", id);
}

// 更新选中 ID，并返回是否发生真实变化
function updateSelectedId(key, id) {
  if (Number(state[key]) === Number(id)) return false;

  state[key] = id;
  return true;
}

// 局部更新悬停预览相关 DOM，不重建画廊网格
function updatePreviewDetailFromHover(card) {
  // 调用选中态同步函数，只移动当前卡片高亮
  syncPreviewActiveCard(card);

  // 调用详情面板替换函数，只刷新右侧信息
  replacePreviewDetailPanel();
}

// 同步当前悬停卡片的选中态
function syncPreviewActiveCard(activeCard) {
  app.querySelectorAll("[data-preview-id]").forEach((card) => {
    const sameScope = card.dataset.previewScope === activeCard.dataset.previewScope;
    card.classList.toggle("is-active", sameScope && card === activeCard);
  });
}

// 替换右侧详情面板，避免触发整页淡入动画
function replacePreviewDetailPanel() {
  const panel = app.querySelector(".gallery-layout .detail-panel");
  const nextPanel = createPreviewDetailPanel();

  if (!panel || !nextPanel) return;
  panel.replaceWith(nextPanel);
}

// 创建当前视图对应的详情面板节点
function createPreviewDetailPanel() {
  const template = document.createElement("template");
  template.innerHTML = renderPreviewDetailPanel().trim();
  const panel = template.content.firstElementChild;

  panel?.classList.remove("content-fade-in");
  return panel;
}

// 渲染当前视图对应的详情面板 HTML
function renderPreviewDetailPanel() {
  if (state.view === "history") return renderHistoryDetailPanel();
  if (state.view === "my-gallery") return renderMyGalleryDetailPanel();

  return renderDetailPanel();
}

// 打开放大预览，忽略空图片和占位图
function openLightboxFromTrigger(trigger) {
  const image = trigger.dataset.lightbox;

  if (!isRenderableImage(image)) return false;
  state.lightboxImage = image;
  render();
  return true;
}

// 根据触发放大预览的卡片同步选中项，保证右侧详情跟随图片切换
function selectItemFromLightboxTrigger(trigger) {
  if (trigger.dataset.historySelect) {
    state.historySelectedId = Number(trigger.dataset.historySelect);
    return;
  }

  if (trigger.dataset.select) {
    if (state.view === "my-gallery") {
      state.selectedMyGalleryId = Number(trigger.dataset.select);
      return;
    }

    state.selectedId = Number(trigger.dataset.select);
  }
}

// 关闭放大预览，仅响应遮罩层和关闭按钮
function closeLightbox(event) {
  const isBackdropClick = event.target.classList.contains("lightbox-backdrop");
  const isCloseButtonClick = Boolean(event.target.closest(".lightbox-close"));

  if (!isBackdropClick && !isCloseButtonClick) return;
  state.lightboxImage = null;
  render();
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
  app.querySelectorAll("[data-action='toggle-password']").forEach((node) => node.addEventListener("click", () => {
    const input = node.closest(".auth-input-wrap").querySelector("input");
    input.type = input.type === "password" ? "text" : "password";
  }));
  form?.addEventListener("submit", handleAuthSubmit);
}

// 渲染验证码输入区域
function renderVerificationCodeField() {
  const countdownText = state.codeCountdown > 0 ? `${state.codeCountdown}s` : "获取验证码";
  const disabled = state.codeCountdown > 0 || state.codeSending ? "disabled" : "";

  return `
    <div class="auth-input-group">
      <label>验证码</label>
      <div class="auth-input-wrap auth-code-wrap">
        <span class="auth-input-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
        </span>
        <input name="verificationCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="请输入6位验证码">
        <button type="button" class="auth-code-btn" data-action="send-code" ${disabled}>${countdownText}</button>
      </div>
    </div>
  `;
}

// 切换登录注册模式
function switchAuthMode(mode) {
  state.authMode = mode;
  render();
}

// 发送验证码
async function sendVerificationCode() {
  const email = app.querySelector("#authForm input[name='email']")?.value?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("请输入有效的邮箱地址", "error");
    return;
  }

  state.email = email;
  state.codeSending = true;
  render();

  try {
    const result = await api("/api/auth/send-code", { method: "POST", body: JSON.stringify({ email }) });
    showToast("验证码已发送", "success");
    startCodeCountdown(result.remainingSeconds ?? 60);
  } catch (error) {
    showToast(error.message || "发送失败", "error");
  } finally {
    state.codeSending = false;
    render();
  }
}

// 启动验证码倒计时，仅更新按钮文本避免输入框失焦
function startCodeCountdown(seconds) {
  state.codeCountdown = seconds;
  updateCodeButtonText();
  const timer = setInterval(() => {
    state.codeCountdown--;
    updateCodeButtonText();
    if (state.codeCountdown <= 0) {
      clearInterval(timer);
      updateCodeButtonText();
    }
  }, 1000);
}

// 单独更新验证码按钮文本，避免全量渲染导致输入框失焦
function updateCodeButtonText() {
  const btn = app.querySelector(".auth-code-btn");
  if (!btn) return;
  const text = state.codeCountdown > 0 ? `${state.codeCountdown}s` : "获取验证码";
  btn.textContent = text;
  btn.disabled = state.codeCountdown > 0 || state.codeSending;
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
    persistCurrentView(state.view);
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
  state.generatingMode = state.mode;
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
    state.generatingMode = "";
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
  if (file.size > REFERENCE_IMAGE_MAX_BYTES) {
    showToast(`参考图不能超过 ${formatFileSize(REFERENCE_IMAGE_MAX_BYTES)}`, "error");
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
const AUTH_REQUIRED_VIEWS = new Set(["workspace", "my-gallery", "history", "resources"]);
const AUTH_REQUIRED_SIDES = new Set(["workspace", "workspace-edit", "my-gallery", "history", "models", "styles", "settings"]);

// 切换主视图
function setView(view) {
  if (AUTH_REQUIRED_VIEWS.has(view) && !state.user) {
    state.returnTo = view;
    state.view = "auth";
    persistCurrentView(state.view);
    render();
    return;
  }
  if (state.view === view) return;

  state.view = view;
  persistCurrentView(view);
  render();
  refreshDataIfNeeded(view);
}

// 切换侧边栏目标
function setSide(target) {
  if (isDisabledSideTarget(target)) return;

  if (resolveSideActive(target)) return;

  if (AUTH_REQUIRED_SIDES.has(target) && !state.user) {
    state.returnTo = target === "workspace-edit" ? "workspace" : target;
    state.view = "auth";
    persistCurrentView(state.view);
    render();
    return;
  }
  if (target === "workspace-edit") {
    state.view = "workspace";
    state.mode = "image-prompt";
    state.generatedImages = [];
    state.referenceImage = "";
  } else {
    state.view = target;
    if (target === "workspace") {
      state.mode = "text-to-image";
      state.generatedImages = [];
      state.referenceImage = "";
    }
  }

  persistCurrentView(state.view);
  render();
  refreshDataIfNeeded(target === "workspace-edit" ? "workspace" : target);
}

// 根据目标视图按需刷新数据，避免每次导航都全量刷新
function refreshDataIfNeeded(view) {
  if (!state.user) return;
  if (view === "gallery") {
    runBackgroundDataRefresh(refreshPublicGallery);
    return;
  }
  if (view === "my-gallery") {
    runBackgroundDataRefresh(refreshMyGallery);
    return;
  }
  if (view === "history") {
    runBackgroundDataRefresh(refreshHistory);
    return;
  }
  if (view === "workspace" || view === "workspace-edit") {
    runBackgroundDataRefresh(refreshWallet);
  }
}

// 执行后台数据刷新，保留统一加载动画并兜底错误提示
function runBackgroundDataRefresh(work) {
  work().catch((error) => showToast(error.message || "数据加载失败", "error"));
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
  if (state.view === "my-gallery") {
    state.selectedMyGalleryId = id;
    render();
    return;
  }

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
  const item = selectedVisibleImageItem();
  const image = item?.images?.[0] ?? state.generatedImages[0];

  if (!image) return showToast("暂无可下载图片", "error");

  const link = document.createElement("a");
  link.href = image;
  link.download = `create-img-${Date.now()}.png`;
  link.click();
}

// 将当前用户的图片移出公共画廊并刷新相关列表
async function removeFromMyGallery(action) {
  const itemId = Number(action.dataset.removeGallery);
  const item = myGalleryItems().find((galleryItem) => Number(galleryItem.id) === itemId) ?? selectedMyGalleryItem();

  if (!item || item.id < 0) return;

  await runAction(async () => {
    await api(`/api/my-gallery/${item.id}`, { method: "DELETE" });
    state.selectedMyGalleryId = null;
    await Promise.all([refreshMyGallery(), refreshPublicGallery(), refreshHistory()]);
    showToast("已移出画廊", "success");
  });
}

// 切换历史记录的公开状态（加入/移出画廊）
async function togglePublic(action) {
  const itemId = Number(action.dataset.togglePublic);

  await runAction(async () => {
    await api(`/api/history/${itemId}/toggle-public`, { method: "POST" });
    await Promise.all([refreshHistory(), refreshMyGallery(), refreshPublicGallery()]);
    showToast("已更新", "success");
  });
}

// 删除当前选中的历史记录
async function deleteSelectedItem() {
  const item = selectedHistoryItem();

  if (!item || item.id < 0) return;

  await deleteHistoryItem(item);
}

// 删除指定历史记录
async function deleteHistoryItem(item) {
  if (!item || item.id < 0) return;

  await runAction(async () => {
    await api(`/api/gallery/${item.id}`, { method: "DELETE" });
    state.historySelectedId = null;
    await refreshHistory();
    showToast("已删除", "success");
  });
}

// 下载指定历史记录图片
function downloadHistoryItem(item) {
  const image = item?.images?.[0];

  if (!image) return showToast("暂无可下载图片", "error");

  const link = document.createElement("a");
  link.href = image;
  link.download = `create-img-${Date.now()}.png`;
  link.click();
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
  persistCurrentView(state.view);
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

// 获取当前选中的公共画廊可见项
function selectedGalleryItem() {
  return findSelectedItem(galleryItems(), state.selectedId);
}

// 获取当前选中的我的画廊可见项
function selectedMyGalleryItem() {
  return findSelectedItem(myGalleryItems(), state.selectedMyGalleryId);
}

// 获取当前选中的个人历史项
function selectedHistoryItem() {
  return findSelectedItem(state.history, state.historySelectedId);
}

// 根据当前视图返回下载所需的选中图片项
function selectedVisibleImageItem() {
  if (state.view === "history") return selectedHistoryItem();
  if (state.view === "my-gallery") return selectedMyGalleryItem();

  return selectedGalleryItem();
}

// 按 ID 查找选中项，找不到时回退到列表第一项
function findSelectedItem(items, selectedId) {
  return items.find((item) => Number(item.id) === Number(selectedId)) ?? items[0] ?? null;
}

// 保留仍然存在的选中项，否则选中列表第一项
function selectExistingOrFirst(selectedId, items) {
  const selectedItem = items.find((item) => Number(item.id) === Number(selectedId));

  return selectedItem?.id ?? items[0]?.id ?? null;
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
    createdAt: new Date().toISOString(),
    images: [image]
  }));
}

// 获取我的画廊真实项目，不展示公共画廊的占位数据
function myGalleryItems() {
  return state.myGallery.filter((item) => item.status === "succeeded" && item.isPublic && item.images?.length);
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

// 格式化文件大小，用于展示上传限制
function formatFileSize(bytes) {
  const megabytes = Number(bytes ?? 0) / 1024 / 1024;

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)}MB`;
}

// 格式化日期
function formatDate(value) {
  const date = parseDateValue(value);

  if (!date) return "暂无时间";

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

// 解析后端或本地兜底日期，避免非法日期拖垮整页渲染
function parseDateValue(value) {
  if (!value) return null;

  const normalizedValue = normalizeDateValue(value);
  const date = new Date(normalizedValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

// 兼容 MySQL DATETIME 字符串和标准 ISO 日期
function normalizeDateValue(value) {
  if (value instanceof Date || typeof value === "number") return value;

  return String(value).trim().replace(" ", "T");
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
    heart: "M12 20s-7-4.5-7-10a4 4 0 017-2 4 4 0 017 2c0 5.5-7 10-7 10z",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
    trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"
  };

  return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.sparkles}"/></svg>`;
}

boot();
