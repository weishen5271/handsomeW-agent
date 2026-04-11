const SKILL_SHOP_ACCENT_CLASSES = [
  "bg-blue-50 text-blue-600 border-blue-200",
  "bg-emerald-50 text-emerald-600 border-emerald-200",
  "bg-violet-50 text-violet-600 border-violet-200",
  "bg-amber-50 text-amber-600 border-amber-200",
  "bg-cyan-50 text-cyan-600 border-cyan-200",
  "bg-rose-50 text-rose-600 border-rose-200",
];

export function nowTag() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}千`;
  return String(Math.floor(value));
}

export function skillAccentClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % SKILL_SHOP_ACCENT_CLASSES.length;
  }
  return SKILL_SHOP_ACCENT_CLASSES[Math.abs(hash) % SKILL_SHOP_ACCENT_CLASSES.length];
}

export function parseBlocks(chunk: string) {
  const blocks = chunk.split("\n\n").filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split("\n");
    let eventType = "message";
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("event:")) eventType = line.replace("event:", "").trim();
      if (line.startsWith("data:")) dataLines.push(line.replace("data:", "").trim());
    }

    let payload: Record<string, unknown> = {};
    const rawData = dataLines.join("\n");
    if (rawData) {
      try {
        payload = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        payload = { raw: rawData };
      }
    }

    return { eventType, payload };
  });
}

export function extractImageUrl(text: string): string | undefined {
  const markdownMatch = text.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1];

  const directMatch = text.match(/https?:\/\/\S+\.(?:png|jpg|jpeg|gif|webp)/i);
  if (directMatch?.[0]) return directMatch[0];

  return undefined;
}

export function cleanText(text: string, imageUrl?: string): string {
  if (!imageUrl) return text.trim();
  const escapedUrl = imageUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`!\\[[^\\]]*\\]\\(${escapedUrl}\\)`, "g"), "")
    .replace(imageUrl, "")
    .trim();
}

export function parseErrorDetail(detail: unknown): string {
  if (!detail) return "请求失败";
  if (typeof detail === "string") return translateErrorText(detail);
  if (Array.isArray(detail)) {
    const joined = detail.map((item) => parseErrorDetail(item)).filter(Boolean).join("；");
    return joined || "请求失败";
  }
  if (typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const msg = typeof record.msg === "string" ? translateErrorText(record.msg) : "";
    const loc = Array.isArray(record.loc) ? formatErrorLoc(record.loc) : "";
    if (msg && loc) return `${loc}: ${msg}`;
    if (msg) return msg;
    return translateErrorText(JSON.stringify(record));
  }
  return translateErrorText(String(detail));
}

function formatErrorLoc(loc: unknown[]): string {
  const raw = loc.join(".");
  const locMap: Record<string, string> = {
    "body.username": "用户名",
    "body.password": "密码",
    "body.role": "角色",
    "body.provider": "Provider",
    "body.model": "模型",
    "body.base_url": "Base URL",
    "body.api_key": "API Key",
    "query.input": "输入参数",
  };
  return locMap[raw] ?? raw;
}

function translateErrorText(text: string): string {
  const normalized = text.trim();
  if (!normalized) return "请求失败";

  const exactMap: Record<string, string> = {
    "Field required": "必填项缺失",
    "Input should be a valid string": "请输入有效的文本",
    "Input should be a valid integer": "请输入有效的整数",
    "Input should be a valid number": "请输入有效的数字",
    "String should have at least 3 characters": "长度至少为 3 个字符",
    "String should have at least 6 characters": "长度至少为 6 个字符",
    "String should have at most 32 characters": "长度不能超过 32 个字符",
    "String should have at most 128 characters": "长度不能超过 128 个字符",
    "Invalid username or password": "用户名或密码错误",
    "Username already exists": "用户名已存在",
    "Invalid or expired token": "登录状态无效或已过期",
    "Missing authorization header": "缺少认证请求头",
    "Invalid authorization format": "认证格式无效",
    "Missing bearer token": "缺少访问令牌",
    "Admin access required": "需要管理员权限",
    "User not found": "用户不存在",
  };

  if (exactMap[normalized]) return exactMap[normalized];
  if (normalized.includes("String should have at least")) {
    return normalized.replace("String should have at least", "长度至少为").replace("characters", "个字符");
  }
  if (normalized.includes("String should have at most")) {
    return normalized.replace("String should have at most", "长度不能超过").replace("characters", "个字符");
  }

  return normalized;
}
