const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("GitHub Pages 前端使用 Supabase 而不是本机 API", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /supabase-config\.js/);
  assert.match(app, /\/auth\/v1\/token/);
  assert.match(app, /\/rest\/v1\/resources/);
  assert.match(app, /\/storage\/v1\/object\/authenticated/);
  assert.match(app, /\/functions\/v1\/\$\{encodeURIComponent\(functionName\)\}/);
  assert.match(read("supabase-config.js"), /adminFunction: "hyper-action"/);
  assert.doesNotMatch(app, /fetch\(["'`]\/api\//);
});

test("浏览器配置不包含高权限密钥", () => {
  const config = read("supabase-config.js");
  const browserFiles = `${config}\n${read("app.js")}\n${read("index.html")}`;
  assert.match(config, /anonKey/);
  assert.doesNotMatch(browserFiles, /SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test("数据库脚本启用 RLS 并区分游客、会员和管理员", () => {
  const sql = read("supabase/schema.sql");
  for (const requirement of [
    /alter table public\.profiles enable row level security/i,
    /alter table public\.resources enable row level security/i,
    /member_only = false or public\.is_member\(\)/i,
    /resources_admin_insert/i,
    /resource_files_admin_insert/i,
    /file_size_limit/i,
    /increment_download/i,
  ]) assert.match(sql, requirement);
  assert.match(sql, /public = false/i);
});

test("会员管理函数在执行操作前验证管理员", () => {
  const edge = read("supabase/functions/admin-users/index.ts");
  assert.match(edge, /requireAdmin/);
  assert.match(edge, /role=eq\.admin/);
  assert.match(edge, /\/auth\/v1\/admin\/users/);
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(read("supabase-config.js"), /SUPABASE_SERVICE_ROLE_KEY/);
});

test("管理员可以发布详细文本和最大 50 MB 文件", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /name="content"/);
  assert.match(html, /最大 50 MB/);
  assert.match(app, /50 \* 1024 \* 1024/);
  assert.match(app, /file_path/);
});

test("异步表单会保留表单引用并使用安全的 Storage 对象名", () => {
  const app = read("app.js");
  assert.doesNotMatch(app, /event\.currentTarget\.reset\(\)/);
  assert.match(app, /const formElement = event\.currentTarget/);
  assert.match(app, /newFilePath = `\$\{crypto\.randomUUID\(\)\}\$\{extension\}`/);
  assert.match(app, /file_name: file\?\.size \? file\.name : null/);
  assert.match(app, /newFilePath && !resourceSaved/);
});

test("删除资源时允许对应的 Storage 文件已经不存在", () => {
  const app = read("app.js");
  assert.match(app, /removeStorageObject\(resource\.filePath, \{ ignoreMissing: true \}\)/);
  assert.match(app, /ignoreMissing && \/object not found\|not\[_ -\]\?found\/i/);
  assert.match(app, /\/rest\/v1\/resources\?id=eq\./);
});

test("管理员可以编辑已发布资源并替换丢失的文件", () => {
  const html = read("index.html");
  const app = read("app.js");
  assert.match(html, /id="resourceFormTitle"/);
  assert.match(html, /id="cancelResourceEdit"/);
  assert.match(app, /data-edit=/);
  assert.match(app, /function startEditResource/);
  assert.match(app, /method: "PATCH"/);
  assert.match(app, /payload\.updated_at = new Date\(\)\.toISOString\(\)/);
  assert.match(app, /替换资源文件/);
});

test("资源支持详细文字、观看权限和封面照片", () => {
  const html = read("index.html");
  const app = read("app.js");
  const sql = read("supabase/schema.sql");
  const migration = read("supabase/migrations/20260719_resource_editor.sql");
  assert.match(html, /详细文字内容/);
  assert.match(html, /name="memberOnly"/);
  assert.match(html, /仅会员可观看和下载/);
  assert.match(html, /name="cover"/);
  assert.match(app, /coverBucket = "resource-covers"/);
  assert.match(app, /cover_path/);
  assert.match(app, /5 \* 1024 \* 1024/);
  assert.match(sql, /using \(member_only = false or public\.is_member\(\)\)/i);
  assert.match(sql, /resource-covers/);
  assert.match(migration, /add column if not exists cover_path/i);
  assert.match(migration, /add column if not exists updated_at/i);
  assert.match(migration, /resource_covers_admin_insert/i);
});

test("大文件上传显示进度并防止重复提交", () => {
  const html = read("index.html");
  const app = read("app.js");
  const css = read("styles.css");
  assert.match(html, /id="uploadStatus"/);
  assert.match(html, /id="uploadProgress"/);
  assert.match(html, /不要重复点击发布按钮/);
  assert.match(app, /new XMLHttpRequest\(\)/);
  assert.match(app, /request\.upload\.addEventListener\("progress"/);
  assert.match(app, /request\.timeout = 10 \* 60 \* 1000/);
  assert.match(app, /resourceSubmitButton"\)\.disabled = submitting/);
  assert.match(app, /上传失败，可直接重试/);
  assert.match(css, /\.upload-status/);
  assert.match(css, /\.primary-button:disabled/);
});
