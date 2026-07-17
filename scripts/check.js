const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const files = ["index.html", "styles.css", "app.js"];
let failed = false;

for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (/\t|[ \t]+$/m.test(text)) {
    console.error(`${file}: 包含制表符或行尾空格`);
    failed = true;
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
if (duplicates.length) {
  console.error(`index.html: 存在重复 id: ${[...new Set(duplicates)].join(", ")}`);
  failed = true;
}

if (failed) process.exit(1);
console.log("静态检查通过");
