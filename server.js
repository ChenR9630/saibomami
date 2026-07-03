const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { URL } = require("node:url");

const ROOT = __dirname;

function loadLocalEnvironment() {
  const environmentPath = path.join(ROOT, ".env.local");
  if (!fs.existsSync(environmentPath)) {
    return;
  }
  fs.readFileSync(environmentPath, "utf8").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  });
}

loadLocalEnvironment();

const IS_PRODUCTION = process.env.PRODUCTION === "true";
const logger = require("./lib/logger");
const PORT = Number(process.env.PORT || 8443);
const CERT_PORT = Number(process.env.CERT_PORT || 8080);
const LOCAL_PORT = Number(process.env.LOCAL_PORT || 8000);
const HOST = "0.0.0.0";
const CERT_DIR = path.join(ROOT, ".cert");
const SCANS_DIR = path.join(ROOT, "scans");
const KEY_PATH = path.join(CERT_DIR, "localhost-key.pem");
const CERT_PATH = path.join(CERT_DIR, "localhost-cert.pem");
const CA_KEY_PATH = path.join(CERT_DIR, "neko-local-ca-key.pem");
const CA_CERT_PATH = path.join(CERT_DIR, "neko-local-ca-cert.pem");
const APPEARANCE_PATH = path.join(ROOT, ".pet-appearance.json");
const GENERATED_DIR = path.join(ROOT, ".generated");
const AUTH_DIR = path.join(GENERATED_DIR, "auth");
const USERS_PATH = path.join(AUTH_DIR, "users.json");
const DESKTOP_TOKENS_PATH = path.join(AUTH_DIR, "desktop-tokens.json");
const DESKTOP_APP_PATH = path.join(ROOT, "dist", "NEKO.SYNC Desktop Pet.app");
const WINDOWS_DESKTOP_SCRIPT_PATH = path.join(ROOT, "scripts", "start-desktop-windows.ps1");

function isMacDesktopPetRunning() {
  if (process.platform !== "darwin") {
    return false;
  }
  const result = spawnSync("pgrep", ["-f", "NEKO.SYNC Desktop Pet"], {
    encoding: "utf8",
  });
  return result.status === 0 && Boolean(String(result.stdout || "").trim());
}
const ORDERS_PATH = path.join(AUTH_DIR, "orders.json");
const COMMUNITY_PATH = path.join(GENERATED_DIR, "community-posts.json");
const COMMUNITY_IMAGES_DIR = path.join(GENERATED_DIR, "community-images");
const MASTER_CAT_DIR = path.join(ROOT, "assets", "master-cat");
const MASTER_CAT_BLEND_PATH = path.join(MASTER_CAT_DIR, "cat.blend");
const MASTER_CAT_GLB_PATH = path.join(MASTER_CAT_DIR, "master-cat.glb");
const MASTER_CAT_REPORT_PATH = path.join(MASTER_CAT_DIR, "master-cat.report.json");
const FUSION_IMAGE_PATH = path.join(GENERATED_DIR, "ai-fusion.jpg");
const FUSION_MIME_PATH = path.join(GENERATED_DIR, "ai-fusion.mime");
const TOPOLOGY_TEST_DIR = path.join(GENERATED_DIR, "topology-tests");
const AVATAR_RESERVATION_DIR = path.join(GENERATED_DIR, "avatar-reservations");
const TWIN_3D_PATH = path.join(GENERATED_DIR, "identity-twin.glb");
const TWIN_3D_JOB_PATH = path.join(GENERATED_DIR, "identity-twin-job.json");
const TWIN_3D_MASTER_REBIND_PATH = path.join(GENERATED_DIR, "identity-twin-master-rebind.glb");
const TWIN_3D_MASTER_REBIND_REPORT_PATH = path.join(
  GENERATED_DIR,
  "identity-twin-master-rebind.report.json",
);
const TWIN_3D_ANIMATION_PATHS = {
  idle: path.join(GENERATED_DIR, "identity-twin-idle.glb"),
  walking: path.join(GENERATED_DIR, "identity-twin-walk.glb"),
  running: path.join(GENERATED_DIR, "identity-twin-run.glb"),
  jumpStart: path.join(GENERATED_DIR, "identity-twin-jump-start.glb"),
  jumping: path.join(GENERATED_DIR, "identity-twin-jump.glb"),
  jumpFall: path.join(GENERATED_DIR, "identity-twin-jump-fall.glb"),
  jumpEnd: path.join(GENERATED_DIR, "identity-twin-jump-end.glb"),
};
const STANDARD_VIEW_PATHS = {
  front: path.join(GENERATED_DIR, "standard-cat-front.jpg"),
  side: path.join(GENERATED_DIR, "standard-cat-side.jpg"),
  back: path.join(GENERATED_DIR, "standard-cat-back.jpg"),
};
const STANDARD_VIEW_MIME_PATHS = {
  front: path.join(GENERATED_DIR, "standard-cat-front.mime"),
  side: path.join(GENERATED_DIR, "standard-cat-side.mime"),
  back: path.join(GENERATED_DIR, "standard-cat-back.mime"),
};
const TRIPO_QUADRUPED_ANIMATIONS = [
  ["walking", "preset:quadruped:walk"],
];
const TRIPO_SMART_QUAD_TOPOLOGY = {
  model: "v2.0",
  face_limit: Math.max(500, Math.min(10000, Number(process.env.TRIPO_QUAD_FACE_LIMIT || 8000))),
  quad: true,
  bake: true,
};
const MAX_BODY_SIZE = 12 * 1024 * 1024;
const MAX_SCAN_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_MODEL_SIZE = 150 * 1024 * 1024;
const DAILY_AVATAR_RESERVATION_LIMIT = 20;
const MESSAGE_TTL = 5 * 60 * 1000;
const rooms = new Map();
const reconstructionJobs = new Map();
const twinClients = new Set();
const sessions = new Map();
const oauthStates = new Map(); // WeChat OAuth state tokens → { createdAt }
const userTwinStates = new Map();

// --- Rate Limiting ---
const RATE_LIMIT_RPM = Number(process.env.RATE_LIMIT_RPM || 60);
const AUTH_RATE_LIMIT_RPM = Number(process.env.AUTH_RATE_LIMIT_RPM || 10);
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const rateLimitStore = new Map(); // ip:endpoint → { count, windowStart }

function getClientIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers["x-real-ip"];
  if (realIp) return realIp.trim();
  return request.socket?.remoteAddress || "127.0.0.1";
}

function rateLimit(ip, endpoint, maxRequests) {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  entry.count++;
  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: maxRequests - entry.count };
}

// Clean up rate limit store periodically
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW * 2;
  rateLimitStore.forEach((entry, key) => {
    if (entry.windowStart < cutoff) rateLimitStore.delete(key);
  });
}, 300_000).unref();

// --- Security Headers ---
function applySecurityHeaders(response) {
  if (!IS_PRODUCTION) return;
  response.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(self), microphone=()");
}

// --- SSE Client Limit ---
const MAX_SSE_CLIENTS = Number(process.env.MAX_SSE_CLIENTS || 100);

// --- Fetch with Timeout ---
function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

let twinState = {
  visible: true,
  displayMode: "live",
  action: "idle",
  confidence: 0,
  direction: 0,
  intensity: 0,
  speed: 0,
  snack: 0,
  appearance: {
    style: "original",
    texture: "",
    primary: "#d6d7cd",
    secondary: "#777c73",
  },
  updatedAt: 0,
};
const PUBLIC_FILES = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "camera-protocol.js",
  "remote-camera.js",
  "motion-twin.js",
  "twin-3d.js",
  "twin-3d.bundle.js",
  "desktop-pet.html",
  "desktop-pet.css",
  "desktop-pet.js",
  "sender.html",
  "sender.css",
  "sender.js",
  "scan.html",
  "scan.css",
  "scan.js",
  "master-cat-test.html",
  "master-cat-test.js",
  "master-rebind-test.html",
  "topology-compare.html",
  "topology-compare.bundle.js",
  "assets/payment/weixin.jpeg",
  "assets/payment/zhifubao.jpeg",
  "dist/neko-sync-desktop-mac.zip",
  "dist/neko-sync-desktop-windows.zip",
]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
};

const VENDOR_FILES = new Map([
  ["/vendor/three.module.js", path.join(ROOT, "node_modules/three/build/three.module.js")],
  [
    "/vendor/addons/loaders/GLTFLoader.js",
    path.join(ROOT, "node_modules/three/examples/jsm/loaders/GLTFLoader.js"),
  ],
  [
    "/vendor/addons/utils/BufferGeometryUtils.js",
    path.join(ROOT, "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js"),
  ],
  [
    "/vendor/addons/utils/SkeletonUtils.js",
    path.join(ROOT, "node_modules/three/examples/jsm/utils/SkeletonUtils.js"),
  ],
]);

function ensureCertificate() {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  if (
    fs.existsSync(KEY_PATH)
    && fs.existsSync(CERT_PATH)
    && fs.existsSync(CA_CERT_PATH)
  ) {
    return;
  }

  const caResult = spawnSync("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-sha256",
    "-nodes",
    "-keyout",
    CA_KEY_PATH,
    "-out",
    CA_CERT_PATH,
    "-days",
    "1825",
    "-subj",
    "/CN=NEKO.SYNC Local CA",
    "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign",
  ], { stdio: "inherit" });

  if (caResult.status !== 0) {
    throw new Error("无法生成本地 CA，请确认系统已安装 openssl");
  }

  const csrPath = path.join(CERT_DIR, "localhost.csr");
  const extensionPath = path.join(CERT_DIR, "localhost.ext");
  const sanEntries = [
    "DNS.1 = localhost",
    "IP.1 = 127.0.0.1",
    ...getLanAddresses().map((address, index) => `IP.${index + 2} = ${address}`),
  ];
  fs.writeFileSync(extensionPath, [
    "basicConstraints = CA:FALSE",
    "keyUsage = digitalSignature, keyEncipherment",
    "extendedKeyUsage = serverAuth",
    "subjectAltName = @alt_names",
    "[alt_names]",
    ...sanEntries,
  ].join("\n"));

  const csrResult = spawnSync("openssl", [
    "req",
    "-new",
    "-newkey", "rsa:2048",
    "-nodes",
    "-keyout", KEY_PATH,
    "-out", csrPath,
    "-subj", "/CN=NEKO.SYNC Local Server",
  ], { stdio: "inherit" });
  const signResult = spawnSync("openssl", [
    "x509",
    "-req",
    "-in", csrPath,
    "-CA", CA_CERT_PATH,
    "-CAkey", CA_KEY_PATH,
    "-CAcreateserial",
    "-CAserial", path.join(CERT_DIR, "neko-local-ca-cert.srl"),
    "-out", CERT_PATH,
    "-days", "825",
    "-sha256",
    "-extfile", extensionPath,
  ], { stdio: "inherit" });

  if (csrResult.status !== 0 || signResult.status !== 0) {
    throw new Error("无法生成 HTTPS 服务证书");
  }

  fs.rmSync(csrPath, { force: true });
  fs.rmSync(extensionPath, { force: true });
}

function loadMasterCatReport() {
  if (!fs.existsSync(MASTER_CAT_REPORT_PATH)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(MASTER_CAT_REPORT_PATH, "utf8"));
  } catch {
    return null;
  }
}

function getMasterCatSkeleton() {
  const report = loadMasterCatReport();
  return {
    id: "master-cat-v1",
    role: "canonical-quadruped-cat-rig",
    available: fs.existsSync(MASTER_CAT_BLEND_PATH) && fs.existsSync(MASTER_CAT_GLB_PATH),
    sourceBlend: fs.existsSync(MASTER_CAT_BLEND_PATH)
      ? "assets/master-cat/cat.blend"
      : "",
    modelUrl: fs.existsSync(MASTER_CAT_GLB_PATH)
      ? `/api/twin/3d/master/model?v=${fs.statSync(MASTER_CAT_GLB_PATH).mtimeMs}`
      : "",
    reportUrl: fs.existsSync(MASTER_CAT_REPORT_PATH)
      ? `/api/twin/3d/master/report?v=${fs.statSync(MASTER_CAT_REPORT_PATH).mtimeMs}`
      : "",
    runtimeExport: report?.runtimeExport || null,
    armatures: (report?.armatures || []).map((armature) => ({
      name: armature.name,
      boneCount: armature.boneCount,
    })),
    actions: report?.actions || [],
    bounds: report?.bounds || null,
  };
}

function getLanAddresses() {
  const addresses = [];
  Object.values(os.networkInterfaces()).flat().forEach((address) => {
    if (
      address
      && address.family === "IPv4"
      && !address.internal
      && !address.address.startsWith("169.254.")
    ) {
      addresses.push(address.address);
    }
  });
  return [...new Set(addresses)];
}

function sendJson(response, statusCode, payload) {
  applySecurityHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("INVALID_JSON"));
      }
    });
    request.on("error", reject);
  });
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

const DAILY_CHAT_LIMIT_FREE = 5;

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

function checkChatQuota(user) {
  const plan = user.plan || "none";
  if (plan === "custom_paid") {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }
  const today = getTodayKey();
  const quota = user.chatQuota || { date: today, count: 0 };
  if (quota.date !== today) {
    return { allowed: true, remaining: DAILY_CHAT_LIMIT_FREE, limit: DAILY_CHAT_LIMIT_FREE };
  }
  const remaining = Math.max(0, DAILY_CHAT_LIMIT_FREE - quota.count);
  return { allowed: remaining > 0, remaining, limit: DAILY_CHAT_LIMIT_FREE };
}

function recordChatUsage(user) {
  const plan = user.plan || "none";
  if (plan === "custom_paid") return user;
  const today = getTodayKey();
  const quota = user.chatQuota || { date: today, count: 0 };
  if (quota.date !== today) {
    return updateUser(user.id, (draft) => ({ ...draft, chatQuota: { date: today, count: 1 } }));
  }
  return updateUser(user.id, (draft) => ({
    ...draft,
    chatQuota: { date: today, count: quota.count + 1 },
  }));
}

// --- SMS verification code store ---
const smsCodes = new Map(); // phone -> { code, expiresAt }
const SMS_CODE_TTL = 5 * 60 * 1000; // 5 minutes
const SMS_COOLDOWN = 60 * 1000; // 1 minute between sends

function generateSmsCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sendSmsCode(phone) {
  const existing = smsCodes.get(phone);
  if (existing && Date.now() - (existing.sentAt || 0) < SMS_COOLDOWN) {
    throw new Error("SMS_TOO_FREQUENT");
  }
  const code = generateSmsCode();
  smsCodes.set(phone, { code, expiresAt: Date.now() + SMS_CODE_TTL, sentAt: Date.now() });
  // In production, integrate with an SMS provider (e.g., Aliyun SMS, Tencent Cloud SMS).
  if (!IS_PRODUCTION) {
    logger.debug(`[SMS] Verification code for ${phone}: ${code}`);
  } else {
    logger.info(`[SMS] Code sent to ${phone.slice(0, 3)}****${phone.slice(-4)}`);
  }
  return { masked: phone.slice(0, 3) + "****" + phone.slice(-4) };
}

function verifySmsCode(phone, code) {
  const entry = smsCodes.get(phone);
  if (!entry) return false;
  if (Date.now() > entry.expiresAt) {
    smsCodes.delete(phone);
    return false;
  }
  if (entry.code !== String(code)) return false;
  smsCodes.delete(phone); // one-time use
  return true;
}

// --- Phone number normalization ---
function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^1[3-9]\d{9}$/.test(digits)) return digits;
  if (/^86\d{11}$/.test(digits)) return digits.slice(2);
  return digits.length === 11 ? digits : "";
}

function normalizeNickname(nickname) {
  return String(nickname || "").trim().replace(/\s+/g, " ");
}

function getUserDisplayName(user) {
  return user?.nickname || user?.wechatNickname || user?.phone || user?.email || "";
}

function normalizeComparableName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function publicUser(user) {
  if (!user) {
    return null;
  }
  const quota = checkChatQuota(user);
  return {
    id: user.id,
    nickname: user.nickname || "",
    email: user.email || "",
    phone: user.phone || "",
    wechatNickname: user.wechatNickname || "",
    plan: user.plan || "none",
    adoptedAt: user.adoptedAt || "",
    createdAt: user.createdAt,
    chatQuota: { remaining: quota.remaining, limit: quota.limit },
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

function verifyPassword(user, password) {
  if (!user?.salt || !user?.passwordHash) {
    return false;
  }
  return hashPassword(password, user.salt).hash === user.passwordHash;
}

function validateRegistrationPassword(password, identity = "") {
  const value = String(password || "");
  if (value.length < 8) {
    throw new Error("PASSWORD_TOO_SHORT");
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    throw new Error("PASSWORD_WEAK");
  }
  if (identity && normalizeComparableName(value) === normalizeComparableName(identity)) {
    throw new Error("PASSWORD_MATCHES_ACCOUNT");
  }
}

function readUsers() {
  return readJsonFile(USERS_PATH, { users: [] });
}

function writeUsers(users) {
  writeJsonFile(USERS_PATH, users);
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function createSession(response, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId,
    createdAt: Date.now(),
  });
  response.setHeader("Set-Cookie", [
    `neko_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${IS_PRODUCTION ? "; Secure" : ""}`,
  ]);
}

function clearSession(request, response) {
  const token = parseCookies(request).neko_session;
  if (token) {
    sessions.delete(token);
  }
  response.setHeader("Set-Cookie", [
    `neko_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${IS_PRODUCTION ? "; Secure" : ""}`,
  ]);
}

function getCurrentUser(request) {
  const token = parseCookies(request).neko_session;
  const session = token ? sessions.get(token) : null;
  if (!session) {
    return null;
  }
  const users = readUsers();
  return users.users.find((user) => user.id === session.userId) || null;
}

function readDesktopTokens() {
  const data = readJsonFile(DESKTOP_TOKENS_PATH, { tokens: [] });
  const cutoff = Date.now() - 1000 * 60 * 60 * 24 * 180;
  const tokens = (data.tokens || []).filter((entry) => Number(entry.createdAt || 0) > cutoff);
  if (tokens.length !== (data.tokens || []).length) {
    writeJsonFile(DESKTOP_TOKENS_PATH, { tokens });
  }
  return { tokens };
}

function writeDesktopTokens(data) {
  writeJsonFile(DESKTOP_TOKENS_PATH, { tokens: data.tokens || [] });
}

function createDesktopToken(userId) {
  const data = readDesktopTokens();
  const token = crypto.randomBytes(32).toString("hex");
  data.tokens.push({
    token,
    userId,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  });
  writeDesktopTokens(data);
  return token;
}

function getDesktopUser(requestUrl) {
  const authHeader = requestUrl.searchParams.get("desktopToken") || "";
  const token = authHeader || "";
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return null;
  }
  const data = readDesktopTokens();
  const entry = data.tokens.find((item) => item.token === token);
  if (!entry) {
    return null;
  }
  entry.lastUsedAt = Date.now();
  writeDesktopTokens(data);
  const users = readUsers();
  return users.users.find((user) => user.id === entry.userId) || null;
}

function getRequestUser(request, requestUrl) {
  return getCurrentUser(request) || getDesktopUser(requestUrl);
}

function cloneTwinState(state) {
  return JSON.parse(JSON.stringify(state));
}

function getTwinStateForUser(userId) {
  if (!userId) {
    return twinState;
  }
  if (!userTwinStates.has(userId)) {
    userTwinStates.set(userId, cloneTwinState(twinState));
  }
  return userTwinStates.get(userId);
}

function setTwinStateForUser(userId, nextState) {
  if (!userId) {
    twinState = nextState;
    return twinState;
  }
  userTwinStates.set(userId, nextState);
  return nextState;
}

function registerUser(email, password, phone) {
  const normalizedEmail = email ? normalizeEmail(email) : "";
  const normalizedPhone = phone ? normalizePhone(phone) : "";
  if (!normalizedEmail && !normalizedPhone) {
    throw new Error("INVALID_INPUT");
  }
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("INVALID_EMAIL");
  }
  if (normalizedPhone && !/^1[3-9]\d{9}$/.test(normalizedPhone)) {
    throw new Error("INVALID_PHONE");
  }
  const shouldStorePassword = Boolean(normalizedEmail || String(password || ""));
  if (shouldStorePassword) {
    validateRegistrationPassword(password, normalizedEmail || normalizedPhone);
  }
  const users = readUsers();
  if (normalizedEmail && users.users.some((user) => user.email === normalizedEmail)) {
    throw new Error("EMAIL_ALREADY_REGISTERED");
  }
  if (normalizedPhone && users.users.some((user) => user.phone === normalizedPhone)) {
    throw new Error("PHONE_ALREADY_REGISTERED");
  }
  const credentials = shouldStorePassword
    ? hashPassword(password)
    : { salt: "", hash: "" };
  const user = {
    id: `USR-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    email: normalizedEmail,
    phone: normalizedPhone,
    salt: credentials.salt,
    passwordHash: credentials.hash,
    plan: "none",
    createdAt: new Date().toISOString(),
  };
  users.users.push(user);
  writeUsers(users);
  return user;
}

function registerNicknameUser(nickname, password) {
  const normalizedNickname = normalizeNickname(nickname);
  if (normalizedNickname.length < 2 || normalizedNickname.length > 18) {
    throw new Error("INVALID_NICKNAME");
  }
  validateRegistrationPassword(password, normalizedNickname);
  const users = readUsers();
  if (users.users.some((user) => normalizeNickname(user.nickname).toLowerCase() === normalizedNickname.toLowerCase())) {
    throw new Error("NICKNAME_ALREADY_REGISTERED");
  }
  const { salt, hash } = hashPassword(password);
  const user = {
    id: `USR-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    nickname: normalizedNickname,
    email: "",
    phone: "",
    salt,
    passwordHash: hash,
    plan: "none",
    createdAt: new Date().toISOString(),
  };
  users.users.push(user);
  writeUsers(users);
  return user;
}

function loginUser(email, password, phone) {
  const users = readUsers();
  const normalizedEmail = email ? normalizeEmail(email) : "";
  const normalizedPhone = phone ? normalizePhone(phone) : "";
  let user = null;
  if (normalizedEmail) {
    user = users.users.find((item) => item.email === normalizedEmail);
  } else if (normalizedPhone) {
    user = users.users.find((item) => item.phone === normalizedPhone);
  }
  if (!user || !verifyPassword(user, password)) {
    throw new Error("INVALID_LOGIN");
  }
  return user;
}

function loginNicknameUser(nickname, password) {
  const normalizedNickname = normalizeNickname(nickname);
  const users = readUsers();
  const user = users.users.find((item) => (
    normalizeNickname(item.nickname).toLowerCase() === normalizedNickname.toLowerCase()
  ));
  if (!user || !verifyPassword(user, password)) {
    throw new Error("INVALID_LOGIN");
  }
  return user;
}

function updateUser(userId, updater) {
  const users = readUsers();
  const index = users.users.findIndex((user) => user.id === userId);
  if (index === -1) {
    throw new Error("AUTH_REQUIRED");
  }
  users.users[index] = updater({ ...users.users[index] });
  writeUsers(users);
  return users.users[index];
}

function createCustomOrder(user) {
  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }
  const orders = readJsonFile(ORDERS_PATH, { orders: [] });
  const order = {
    id: `ORD-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    userId: user.id,
    product: "custom-digital-twin",
    amount: Number(process.env.CUSTOM_TWIN_PRICE_CNY || 18.8),
    currency: "CNY",
    status: "payment_pending",
    paymentMethod: "wechat_or_alipay_qr",
    paymentNote: "个人微信/支付宝收款码付款；等待后台确认到账金额。",
    createdAt: new Date().toISOString(),
  };
  orders.orders.push(order);
  writeJsonFile(ORDERS_PATH, orders);
  return order;
}

function getCustomOrderForUser(orderId, userId) {
  const orders = readJsonFile(ORDERS_PATH, { orders: [] });
  return orders.orders.find((order) => order.id === orderId && order.userId === userId) || null;
}

function confirmCustomOrderPayment(orderId, amount, provider = "manual") {
  const expectedAmount = Number(process.env.CUSTOM_TWIN_PRICE_CNY || 18.8);
  const paidAmount = Number(amount);
  if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.001) {
    throw new Error("PAYMENT_AMOUNT_MISMATCH");
  }
  const orders = readJsonFile(ORDERS_PATH, { orders: [] });
  const index = orders.orders.findIndex((order) => order.id === orderId);
  if (index === -1) {
    throw new Error("ORDER_NOT_FOUND");
  }
  const order = orders.orders[index];
  if (Number(order.amount) !== expectedAmount) {
    throw new Error("ORDER_AMOUNT_MISMATCH");
  }
  orders.orders[index] = {
    ...order,
    status: "paid",
    paidAmount,
    paidProvider: provider,
    paidAt: new Date().toISOString(),
  };
  writeJsonFile(ORDERS_PATH, orders);
  const updated = updateUser(order.userId, (draft) => ({
    ...draft,
    plan: draft.plan === "custom_paid" ? "custom_paid" : "custom_pending",
    customOrderId: order.id,
    customPaidAt: orders.orders[index].paidAt,
  }));
  return { order: orders.orders[index], user: updated };
}

function readCommunityPosts() {
  return readJsonFile(COMMUNITY_PATH, { posts: [] });
}

function writeCommunityPosts(data) {
  writeJsonFile(COMMUNITY_PATH, data);
}

function saveCommunityImage(base64Data) {
  const match = String(base64Data).match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) throw new Error("INVALID_IMAGE");
  const mime = match[1];
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  fs.mkdirSync(COMMUNITY_IMAGES_DIR, { recursive: true });
  fs.writeFileSync(path.join(COMMUNITY_IMAGES_DIR, name), Buffer.from(match[2], "base64"));
  return `/api/community/images/${name}`;
}

function createCommunityPost(user, data) {
  const posts = readCommunityPosts();
  const post = {
    id: `POST-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
    userId: user.id,
    userEmail: user.email.replace(/(.{2}).*(@.*)/, "$1***$2"),
    petName: String(data.petName || "Neko").slice(0, 12),
    type: data.image ? "mixed" : "text",
    content: String(data.content || "").slice(0, 500),
    imageUrl: data.image ? saveCommunityImage(data.image) : null,
    topic: String(data.topic || "").slice(0, 20),
    likes: 0,
    likedBy: [],
    createdAt: new Date().toISOString(),
  };
  posts.posts.unshift(post);
  if (posts.posts.length > 200) posts.posts = posts.posts.slice(0, 200);
  writeCommunityPosts(posts);
  return post;
}

function getReservationDateKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function getReservationDayDir(dateKey = getReservationDateKey()) {
  return path.join(AVATAR_RESERVATION_DIR, dateKey);
}

function getReservationIndexPath(dateKey = getReservationDateKey()) {
  return path.join(getReservationDayDir(dateKey), "index.json");
}

function readReservationIndex(dateKey = getReservationDateKey()) {
  const indexPath = getReservationIndexPath(dateKey);
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch {
    return {
      date: dateKey,
      limit: DAILY_AVATAR_RESERVATION_LIMIT,
      reservations: [],
    };
  }
}

function writeReservationIndex(index) {
  const dayDir = getReservationDayDir(index.date);
  fs.mkdirSync(dayDir, { recursive: true });
  fs.writeFileSync(getReservationIndexPath(index.date), JSON.stringify(index, null, 2));
}

function getReservationAvailability(dateKey = getReservationDateKey()) {
  const index = readReservationIndex(dateKey);
  const used = index.reservations.filter((reservation) => reservation.status !== "cancelled").length;
  return {
    date: dateKey,
    limit: DAILY_AVATAR_RESERVATION_LIMIT,
    used,
    remaining: Math.max(0, DAILY_AVATAR_RESERVATION_LIMIT - used),
    available: used < DAILY_AVATAR_RESERVATION_LIMIT,
  };
}

function decodeReservationImage(imageDataUrl) {
  const match = String(imageDataUrl || "").match(
    /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=]+)$/i,
  );
  if (!match) {
    throw new Error("INVALID_RESERVATION_IMAGE");
  }
  const extension = match[1].toLowerCase() === "jpg" ? "jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_SCAN_IMAGE_SIZE) {
    throw new Error("INVALID_RESERVATION_IMAGE_SIZE");
  }
  return {
    buffer,
    extension: extension === "jpeg" ? "jpg" : extension,
    mime: `image/${extension}`,
  };
}

