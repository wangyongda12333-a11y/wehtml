const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("页面包含原创资源门户的核心区域", () => {
  const html = read("index.html");
  for (const id of ["searchInput", "categoryStrip", "resourceGrid", "authModal", "detailModal", "adminModal"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /X\.Z\.C 资源站/);
});

test("页面不包含参考站点的品牌或具体资源内容", () => {
  const content = `${read("index.html")} ${read("app.js")}`;
  for (const forbidden of ["joker.ps", "鹏少资源", "CCleaner", "BitComet", "CleanMyMac"]) {
    assert.doesNotMatch(content, new RegExp(forbidden, "i"));
  }
});

test("品牌文字不再显示方形 X 标识", () => {
  assert.doesNotMatch(read("index.html"), /brand-symbol|modal-mark/);
});

test("前端支持分类、搜索、会员管理与下载交互", () => {
  const js = read("app.js");
  for (const feature of ["loadResources", "openResource", "downloadResource", "resourceForm", "memberForm"]) {
    assert.match(js, new RegExp(feature));
  }
});

test("页面仅保留会员登录并移除注册与评论", () => {
  const html = read("index.html");
  const js = read("app.js");
  assert.match(html, /会员登录/);
  assert.match(html, /id="memberForm"/);
  assert.doesNotMatch(html, /data-auth-tab="register"|href="#register"|membershipModal|membershipForm/);
  assert.doesNotMatch(js, /api\/register|commentSection|\/comments|membership\/apply/);
});

test("页面明确免费和会员下载规则", () => {
  const content = `${read("index.html")} ${read("app.js")}`;
  assert.match(content, /免费资源无需登录/);
  assert.match(content, /免费下载/);
  assert.match(content, /X\.Z\.C 会员下载/);
});

test("页面资源存在且提供响应式布局", () => {
  const html = read("index.html");
  const css = read("styles.css");
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
  assert.match(css, /@media\(max-width:700px\)/);
});
