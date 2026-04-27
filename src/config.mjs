import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { createImageStorageConfig } from "./services/imageStorageService.mjs";

const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const LOCAL_ENV_FILE_PATH = join(PROJECT_ROOT, ".env");
const DEFAULT_IMAGE_API_TIMEOUT_MS = 600000;
const DEFAULT_SERVER_IMAGE_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_SIGNUP_CREDIT_CENTS = 10;
const DEFAULT_MAX_CONCURRENT_GENERATIONS = 2;

// 创建应用配置，统一编排各模块配置来源
export function createAppConfig(runtimeEnv = createConfigEnvironment()) {
  return Object.freeze({
    port: readConfigNumber(runtimeEnv, "PORT", 4173),
    signupCreditCents: readConfigNumber(runtimeEnv, "SIGNUP_CREDIT_CENTS", DEFAULT_SIGNUP_CREDIT_CENTS),
    textToImageUnitCostCents: readConfigNumber(runtimeEnv, "TEXT_TO_IMAGE_UNIT_COST_CENTS", 10),
    imageEditUnitCostCents: readConfigNumber(runtimeEnv, "IMAGE_EDIT_UNIT_COST_CENTS", 10),
    maxConcurrentGenerations: readConfigNumber(runtimeEnv, "MAX_CONCURRENT_GENERATIONS", DEFAULT_MAX_CONCURRENT_GENERATIONS),
    rechargeContact: readConfigValue(runtimeEnv, "RECHARGE_CONTACT", "QQ1351491099"),
    sessionTtlSeconds: readConfigNumber(runtimeEnv, "SESSION_TTL_SECONDS", 7 * 24 * 60 * 60),
    database: createDatabaseConfig(runtimeEnv),
    redis: createRedisConfig(runtimeEnv),
    imageApi: createImageApiConfig(runtimeEnv),
    server: createServerConfig(runtimeEnv),
    imageStorage: createImageStorageConfig({
      platform: process.platform,
      projectRoot: join(PROJECT_ROOT)
    }),
    email: createEmailConfig(runtimeEnv)
  });
}

// 创建配置环境，本地 .env 作为兜底，运行时环境变量优先
export function createConfigEnvironment(options = Object.freeze({})) {
  const envFilePath = options.envFilePath ?? LOCAL_ENV_FILE_PATH;
  const runtimeEnv = options.runtimeEnv ?? process.env;
  const envFileVariables = readEnvFileVariables(envFilePath);
  return Object.freeze({ ...envFileVariables, ...runtimeEnv });
}

// 创建 Redis 配置对象，本地 Redis 作为默认会话存储
function createRedisConfig(runtimeEnv) {
  return Object.freeze({
    host: readConfigValue(runtimeEnv, "REDIS_HOST", "127.0.0.1"),
    port: readConfigNumber(runtimeEnv, "REDIS_PORT", 6379),
    password: readConfigValue(runtimeEnv, "REDIS_PASSWORD", ""),
    db: readConfigNumber(runtimeEnv, "REDIS_DB", 0)
  });
}

// 创建数据库配置对象，隔离数据库连接参数读取
function createDatabaseConfig(runtimeEnv) {
  return Object.freeze({
    host: readConfigValue(runtimeEnv, "DB_HOST", "127.0.0.1"),
    port: readConfigNumber(runtimeEnv, "DB_PORT", 3306),
    user: readConfigValue(runtimeEnv, "DB_USER", "root"),
    password: readConfigValue(runtimeEnv, "DB_PASSWORD", "rootadmin"),
    name: readConfigValue(runtimeEnv, "DB_NAME", "create_img_web")
  });
}

// 创建服务端运行限制配置，集中管理上传下载相关边界
function createServerConfig(runtimeEnv) {
  return Object.freeze({
    imageUploadMaxBytes: readConfigNumber(runtimeEnv, "SERVER_IMAGE_UPLOAD_MAX_BYTES", DEFAULT_SERVER_IMAGE_UPLOAD_MAX_BYTES)
  });
}

