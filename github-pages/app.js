const categories = [
  { name: "Windows", icon: "W", description: "桌面效率与系统工具" },
  { name: "MacOS", icon: "M", description: "创意工作与日常实用" },
  { name: "Android", icon: "A", description: "随身携带的数字工具" },
  { name: "Chrome", icon: "C", description: "扩展你的浏览器体验" },
];

const state = { resources: [], category: "全部", query: "" };
const $ = selector => document.querySelector(selector);

function escapeHTML(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function safeFilePath(value) {
  if (typeof value !== "string" || !value.startsWith("downloads/") || value.includes("..") || /[?#]/.test(value)) return null;
  return encodeURI(value);
}

function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}

function openModal() { $("#detailModal").hidden = false; document.body.style.overflow = "hidden"; }
function closeModal() { $("#detailModal").hidden = true; document.body.style.overflow = ""; }

function renderCategories() {
  $("#categoryStrip").innerHTML = categories.map(category => `<button class="category-button ${state.category === category.name ? "active" : ""}" data-category="${category.name}"><span>${category.icon}</span><div><strong>${category.name}</strong><small>${category.description}</small></div></button>`).join("");
  $("#filterRow").innerHTML = ["全部", ...categories.map(item => item.name)].map(name => `<button class="filter-button ${state.category === name ? "active" : ""}" data-category="${name}">${name}</button>`).join("");
}

function visibleResources() {
  const query = state.query.toLowerCase();
  return state.resources.filter(item => (state.category === "全部" || item.category === state.category) && `${item.title} ${item.description} ${item.category} ${item.subcategory}`.toLowerCase().includes(query));
}

function renderResources() {
  const resources = visibleResources();
  $("#resourceGrid").innerHTML = resources.map(resource => { const file = safeFilePath(resource.file); return `<article class="resource-card" data-resource="${escapeHTML(resource.id)}" tabindex="0" aria-label="查看 ${escapeHTML(resource.title)}"><div class="resource-icon ${escapeHTML(resource.color)}">${escapeHTML(resource.icon)}</div><div><div class="resource-tags"><span>${escapeHTML(resource.category)}</span><span>${escapeHTML(resource.subcategory)}</span>${file ? '<span class="plus-tag">可下载</span>' : ""}</div><h3>${escapeHTML(resource.title)}</h3><p>${escapeHTML(resource.description)}</p><div class="resource-meta"><span>v${escapeHTML(resource.version)}</span><span>${file ? "↓ 公开下载" : "暂未上传"}</span></div></div></article>`; }).join("");
  $("#emptyState").hidden = resources.length > 0;
  $("#resourceStat").textContent = state.resources.length;
  renderCategories();
}

function openResource(id) {
  const resource = state.resources.find(item => item.id === id);
  if (!resource) return;
  const file = safeFilePath(resource.file);
  const action = file ? `<a class="download-button static-download" href="${file}" download>免费下载 ↓</a>` : '<button class="download-button" disabled>文件暂未上传</button>';
  $("#detailContent").innerHTML = `<div class="detail-hero"><div class="resource-icon ${escapeHTML(resource.color)}">${escapeHTML(resource.icon)}</div><div><div class="resource-tags"><span>${escapeHTML(resource.category)}</span><span>${escapeHTML(resource.subcategory)}</span></div><h2 id="detailTitle">${escapeHTML(resource.title)}</h2><p>${escapeHTML(resource.description)}</p></div></div><div class="detail-info"><div><strong>v${escapeHTML(resource.version)}</strong><span>当前版本</span></div><div><strong>${resource.file ? "公开" : "等待"}</strong><span>下载状态</span></div><div><strong>${new Date(resource.createdAt).toLocaleDateString("zh-CN")}</strong><span>更新时间</span></div></div>${resource.content ? `<div class="resource-content">${escapeHTML(resource.content)}</div>` : ""}${action}`;
  openModal();
}

async function loadResources() {
  try {
    const response = await fetch(`resources.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("资源清单加载失败");
    const data = await response.json();
    state.resources = Array.isArray(data.resources) ? data.resources : [];
    renderResources();
  } catch (error) { showToast(error.message); }
}

document.addEventListener("click", event => {
  const category = event.target.closest("[data-category]");
  const resource = event.target.closest("[data-resource]");
  if (category) { state.category = category.dataset.category; renderResources(); $("#resources").scrollIntoView({ behavior: "smooth" }); }
  if (resource) openResource(resource.dataset.resource);
  if (event.target.closest("[data-close-modal]") || event.target === $("#detailModal")) closeModal();
});

$("#resourceGrid").addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target.closest("[data-resource]")) { event.preventDefault(); openResource(event.target.closest("[data-resource]").dataset.resource); } });
$("#searchInput").addEventListener("input", event => { state.query = event.target.value.trim(); renderResources(); });
$("#searchFocus").addEventListener("click", () => $("#searchInput").focus());
document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
renderCategories();
loadResources();
