const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server");

function request(base, pathname, options = {}) {
  return fetch(`${base}${pathname}`, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
}

async function startTestServer(t, prefix) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const server = createApp({ dataDir: path.join(temporary, "data"), uploadDir: path.join(temporary, "uploads") });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.close(); fs.rmSync(temporary, { recursive: true, force: true }); });
  return `http://127.0.0.1:${server.address().port}`;
}

test("游客下载免费资源，会员下载付费资源", async t => {
  const base = await startTestServer(t, "xzc-download-");

  const registration = await request(base, "/api/register", { method: "POST", body: JSON.stringify({ username: "visitor", password: "password123" }) });
  assert.equal(registration.status, 404);

  const adminLogin = await request(base, "/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "admin1234" }) });
  assert.equal(adminLogin.status, 200);
  const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];

  const memberCreation = await request(base, "/api/users", { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ username: "paidmember", password: "password123" }) });
  assert.equal(memberCreation.status, 201);
  assert.equal((await memberCreation.json()).user.member, true);

  const memberLogin = await request(base, "/api/login", { method: "POST", body: JSON.stringify({ username: "paidmember", password: "password123" }) });
  assert.equal(memberLogin.status, 200);
  const memberCookie = memberLogin.headers.get("set-cookie").split(";")[0];

  const basePayload = {
    category: "Windows", subcategory: "测试", description: "用于验证下载权限", version: "1.0.0", icon: "TEST",
    file: { name: "hello.txt", type: "text/plain", data: Buffer.from("hello xzc").toString("base64") },
  };
  const freeCreation = await request(base, "/api/resources", { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ ...basePayload, title: "免费资源", memberOnly: false }) });
  const paidCreation = await request(base, "/api/resources", { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ ...basePayload, title: "付费资源", memberOnly: true }) });
  assert.equal(freeCreation.status, 201);
  assert.equal(paidCreation.status, 201);
  const freeResource = (await freeCreation.json()).resource;
  const paidResource = (await paidCreation.json()).resource;

  const guestFreeDownload = await request(base, `/api/download/${freeResource.id}`);
  assert.equal(guestFreeDownload.status, 200);
  assert.equal(await guestFreeDownload.text(), "hello xzc");

  const guestPaidDownload = await request(base, `/api/download/${paidResource.id}`);
  assert.equal(guestPaidDownload.status, 401);

  const memberPaidDownload = await request(base, `/api/download/${paidResource.id}`, { headers: { Cookie: memberCookie } });
  assert.equal(memberPaidDownload.status, 200);

  const forbiddenPublish = await request(base, "/api/resources", { method: "POST", headers: { Cookie: memberCookie }, body: JSON.stringify({ ...basePayload, title: "越权资源" }) });
  assert.equal(forbiddenPublish.status, 403);

  const comments = await request(base, `/api/resources/${freeResource.id}/comments`);
  assert.equal(comments.status, 404);
});

test("只有管理员可以创建和删除会员账号", async t => {
  const base = await startTestServer(t, "xzc-member-");
  const unauthorized = await request(base, "/api/users", { method: "POST", body: JSON.stringify({ username: "newmember", password: "password123" }) });
  assert.equal(unauthorized.status, 403);

  const adminLogin = await request(base, "/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: "admin1234" }) });
  const adminCookie = adminLogin.headers.get("set-cookie").split(";")[0];
  const created = await request(base, "/api/users", { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ username: "newmember", password: "password123" }) });
  assert.equal(created.status, 201);
  const member = (await created.json()).user;

  const duplicate = await request(base, "/api/users", { method: "POST", headers: { Cookie: adminCookie }, body: JSON.stringify({ username: "newmember", password: "password456" }) });
  assert.equal(duplicate.status, 409);

  const users = await request(base, "/api/users", { headers: { Cookie: adminCookie } }).then(response => response.json());
  assert.equal(users.users.some(user => user.username === "newmember" && user.member), true);

  const deletion = await request(base, `/api/users/${member.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
  assert.equal(deletion.status, 200);
  const deletedLogin = await request(base, "/api/login", { method: "POST", body: JSON.stringify({ username: "newmember", password: "password123" }) });
  assert.equal(deletedLogin.status, 401);
});

test("未登录用户不能访问管理接口", async t => {
  const base = await startTestServer(t, "xzc-auth-");
  assert.equal((await request(base, "/api/users")).status, 403);
  assert.equal((await request(base, "/api/resources", { method: "POST", body: "{}" })).status, 403);
  const health = await request(base, "/api/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
});

test("管理员账号可通过部署环境变量初始化", async t => {
  const previousUsername = process.env.ADMIN_USERNAME;
  const previousPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_USERNAME = "cloudadmin";
  process.env.ADMIN_PASSWORD = "cloud-password-123";
  t.after(() => {
    if (previousUsername === undefined) delete process.env.ADMIN_USERNAME; else process.env.ADMIN_USERNAME = previousUsername;
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD; else process.env.ADMIN_PASSWORD = previousPassword;
  });
  const base = await startTestServer(t, "xzc-env-");
  const login = await request(base, "/api/login", { method: "POST", body: JSON.stringify({ username: "cloudadmin", password: "cloud-password-123" }) });
  assert.equal(login.status, 200);
});
