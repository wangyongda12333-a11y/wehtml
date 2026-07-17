const categories = [
  { name: "Windows", icon: "W", description: "桌面效率与系统工具" },
  { name: "MacOS", icon: "M", description: "创意工作与日常实用" },
  { name: "Android", icon: "A", description: "随身携带的数字工具" },
  { name: "Chrome", icon: "C", description: "扩展你的浏览器体验" },
];

const state = { resources: [], category: "全部", query: "", user: null };
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

async function api(url, options = {}) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(body?.error || "请求失败");
  return body;
}

function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}

function openModal(selector) { $(selector).hidden = false; document.body.style.overflow = "hidden"; }
function closeModals() {
  $$(".modal-backdrop").forEach(modal => { modal.hidden = true; });
  document.body.style.overflow = "";
  if (window.location.hash === "#login") history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function escapeHTML(value) {
  const element = document.createElement("span");
  element.textContent = String(value);
  return element.innerHTML;
}

function renderCategories() {
  $("#categoryStrip").innerHTML = categories.map(category => `
    <button class="category-button ${state.category === category.name ? "active" : ""}" data-category="${category.name}">
      <span>${category.icon}</span><div><strong>${category.name}</strong><small>${category.description}</small></div>
    </button>
  `).join("");
  $("#filterRow").innerHTML = ["全部", ...categories.map(item => item.name)].map(name => `<button class="filter-button ${state.category === name ? "active" : ""}" data-category="${name}">${name}</button>`).join("");
}

function resourceCard(resource) {
  return `<article class="resource-card" data-resource="${resource.id}" tabindex="0" aria-label="查看 ${resource.title}">
    <div class="resource-icon ${resource.color}">${resource.icon}</div>
    <div><div class="resource-top"><div class="resource-tags"><span>${resource.category}</span><span>${resource.subcategory}</span>${resource.memberOnly ? '<span class="plus-tag">X.Z.C+</span>' : ""}</div></div>
    <h3>${resource.title}</h3><p>${resource.description}</p><div class="resource-meta"><span>v${resource.version}</span><span>↓ ${resource.downloads.toLocaleString("zh-CN")}</span></div></div>
  </article>`;
}

async function loadResources() {
  const params = new URLSearchParams();
  if (state.category !== "全部") params.set("category", state.category);
  if (state.query) params.set("q", state.query);
  try {
    const data = await api(`/api/resources?${params}`);
    state.resources = data.resources;
    $("#resourceGrid").innerHTML = state.resources.map(resourceCard).join("");
    $("#emptyState").hidden = state.resources.length > 0;
    $("#resourceStat").textContent = state.resources.length;
    renderCategories();
  } catch (error) { showToast(error.message); }
}

function renderUser() {
  const user = state.user;
  $("#loginButton").hidden = Boolean(user);
  $("#userButton").hidden = !user;
  $("#memberAction").textContent = user ? "会员权益已生效 ✓" : "会员登录 →";
  if (!user) return;
  const initial = user.username.slice(0, 1).toUpperCase();
  $("#userInitial").textContent = initial;
  $("#userName").textContent = user.username;
  $("#accountInitial").textContent = initial;
  $("#accountName").textContent = user.username;
  $("#accountRole").textContent = user.role === "admin" ? "管理员 · X.Z.C+" : "X.Z.C 会员";
  $("#adminEntry").hidden = user.role !== "admin";
}

async function loadUser() {
  try {
    state.user = (await api("/api/me")).user;
    renderUser();
  } catch { state.user = null; renderUser(); }
}

function setCategory(category) {
  state.category = category;
  loadResources();
  $("#resources").scrollIntoView({ behavior: "smooth" });
  $("#mainNav").classList.remove("open");
}

async function openResource(id) {
  try {
    const { resource } = await api(`/api/resources/${id}`);
    $("#detailContent").innerHTML = `<div class="detail-hero"><div class="resource-icon ${resource.color}">${resource.icon}</div><div><div class="resource-tags"><span>${resource.category}</span><span>${resource.subcategory}</span>${resource.memberOnly ? '<span class="plus-tag">X.Z.C+</span>' : ""}</div><h2 id="detailTitle">${resource.title}</h2><p>${resource.description}</p></div></div><div class="detail-info"><div><strong>v${resource.version}</strong><span>当前版本</span></div><div><strong>${resource.downloads.toLocaleString("zh-CN")}</strong><span>累计下载</span></div><div><strong>${new Date(resource.createdAt).toLocaleDateString("zh-CN")}</strong><span>更新时间</span></div></div><button class="download-button" data-download="${resource.id}">${resource.memberOnly ? "X.Z.C 会员下载" : "免费下载"} ↓</button>`;
    openModal("#detailModal");
  } catch (error) { showToast(error.message); }
}

async function downloadResource(id) {
  try {
    const response = await fetch(`/api/download/${id}`);
    if (!response.ok) { const body = await response.json(); if (response.status === 401) openAuth(); throw new Error(body.error); }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = match ? decodeURIComponent(match[1]) : "resource-file"; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    showToast("下载已开始"); loadResources();
  } catch (error) {
    showToast(error.message);
  }
}

function openAuth() {
  $("#authError").textContent = "";
  openModal("#authModal");
  if (window.location.hash !== "#login") history.pushState(null, "", "#login");
}

function handleAuthShortcut() {
  if (window.location.hash === "#login") openAuth();
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function renderAdminResources() {
  const [{ resources }, { users }] = await Promise.all([api("/api/resources"), api("/api/users")]);
  $("#adminResourceList").innerHTML = resources.map(item => `<div class="admin-item"><span class="resource-icon ${item.color}">${item.icon}</span><div><strong>${item.title}</strong><small>${item.category} · v${item.version}</small></div><button data-delete="${item.id}">删除</button></div>`).join("");
  $("#adminUserList").innerHTML = users.map(user => `<div class="admin-user"><span>${escapeHTML(user.username.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHTML(user.username)}</strong><small>${user.role === "admin" ? "管理员" : "X.Z.C 会员"}</small></div>${user.role === "admin" ? "" : `<button class="member-toggle" data-delete-user="${user.id}">删除会员</button>`}</div>`).join("");
}

document.addEventListener("click", async event => {
  const category = event.target.closest("[data-category]");
  const categoryLink = event.target.closest("[data-category-link]");
  const query = event.target.closest("[data-query]");
  const resource = event.target.closest("[data-resource]");
  const download = event.target.closest("[data-download]");
  const deleteButton = event.target.closest("[data-delete]");
  const deleteUserButton = event.target.closest("[data-delete-user]");
  if (category) setCategory(category.dataset.category);
  if (categoryLink) setCategory(categoryLink.dataset.categoryLink);
  if (query) { state.query = query.dataset.query; $("#searchInput").value = state.query; loadResources(); }
  if (resource) openResource(resource.dataset.resource);
  if (download) downloadResource(download.dataset.download);
  if (event.target.closest("[data-close-modal]")) closeModals();
  if (event.target.classList.contains("modal-backdrop")) closeModals();
  if (deleteButton && confirm("确定删除这个资源吗？")) { try { await api(`/api/resources/${deleteButton.dataset.delete}`, { method: "DELETE" }); showToast("资源已删除"); await renderAdminResources(); await loadResources(); } catch (error) { showToast(error.message); } }
  if (deleteUserButton && confirm("确定删除这个会员账号吗？")) { try { await api(`/api/users/${deleteUserButton.dataset.deleteUser}`, { method: "DELETE" }); showToast("会员账号已删除"); await renderAdminResources(); } catch (error) { showToast(error.message); } }
});

$("#resourceGrid").addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target.closest("[data-resource]")) { event.preventDefault(); openResource(event.target.closest("[data-resource]").dataset.resource); } });
$("#loginButton").addEventListener("click", openAuth);
$("#userButton").addEventListener("click", () => openModal("#userModal"));
$("#mobileMenu").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
$("#searchFocus").addEventListener("click", () => { $("#searchInput").focus(); window.scrollTo({ top: 70, behavior: "smooth" }); });
$("#dismissAnnouncement").addEventListener("click", event => event.currentTarget.parentElement.remove());
$("#memberAction").addEventListener("click", () => state.user ? openModal("#userModal") : openAuth());
$("#searchInput").addEventListener("input", event => { state.query = event.target.value.trim(); clearTimeout(loadResources.timer); loadResources.timer = setTimeout(loadResources, 250); });
$("#authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify(data) });
    state.user = result.user; await loadUser(); closeModals(); event.currentTarget.reset(); showToast("登录成功");
  } catch (error) { $("#authError").textContent = error.message; }
});