// 创建邮件服务配置，支持任意 SMTP 服务商
function createEmailConfig(runtimeEnv) {
  return Object.freeze({
    host: readConfigValue(runtimeEnv, "SMTP_HOST", ""),
    port: readConfigNumber(runtimeEnv, "SMTP_PORT", 587),
    secure: readConfigValue(runtimeEnv, "SMTP_SECURE", "false") === "true",
    user: readConfigValue(runtimeEnv, "SMTP_USER", ""),
    pass: readConfigValue(runtimeEnv, "SMTP_PASS", ""),
    from: readConfigValue(runtimeEnv, "SMTP_FROM", "")
  });
}

// 创建图片服务请求配置对象，避免密钥和请求地址硬编码在源码里
function createImageApiConfig(runtimeEnv) {
  const baseUrl = normalizeBaseUrl(readConfigValue(runtimeEnv, "KIMO_API_BASE_URL", ""));

  return Object.freeze({
    key: readConfigValue(runtimeEnv, "KIMO_API_KEY", ""),
    generationUrl: readConfigValue(runtimeEnv, "KIMO_GENERATION_URL", createImageApiUrl(baseUrl, "/v1/images/generations")),
    editUrl: readConfigValue(runtimeEnv, "KIMO_EDIT_URL", createImageApiUrl(baseUrl, "/v1/images/edits")),
    model: readConfigValue(runtimeEnv, "KIMO_IMAGE_MODEL", "gpt-image-1"),
    timeoutMs: readConfigNumber(runtimeEnv, "KIMO_API_TIMEOUT_MS", DEFAULT_IMAGE_API_TIMEOUT_MS),
    maxRetries: readConfigNumber(runtimeEnv, "KIMO_API_MAX_RETRIES", 1)
  });
}

// 拼接图片 API 完整地址，未配置 base URL 时保持为空
function createImageApiUrl(baseUrl, pathname) {
  if (!baseUrl) return "";
  return `${baseUrl}${pathname}`;
}

// 规范化 API base URL，避免尾部斜杠导致路径双斜杠
function normalizeBaseUrl(value) {
  return String(value ?? "").replace(/\/+$/, "");
}

// 读取数字配置，非法数字时回退到默认值
function readConfigNumber(runtimeEnv, key, fallback) {
  const value = Number(readConfigValue(runtimeEnv, key, fallback));
  return Number.isFinite(value) ? value : fallback;
}

// 读取字符串配置，空值统一回退到默认值
function readConfigValue(runtimeEnv, key, fallback) {
  const value = runtimeEnv[key];
  if (value === undefined || value === null || value === "") return fallback;
  return value;
}

// 读取本地 .env 文件变量，文件不存在时返回空配置
function readEnvFileVariables(envFilePath) {
  if (!existsSync(envFilePath)) return Object.freeze({});
  return parseEnvFileContent(readFileSync(envFilePath, "utf8"));
}

// 解析 .env 文本内容，支持空行、注释和带引号的值
function parseEnvFileContent(content) {
  const entries = content.split(/\r?\n/)
    .map((line) => parseEnvLine(line))
    .filter((entry) => entry !== null);
  return Object.freeze(Object.fromEntries(entries));
}

// 解析单行 .env 配置，非配置行返回空值
function parseEnvLine(line) {
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith("#")) return null;
  const separatorIndex = trimmedLine.indexOf("=");
  if (separatorIndex <= 0) return null;
  return [
    trimmedLine.slice(0, separatorIndex).trim(),
    normalizeEnvValue(trimmedLine.slice(separatorIndex + 1).trim())
  ];
}

// 规范化 .env 配置值，去掉成对引号
function normalizeEnvValue(value) {
  if (value.length < 2) return value;
  if (value.startsWith("\"") && value.endsWith("\"")) return value.slice(1, -1);
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

// 加载运行时环境并生成应用配置
export const APP_CONFIG = createAppConfig();