function createAvatarReservation(payload, user) {
  if (!user) {
    throw new Error("AUTH_REQUIRED");
  }
  const customerName = normalizeNickname(payload?.customerName);
  const registeredName = getUserDisplayName(user);
  if (
    !customerName
    || normalizeComparableName(customerName) !== normalizeComparableName(registeredName)
  ) {
    throw new Error("USER_NAME_MISMATCH");
  }
  const orderId = String(payload?.orderId || "").trim();
  if (!orderId) {
    throw new Error("PAYMENT_ORDER_REQUIRED");
  }
  const order = getCustomOrderForUser(orderId, user.id);
  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }
  const images = payload?.images || {};
  const imageEntries = Object.entries({
    front: images.front,
    side: images.side,
    back: images.back,
  }).filter(([, image]) => typeof image === "string" && image.length > 0);
  if (!imageEntries.length) {
    throw new Error("RESERVATION_IMAGE_REQUIRED");
  }

  const dateKey = getReservationDateKey();
  const index = readReservationIndex(dateKey);
  const availability = getReservationAvailability(dateKey);
  if (!availability.available) {
    throw new Error("DAILY_RESERVATION_LIMIT_REACHED");
  }

  const sequence = index.reservations.length + 1;
  const id = `RSV-${dateKey.replace(/-/g, "")}-${String(sequence).padStart(3, "0")}`;
  const reservationDir = path.join(getReservationDayDir(dateKey), id);
  fs.mkdirSync(reservationDir, { recursive: true });

  const savedImages = imageEntries.map(([view, image]) => {
    const decoded = decodeReservationImage(image);
    const filename = `${view}.${decoded.extension}`;
    fs.writeFileSync(path.join(reservationDir, filename), decoded.buffer);
    return {
      view,
      filename,
      mime: decoded.mime,
      bytes: decoded.buffer.length,
    };
  });

  const manifest = {
    id,
    date: dateKey,
    status: order.status === "paid" ? "reserved" : "payment_review",
    source: "web",
    userId: user.id,
    customerName,
    registeredName,
    orderId: order.id,
    payment: {
      orderStatus: order.status,
      expectedAmount: order.amount,
      currency: order.currency || "CNY",
      reviewStatus: order.status === "paid" ? "approved" : "pending",
      reviewNote: order.status === "paid"
        ? "Payment already confirmed before reservation."
        : "Waiting for manual payment amount review.",
      reviewedAt: "",
    },
    createdAt: new Date().toISOString(),
    notes: order.status === "paid"
      ? "Manual digital twin modeling and rigging required."
      : "Payment review required before manual modeling and rigging.",
    images: savedImages,
    handoff: {
      model: "",
      riggedModel: "",
      animations: {},
      updatedAt: "",
    },
  };
  fs.writeFileSync(path.join(reservationDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  index.limit = DAILY_AVATAR_RESERVATION_LIMIT;
  index.reservations.push({
    id,
    status: manifest.status,
    createdAt: manifest.createdAt,
    userId: user.id,
    customerName,
    orderId: order.id,
    paymentReviewStatus: manifest.payment.reviewStatus,
    imageCount: savedImages.length,
    directory: path.relative(AVATAR_RESERVATION_DIR, reservationDir),
  });
  writeReservationIndex(index);

  return {
    reservation: manifest,
    availability: getReservationAvailability(dateKey),
    storage: {
      directory: reservationDir,
      manifest: path.join(reservationDir, "manifest.json"),
    },
  };
}

function getDateKeyFromReservationId(reservationId) {
  const match = String(reservationId || "").match(/^RSV-(\d{4})(\d{2})(\d{2})-\d{3}$/);
  if (!match) {
    throw new Error("RESERVATION_NOT_FOUND");
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function reviewAvatarReservationPayment(reservationId, status, note = "") {
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("INVALID_REVIEW_STATUS");
  }
  const dateKey = getDateKeyFromReservationId(reservationId);
  const index = readReservationIndex(dateKey);
  const entryIndex = index.reservations.findIndex((reservation) => reservation.id === reservationId);
  if (entryIndex === -1) {
    throw new Error("RESERVATION_NOT_FOUND");
  }
  const entry = index.reservations[entryIndex];
  const manifestPath = path.join(AVATAR_RESERVATION_DIR, entry.directory, "manifest.json");
  const manifest = readJsonFile(manifestPath, null);
  if (!manifest) {
    throw new Error("RESERVATION_NOT_FOUND");
  }
  const reviewStatus = status;
  const reservationStatus = reviewStatus === "approved" ? "reserved" : "payment_rejected";
  const updatedManifest = {
    ...manifest,
    status: reservationStatus,
    payment: {
      ...(manifest.payment || {}),
      reviewStatus,
      reviewNote: String(note || "").trim(),
      reviewedAt: new Date().toISOString(),
    },
  };
  fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
  index.reservations[entryIndex] = {
    ...entry,
    status: reservationStatus,
    paymentReviewStatus: reviewStatus,
    paymentReviewNote: updatedManifest.payment.reviewNote,
    paymentReviewedAt: updatedManifest.payment.reviewedAt,
  };
  writeReservationIndex(index);
  return updatedManifest;
}

function getLatestAvatarReservationForUser(user) {
  if (!user || !fs.existsSync(AVATAR_RESERVATION_DIR)) {
    return null;
  }
  const manifests = [];
  for (const dayEntry of fs.readdirSync(AVATAR_RESERVATION_DIR, { withFileTypes: true })) {
    if (!dayEntry.isDirectory()) continue;
    const index = readReservationIndex(dayEntry.name);
    for (const reservation of index.reservations || []) {
      if (reservation.userId !== user.id) continue;
      const manifestPath = path.join(AVATAR_RESERVATION_DIR, reservation.directory, "manifest.json");
      const manifest = readJsonFile(manifestPath, null);
      if (manifest) {
        manifests.push(manifest);
      }
    }
  }
  manifests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const latest = manifests[0];
  if (!latest) {
    return null;
  }
  return {
    id: latest.id,
    date: latest.date,
    status: latest.status,
    customerName: latest.customerName || "",
    orderId: latest.orderId || "",
    payment: latest.payment || null,
    createdAt: latest.createdAt,
  };
}

function readBinary(request, limit = MAX_SCAN_IMAGE_SIZE) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function normalizeAppearance(payload) {
  const styles = new Set(["original", "soft", "pixel", "neon", "mono"]);
  const colorPattern = /^#[0-9a-f]{6}$/i;
  const style = styles.has(payload?.style) ? payload.style : "original";
  const texture = typeof payload?.texture === "string"
    && (
      (
        payload.texture.length < 220000
        && /^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(payload.texture)
      )
      || /^\/api\/twin\/fusion\/image\?v=\d+$/.test(payload.texture)
    )
      ? payload.texture
      : "";
  const layout = texture && payload?.layout === "identity-atlas-v1"
    ? "identity-atlas-v1"
    : "";
  return {
    style: style === "original" || texture ? style : "original",
    texture,
    layout,
    primary: colorPattern.test(payload?.primary) ? payload.primary : "#d6d7cd",
    secondary: colorPattern.test(payload?.secondary) ? payload.secondary : "#777c73",
  };
}

function loadSavedAppearance() {
  try {
    if (fs.existsSync(APPEARANCE_PATH)) {
      twinState.appearance = normalizeAppearance(
        JSON.parse(fs.readFileSync(APPEARANCE_PATH, "utf8")),
      );
    }
  } catch {
    // A damaged local preference should not prevent the service from starting.
  }
}

function saveAppearance(appearance) {
  fs.writeFileSync(APPEARANCE_PATH, JSON.stringify(appearance));
}

loadSavedAppearance();

function getTripoConfig() {
  const modelAliases = {
    "tripo-p1": "P1-20260311",
    "tripo-v2.5": "v2.5-20250123",
    "tripo-v3.0": "v3.0-20250812",
    "tripo-v3.1": "v3.1-20260211",
  };
  const configuredModel = process.env.TRIPO_MODEL_VERSION || "v3.1-20260211";
  return {
    apiKey: process.env.TRIPO_API_KEY || "",
    studioUrl: (
      process.env.TRIPO_STUDIO_URL
      || "https://studio.tripo3d.com"
    ).replace(/\/$/, ""),
    baseUrl: (
      process.env.TRIPO_API_BASE_URL
      || "https://openapi.tripo3d.com/v3"
    ).replace(/\/$/, ""),
    model: modelAliases[configuredModel] || configuredModel,
  };
}

function findNestedValueByKey(value, key) {
  if (!value || typeof value !== "object") {
    return null;
  }
  if (typeof value[key] === "string" && value[key]) {
    return value[key];
  }
  for (const nested of Object.values(value)) {
    const found = findNestedValueByKey(nested, key);
    if (found) {
      return found;
    }
  }
  return null;
}

function findNestedValue(value, keys) {
  for (const key of keys) {
    const found = findNestedValueByKey(value, key);
    if (found) {
      return found;
    }
  }
  return null;
}

function getTripoTaskId(payload) {
  return payload?.data?.task_id
    || payload?.data?.taskId
    || findNestedValue(payload, ["task_id", "taskId", "id"]);
}

function getTripoStatus(payload) {
  return String(
    payload?.data?.status
    || payload?.data?.state
    || findNestedValue(payload, ["task_status", "taskStatus", "status", "state"])
    || "",
  ).toLowerCase();
}

function getTripoModelUrl(payload) {
  const isModelUrl = (value) => (
    typeof value === "string"
    && /^https:\/\//i.test(value)
    && /\.(?:glb|gltf)(?:$|[?#])/i.test(value)
  );
  const explicit = findNestedValue(payload, [
    "rigged_model",
    "base_model",
    "model_url",
    "modelUrl",
    "glb_url",
    "glbUrl",
    "file_url",
    "fileUrl",
    "result_url",
    "resultUrl",
  ]);
  if (isModelUrl(explicit)) {
    return explicit;
  }
  const urls = [];
  const visit = (value) => {
    if (typeof value === "string" && /^https:\/\//i.test(value)) {
      urls.push(value);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(payload);
  return urls.find(isModelUrl) || null;
}

function getTripoArtifactUrl(payload) {
  const explicit = findNestedValue(payload, [
    "rigged_model",
    "base_model",
    "model_url",
    "modelUrl",
    "glb_url",
    "glbUrl",
    "file_url",
    "fileUrl",
    "result_url",
    "resultUrl",
  ]);
  if (typeof explicit === "string" && /^https:\/\//i.test(explicit)) {
    return explicit;
  }
  const urls = [];
  const visit = (value) => {
    if (typeof value === "string" && /^https:\/\//i.test(value)) {
      urls.push(value);
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };
  visit(payload);
  return urls.find((url) => /\.(?:glb|gltf|fbx)(?:$|[?#])/i.test(url)) || null;
}

function saveTwin3DJob(job) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(TWIN_3D_JOB_PATH, JSON.stringify(job, null, 2));
}

function loadTwin3DJob() {
  try {
    return JSON.parse(fs.readFileSync(TWIN_3D_JOB_PATH, "utf8"));
  } catch {
    return null;
  }
}

function readGlbJson(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error(`${path.basename(filePath)} is not a GLB file`);
  }
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8"));
}

function getGlbNodeNames(filePath) {
  const gltf = readGlbJson(filePath);
  return new Set((gltf.nodes || []).map((node) => node.name).filter(Boolean));
}

function getGlbAnimationTargetNames(filePath) {
  const gltf = readGlbJson(filePath);
  const nodes = gltf.nodes || [];
  const names = new Set();
  (gltf.animations || []).forEach((animation) => {
    (animation.channels || []).forEach((channel) => {
      const nodeName = nodes[channel.target?.node]?.name;
      if (nodeName) {
        names.add(nodeName);
      }
    });
  });
  return {
    animationCount: (gltf.animations || []).length,
    targetNames: names,
  };
}

function getGlbSkinJointNames(filePath) {
  const gltf = readGlbJson(filePath);
  const nodes = gltf.nodes || [];
  const names = new Set();
  (gltf.skins || []).forEach((skin) => {
    (skin.joints || []).forEach((jointIndex) => {
      const nodeName = nodes[jointIndex]?.name;
      if (nodeName) {
        names.add(nodeName);
      }
    });
  });
  return names;
}

function getTwinAnimationCompatibility() {
  if (!fs.existsSync(TWIN_3D_PATH)) {
    return {};
  }
  let modelNodeNames;
  let modelSkinJointNames;
  try {
    modelNodeNames = getGlbNodeNames(TWIN_3D_PATH);
    modelSkinJointNames = getGlbSkinJointNames(TWIN_3D_PATH);
  } catch {
    return {};
  }
  return Object.fromEntries(
    Object.entries(TWIN_3D_ANIMATION_PATHS).map(([name, filePath]) => {
      if (!fs.existsSync(filePath)) {
        return [name, {
          compatible: false,
          reason: "missing",
          missingTargetCount: 0,
          animationCount: 0,
        }];
      }
      try {
        const { animationCount, targetNames } = getGlbAnimationTargetNames(filePath);
        const animationSkinJointNames = getGlbSkinJointNames(filePath);
        const missingTargets = [...targetNames].filter((targetName) => (
          !modelNodeNames.has(targetName)
        ));
        const missingSkinJoints = [...animationSkinJointNames].filter((jointName) => (
          !modelSkinJointNames.has(jointName)
        ));
        const skinJointCountMismatch = modelSkinJointNames.size > 0
          && animationSkinJointNames.size > 0
          && modelSkinJointNames.size !== animationSkinJointNames.size;
        const skinMismatch = missingSkinJoints.length > 0 || skinJointCountMismatch;
        return [name, {
          compatible: animationCount > 0 && missingTargets.length === 0 && !skinMismatch,
          reason: animationCount > 0
            ? missingTargets.length === 0
              ? skinMismatch ? "skin-mismatch" : ""
              : "target-mismatch"
            : "no-animation",
          missingTargetCount: missingTargets.length,
          missingSkinJointCount: missingSkinJoints.length,
          modelSkinJointCount: modelSkinJointNames.size,
          animationSkinJointCount: animationSkinJointNames.size,
          targetCount: targetNames.size,
          animationCount,
          missingTargets: missingTargets.slice(0, 40),
          missingSkinJoints: missingSkinJoints.slice(0, 40),
          updatedAt: fs.statSync(filePath).mtimeMs,
        }];
      } catch (error) {
        return [name, {
          compatible: false,
          reason: "invalid-glb",
          error: error.message,
          missingTargetCount: 0,
          animationCount: 0,
        }];
      }
    }),
  );
}

function getCompatibleTwinAnimationUrls(exposeAnimations) {
  const animationCompatibility = getTwinAnimationCompatibility();
  return {
    animations: Object.fromEntries(
      Object.entries(TWIN_3D_ANIMATION_PATHS).map(([name, filePath]) => [
        name,
        exposeAnimations
          && fs.existsSync(filePath)
          && animationCompatibility[name]?.compatible
          ? `/api/twin/3d/animations/${name}?v=${fs.statSync(filePath).mtimeMs}`
          : "",
      ]),
    ),
    animationCompatibility,
  };
}

async function callTripo(pathname, payload) {
  const config = getTripoConfig();
  if (!config.apiKey) {
    throw new Error("TRIPO_API_KEY_NOT_CONFIGURED");
  }
  let response;
  try {
    response = await fetchWithTimeout(`${config.baseUrl}${pathname}`, {
      method: payload === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("TRIPO_REQUEST_TIMEOUT");
    throw new Error(`TRIPO_NETWORK_ERROR: ${error.cause?.code || error.message}`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code && result.code !== 0 || result.error) {
    throw new Error(
      result.error?.message
      || result.message
      || "TRIPO_API_REQUEST_FAILED",
    );
  }
  return result;
}

async function uploadTripoImage(imageDataUrl, filename = "cat-identity.jpg") {
  const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error("INVALID_IDENTITY_IMAGE");
  }
  const config = getTripoConfig();
  if (!config.apiKey) {
    throw new Error("TRIPO_API_KEY_NOT_CONFIGURED");
  }
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(match[2], "base64")], {
    type: match[1],
  }), filename);
  let response;
  try {
    response = await fetchWithTimeout(`${config.baseUrl}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
  } catch (error) {
    if (error.name === "AbortError") throw new Error("TRIPO_UPLOAD_TIMEOUT");
    throw new Error(`TRIPO_NETWORK_ERROR: ${error.cause?.code || error.message}`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.code !== 0) {
    throw new Error(result.message || "TRIPO_IMAGE_UPLOAD_FAILED");
  }
  const token = findNestedValue(result, ["image_token", "file_token"]);
  if (!token) {
    throw new Error("TRIPO_IMAGE_TOKEN_MISSING");
  }
  return token;
}

function extractReferenceImages(images) {
  const values = [
    images?.front,
    images?.side,
    images?.back,
    ...(Array.isArray(images?.references) ? images.references : []),
  ].filter((image) => (
    typeof image === "string"
    && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(image)
  ));
  return [...new Set(values)];
}

function getStandardViewPrompt(view) {
  const viewInstructions = {
    front: "front view, the cat faces the camera symmetrically",
    side: "right side profile view, the cat faces left, full body side silhouette",
    back: "back view, the cat faces away from the camera symmetrically",
  };
  return [
    "Generate a photorealistic standardized 3D reconstruction reference image of the same cat in the uploaded reference photo.",
    "Preserve the cat identity precisely: fur colors, facial markings, body markings, coat length, ear shape, eye-area contrast, tail color and distinctive pattern placement.",
    "Do not invent a different cat. Do not simplify, recolor, stylize, accessorize, cartoonize, armor, or add cyber elements.",
    `Required camera angle: ${viewInstructions[view]}.`,
    "Required pose: neutral standing quadruped pose, all four legs visible, paws on the ground, spine level, head natural, tail fully visible and separated from the body.",
    "Use a clean plain light background, no floor clutter, no shadows that hide paws, no human hands, no furniture, no text, no labels, no frame.",
    "The full cat must be centered and completely inside the image with consistent scale.",
    "This image is an engineering reference for 3D model reconstruction, not a decorative portrait.",
  ].join(" ");
}

async function downloadGeneratedImage(generatedUrl, view) {
  const imageResponse = await fetchWithTimeout(generatedUrl);
  if (!imageResponse.ok) {
    throw new Error("STANDARD_VIEW_DOWNLOAD_FAILED");
  }
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(STANDARD_VIEW_PATHS[view], bytes);
  fs.writeFileSync(STANDARD_VIEW_MIME_PATHS[view], contentType);
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

async function generateVolcengineStandardView(referenceImage, view) {
  if (!process.env.ARK_API_KEY) {
    throw new Error("ARK_API_KEY_NOT_CONFIGURED");
  }
  const baseUrl = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const model = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128";
  const response = await fetchWithTimeout(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: getStandardViewPrompt(view),
      image: referenceImage,
      size: "2048x2048",
      response_format: "url",
      watermark: false,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "STANDARD_VIEW_GENERATION_FAILED");
  }
  const generatedUrl = payload.data?.[0]?.url;
  if (!generatedUrl) {
    throw new Error("STANDARD_VIEW_RESULT_MISSING");
  }
  return downloadGeneratedImage(generatedUrl, view);
}

async function generateStandardIdentityViews(images) {
  const references = extractReferenceImages(images);
  if (!references.length) {
    throw new Error("IDENTITY_REFERENCE_IMAGE_REQUIRED");
  }
  if (
    process.env.STANDARD_VIEW_MODE === "passthrough"
    && images?.front
    && images?.side
    && images?.back
  ) {
    return {
      provider: "passthrough",
      views: {
        front: images.front,
        side: images.side,
        back: images.back,
      },
    };
  }
  const referenceImage = images?.front || references[0];
  const [front, side, back] = await Promise.all([
    generateVolcengineStandardView(referenceImage, "front"),
    generateVolcengineStandardView(referenceImage, "side"),
    generateVolcengineStandardView(referenceImage, "back"),
  ]);
  return {
    provider: "volcengine",
    views: { front, side, back },
    sourceReferenceCount: references.length,
    model: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128",
  };
}

async function createTripoTask(pathname, payload) {
  const result = await callTripo(pathname, payload);
  const id = getTripoTaskId(result);
  if (!id) {
    throw new Error("TRIPO_TASK_ID_MISSING");
  }
  return id;
}

async function createSmartQuadTopologyTask(inputTaskId) {
  return createTripoTask("/mesh/decimate", {
    input: inputTaskId,
    ...TRIPO_SMART_QUAD_TOPOLOGY,
  });
}

async function submitTripo3D(images, options = {}) {
  const config = getTripoConfig();
  const requiredViews = ["front", "side", "back"];
  if (
    !images
    || requiredViews.some((view) => (
      typeof images[view] !== "string" || images[view].length === 0
    ))
  ) {
    throw new Error("THREE_IDENTITY_IMAGES_REQUIRED");
  }
  const [frontToken, sideToken, backToken] = await Promise.all([
    uploadTripoImage(images.front, "cat-front.jpg"),
    uploadTripoImage(images.side, "cat-side.jpg"),
    uploadTripoImage(images.back, "cat-back.jpg"),
  ]);
  const id = await createTripoTask("/generation/multiview-to-model", {
    inputs: [
      { front: frontToken },
      { back: backToken },
      { right: sideToken },
    ],
    model: config.model,
    texture: true,
    pbr: true,
    texture_quality: "detailed",
    geometry_quality: "standard",
    orientation: "align_image",
    face_limit: 50000,
    auto_size: true,
  });
  const job = {
    id,
    taskId: id,
    sourceTaskId: id,
    modelTaskId: id,
    model: config.model,
    provider: "tripo",
    stage: "generation",
    status: "submitted",
    inputViews: ["front", "right", "back"],
    standardViews: options.standardViews || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  saveTwin3DJob(job);
  return job;
}

async function submitStandardizedTripo3D(images) {
  const standardViews = await generateStandardIdentityViews(images);
  return submitTripo3D(standardViews.views, { standardViews });
}

async function rebindTripo3D() {
  const savedJob = loadTwin3DJob();
  const sourceTaskId = savedJob?.sourceTaskId || savedJob?.modelTaskId;
  if (!sourceTaskId || !fs.existsSync(TWIN_3D_PATH)) {
    throw new Error("TWIN_3D_MODEL_NOT_FOUND");
  }
  const taskId = await createSmartQuadTopologyTask(sourceTaskId);
  const job = {
    ...savedJob,
    id: sourceTaskId,
    taskId,
    sourceTaskId,
    modelTaskId: sourceTaskId,
    stage: "retopology",
    status: "processing",
    topology: {
      mode: "smart-quad-medium",
      ...TRIPO_SMART_QUAD_TOPOLOGY,
    },
    rigValidated: false,
    retopologyAttempted: true,
    rebindRequested: true,
    animationIndex: 0,
    animations: {},
    warning: "",
    updatedAt: Date.now(),
  };
  delete job.error;
  delete job.rigTaskId;
  delete job.retopologyTaskId;
  delete job.animationCompatibility;
  saveTwin3DJob(job);
  return job;
}

async function downloadTripoModel(url, destination = TWIN_3D_PATH) {
  if (!/^https:\/\//i.test(url)) {
    throw new Error("INVALID_3D_MODEL_URL");
  }
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error("TRIPO_MODEL_DOWNLOAD_FAILED");
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_MODEL_SIZE) {
    throw new Error("TRIPO_MODEL_TOO_LARGE");
  }
  const model = Buffer.from(await response.arrayBuffer());
  if (model.length > MAX_MODEL_SIZE) {
    throw new Error("TRIPO_MODEL_TOO_LARGE");
  }
  if (model.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error("TRIPO_GLB_REQUIRED");
  }
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(destination, model);
}

async function queryTripoTask(taskId) {
  return callTripo(`/tasks/${encodeURIComponent(taskId)}`);
}

function isTripoComplete(status) {
  return ["success", "succeeded", "completed", "finished", "done"].some((value) => (
    status.includes(value)
  ));
}

async function queryTripo3D(requestedTaskId) {
  const config = getTripoConfig();
  const savedJob = loadTwin3DJob();
  const job = savedJob?.sourceTaskId === requestedTaskId
    ? savedJob
    : {
        id: requestedTaskId,
        taskId: requestedTaskId,
        sourceTaskId: requestedTaskId,
        model: config.model,
        provider: "tripo",
        stage: "generation",
      };
  if (["retopology", "rigcheck"].includes(job.stage)) {
    delete job.rigTaskId;
    delete job.animationCompatibility;
  }
  const result = await queryTripoTask(job.taskId);
  const status = getTripoStatus(result);
  const modelUrl = getTripoModelUrl(result);
  const artifactUrl = getTripoArtifactUrl(result);
  const failed = ["failed", "error", "cancelled", "canceled"].some((value) => (
    status.includes(value)
  ));
  if (failed) {
    job.status = "failed";
    job.error = findNestedValue(result, ["message", "error_message", "errorMessage"])
      || "Tripo 任务失败";
  } else {
    delete job.error;
  }
  if (!failed && !isTripoComplete(status)) {
    job.status = status || "processing";
  } else if (!failed && job.stage === "generation") {
    if (!modelUrl) {
      throw new Error("TRIPO_GENERATED_MODEL_MISSING");
    }
    await downloadTripoModel(modelUrl);
    job.sourceTaskId = job.sourceTaskId || job.taskId;
    job.rawModelTaskId = job.taskId;
    job.modelTaskId = job.taskId;
    job.stage = "retopology";
    job.taskId = await createSmartQuadTopologyTask(job.modelTaskId);
    job.topology = {
      mode: "smart-quad-medium",
      ...TRIPO_SMART_QUAD_TOPOLOGY,
    };
    job.retopologyAttempted = true;
    job.status = "processing";
    delete job.rigTaskId;
    delete job.retopologyTaskId;
    delete job.animationCompatibility;
  } else if (!failed && job.stage === "rigcheck") {
    const riggable = result?.data?.output?.riggable
      ?? result?.output?.riggable
      ?? result?.data?.riggable
      ?? result?.riggable;
    job.rigType = findNestedValue(result, ["rig_type", "rigType"]) || "quadruped";
    if (riggable !== true && !job.retopologyAttempted) {
      job.retopologyAttempted = true;
      job.stage = "retopology";
      job.taskId = await createSmartQuadTopologyTask(job.modelTaskId);
      job.topology = {
        mode: "smart-quad-medium",
        ...TRIPO_SMART_QUAD_TOPOLOGY,
      };
      job.status = "processing";
    } else if (riggable !== true) {
      job.stage = "completed";
      job.status = "completed";
      job.rigValidated = false;
      job.warning = "模型拓扑不适合 Tripo 自动绑骨，已保留高质量分身并启用赛博分段骨架动作";
      job.modelUrl = `/api/twin/3d/model?v=${Date.now()}`;
      job.animations = {};
    } else {
      job.rigValidated = true;
      job.stage = "rigging";
      job.taskId = await createTripoTask("/animations/rig", {
        input: job.modelTaskId,
        model: "v2.5-20260210",
        rig_type: job.rigType,
        spec: "tripo",
        out_format: "glb",
      });
      job.status = "processing";
    }
  } else if (!failed && job.stage === "retopology") {
    if (!artifactUrl) {
      throw new Error("TRIPO_RETOPOLOGY_MODEL_MISSING");
    }
    job.topologyModelUrl = artifactUrl;
    job.modelTaskId = job.taskId;
    job.retopologyTaskId = job.taskId;
    job.stage = "rigcheck";
    job.taskId = await createTripoTask("/animations/rig-check", {
      input: job.modelTaskId,
    });
    job.status = "processing";
  } else if (!failed && job.stage === "rigging") {
    if (!job.rigValidated) {
      throw new Error("TRIPO_RIG_NOT_VALIDATED");
    }
    if (!modelUrl && !artifactUrl) {
      throw new Error("TRIPO_RIGGED_MODEL_MISSING");
    }
    if (modelUrl) {
      await downloadTripoModel(modelUrl);
    } else {
      job.riggedModelUrl = artifactUrl;
    }
    job.rigTaskId = job.taskId;
    job.animationIndex = 0;
    job.stage = "animation";
    job.taskId = await createTripoTask("/animations/retarget", {
      input: job.rigTaskId,
      animation: TRIPO_QUADRUPED_ANIMATIONS[0][1],
      out_format: "glb",
      bake_animation: true,
      animate_in_place: true,
    });
    job.status = "processing";
  } else if (!failed && job.stage === "animation") {
    if (!job.rigValidated) {
      throw new Error("TRIPO_RIG_NOT_VALIDATED");
    }
    const [actionName] = TRIPO_QUADRUPED_ANIMATIONS[job.animationIndex];
    if (!modelUrl) {
      throw new Error("TRIPO_ANIMATION_MODEL_MISSING");
    }
    const animationPath = TWIN_3D_ANIMATION_PATHS[actionName];
    await downloadTripoModel(modelUrl, animationPath);
    if (job.animationIndex === 0) {
      fs.copyFileSync(animationPath, TWIN_3D_PATH);
      job.modelUrl = `/api/twin/3d/model?v=${fs.statSync(TWIN_3D_PATH).mtimeMs}`;
    }
    job.animationIndex += 1;
    if (job.animationIndex < TRIPO_QUADRUPED_ANIMATIONS.length) {
      const [, animationPreset] = TRIPO_QUADRUPED_ANIMATIONS[job.animationIndex];
      job.taskId = await createTripoTask("/animations/retarget", {
        input: job.rigTaskId,
        animation: animationPreset,
        out_format: "glb",
        bake_animation: true,
        animate_in_place: true,
      });
      job.status = "processing";
    } else {
      job.stage = "completed";
      job.status = "completed";
      job.warning = "";
      job.modelUrl = `/api/twin/3d/model?v=${Date.now()}`;
      job.animations = Object.fromEntries(
        Object.entries(TWIN_3D_ANIMATION_PATHS).map(([name, filePath]) => [
          name,
          fs.existsSync(filePath)
            ? `/api/twin/3d/animations/${name}?v=${fs.statSync(filePath).mtimeMs}`
            : "",
        ]),
      );
    }
  }
  job.updatedAt = Date.now();
  if (job.rigValidated === true && fs.existsSync(TWIN_3D_PATH)) {
    const { animations, animationCompatibility } = getCompatibleTwinAnimationUrls(true);
    job.animations = animations;
    job.animationCompatibility = animationCompatibility;
  }
  saveTwin3DJob(job);
  return job;
}

function getFusionPrompt(direction) {
  const directionNotes = {
    soft: "balanced organic fur and smooth graphite armor, subtle integration",
    pixel: "micro-pixel data mosaic embedded into fur and armor surfaces",
    neon: "strong magenta-cyan-lime energy channels with controlled high saturation",
    mono: "black, silver and white etched mechanical linework, restrained lime accents",
    original: "graphite cybernetic armor with restrained lime circuitry",
  };
  return [
    "Create a square 2x2 cyber-organic identity texture atlas for an animated cat avatar.",
    "Use the uploaded cat as the identity reference: preserve its exact dominant fur colors,",
    "distinctive facial and body markings, eye-area contrast, and recognizable pattern distribution.",
    "Use this exact quadrant layout with clean continuous texture inside every quadrant:",
    "TOP LEFT: a front-facing facial fur map, symmetrical and centered, including the cat's",
    "recognizable forehead, eye-area and cheek markings but no eyes, nose, mouth, ears or head silhouette.",
    "TOP RIGHT: a low-frequency side-body fur map with only broad color blocks and major markings.",
    "BOTTOM LEFT: matching ear and neck synthetic-fur texture with restrained identity markings.",
    "BOTTOM RIGHT: matte graphite limb and tail armor using the cat's fur colors only as subtle inlays.",
    "Fuse the biological traits with graphite armor edges, translucent synthetic fur, fine lime-green",
    "circuit seams, and premium near-future industrial design. Keep biological fur near the center",
    "of each region and mechanical material near its edges so the transition feels constructed.",
    "This is a texture atlas, not a portrait: no full cat, no body silhouette, no complete face,",
    "no environment, text, labels, grid lines, frames, background, shadows or objects.",
    `Art direction: ${directionNotes[direction] || directionNotes.soft}.`,
    "Keep it readable at small scale. Each quadrant must fill its area edge-to-edge.",
  ].join(" ");
}

async function generateOpenAIFusion(imageDataUrl, direction) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY_NOT_CONFIGURED");
  }
  const match = imageDataUrl.match(/^data:(image\/jpeg);base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error("INVALID_IDENTITY_IMAGE");
  }
  const form = new FormData();
  form.append("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-2");
  form.append("prompt", getFusionPrompt(direction));
  form.append("image[]", new Blob([Buffer.from(match[2], "base64")], {
    type: match[1],
  }), "cat-identity.jpg");
  form.append("size", "1024x1024");
  form.append("quality", "medium");
  form.append("output_format", "jpeg");

  const response = await fetchWithTimeout("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "OPENAI_IMAGE_GENERATION_FAILED");
  }
  const encoded = payload.data?.[0]?.b64_json;
  if (!encoded) {
    throw new Error("OPENAI_IMAGE_RESULT_MISSING");
  }
  const token = crypto.randomBytes(8).toString("hex");
  const imagePath = path.join(GENERATED_DIR, `ai-fusion-${token}.jpg`);
  const mimePath = path.join(GENERATED_DIR, `ai-fusion-${token}.mime`);
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(imagePath, Buffer.from(encoded, "base64"));
  fs.writeFileSync(mimePath, "image/jpeg");
  return {
    texture: `/api/twin/fusion/image?token=${token}`,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    provider: "openai",
    layout: "identity-atlas-v1",
  };
}

async function generateVolcengineFusion(imageDataUrl, direction) {
  if (!process.env.ARK_API_KEY) {
    throw new Error("ARK_API_KEY_NOT_CONFIGURED");
  }
  if (!/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(imageDataUrl)) {
    throw new Error("INVALID_IDENTITY_IMAGE");
  }
  const baseUrl = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
  const model = process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128";
  const response = await fetchWithTimeout(`${baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: getFusionPrompt(direction),
      image: imageDataUrl,
      size: "2048x2048",
      response_format: "url",
      watermark: false,
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "ARK_IMAGE_GENERATION_FAILED");
  }
  const generatedUrl = payload.data?.[0]?.url;
  if (!generatedUrl) {
    throw new Error("ARK_IMAGE_RESULT_MISSING");
  }
  const imageResponse = await fetchWithTimeout(generatedUrl);
  if (!imageResponse.ok) {
    throw new Error("ARK_IMAGE_DOWNLOAD_FAILED");
  }
  const token = crypto.randomBytes(8).toString("hex");
  const imagePath = path.join(GENERATED_DIR, `ai-fusion-${token}.jpg`);
  const mimePath = path.join(GENERATED_DIR, `ai-fusion-${token}.mime`);
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(imagePath, Buffer.from(await imageResponse.arrayBuffer()));
  fs.writeFileSync(
    mimePath,
    imageResponse.headers.get("content-type") || "image/jpeg",
  );
  return {
    texture: `/api/twin/fusion/image?token=${token}`,
    model,
    provider: "volcengine",
    layout: "identity-atlas-v1",
  };
}

async function generateFusionMaterial(imageDataUrl, direction) {
  const provider = process.env.IMAGE_PROVIDER || (
    process.env.ARK_API_KEY ? "volcengine" : "openai"
  );
  if (provider === "volcengine") {
    return generateVolcengineFusion(imageDataUrl, direction);
  }
  if (provider === "openai") {
    return generateOpenAIFusion(imageDataUrl, direction);
  }
  throw new Error("UNSUPPORTED_IMAGE_PROVIDER");
}

function createScanId() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${date}-${suffix}`;
}

function isValidScanId(value) {
  return /^\d{8}-[A-Z0-9]{6}$/.test(value);
}

function getScanDirectory(scanId) {
  if (!isValidScanId(scanId)) {
    throw new Error("INVALID_SCAN_ID");
  }
  return path.join(SCANS_DIR, scanId);
}

function getScanManifest(scanId) {
  const scanDirectory = getScanDirectory(scanId);
  const manifestPath = path.join(scanDirectory, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function saveScanManifest(scanId, manifest) {
  const scanDirectory = getScanDirectory(scanId);
  fs.mkdirSync(scanDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(scanDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
}

function listScanManifests() {
  fs.mkdirSync(SCANS_DIR, { recursive: true });
  return fs.readdirSync(SCANS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidScanId(entry.name))
    .map((entry) => getScanManifest(entry.name))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function startReconstruction(scanId) {
  const manifest = getScanManifest(scanId);
  if (!manifest) {
    throw new Error("SCAN_NOT_FOUND");
  }
  if (manifest.frames.length < 12) {
    throw new Error("NOT_ENOUGH_FRAMES");
  }
  if (reconstructionJobs.has(scanId)) {
    return manifest;
  }

  const executable = path.join(ROOT, "bin", "cat-reconstruct");
  if (!fs.existsSync(executable)) {
    throw new Error("RECONSTRUCTOR_NOT_BUILT");
  }

  const imagesDirectory = path.join(getScanDirectory(scanId), "images");
  const outputPath = path.join(getScanDirectory(scanId), "cat.usdz");
  manifest.status = "reconstructing";
  manifest.progress = 0;
  manifest.error = null;
  saveScanManifest(scanId, manifest);

  const process = spawn(executable, [imagesDirectory, outputPath], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  reconstructionJobs.set(scanId, process);
  let stdoutBuffer = "";
  let stderrBuffer = "";

  process.stdout.setEncoding("utf8");
  process.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() || "";
    lines.filter(Boolean).forEach((line) => {
      try {
        const event = JSON.parse(line);
        const current = getScanManifest(scanId);
        if (!current) {
          return;
        }
        if (event.type === "progress") {
          current.progress = event.progress;
        } else if (event.type === "complete") {
          current.progress = 1;
        } else if (event.type === "stitching-incomplete") {
          current.warning = "部分照片无法拼接，模型可能不完整";
        }
        saveScanManifest(scanId, current);
      } catch {
        // Ignore non-JSON diagnostics from the framework.
      }
    });
  });
  process.stderr.setEncoding("utf8");
  process.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
  });
  process.on("close", (code) => {
    reconstructionJobs.delete(scanId);
    const current = getScanManifest(scanId);
    if (!current) {
      return;
    }
    if (code === 0 && fs.existsSync(outputPath)) {
      current.status = "complete";
      current.progress = 1;
      current.output = "cat.usdz";
      current.completedReconstructionAt = new Date().toISOString();
      fs.copyFileSync(outputPath, path.join(SCANS_DIR, "active-cat.usdz"));
      fs.writeFileSync(
        path.join(SCANS_DIR, "active-scan.json"),
        JSON.stringify({ scanId, activatedAt: new Date().toISOString() }, null, 2),
      );
    } else {
      current.status = "failed";
      current.error = stderrBuffer.trim() || `重建进程退出码 ${code}`;
    }
    saveScanManifest(scanId, current);
  });
  return manifest;
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      createdAt: Date.now(),
      lastCreatedAt: 0,
      messages: [],
      waiters: [],
    });
  }
  return rooms.get(roomId);
}

function postSignal(roomId, sender, message) {
  const room = getRoom(roomId);
  const createdAt = Math.max(Date.now(), room.lastCreatedAt + 1);
  room.lastCreatedAt = createdAt;
  const entry = {
    id: `${createdAt}-${Math.random().toString(16).slice(2)}`,
    sender,
    createdAt,
    message,
  };
  room.messages.push(entry);
  room.messages = room.messages.slice(-200);

  const waiters = room.waiters.splice(0);
  waiters.forEach((waiter) => waiter());
  return entry;
}

function getSignals(roomId, receiver, since) {
  const room = getRoom(roomId);
  return room.messages.filter((entry) => (
    entry.sender !== receiver
    && entry.createdAt > since
  ));
}

async function handleApi(request, response, requestUrl) {
  if (request.method === "GET" && requestUrl.pathname === "/api/health") {
    sendJson(response, 200, {
      status: "ok",
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      version: "0.2.0",
    });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/info") {
    const hosts = getLanAddresses();
    sendJson(response, 200, {
      port: PORT,
      certificatePort: CERT_PORT,
      localUrl: `http://localhost:${LOCAL_PORT}`,
      lanUrls: hosts.map((host) => `https://${host}:${PORT}`),
      certificateUrls: hosts.map((host) => `http://${host}:${CERT_PORT}`),
    });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/me") {
    sendJson(response, 200, {
      user: publicUser(getRequestUser(request, requestUrl)),
    });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/desktop/session") {
    const user = getDesktopUser(requestUrl);
    if (!user) {
      sendJson(response, 401, { error: "AUTH_REQUIRED" });
      return true;
    }
    createSession(response, user.id);
    sendJson(response, 200, { user: publicUser(user) });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/register") {
    const ip = getClientIp(request);
    const rl = rateLimit(ip, "auth", AUTH_RATE_LIMIT_RPM);
    if (!rl.allowed) {
      sendJson(response, 429, { error: "RATE_LIMITED", retryAfter: RATE_LIMIT_WINDOW });
      return true;
    }
    try {
      const payload = await readJson(request);
      const method = payload.method || "email";
      if (method === "nickname") {
        const user = registerNicknameUser(payload.nickname, payload.password);
        createSession(response, user.id);
        sendJson(response, 201, { user: publicUser(user) });
        return true;
      }
      if (method === "phone") {
        const phone = normalizePhone(payload.phone || "");
        if (!phone) throw new Error("INVALID_PHONE");
        if (!verifySmsCode(phone, payload.code)) throw new Error("INVALID_SMS_CODE");
      }
      const user = registerUser(
        method === "email" ? payload.email : "",
        payload.password,
        method === "phone" ? payload.phone : "",
      );
      createSession(response, user.id);
      sendJson(response, 201, { user: publicUser(user) });
    } catch (error) {
      const statusCode = error.message === "PAYLOAD_TOO_LARGE"
        ? 413
        : ["EMAIL_ALREADY_REGISTERED", "PHONE_ALREADY_REGISTERED", "NICKNAME_ALREADY_REGISTERED"].includes(error.message)
          ? 409
          : 400;
      sendJson(response, statusCode, { error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/login") {
    const ip = getClientIp(request);
    const rl = rateLimit(ip, "auth", AUTH_RATE_LIMIT_RPM);
    if (!rl.allowed) {
      sendJson(response, 429, { error: "RATE_LIMITED", retryAfter: RATE_LIMIT_WINDOW });
      return true;
    }
    try {
      const payload = await readJson(request);
      const method = payload.method || "email";
      if (method === "nickname") {
        const user = loginNicknameUser(payload.nickname, payload.password);
        createSession(response, user.id);
        sendJson(response, 200, { user: publicUser(user) });
        return true;
      }
      const email = method === "email" ? payload.email : "";
      const phone = method === "phone" ? payload.phone : "";
      if (method === "phone" && !normalizePhone(phone || "")) {
        throw new Error("INVALID_PHONE");
      }
      let user = null;
      if (method === "phone") {
        const normalizedPhone = normalizePhone(phone);
        if (!verifySmsCode(normalizedPhone, payload.code)) {
          throw new Error("INVALID_SMS_CODE");
        }
        const users = readUsers();
        user = users.users.find((item) => item.phone === normalizedPhone);
        if (!user) {
          throw new Error("PHONE_NOT_REGISTERED");
        }
      } else {
        user = loginUser(email, payload.password, phone);
      }
      createSession(response, user.id);
      sendJson(response, 200, { user: publicUser(user) });
    } catch (error) {
      const statusCode = error.message === "PAYLOAD_TOO_LARGE"
        ? 413
        : error.message === "INVALID_PHONE"
          ? 400
          : 401;
      sendJson(response, statusCode, {
        error: error.message,
      });
    }
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/send-code") {
    const ip = getClientIp(request);
    const rl = rateLimit(ip, "auth", AUTH_RATE_LIMIT_RPM);
    if (!rl.allowed) {
      sendJson(response, 429, { error: "RATE_LIMITED", retryAfter: RATE_LIMIT_WINDOW });
      return true;
    }
    try {
      const payload = await readJson(request);
      const phone = normalizePhone(payload.phone || "");
      if (!phone) throw new Error("INVALID_PHONE");
      const result = sendSmsCode(phone);
      sendJson(response, 200, { ok: true, masked: result.masked });
    } catch (error) {
      sendJson(response, error.message === "SMS_TOO_FREQUENT" ? 429 : 400, {
        error: error.message,
      });
    }
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/wechat/qr") {
    const appId = process.env.WECHAT_APP_ID;
    if (!appId) {
      sendJson(response, 200, { available: false, reason: "WeChat OAuth not configured" });
      return true;
    }
    const redirectUri = process.env.WECHAT_REDIRECT_URI;
    if (!redirectUri) {
      sendJson(response, 500, { error: "WECHAT_REDIRECT_URI not configured" });
      return true;
    }
    const state = crypto.randomBytes(16).toString("hex");
    oauthStates.set(state, { createdAt: Date.now() });
    // Clean up old OAuth states (older than 10 minutes)
    const cutoff = Date.now() - 600_000;
    oauthStates.forEach((entry, key) => {
      if (entry.createdAt < cutoff) oauthStates.delete(key);
    });
    const qrUrl = `https://open.weixin.qq.com/connect/qrconnect`
      + `?appid=${encodeURIComponent(appId)}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + `&response_type=code`
      + `&scope=snsapi_login`
      + `&state=${state}`;
    sendJson(response, 200, { available: true, qrUrl, state });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/auth/wechat/callback") {
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    const params = Object.fromEntries(requestUrl.searchParams.entries());
    if (!appId || !appSecret || !params.code) {
      sendJson(response, 400, { error: "WECHAT_AUTH_FAILED" });
      return true;
    }
    // Verify OAuth state to prevent CSRF
    if (!params.state || !oauthStates.has(params.state)) {
      sendJson(response, 400, { error: "WECHAT_STATE_MISMATCH" });
      return true;
    }
    oauthStates.delete(params.state);
    try {
      const tokenRes = await fetchWithTimeout(`https://api.weixin.qq.com/sns/oauth2/access_token`
        + `?appid=${appId}&secret=${appSecret}&code=${params.code}&grant_type=authorization_code`);
      const tokenData = await tokenRes.json();
      if (tokenData.errcode) throw new Error(tokenData.errmsg || "WECHAT_TOKEN_ERROR");
      const userRes = await fetchWithTimeout(`https://api.weixin.qq.com/sns/userinfo`
        + `?access_token=${tokenData.access_token}&openid=${tokenData.openid}`);
      const wxUser = await userRes.json();
      if (wxUser.errcode) throw new Error(wxUser.errmsg || "WECHAT_USERINFO_ERROR");
      // Auto-register or login by wechat openid
      const users = readUsers();
      let user = users.users.find((u) => u.wechatOpenId === wxUser.openid);
      if (!user) {
        user = {
          id: `USR-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`,
          email: "",
          phone: "",
          wechatOpenId: wxUser.openid,
          wechatNickname: wxUser.nickname || "",
          salt: "",
          passwordHash: "",
          plan: "free",
          adoptedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        users.users.push(user);
        writeUsers(users);
      }
      createSession(response, user.id);
      response.writeHead(302, { Location: "/" });
      response.end();
    } catch (error) {
      sendJson(response, 500, { error: error.message || "WECHAT_AUTH_FAILED" });
    }
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/logout") {
    clearSession(request, response);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/auth/adopt-free") {
    try {
      const user = getCurrentUser(request);
      if (!user) {
        throw new Error("AUTH_REQUIRED");
      }
      const updated = updateUser(user.id, (draft) => ({
        ...draft,
        plan: draft.plan === "custom_paid" || draft.plan === "custom_pending"
          ? draft.plan
          : "free",
        adoptedAt: draft.adoptedAt || new Date().toISOString(),
      }));
      sendJson(response, 200, {
        user: publicUser(updated),
        pet: {
          id: "cyber-cat-basic",
          name: "基础版赛博猫咪",
          tier: "free",
        },
      });
    } catch (error) {
      sendJson(response, error.message === "AUTH_REQUIRED" ? 401 : 400, { error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/payments/custom-order") {
    try {
      const user = getCurrentUser(request);
      const order = createCustomOrder(user);
      sendJson(response, 201, {
        order,
        user: publicUser(user),
      });
    } catch (error) {
      sendJson(response, error.message === "AUTH_REQUIRED" ? 401 : 400, { error: error.message });
    }
    return true;
  }

  const paymentStatusMatch = requestUrl.pathname.match(/^\/api\/payments\/custom-order\/([^/]+)$/);
  if (request.method === "GET" && paymentStatusMatch) {
    try {
      const user = getCurrentUser(request);
      if (!user) throw new Error("AUTH_REQUIRED");
      const order = getCustomOrderForUser(decodeURIComponent(paymentStatusMatch[1]), user.id);
      if (!order) throw new Error("ORDER_NOT_FOUND");
      sendJson(response, 200, {
        order,
        user: publicUser(getCurrentUser(request)),
      });
    } catch (error) {
      sendJson(response, error.message === "AUTH_REQUIRED" ? 401 : 404, { error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/payments/custom-order/confirm") {
    try {
      const token = request.headers["x-payment-admin-token"];
      const expectedToken = process.env.PAYMENT_ADMIN_TOKEN || "";
      if (!expectedToken || token !== expectedToken) {
        throw new Error("PAYMENT_CONFIRM_FORBIDDEN");
      }
      const payload = await readJson(request);
      const result = confirmCustomOrderPayment(payload.orderId, payload.amount, payload.provider);
      sendJson(response, 200, {
        order: result.order,
        user: publicUser(result.user),
      });
    } catch (error) {
      const status = error.message === "PAYMENT_CONFIRM_FORBIDDEN"
        ? 403
        : ["ORDER_NOT_FOUND"].includes(error.message)
          ? 404
          : 400;
      sendJson(response, status, { error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/certificate") {
    response.writeHead(200, {
      "Content-Type": "application/x-x509-ca-cert",
      "Content-Disposition": 'attachment; filename="neko-sync-local-ca.crt"',
      "Cache-Control": "no-store",
    });
    fs.createReadStream(CA_CERT_PATH).pipe(response);
    return true;
  }

  if (requestUrl.pathname === "/api/twin/state") {
    if (request.method === "GET") {
      const user = getRequestUser(request, requestUrl);
      sendJson(response, 200, getTwinStateForUser(user?.id));
      return true;
    }
    if (request.method === "POST") {
      try {
        const user = getRequestUser(request, requestUrl);
        const currentState = getTwinStateForUser(user?.id);
        const payload = await readJson(request);
        const nextState = {
          visible: payload.visible !== false,
          displayMode: payload.displayMode === "custom-pending" ? "custom-pending" : "live",
          action: [
            "idle",
            "tracking",
            "walking",
            "running",
            "prowling",
            "turning",
            "alert",
            "lying",
            "jumpStart",
            "jumping",
            "jumpFall",
            "jumpEnd",
          ].includes(payload.action)
            ? payload.action
            : "idle",
          confidence: Math.max(0, Math.min(1, Number(payload.confidence) || 0)),
          direction: Math.max(-1, Math.min(1, Number(payload.direction) || 0)),
          intensity: Math.max(0, Math.min(1, Number(payload.intensity) || 0)),
          speed: Math.max(0, Math.min(1, Number(payload.speed) || 0)),
          appearance: currentState.appearance,
          updatedAt: Date.now(),
        };
        setTwinStateForUser(user?.id, nextState);
        broadcastTwinState(user?.id);
        sendJson(response, 202, { ok: true });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }
      return true;
    }
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return true;
  }

  if (requestUrl.pathname === "/api/desktop/link") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }
    try {
      const user = getCurrentUser(request);
      if (!user) {
        sendJson(response, 401, { error: "AUTH_REQUIRED" });
        return true;
      }
      const token = createDesktopToken(user.id);
      const baseUrl = IS_PRODUCTION
        ? "https://yutanggo.com"
        : `http://localhost:${LOCAL_PORT}`;
      const params = new URLSearchParams({
        baseUrl,
        desktopToken: token,
        userId: user.id,
      });
      sendJson(response, 201, {
        ok: true,
        deepLink: `neko-sync://spawn?${params.toString()}`,
        desktopToken: token,
        baseUrl,
        user: publicUser(user),
      });
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/desktop/open") {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }
    try {
      let opener = null;
      if (process.platform === "darwin") {
        if (!fs.existsSync(DESKTOP_APP_PATH)) {
          sendJson(response, 404, { error: "DESKTOP_APP_MISSING" });
          return true;
        }
        if (isMacDesktopPetRunning()) {
          sendJson(response, 202, {
            ok: true,
            platform: process.platform,
            alreadyRunning: true,
          });
          return true;
        }
        opener = spawn("open", [DESKTOP_APP_PATH], {
          detached: true,
          stdio: "ignore",
        });
      } else if (process.platform === "win32") {
        if (!fs.existsSync(WINDOWS_DESKTOP_SCRIPT_PATH)) {
          sendJson(response, 404, { error: "WINDOWS_DESKTOP_SCRIPT_MISSING" });
          return true;
        }
        opener = spawn("powershell.exe", [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          WINDOWS_DESKTOP_SCRIPT_PATH,
        ], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        sendJson(response, 400, { error: "DESKTOP_APP_UNSUPPORTED_PLATFORM" });
        return true;
      }
      opener.unref();
      sendJson(response, 202, { ok: true, platform: process.platform });
    } catch (error) {
      sendJson(response, 500, { error: error.message || "DESKTOP_APP_OPEN_FAILED" });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/desktop/platform") {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return true;
    }
    sendJson(response, 200, {
      platform: process.platform,
      desktopAvailable: process.platform === "darwin"
        ? fs.existsSync(DESKTOP_APP_PATH)
        : process.platform === "win32"
          ? fs.existsSync(WINDOWS_DESKTOP_SCRIPT_PATH)
          : false,
      launchMode: process.platform === "darwin"
        ? "native-macos"
        : process.platform === "win32"
          ? "windows-browser-app"
          : "unsupported",
    });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/twin/snack") {
    const user = getRequestUser(request, requestUrl);
    const currentState = getTwinStateForUser(user?.id);
    currentState.snack = (currentState.snack || 0) + 1;
    currentState.updatedAt = Date.now();
    setTwinStateForUser(user?.id, currentState);
    const snackData = { count: currentState.snack, at: currentState.updatedAt };
    twinClients.forEach((client) => {
      if (client.response.writableEnded) {
        twinClients.delete(client);
      } else if (client.userId === (user?.id || null)) {
        client.response.write(`event: snack\ndata: ${JSON.stringify(snackData)}\n\n`);
      }
    });
    sendJson(response, 202, { ok: true, snack: snackData });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/subscription/status") {
    const user = getRequestUser(request, requestUrl);
    const quota = checkChatQuota(user || { plan: "none" });
    sendJson(response, 200, {
      plan: user?.plan || "none",
      chatQuota: { remaining: quota.remaining, limit: quota.limit },
    });
    return true;
  }

  // --- Community ---
  if (request.method === "GET" && requestUrl.pathname.startsWith("/api/community/images/")) {
    const imageName = path.basename(requestUrl.pathname);
    const imagePath = path.join(COMMUNITY_IMAGES_DIR, imageName);
    if (!fs.existsSync(imagePath)) { response.writeHead(404); response.end(); return true; }
    const ext = path.extname(imageName).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    response.writeHead(200, { "Content-Type": mime, "Cache-Control": "public, max-age=86400" });
    fs.createReadStream(imagePath).pipe(response);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/community/posts") {
    const posts = readCommunityPosts();
    const searchParams = new URL(request.url, "http://localhost").searchParams;
    const limit = Math.min(50, Number(searchParams.get("limit")) || 30);
    const topic = searchParams.get("topic") || "";
    let list = posts.posts;
    if (topic) list = list.filter((p) => p.topic === topic);
    sendJson(response, 200, { posts: list.slice(0, limit) });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/community/posts") {
    try {
      const user = getCurrentUser(request);
      if (!user) throw new Error("AUTH_REQUIRED");
      const payload = await readJson(request);
      if (!payload.content || !payload.content.trim()) throw new Error("EMPTY_CONTENT");
      const post = createCommunityPost(user, payload);
      sendJson(response, 201, { post });
    } catch (error) {
      const status = error.message === "AUTH_REQUIRED" ? 401
        : error.message === "EMPTY_CONTENT" ? 400 : 400;
      sendJson(response, status, { error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname.startsWith("/api/community/posts/") && requestUrl.pathname.endsWith("/like")) {
    try {
      const user = getCurrentUser(request);
      if (!user) throw new Error("AUTH_REQUIRED");
      const postId = requestUrl.pathname.split("/")[4];
      const posts = readCommunityPosts();
      const post = posts.posts.find((p) => p.id === postId);
      if (!post) throw new Error("POST_NOT_FOUND");
      if (!post.likedBy) post.likedBy = [];
      if (post.likedBy.includes(user.id)) {
        post.likedBy = post.likedBy.filter((id) => id !== user.id);
        post.likes = Math.max(0, post.likes - 1);
      } else {
        post.likedBy.push(user.id);
        post.likes += 1;
      }
      writeCommunityPosts(posts);
      sendJson(response, 200, { likes: post.likes, liked: post.likedBy.includes(user.id) });
    } catch (error) {
      sendJson(response, error.message === "AUTH_REQUIRED" ? 401 : 404, { error: error.message });
    }
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/chat") {
    try {
      const user = getRequestUser(request, requestUrl);
      const quota = checkChatQuota(user || { plan: "none" });
      if (!quota.allowed) {
        sendJson(response, 429, {
          error: "DAILY_CHAT_LIMIT_REACHED",
          message: `每日免费对话次数（${DAILY_CHAT_LIMIT_FREE}次）已用完，无限对话订阅暂未开放。`,
          quota,
        });
        return true;
      }

      const payload = await readJson(request);
      const MAX_CHAT_MESSAGE_LENGTH = 2000;
      if (String(payload.message || "").length > MAX_CHAT_MESSAGE_LENGTH) {
        sendJson(response, 400, { error: "MESSAGE_TOO_LONG", maxLength: MAX_CHAT_MESSAGE_LENGTH });
        return true;
      }
      // Sanitize user-supplied strings interpolated into the system prompt
      const petName = String(payload.petName || "Neko").slice(0, 32).replace(/[\n\r]/g, "");
      const safeFileName = payload.fileName
        ? String(payload.fileName).slice(0, 128).replace(/[\n\r]/g, "")
        : "";
      const chatModel = process.env.ARK_CHAT_MODEL || "doubao-1-5-pro-32k-250115";
      const baseUrl = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
      const systemPrompt = [
        "你是 NEKO.SYNC 的一只赛博猫咪数字分身，你住在用户的电脑桌面上。",
        "用猫的口吻说话：偶尔带'喵'、好奇、有点傲娇但很关心主人。",
        "回复简洁，2-4 句话，用中文。如果有人给你投喂文件，认真读完再回答。",
        `你的名字叫 ${petName}。你的性格：聪明、慵懒、对新技术很好奇。`,
      ].join(" ");

      let userContent = payload.message || "";
      if (payload.fileName) {
        userContent = `[用户投喂了一个文件: ${safeFileName}]\n\n${payload.fileContent || payload.message}`;
      }

      const messages = [
        { role: "system", content: systemPrompt },
        ...(payload.history || []).slice(-20),
        { role: "user", content: userContent },
      ];

      // Handle image content for vision-capable models
      if (payload.imageDataUrl && /^data:image\//.test(payload.imageDataUrl)) {
        messages[messages.length - 1] = {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: payload.imageDataUrl } },
            { type: "text", text: userContent || "这张图片里有什么？" },
          ],
        };
      }

      const apiResponse = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.ARK_API_KEY || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: chatModel,
          messages,
          temperature: 0.8,
          max_tokens: 1024,
        }),
      });

      if (!apiResponse.ok) {
        const err = await apiResponse.json().catch(() => ({}));
        throw new Error(err.error?.message || "CHAT_API_FAILED");
      }

      const result = await apiResponse.json();
      const reply = result.choices?.[0]?.message?.content || "喵...（打了个哈欠）";

      const updatedUser = user ? recordChatUsage(user) : null;
      const updatedQuota = updatedUser ? checkChatQuota(updatedUser) : quota;
      sendJson(response, 200, { reply, quota: updatedQuota });
    } catch (error) {
      console.error("[Chat]", error.message);
      const status = error.message === "ARK_API_KEY_NOT_CONFIGURED" ? 503 : 400;
      sendJson(response, status, { error: error.message });
    }
    return true;
  }

  if (requestUrl.pathname === "/api/twin/appearance") {
    if (request.method === "GET") {
      const user = getRequestUser(request, requestUrl);
      sendJson(response, 200, getTwinStateForUser(user?.id).appearance);
      return true;
    }
    if (request.method === "POST") {
      try {
        const user = getRequestUser(request, requestUrl);
        const currentState = getTwinStateForUser(user?.id);
        currentState.appearance = normalizeAppearance(await readJson(request));
        if (!user?.id) {
          saveAppearance(currentState.appearance);
        }
        currentState.updatedAt = Date.now();
        setTwinStateForUser(user?.id, currentState);
        broadcastTwinState(user?.id);
        sendJson(response, 202, currentState.appearance);
      } catch (error) {
        sendJson(response, error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
          error: error.message,
        });
      }
      return true;
    }
    sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/3d") {
    const config = getTripoConfig();
    const job = loadTwin3DJob();
    const exposeAnimations = job?.rigValidated === true;
    const { animations, animationCompatibility } = getCompatibleTwinAnimationUrls(exposeAnimations);
    const reservationAvailability = getReservationAvailability();
    const currentUser = getCurrentUser(request);
    sendJson(response, 200, {
      available: Boolean(config.apiKey),
      provider: job?.provider || "tripo",
      model: job?.model || config.model,
      studioUrl: config.studioUrl,
      reservation: reservationAvailability,
      myReservation: getLatestAvatarReservationForUser(currentUser),
      masterSkeleton: getMasterCatSkeleton(),
      job: job ? { ...job, animations, animationCompatibility } : job,
      warning: job?.warning || "",
      modelUrl: fs.existsSync(TWIN_3D_PATH)
        ? `/api/twin/3d/model?v=${fs.statSync(TWIN_3D_PATH).mtimeMs}`
        : "",
      animations,
      animationCompatibility,
    });
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/3d/reservations") {
    sendJson(response, 200, getReservationAvailability());
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/twin/3d/reservations") {
    try {
      const user = getCurrentUser(request);
      const payload = await readJson(request);
      const result = createAvatarReservation(payload, user);
      sendJson(response, 201, {
        id: result.reservation.id,
        date: result.reservation.date,
        status: result.reservation.status,
        payment: result.reservation.payment,
        imageCount: result.reservation.images.length,
        availability: result.availability,
        storage: result.storage,
      });
    } catch (error) {
      console.error("[Avatar reservation]", error);
      const statusCode = error.message === "PAYLOAD_TOO_LARGE"
        ? 413
        : error.message === "AUTH_REQUIRED"
          ? 401
          : ["ORDER_NOT_FOUND"].includes(error.message)
            ? 404
        : error.message === "DAILY_RESERVATION_LIMIT_REACHED"
          ? 409
          : 400;
      sendJson(response, statusCode, { error: error.message });
    }
    return true;
  }

  const reservationReviewMatch = requestUrl.pathname.match(/^\/api\/twin\/3d\/reservations\/([^/]+)\/review$/);
  if (request.method === "POST" && reservationReviewMatch) {
    try {
      const token = request.headers["x-payment-admin-token"];
      const expectedToken = process.env.PAYMENT_ADMIN_TOKEN || "";
      if (!expectedToken || token !== expectedToken) {
        throw new Error("PAYMENT_CONFIRM_FORBIDDEN");
      }
      const payload = await readJson(request);
      const manifest = reviewAvatarReservationPayment(
        decodeURIComponent(reservationReviewMatch[1]),
        payload.status,
        payload.note,
      );
      sendJson(response, 200, {
        id: manifest.id,
        status: manifest.status,
        payment: manifest.payment,
      });
    } catch (error) {
      const status = error.message === "PAYMENT_CONFIRM_FORBIDDEN"
        ? 403
        : error.message === "RESERVATION_NOT_FOUND"
          ? 404
          : 400;
      sendJson(response, status, { error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/3d/master") {
    sendJson(response, 200, getMasterCatSkeleton());
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/3d/master-rebind") {
    if (!fs.existsSync(TWIN_3D_MASTER_REBIND_PATH)) {
      sendJson(response, 404, { error: "MASTER_REBIND_MODEL_NOT_FOUND" });
      return true;
    }
    const compatibleActions = new Set(["idle", "running", "jumpStart", "jumping", "jumpFall", "jumpEnd"]);
    sendJson(response, 200, {
      modelUrl: `/api/twin/3d/master-rebind/model?v=${fs.statSync(TWIN_3D_MASTER_REBIND_PATH).mtimeMs}`,
      reportUrl: fs.existsSync(TWIN_3D_MASTER_REBIND_REPORT_PATH)
        ? `/api/twin/3d/master-rebind/report?v=${fs.statSync(TWIN_3D_MASTER_REBIND_REPORT_PATH).mtimeMs}`
        : "",
      animations: Object.fromEntries(
        Object.entries(TWIN_3D_ANIMATION_PATHS).map(([name, filePath]) => [
          name,
          compatibleActions.has(name) && fs.existsSync(filePath)
            ? `/api/twin/3d/master-rebind/animations/${name}?v=${fs.statSync(filePath).mtimeMs}`
            : "",
        ]),
      ),
    });
    return true;
  }

  if (
    (request.method === "GET" || request.method === "HEAD")
    && requestUrl.pathname === "/api/twin/3d/master-rebind/model"
  ) {
    if (!fs.existsSync(TWIN_3D_MASTER_REBIND_PATH)) {
      sendJson(response, 404, { error: "MASTER_REBIND_MODEL_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "model/gltf-binary",
      "Content-Length": fs.statSync(TWIN_3D_MASTER_REBIND_PATH).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    fs.createReadStream(TWIN_3D_MASTER_REBIND_PATH).pipe(response);
    return true;
  }

  if (
    (request.method === "GET" || request.method === "HEAD")
    && requestUrl.pathname === "/api/twin/3d/master-rebind/report"
  ) {
    if (!fs.existsSync(TWIN_3D_MASTER_REBIND_REPORT_PATH)) {
      sendJson(response, 404, { error: "MASTER_REBIND_REPORT_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": fs.statSync(TWIN_3D_MASTER_REBIND_REPORT_PATH).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    fs.createReadStream(TWIN_3D_MASTER_REBIND_REPORT_PATH).pipe(response);
    return true;
  }

  const masterRebindAnimationMatch = requestUrl.pathname.match(
    /^\/api\/twin\/3d\/master-rebind\/animations\/(idle|running|jumpStart|jumping|jumpFall|jumpEnd)$/,
  );
  if (request.method === "GET" && masterRebindAnimationMatch) {
    const animationPath = TWIN_3D_ANIMATION_PATHS[masterRebindAnimationMatch[1]];
    if (!fs.existsSync(animationPath)) {
      sendJson(response, 404, { error: "MASTER_REBIND_ANIMATION_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "model/gltf-binary",
      "Content-Length": fs.statSync(animationPath).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(animationPath).pipe(response);
    return true;
  }

  if (
    (request.method === "GET" || request.method === "HEAD")
    && requestUrl.pathname === "/api/twin/3d/master/report"
  ) {
    if (!fs.existsSync(MASTER_CAT_REPORT_PATH)) {
      sendJson(response, 404, { error: "MASTER_CAT_REPORT_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": fs.statSync(MASTER_CAT_REPORT_PATH).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    fs.createReadStream(MASTER_CAT_REPORT_PATH).pipe(response);
    return true;
  }

  if (
    (request.method === "GET" || request.method === "HEAD")
    && requestUrl.pathname === "/api/twin/3d/master/model"
  ) {
    if (!fs.existsSync(MASTER_CAT_GLB_PATH)) {
      sendJson(response, 404, { error: "MASTER_CAT_MODEL_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "model/gltf-binary",
      "Content-Length": fs.statSync(MASTER_CAT_GLB_PATH).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    fs.createReadStream(MASTER_CAT_GLB_PATH).pipe(response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/twin/3d") {
    try {
      const payload = await readJson(request);
      const job = await submitStandardizedTripo3D(payload.images);
      sendJson(response, 202, job);
    } catch (error) {
      console.error("[Tripo submit]", error);
      const statusCode = [
        "TRIPO_API_KEY_NOT_CONFIGURED",
        "ARK_API_KEY_NOT_CONFIGURED",
      ].includes(error.message)
        ? 503
        : error.message === "PAYLOAD_TOO_LARGE"
          ? 413
          : 400;
      sendJson(response, statusCode, { error: error.message });
    }
    return true;
  }

  const standardViewMatch = requestUrl.pathname.match(
    /^\/api\/twin\/3d\/standard-views\/(front|side|back)$/,
  );
  if ((request.method === "GET" || request.method === "HEAD") && standardViewMatch) {
    const view = standardViewMatch[1];
    const imagePath = STANDARD_VIEW_PATHS[view];
    if (!fs.existsSync(imagePath)) {
      sendJson(response, 404, { error: "STANDARD_VIEW_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": fs.existsSync(STANDARD_VIEW_MIME_PATHS[view])
        ? fs.readFileSync(STANDARD_VIEW_MIME_PATHS[view], "utf8").trim()
        : "image/jpeg",
      "Content-Length": fs.statSync(imagePath).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return true;
    }
    fs.createReadStream(imagePath).pipe(response);
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/twin/3d/rebind") {
    try {
      const job = await rebindTripo3D();
      sendJson(response, 202, job);
    } catch (error) {
      console.error("[Tripo rebind]", error);
      sendJson(response, error.message === "TRIPO_API_KEY_NOT_CONFIGURED" ? 503 : 400, {
        error: error.message,
      });
    }
    return true;
  }

  if (request.method === "DELETE" && requestUrl.pathname === "/api/twin/3d") {
    [
      TWIN_3D_PATH,
      TWIN_3D_JOB_PATH,
      ...Object.values(TWIN_3D_ANIMATION_PATHS),
    ].forEach((filePath) => {
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }
      }
    });
    sendJson(response, 200, { ok: true });
    return true;
  }

  const twin3DJobMatch = requestUrl.pathname.match(/^\/api\/twin\/3d\/jobs\/([^/]+)$/);
  if (request.method === "GET" && twin3DJobMatch) {
    try {
      const job = await queryTripo3D(decodeURIComponent(twin3DJobMatch[1]));
      sendJson(response, 200, job);
    } catch (error) {
      console.error("[Tripo query]", error);
      const job = loadTwin3DJob();
      if (job?.sourceTaskId === decodeURIComponent(twin3DJobMatch[1])) {
        job.status = "failed";
        job.error = error.message;
        job.updatedAt = Date.now();
        saveTwin3DJob(job);
      }
      sendJson(response, 400, { error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/3d/model") {
    if (!fs.existsSync(TWIN_3D_PATH)) {
      sendJson(response, 404, { error: "TWIN_3D_MODEL_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "model/gltf-binary",
      "Content-Length": fs.statSync(TWIN_3D_PATH).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(TWIN_3D_PATH).pipe(response);
    return true;
  }

  if (
    request.method === "GET"
    && requestUrl.pathname.startsWith("/api/twin/3d/topology-tests/")
  ) {
    const relativeFile = decodeURIComponent(
      requestUrl.pathname.replace("/api/twin/3d/topology-tests/", ""),
    );
    const testFilePath = path.resolve(TOPOLOGY_TEST_DIR, relativeFile);
    if (
      !testFilePath.startsWith(`${TOPOLOGY_TEST_DIR}${path.sep}`)
      || !fs.existsSync(testFilePath)
      || !fs.statSync(testFilePath).isFile()
    ) {
      sendJson(response, 404, { error: "TOPOLOGY_TEST_FILE_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(testFilePath)] || "application/octet-stream",
      "Content-Length": fs.statSync(testFilePath).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(testFilePath).pipe(response);
    return true;
  }

  const twin3DAnimationMatch = requestUrl.pathname.match(
    /^\/api\/twin\/3d\/animations\/(idle|walking|running|jumpStart|jumping|jumpFall|jumpEnd)$/,
  );
  if (request.method === "GET" && twin3DAnimationMatch) {
    const animationName = twin3DAnimationMatch[1];
    const animationPath = TWIN_3D_ANIMATION_PATHS[animationName];
    if (!fs.existsSync(animationPath)) {
      sendJson(response, 404, { error: "TWIN_3D_ANIMATION_NOT_FOUND" });
      return true;
    }
    const compatibility = getTwinAnimationCompatibility()[animationName];
    if (!compatibility?.compatible) {
      sendJson(response, 409, {
        error: "TWIN_3D_ANIMATION_TARGET_MISMATCH",
        compatibility,
      });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": "model/gltf-binary",
      "Content-Length": fs.statSync(animationPath).size,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    fs.createReadStream(animationPath).pipe(response);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/fusion/image") {
    const token = requestUrl.searchParams.get("token");
    const imagePath = token
      ? path.join(GENERATED_DIR, `ai-fusion-${token}.jpg`)
      : FUSION_IMAGE_PATH;
    const mimePath = token
      ? path.join(GENERATED_DIR, `ai-fusion-${token}.mime`)
      : FUSION_MIME_PATH;
    if (!fs.existsSync(imagePath)) {
      sendJson(response, 404, { error: "FUSION_IMAGE_NOT_FOUND" });
      return true;
    }
    response.writeHead(200, {
      "Content-Type": fs.existsSync(mimePath)
        ? fs.readFileSync(mimePath, "utf8").trim()
        : "image/jpeg",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(imagePath).pipe(response);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/fusion") {
    const provider = process.env.IMAGE_PROVIDER || (
      process.env.ARK_API_KEY ? "volcengine" : "openai"
    );
    const available = provider === "volcengine"
      ? Boolean(process.env.ARK_API_KEY)
      : Boolean(process.env.OPENAI_API_KEY);
    sendJson(response, 200, {
      available,
      provider,
      model: provider === "volcengine"
        ? process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128"
        : process.env.OPENAI_IMAGE_MODEL || "gpt-image-2",
    });
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/twin/fusion") {
    try {
      const payload = await readJson(request);
      const result = await generateFusionMaterial(payload.image || "", payload.direction);
      sendJson(response, 201, result);
    } catch (error) {
      const statusCode = [
        "OPENAI_API_KEY_NOT_CONFIGURED",
        "ARK_API_KEY_NOT_CONFIGURED",
      ].includes(error.message)
        ? 503
        : error.message === "PAYLOAD_TOO_LARGE"
          ? 413
          : 400;
      sendJson(response, statusCode, { error: error.message });
    }
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/twin/events") {
    if (twinClients.size >= MAX_SSE_CLIENTS) {
      sendJson(response, 503, { error: "TOO_MANY_SSE_CLIENTS" });
      return true;
    }
    const user = getRequestUser(request, requestUrl);
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "Connection": "keep-alive",
    });
    applySecurityHeaders(response);
    response.write(`data: ${JSON.stringify(getTwinStateForUser(user?.id))}\n\n`);
    const client = { response, userId: user?.id || null };
    twinClients.add(client);
    request.on("close", () => twinClients.delete(client));
    return true;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/scans") {
    const scanId = createScanId();
    const manifest = {
      id: scanId,
      createdAt: new Date().toISOString(),
      status: "capturing",
      expectedFrames: 24,
      frames: [],
      output: null,
    };
    saveScanManifest(scanId, manifest);
    sendJson(response, 201, manifest);
    return true;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/scans") {
    sendJson(response, 200, { items: listScanManifests() });
    return true;
  }

  const scanMatch = requestUrl.pathname.match(
    /^\/api\/scans\/(\d{8}-[A-Z0-9]{6})(?:\/(frames|complete|reconstruct))?$/,
  );
  if (scanMatch) {
    const [, scanId, action] = scanMatch;
    const manifest = getScanManifest(scanId);
    if (!manifest) {
      sendJson(response, 404, { error: "SCAN_NOT_FOUND" });
      return true;
    }

    if (request.method === "GET" && !action) {
      sendJson(response, 200, manifest);
      return true;
    }

    if (request.method === "POST" && action === "frames") {
      const frameIndex = Number(requestUrl.searchParams.get("index"));
      if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= 48) {
        sendJson(response, 400, { error: "INVALID_FRAME_INDEX" });
        return true;
      }
      if (!String(request.headers["content-type"] || "").startsWith("image/jpeg")) {
        sendJson(response, 415, { error: "JPEG_REQUIRED" });
        return true;
      }

      try {
        const image = await readBinary(request);
        const imageDirectory = path.join(getScanDirectory(scanId), "images");
        fs.mkdirSync(imageDirectory, { recursive: true });
        const frameName = `frame-${String(frameIndex + 1).padStart(3, "0")}.jpg`;
        fs.writeFileSync(path.join(imageDirectory, frameName), image);
        manifest.frames = manifest.frames.filter((frame) => frame.index !== frameIndex);
        manifest.frames.push({
          index: frameIndex,
          file: frameName,
          bytes: image.length,
          capturedAt: new Date().toISOString(),
        });
        manifest.frames.sort((a, b) => a.index - b.index);
        saveScanManifest(scanId, manifest);
        sendJson(response, 201, {
          scanId,
          frameIndex,
          frameCount: manifest.frames.length,
        });
      } catch (error) {
        sendJson(response, error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
          error: error.message,
        });
      }
      return true;
    }

    if (request.method === "POST" && action === "complete") {
      manifest.status = manifest.frames.length >= 12
        ? "ready"
        : "needs-more-frames";
      manifest.completedAt = new Date().toISOString();
      saveScanManifest(scanId, manifest);
      sendJson(response, 200, manifest);
      return true;
    }

    if (request.method === "POST" && action === "reconstruct") {
      try {
        const result = startReconstruction(scanId);
        sendJson(response, 202, result);
      } catch (error) {
        const statusCode = error.message === "SCAN_NOT_FOUND" ? 404 : 400;
        sendJson(response, statusCode, { error: error.message });
      }
      return true;
    }
  }

  const signalMatch = requestUrl.pathname.match(/^\/api\/signal\/([A-Z0-9]{6})\/(receiver|sender)$/);
  if (!signalMatch) {
    return false;
  }

  const [, roomId, role] = signalMatch;
  if (request.method === "POST") {
    try {
      const payload = await readJson(request);
      const entry = postSignal(roomId, role, payload);
      sendJson(response, 202, { id: entry.id });
    } catch (error) {
      sendJson(response, error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, {
        error: error.message,
      });
    }
    return true;
  }

  if (request.method === "GET") {
    const since = Number(requestUrl.searchParams.get("since") || 0);
    const room = getRoom(roomId);
    const immediate = getSignals(roomId, role, since);
    if (immediate.length) {
      sendJson(response, 200, { messages: immediate, serverTime: Date.now() });
      return true;
    }

    let completed = false;
    const complete = () => {
      if (completed) {
        return;
      }
      completed = true;
      clearTimeout(timeout);
      room.waiters = room.waiters.filter((waiter) => waiter !== complete);
      sendJson(response, 200, {
        messages: getSignals(roomId, role, since),
        serverTime: Date.now(),
      });
    };
    const timeout = setTimeout(complete, 20000);
    room.waiters.push(complete);
    request.on("close", () => {
      if (!response.writableEnded) {
        completed = true;
        clearTimeout(timeout);
        room.waiters = room.waiters.filter((waiter) => waiter !== complete);
      }
    });
    return true;
  }

  sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
  return true;
}

function broadcastTwinState(userId = null) {
  const eventUserId = userId || null;
  const event = `data: ${JSON.stringify(getTwinStateForUser(eventUserId))}\n\n`;
  twinClients.forEach((client) => {
    if (client.response.writableEnded) {
      twinClients.delete(client);
    } else if (client.userId === eventUserId) {
      client.response.write(event);
    }
  });
}

function serveStatic(request, response, pathname) {
  if (VENDOR_FILES.has(pathname)) {
    const vendorPath = VENDOR_FILES.get(pathname);
    if (!fs.existsSync(vendorPath)) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Content-Length": fs.statSync(vendorPath).size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(vendorPath).pipe(response);
    return;
  }
  const normalizedPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.resolve(ROOT, `.${decodeURIComponent(normalizedPath)}`);
  const relativePath = path.relative(ROOT, filePath);

  if (
    !filePath.startsWith(ROOT)
    || filePath.startsWith(CERT_DIR)
    || !PUBLIC_FILES.has(relativePath)
  ) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
}

function cleanupRooms() {
  const expiresBefore = Date.now() - MESSAGE_TTL;
  rooms.forEach((room, roomId) => {
    room.messages = room.messages.filter((entry) => entry.createdAt > expiresBefore);
    if (room.createdAt < expiresBefore && !room.messages.length && !room.waiters.length) {
      rooms.delete(roomId);
    }
  });
}

setInterval(cleanupRooms, 60_000).unref();

async function handleRequest(request, response) {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host}`);
    if (requestUrl.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, requestUrl);
      if (!handled) {
        sendJson(response, 404, { error: "NOT_FOUND" });
      }
      return;
    }
    serveStatic(request, response, requestUrl.pathname);
  } catch (error) {
    logger.error("Unhandled request error", { message: error.message, url: request.url });
    if (!response.headersSent) {
      response.writeHead(500);
      response.end("Internal Server Error");
    }
  }
}

// --- Global Error Handlers ---
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { message: error.message, stack: error.stack?.split("\n")[0] });
  process.exitCode = 1;
  setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { message: reason?.message || String(reason) });
});

// --- Graceful Shutdown ---
function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  // Close all SSE connections
  twinClients.forEach((client) => {
    client.response.end();
  });
  twinClients.clear();
  rooms.clear();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// --- Startup ---
if (IS_PRODUCTION) {
  // Production: HTTP-only behind Nginx reverse proxy
  const productionPort = Number(process.env.PORT || 8000);
  const prodServer = http.createServer(handleRequest);
  prodServer.listen(productionPort, "127.0.0.1", () => {
    logger.info(`Production server listening on 127.0.0.1:${productionPort}`);
    prodServer.keepAliveTimeout = 65000; // slightly above Nginx proxy_read_timeout
  });
} else {
  // Development: HTTPS with self-signed cert + HTTP local fallback
  ensureCertificate();

  const server = https.createServer({
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH),
  }, handleRequest);

  server.listen(PORT, HOST, () => {
    logger.info("NEKO.SYNC dev server (HTTPS) running");
    logger.info(`  Computer: http://localhost:${LOCAL_PORT}`);
    getLanAddresses().forEach((host) => {
      logger.info(`  Phone:    https://${host}:${PORT}/sender.html`);
      logger.info(`  CA setup: http://${host}:${CERT_PORT}`);
    });
  });

  const localServer = http.createServer(handleRequest);
  localServer.listen(LOCAL_PORT, "127.0.0.1");

  const certificateServer = http.createServer((request, response) => {
    if (request.url === "/neko-sync-local-ca.crt") {
      response.writeHead(200, {
        "Content-Type": "application/x-x509-ca-cert",
        "Content-Disposition": 'attachment; filename="neko-sync-local-ca.crt"',
        "Cache-Control": "no-store",
      });
      fs.createReadStream(CA_CERT_PATH).pipe(response);
      return;
    }

    const lanAddress = getLanAddresses()[0] || "localhost";
    const html = `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>NEKO.SYNC 证书安装</title>
<style>
body{margin:0;background:#171a16;color:#eef0e7;font:15px/1.7 sans-serif}
main{max-width:520px;margin:auto;padding:36px 24px}
small{color:#c9ff38;letter-spacing:.12em}
h1{font:38px/1.05 Georgia,serif}
p,li{color:#a8ada2}
a{display:block;margin:24px 0;padding:15px;text-align:center;color:#151713;background:#c9ff38;text-decoration:none;font-weight:700}
code{color:#eef0e7}
</style>
<main>
<small>NEKO.SYNC / LOCAL CA</small>
<h1>安装手机信任证书</h1>
<p>这是局域网摄像头 HTTPS 所需的本地 CA，仅用于当前电脑。</p>
<a href="/neko-sync-local-ca.crt">下载 NEKO.SYNC 本地 CA</a>
<ol>
<li>下载并安装证书描述文件。</li>
<li>iPhone：设置 → 通用 → 关于本机 → 证书信任设置，开启完全信任。</li>
<li>然后打开 <code>https://${lanAddress}:${PORT}/sender.html</code>。</li>
</ol>
</main>`;
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(html);
  });

  certificateServer.listen(CERT_PORT, HOST);
}