$("#logoutButton").addEventListener("click", async () => { await api("/api/logout", { method: "POST", body: "{}" }); state.user = null; renderUser(); closeModals(); showToast("已退出登录"); });
$("#adminEntry").addEventListener("click", async () => { closeModals(); await renderAdminResources(); openModal("#adminModal"); });
$("#memberForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget));
  try { await api("/api/users", { method: "POST", body: JSON.stringify(payload) }); event.currentTarget.reset(); $("#memberError").textContent = ""; showToast("会员账号已创建"); await renderAdminResources(); }
  catch (error) { $("#memberError").textContent = error.message; }
});
$("#resourceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const file = form.get("file");
  const payload = { title: form.get("title"), category: form.get("category"), subcategory: form.get("subcategory"), description: form.get("description"), version: form.get("version"), icon: form.get("icon"), memberOnly: form.get("memberOnly") === "on", color: ["blue", "violet", "orange", "green", "cyan", "rose"][Math.floor(Math.random() * 6)] };
  if (file?.size) {
    if (file.size > 10 * 1024 * 1024) { $("#adminError").textContent = "文件不能超过 10 MB"; return; }
    payload.file = { name: file.name, type: file.type, data: await fileAsBase64(file) };
  }
  try { await api("/api/resources", { method: "POST", body: JSON.stringify(payload) }); event.currentTarget.reset(); $("#adminError").textContent = ""; showToast("资源发布成功"); await renderAdminResources(); await loadResources(); }
  catch (error) { $("#adminError").textContent = error.message; }
});

document.addEventListener("keydown", event => { if (event.key === "Escape") closeModals(); });
window.addEventListener("hashchange", handleAuthShortcut);
handleAuthShortcut();
renderCategories();
loadUser();
loadResources();
