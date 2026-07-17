const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DEFAULT_DATA_DIR = path.join(ROOT, "data");
const DEFAULT_UPLOAD_DIR = path.join(ROOT, "uploads");
const MAX_BODY = 15 * 1024 * 1024;
const sessions = new Map();
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
]);

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(part => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function safeUser(user) {
  return user ? { id: user.id, username: user.username, role: user.role, member: user.member, createdAt: user.createdAt } : null;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function validPassword(password, user) {
  const actual = crypto.scryptSync(password, user.salt, 64);
  const expected = Buffer.from(user.passwordHash, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error("请求内容过大"), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
      catch { reject(Object.assign(new Error("JSON 格式无效"), { status: 400 })); }
    });
    req.on("error", reject);
  });
}

function createStore(dataDir = DEFAULT_DATA_DIR) {
  const file = path.join(dataDir, "db.json");
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ users: [], resources: [] }, null, 2));
  return {
    read() { return JSON.parse(fs.readFileSync(file, "utf8")); },
    write(data) {
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
      fs.renameSync(temporary, file);
    },
  };
}

function ensureAdmin(store) {
  const data = store.read();
  data.users = (data.users || []).filter(user => user.role === "admin" || user.member === true);
  delete data.comments;
  delete data.membershipApplications;
  if (!data.users.some(user => user.role === "admin")) {
    const password = process.env.ADMIN_PASSWORD || "admin1234";
    const passwordData = hashPassword(password);
    data.users.push({ id: crypto.randomUUID(), username: "admin", role: "admin", member: true, passwordHash: passwordData.hash, salt: passwordData.salt, createdAt: new Date().toISOString() });
  }
  store.write(data);
}

function currentUser(req, store) {
  const token = parseCookies(req).session;
  const userId = token && sessions.get(token);
  return userId ? store.read().users.find(user => user.id === userId) || null : null;
}

function setSession(res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, userId);
  return `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`;
}

