import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { APP_CONFIG } from "./config.mjs";
import { createDatabasePool } from "./database/mysqlClient.mjs";
import { createRedisClient } from "./database/redisClient.mjs";
import { GenerationRepository } from "./repositories/generationRepository.mjs";
import { UserRepository } from "./repositories/userRepository.mjs";
import { Credentials, AuthService } from "./services/authService.mjs";
import { VerificationService } from "./services/verificationService.mjs";
import { EmailService } from "./services/emailService.mjs";
import { ImageService } from "./services/imageService.mjs";
import { RemoteImageClient } from "./services/remoteImageClient.mjs";
import { ImageStorageService } from "./services/imageStorageService.mjs";
import { WalletService } from "./services/walletService.mjs";
import { sendError, sendOk, readJsonBody } from "./http/httpResponses.mjs";
import { RedisSessionStore } from "./security/sessions.mjs";

const PUBLIC_DIR = join(fileURLToPath(new URL("..", import.meta.url)), "public");

// 启动应用服务，初始化数据库和所有业务服务
async function main() {
  const pool = await createDatabasePool(APP_CONFIG.database);
  const redisClient = await createRedisClient(APP_CONFIG.redis);
  const services = await createServices(pool, redisClient);
  const server = createServer((request, response) => handleRequest(request, response, services));

  server.listen(APP_CONFIG.port, () => {
    console.log(`create-img-web listening on http://localhost:${APP_CONFIG.port}`);
  });
}

// 创建服务实例并完成依赖装配
async function createServices(pool, redisClient) {
  const userRepository = new UserRepository(pool);
  const generationRepository = new GenerationRepository(pool);
  const imageStorageService = new ImageStorageService(APP_CONFIG.imageStorage);
  const sessionStore = new RedisSessionStore({
    redisClient,
    ttlSeconds: APP_CONFIG.sessionTtlSeconds
  });
  const walletService = new WalletService({
    pool,
    userRepository,
    rechargeContact: APP_CONFIG.rechargeContact
  });

  walletService.attachGenerationRepository(generationRepository);

  // 调用历史迁移，把旧版 base64 结果图转换为服务器相对路径
  await generationRepository.migrateInlineImagesToPaths(imageStorageService);

  const emailService = APP_CONFIG.email.host
    ? new EmailService(APP_CONFIG.email)
    : null;
  const verificationService = new VerificationService({ redisClient, emailService });

  return {
    authService: new AuthService({
      pool,
      userRepository,
      sessionStore,
      verificationService,
      signupCreditCents: APP_CONFIG.signupCreditCents
    }),
    verificationService,
    walletService,
    imageService: new ImageService({
      walletService,
      generationRepository,
      remoteImageClient: new RemoteImageClient(APP_CONFIG.imageApi),
      imageStorageService,
      textToImageUnitCostCents: APP_CONFIG.textToImageUnitCostCents,
      imageEditUnitCostCents: APP_CONFIG.imageEditUnitCostCents
    }),
    imageStorageService,
    sessionStore
  };
}

// 请求入口，根据路径分发 API 或静态资源
async function handleRequest(request, response, services) {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApiRequest(request, response, services, url);
      return;
    }

    await serveStaticAsset(response, url.pathname, services);
  } catch (error) {
    sendError(response, resolveErrorStatus(error), error.message || "服务异常");
  }
}

// API 路由分发，集中控制认证边界
async function handleApiRequest(request, response, services, url) {
  if (request.method === "POST" && url.pathname === "/api/auth/register") {
    await handleRegister(request, response, services);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    await handleLogin(request, response, services);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/send-code") {
    await handleSendCode(request, response, services);
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/public-gallery") {
    await handlePublicGallery(request, response, services);
    return;
  }

  await handleAuthedApiRequest(request, response, services, url);
}

// 查询公开画廊（无需登录）
async function handlePublicGallery(request, response, services) {
  const items = await services.imageService.listPublic();
  sendOk(response, { items });
}

// 处理注册接口
async function handleRegister(request, response, services) {
  const payload = await readJsonBody(request);
  const result = await services.authService.register(new Credentials(payload));

  sendOk(response, result);
}

// 处理登录接口
async function handleLogin(request, response, services) {
  const payload = await readJsonBody(request);
  const result = await services.authService.login(new Credentials(payload));

  sendOk(response, result);
}

// 处理发送验证码接口
async function handleSendCode(request, response, services) {
  const payload = await readJsonBody(request);
  const result = await services.verificationService.sendCode(payload.email);

  sendOk(response, result);
}

// 处理需要登录的 API 请求
async function handleAuthedApiRequest(request, response, services, url) {
  const session = await requireSession(request, services.sessionStore);

  if (request.method === "GET" && url.pathname === "/api/session") {
    sendOk(response, { user: await services.authService.loadSessionUser(session) });
    return;
  }

  await routeAuthedApi(request, response, services, url, session);
}

// 分发登录后的业务接口
async function routeAuthedApi(request, response, services, url, session) {
  const routes = new AuthedRouteHandlers(request, response, services, session);

  if (request.method === "GET" && url.pathname === "/api/wallet") return routes.wallet();
  if (request.method === "POST" && url.pathname === "/api/wallet/recharge") return routes.recharge();
  if (request.method === "GET" && url.pathname === "/api/gallery") return routes.gallery();
  if (request.method === "DELETE" && url.pathname.startsWith("/api/gallery/")) return routes.deleteGalleryItem(url);
  // 调用历史公开状态切换接口，让历史图片可以加入或移出公共画廊
  if (request.method === "POST" && url.pathname.startsWith("/api/history/") && url.pathname.endsWith("/toggle-public")) return routes.togglePublic(url);
  if (request.method === "GET" && url.pathname === "/api/my-gallery") return routes.myGallery();
  if (request.method === "DELETE" && url.pathname.startsWith("/api/my-gallery/")) return routes.removeMyGalleryItem(url);
  if (request.method === "POST" && url.pathname === "/api/images/generations") return routes.textToImage();
  if (request.method === "POST" && url.pathname === "/api/images/edits") return routes.imageEdit();

  sendError(response, 404, "接口不存在");
}

