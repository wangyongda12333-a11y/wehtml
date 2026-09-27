const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "github-pages");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("GitHub Pages 免费版不依赖登录或后端接口", () => {
  const html = read("index.html");
  const js = read("app.js");
  assert.match(html, /无需注册、无需登录/);
  assert.match(js, /fetch\(`resources\.json/);
  assert.doesNotMatch(`${html} ${js}`, /api\/login|authModal|ADMIN_PASSWORD|membership/);
});

test("静态资源清单和上传说明有效", () => {
  const data = JSON.parse(read("resources.json"));
  assert.ok(Array.isArray(data.resources));
  assert.ok(data.resources.length > 0);
  assert.match(read("UPLOAD-GUIDE.txt"), /downloads\/focusflow\.zip/);
  assert.match(read("app.js"), /function safeFilePath/);
  assert.match(read("app.js"), /value\.includes\("\.\."\)/);
});

test("GitHub Pages 发布文件齐全", () => {
  for (const file of ["index.html", "app.js", "static.css", "resources.json", ".nojekyll", "downloads/.gitkeep"]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, file);
  }
  assert.equal(fs.existsSync(path.resolve(root, "..", "styles.css")), true);
});