function createApp(options = {}) {
  const store = createStore(options.dataDir);
  const uploadDir = options.uploadDir || DEFAULT_UPLOAD_DIR;
  fs.mkdirSync(uploadDir, { recursive: true });
  ensureAdmin(store);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && staticFiles.has(url.pathname)) {
        const [file, type] = staticFiles.get(url.pathname);
        res.writeHead(200, { "Content-Type": type, "X-Content-Type-Options": "nosniff" });
        fs.createReadStream(path.join(ROOT, file)).pipe(res);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/me") {
        json(res, 200, { user: safeUser(currentUser(req, store)) }); return;
      }

      if (req.method === "POST" && url.pathname === "/api/login") {
        const body = await readBody(req);
        const user = store.read().users.find(item => item.username.toLowerCase() === String(body.username || "").trim().toLowerCase());
        if (!user || (user.role !== "admin" && !user.member) || !validPassword(String(body.password || ""), user)) { json(res, 401, { error: "会员账号或密码错误" }); return; }
        json(res, 200, { user: safeUser(user) }, { "Set-Cookie": setSession(res, user.id) }); return;
      }

      if (req.method === "POST" && url.pathname === "/api/logout") {
        const token = parseCookies(req).session;
        if (token) sessions.delete(token);
        json(res, 200, { ok: true }, { "Set-Cookie": "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" }); return;
      }

      if (req.method === "GET" && url.pathname === "/api/resources") {
        const query = (url.searchParams.get("q") || "").toLowerCase();
        const category = url.searchParams.get("category") || "全部";
        const data = store.read();
        const resources = data.resources.filter(item => (category === "全部" || item.category === category) && `${item.title} ${item.description} ${item.subcategory}`.toLowerCase().includes(query));
        json(res, 200, { resources: resources.map(({ file, ...item }) => ({ ...item, hasFile: Boolean(file) })) }); return;
      }

      const resourceMatch = url.pathname.match(/^\/api\/resources\/([^/]+)$/);
      if (req.method === "GET" && resourceMatch) {
        const resource = store.read().resources.find(item => item.id === resourceMatch[1]);
        if (!resource) { json(res, 404, { error: "资源不存在" }); return; }
        const { file, ...safeResource } = resource;
        json(res, 200, { resource: { ...safeResource, hasFile: Boolean(file) } }); return;
      }

      if (req.method === "POST" && url.pathname === "/api/resources") {
        const user = currentUser(req, store);
        if (user?.role !== "admin") { json(res, 403, { error: "需要管理员权限" }); return; }
        const body = await readBody(req);
        if (!body.title || !body.category || !body.description) { json(res, 400, { error: "标题、分类和简介不能为空" }); return; }
        let storedFile = null;
        if (body.file?.data && body.file?.name) {
          const buffer = Buffer.from(body.file.data, "base64");
          if (buffer.length > 10 * 1024 * 1024) { json(res, 413, { error: "单个文件不能超过 10 MB" }); return; }
          const storedName = `${crypto.randomUUID()}-${path.basename(body.file.name).replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
          fs.writeFileSync(path.join(uploadDir, storedName), buffer);
          storedFile = { storedName, originalName: path.basename(body.file.name), type: String(body.file.type || "application/octet-stream"), size: buffer.length };
        }
        const resource = { id: crypto.randomUUID(), title: String(body.title).slice(0, 80), description: String(body.description).slice(0, 240), category: String(body.category).slice(0, 30), subcategory: String(body.subcategory || "其他").slice(0, 30), version: String(body.version || "1.0.0").slice(0, 20), color: String(body.color || "blue"), icon: String(body.icon || "NEW").slice(0, 4), memberOnly: Boolean(body.memberOnly), downloads: 0, createdAt: new Date().toISOString(), file: storedFile };
        const data = store.read(); data.resources.unshift(resource); store.write(data);
        const { file, ...safeResource } = resource;
        json(res, 201, { resource: { ...safeResource, hasFile: Boolean(file) } }); return;
      }

      if (req.method === "DELETE" && resourceMatch) {
        const user = currentUser(req, store);
        if (user?.role !== "admin") { json(res, 403, { error: "需要管理员权限" }); return; }
        const data = store.read();
        const index = data.resources.findIndex(item => item.id === resourceMatch[1]);
        if (index < 0) { json(res, 404, { error: "资源不存在" }); return; }
        const [removed] = data.resources.splice(index, 1);
        store.write(data);
        if (removed.file) { const target = path.join(uploadDir, removed.file.storedName); if (fs.existsSync(target)) fs.unlinkSync(target); }
        json(res, 200, { ok: true }); return;
      }

      if (req.method === "POST" && url.pathname === "/api/users") {
        const admin = currentUser(req, store);
        if (admin?.role !== "admin") { json(res, 403, { error: "需要管理员权限" }); return; }
        const body = await readBody(req);
        const username = String(body.username || "").trim();
        const password = String(body.password || "");
        if (!/^[\w\u4e00-\u9fa5]{3,20}$/.test(username) || password.length < 8) { json(res, 400, { error: "用户名需为 3–20 个字符，初始密码至少 8 位" }); return; }
        const data = store.read();
        if (data.users.some(user => user.username.toLowerCase() === username.toLowerCase())) { json(res, 409, { error: "用户名已存在" }); return; }
        const passwordData = hashPassword(password);
        const user = { id: crypto.randomUUID(), username, role: "user", member: true, passwordHash: passwordData.hash, salt: passwordData.salt, createdAt: new Date().toISOString() };
        data.users.push(user); store.write(data);
        json(res, 201, { user: safeUser(user) }); return;
      }

      if (req.method === "GET" && url.pathname === "/api/users") {
        const admin = currentUser(req, store);
        if (admin?.role !== "admin") { json(res, 403, { error: "需要管理员权限" }); return; }
        json(res, 200, { users: store.read().users.filter(user => user.role === "admin" || user.member).map(safeUser) }); return;
      }

      const userMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
      if (req.method === "DELETE" && userMatch) {
        const admin = currentUser(req, store);
        if (admin?.role !== "admin") { json(res, 403, { error: "需要管理员权限" }); return; }
        const data = store.read();
        const index = data.users.findIndex(user => user.id === userMatch[1] && user.role !== "admin");
        if (index < 0) { json(res, 404, { error: "会员账号不存在" }); return; }
        const [removed] = data.users.splice(index, 1);
        for (const [token, userId] of sessions) if (userId === removed.id) sessions.delete(token);
        store.write(data); json(res, 200, { ok: true }); return;
      }

      const downloadMatch = url.pathname.match(/^\/api\/download\/([^/]+)$/);
      if (req.method === "GET" && downloadMatch) {
        const data = store.read(); const resource = data.resources.find(item => item.id === downloadMatch[1]);
        if (!resource) { json(res, 404, { error: "资源不存在" }); return; }
        const user = currentUser(req, store);
        if (resource.memberOnly && !user) { json(res, 401, { error: "此资源仅限会员，请使用会员账号登录" }); return; }
        if (resource.memberOnly && !user?.member && user?.role !== "admin") { json(res, 403, { error: "此资源仅限会员下载" }); return; }
        if (!resource.file) { json(res, 404, { error: "演示资源暂未附带文件" }); return; }
        const target = path.join(uploadDir, resource.file.storedName);
        if (!fs.existsSync(target)) { json(res, 404, { error: "文件不存在" }); return; }
        resource.downloads += 1; store.write(data);
        res.writeHead(200, { "Content-Type": resource.file.type, "Content-Length": resource.file.size, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(resource.file.originalName)}`, "X-Content-Type-Options": "nosniff" });
        fs.createReadStream(target).pipe(res); return;
      }

      json(res, 404, { error: "页面不存在" });
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : "服务器内部错误" });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4317);
  const server = createApp();
  server.listen(port, "127.0.0.1", () => {
    console.log(`X.Z.C 资源站：http://127.0.0.1:${port}`);
    if (!process.env.ADMIN_PASSWORD) console.log("本地演示管理员：admin / admin1234（公开部署前必须修改）");
  });
}

module.exports = { createApp, hashPassword };
