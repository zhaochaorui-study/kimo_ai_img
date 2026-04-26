const ALLOWED_EMAIL_DOMAINS = new Set(["gmail.com", "qq.com", "163.com"]);
const UNSUPPORTED_EMAIL_DOMAIN_MESSAGE = "仅支持 Gmail、QQ 邮箱和 163 邮箱注册";

// 校验邮箱域名是否在注册白名单内
export function assertAllowedRegisterEmailDomain(email) {
  const domain = extractEmailDomain(email);

  if (!ALLOWED_EMAIL_DOMAINS.has(domain)) {
    throw new Error(UNSUPPORTED_EMAIL_DOMAIN_MESSAGE);
  }
}

// 提取邮箱域名，统一转成小写便于白名单匹配
function extractEmailDomain(email) {
  return String(email ?? "").trim().toLowerCase().split("@").pop() ?? "";
}