// 已登录接口处理器，避免路由函数继续膨胀
class AuthedRouteHandlers {
  constructor(request, response, services, session) {
    this.request = request;
    this.response = response;
    this.services = services;
    this.session = session;
  }

  // 查询钱包余额和流水
  async wallet() {
    const wallet = await this.services.walletService.loadWallet(this.session.userId);

    sendOk(this.response, { wallet });
  }

  // 创建充值意向并返回客服联系方式
  async recharge() {
    const payload = await readJsonBody(this.request);
    const result = await this.services.walletService.createRechargeRequest(this.session.userId, payload.amountCents);

    sendOk(this.response, result);
  }

  // 查询图片历史和画廊
  async gallery() {
    const items = await this.services.imageService.listHistory(this.session.userId);

    sendOk(this.response, { items });
  }

  // 查询当前用户已加入公共画廊的图片
  async myGallery() {
    const items = await this.services.imageService.listMyGallery(this.session.userId);

    sendOk(this.response, { items });
  }

  // 将当前用户的图片移出公共画廊
  async removeMyGalleryItem(url) {
    const generationId = Number(url.pathname.split("/").pop());

    await this.services.imageService.removeFromMyGallery(this.session.userId, generationId);
    sendOk(this.response);
  }

  // 删除当前用户自己的历史图片
  async deleteGalleryItem(url) {
    const generationId = Number(url.pathname.split("/").pop());

    await this.services.imageService.deleteHistoryItem(this.session.userId, generationId);
    sendOk(this.response);
  }

  // 调用文生图业务流程
  async textToImage() {
    const payload = await readJsonBody(this.request);
    const result = await this.services.imageService.createTextImages(this.session.userId, payload);

    sendOk(this.response, result);
  }

  // 调用图文生图业务流程
  async imageEdit() {
    // 调用配置化请求体读取，放大参考图上传容量并保留服务端保护阈值
    const payload = await readJsonBody(this.request, APP_CONFIG.server.imageUploadMaxBytes);
    const result = await this.services.imageService.createImageEdits(this.session.userId, payload);

    sendOk(this.response, result);
  }

  // 切换历史记录的公开状态（加入/移出画廊）
  async togglePublic(url) {
    const generationId = Number(url.pathname.split("/")[3]);

    await this.services.imageService.togglePublic(this.session.userId, generationId);
    sendOk(this.response);
  }
}

// 从 Authorization 请求头中解析并校验登录令牌
async function requireSession(request, sessionStore) {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  return sessionStore.verify(token);
}

// 返回静态资源，根路径默认返回前端入口
async function serveStaticAsset(response, pathname, services) {
  const safePath = createSafeAssetPath(pathname, services);

  // 调用文件状态读取，给浏览器明确 Content-Length 便于下载进度和连接复用
  const fileStatus = await stat(safePath);
  const headers = resolveStaticAssetHeaders(safePath, pathname, fileStatus.size);

  response.writeHead(200, headers);

  // 调用流式读取，避免大图一次性读进 Node 内存导致服务器卡顿
  createReadStream(safePath).on("error", () => response.destroy()).pipe(response);
}

// 生成安全的静态资源路径，避免目录穿越
function createSafeAssetPath(pathname, services) {
  const normalizedPath = normalize(pathname === "/" ? "/index.html" : pathname);

  if (normalizedPath.startsWith(APP_CONFIG.imageStorage.publicPrefix)) {
    return services.imageStorageService.resolvePublicPath(normalizedPath);
  }

  const relativePath = normalizedPath.replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]/, "");

  return join(PUBLIC_DIR, relativePath);
}

// 根据文件扩展名返回 MIME 类型
function resolveMimeType(filePath) {
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  };

  return types[extname(filePath)] ?? "application/octet-stream";
}

// 生成静态资源响应头，图片长缓存，页面壳短缓存
function resolveStaticAssetHeaders(filePath, pathname, contentLength) {
  return {
    "Content-Type": resolveMimeType(filePath),
    "Content-Length": contentLength,
    "Cache-Control": resolveStaticCacheControl(pathname)
  };
}

// 根据资源路径生成缓存策略，生成图片路径带任务 ID，可安全长缓存
function resolveStaticCacheControl(pathname) {
  if (normalize(pathname).startsWith(APP_CONFIG.imageStorage.publicPrefix)) {
    return "public, max-age=31536000, immutable";
  }

  if (pathname === "/" || pathname.endsWith(".html")) {
    return "no-cache";
  }

  return "public, max-age=300";
}

// 根据错误内容映射合适的 HTTP 状态码
function resolveErrorStatus(error) {
  const message = String(error.message ?? "");

  if (message.includes("登录已失效")) return 401;
  if (message.includes("用户名或密码")) return 401;
  if (message.includes("Duplicate")) return 409;
  if (message.includes("不存在")) return 404;
  if (message.includes("余额不足")) return 402;
  if (message.includes("请求体过大")) return 413;
  if (message.includes("不合法") || message.includes("至少") || message.includes("必须")) return 400;

  return 500;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
