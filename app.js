const categories = [
  { name: "Windows", icon: "W", description: "桌面效率与系统工具" },
  { name: "MacOS", icon: "M", description: "创意工作与日常实用" },
  { name: "Android", icon: "A", description: "随身携带的数字工具" },
  { name: "Chrome", icon: "C", description: "扩展你的浏览器体验" },
];

const config = window.XZC_SUPABASE || {};
const state = { resources: [], category: "全部", query: "", user: null, session: null, editingResourceId: null };
const sessionKey = "xzc_supabase_session";
const bucket = "resources";
const coverBucket = "resource-covers";
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function configReady() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.url || "") && !String(config.anonKey || "").startsWith("YOUR_");
}

function usernameToEmail(username) {
  return `${String(username).trim().toLowerCase()}@example.com`;
}

function friendlyError(error, fallback = "请求失败") {
  const message = error?.message || error?.msg || error?.error_description || error?.error || fallback;
  if (/invalid login credentials/i.test(message)) return "会员账号或密码错误";
  if (/row-level security|permission denied|not allowed/i.test(message)) return "没有执行此操作的权限";
  if (/failed to fetch|networkerror/i.test(message)) return "无法连接 Supabase，请检查配置和网络";
  if (/object not found|not[_ -]?found/i.test(message)) return "文件不存在，请管理员在编辑界面重新上传资源文件";
  if (/cover_path|schema cache/i.test(message)) return "请先在 Supabase SQL Editor 执行封面功能迁移脚本";
  return String(message);
}

async function parseResponse(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json();
  const text = await response.text();
  return text ? { message: text } : null;
}

async function refreshSession() {
  if (!state.session?.refresh_token) return null;
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: state.session.refresh_token }),
  });
  const body = await parseResponse(response);
  if (!response.ok) {
    clearSession();
    throw new Error(friendlyError(body, "登录已过期，请重新登录"));
  }
  saveSession(body);
  return state.session.access_token;
}

async function accessToken() {
  if (!state.session) return null;
  if (state.session.expires_at - Date.now() < 60_000) return refreshSession();
  return state.session.access_token;
}

function saveSession(session) {
  state.session = { ...session, expires_at: Date.now() + Number(session.expires_in || 3600) * 1000 };
  localStorage.setItem(sessionKey, JSON.stringify(state.session));
}

function clearSession() {
  state.session = null;
  state.user = null;
  localStorage.removeItem(sessionKey);
}

async function supabaseRequest(path, options = {}) {
  if (!configReady()) throw new Error("请先在 supabase-config.js 填写项目 URL 和 Publishable Key");
  const headers = { apikey: config.anonKey, ...(options.headers || {}) };
  const token = options.auth ? await accessToken() : null;
  headers.Authorization = `Bearer ${token || config.anonKey}`;
  let body = options.body;
  if (options.json !== false && body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const response = await fetch(`${config.url}${path}`, { method: options.method || "GET", headers, body });
  if (options.raw) return response;
  const result = await parseResponse(response);
  if (!response.ok) throw new Error(friendlyError(result));
  return result;
}

function showToast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => $("#toast").classList.remove("show"), 3000);
}

function openModal(selector) { $(selector).hidden = false; document.body.style.overflow = "hidden"; }
function closeModals() {
  $$(".modal-backdrop").forEach(modal => { modal.hidden = true; });
  document.body.style.overflow = "";
  if (window.location.hash === "#login") history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

function escapeHTML(value) {
  const element = document.createElement("span");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function toResource(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    content: row.content || "",
    category: row.category,
    subcategory: row.subcategory,
    version: row.version,
    color: row.color,
    icon: row.icon,
    memberOnly: row.member_only,
    downloads: Number(row.downloads || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    filePath: row.file_path,
    fileName: row.file_name,
    coverPath: row.cover_path,
    coverName: row.cover_name,
  };
}

function publicCoverURL(path) {
  if (!path) return "";
  return `${config.url}/storage/v1/object/public/${coverBucket}/${encodedStoragePath(path)}`;
}

function resourceArtwork(resource, variant = "card") {
  if (resource.coverPath) return `<img class="resource-cover ${variant}" src="${escapeHTML(publicCoverURL(resource.coverPath))}" alt="${escapeHTML(resource.title)} 封面" loading="lazy" />`;
  return `<div class="resource-icon ${escapeHTML(resource.color)}">${escapeHTML(resource.icon)}</div>`;
}

function renderCategories() {
  $("#categoryStrip").innerHTML = categories.map(category => `
    <button class="category-button ${state.category === category.name ? "active" : ""}" data-category="${category.name}">
      <span>${category.icon}</span><div><strong>${category.name}</strong><small>${category.description}</small></div>
    </button>
  `).join("");
  $("#filterRow").innerHTML = ["全部", ...categories.map(item => item.name)].map(name => `<button class="filter-button ${state.category === name ? "active" : ""}" data-category="${name}">${name}</button>`).join("");
}

function visibleResources() {
  const query = state.query.toLowerCase();
  return state.resources.filter(item => (state.category === "全部" || item.category === state.category) && `${item.title} ${item.description} ${item.content} ${item.category} ${item.subcategory}`.toLowerCase().includes(query));
}

function resourceCard(resource) {
  return `<article class="resource-card" data-resource="${escapeHTML(resource.id)}" tabindex="0" aria-label="查看 ${escapeHTML(resource.title)}">
    ${resourceArtwork(resource)}
    <div><div class="resource-top"><div class="resource-tags"><span>${escapeHTML(resource.category)}</span><span>${escapeHTML(resource.subcategory)}</span>${resource.memberOnly ? '<span class="plus-tag">X.Z.C+</span>' : ""}</div></div>
    <h3>${escapeHTML(resource.title)}</h3><p>${escapeHTML(resource.description)}</p><div class="resource-meta"><span>v${escapeHTML(resource.version)}</span><span>↓ ${resource.downloads.toLocaleString("zh-CN")}</span></div></div>
  </article>`;
}

function renderResources() {
  const resources = visibleResources();
  $("#resourceGrid").innerHTML = resources.map(resourceCard).join("");
  $("#emptyState").hidden = resources.length > 0;
  $("#resourceStat").textContent = state.resources.length;
  renderCategories();
}

async function loadResources() {
  try {
    const rows = await supabaseRequest("/rest/v1/resources?select=*&order=created_at.desc", { auth: Boolean(state.session) });
    state.resources = Array.isArray(rows) ? rows.map(toResource) : [];
    renderResources();
  } catch (error) {
    state.resources = [];
    renderResources();
    showToast(friendlyError(error));
  }
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
  if (!state.session) { state.user = null; renderUser(); return; }
  try {
    const authUser = await supabaseRequest("/auth/v1/user", { auth: true });
    const rows = await supabaseRequest(`/rest/v1/profiles?id=eq.${encodeURIComponent(authUser.id)}&select=id,username,role`, { auth: true });
    const profile = rows?.[0];
    if (!profile || !["member", "admin"].includes(profile.role)) throw new Error("此账号尚未获得会员权限");
    state.user = profile;
  } catch (error) {
    clearSession();
    showToast(friendlyError(error));
  }
  renderUser();
}

function setCategory(category) {
  state.category = category;
  renderResources();
  $("#resources").scrollIntoView({ behavior: "smooth" });
  $("#mainNav").classList.remove("open");
}

function openResource(id) {
  const resource = state.resources.find(item => item.id === id);
  if (!resource) return;
  const content = resource.content ? `<div class="resource-content">${escapeHTML(resource.content)}</div>` : "";
  const action = resource.filePath ? `<button class="download-button" data-download="${escapeHTML(resource.id)}">${resource.memberOnly ? "X.Z.C 会员下载" : "免费下载"} ↓</button>` : '<button class="download-button" disabled>文件暂未上传</button>';
  $("#detailContent").innerHTML = `<div class="detail-hero">${resourceArtwork(resource, "detail")}<div><div class="resource-tags"><span>${escapeHTML(resource.category)}</span><span>${escapeHTML(resource.subcategory)}</span>${resource.memberOnly ? '<span class="plus-tag">X.Z.C+</span>' : ""}</div><h2 id="detailTitle">${escapeHTML(resource.title)}</h2><p>${escapeHTML(resource.description)}</p></div></div><div class="detail-info"><div><strong>v${escapeHTML(resource.version)}</strong><span>当前版本</span></div><div><strong>${resource.downloads.toLocaleString("zh-CN")}</strong><span>累计下载</span></div><div><strong>${new Date(resource.updatedAt).toLocaleDateString("zh-CN")}</strong><span>更新时间</span></div></div>${content}${action}`;
  openModal("#detailModal");
}

function encodedStoragePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

async function downloadResource(id) {
  const resource = state.resources.find(item => item.id === id);
  if (!resource?.filePath) return;
  if (resource.memberOnly && !state.user) { openAuth(); showToast("此资源仅限会员，请先登录"); return; }
  try {
    const response = await supabaseRequest(`/storage/v1/object/authenticated/${bucket}/${encodedStoragePath(resource.filePath)}`, { auth: Boolean(state.session), raw: true });
    if (!response.ok) throw new Error(friendlyError(await parseResponse(response), "文件下载失败"));
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = resource.fileName || "resource-file";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    await supabaseRequest("/rest/v1/rpc/increment_download", { method: "POST", auth: Boolean(state.session), body: { p_resource_id: resource.id } });
    resource.downloads += 1;
    renderResources();
    showToast("下载已开始");
  } catch (error) { showToast(friendlyError(error)); }
}

function openAuth() {
  $("#authError").textContent = "";
  openModal("#authModal");
  if (window.location.hash !== "#login") history.pushState(null, "", "#login");
}

function handleAuthShortcut() { if (window.location.hash === "#login") openAuth(); }

async function renderAdminResources() {
  if (state.user?.role !== "admin") throw new Error("需要管理员权限");
  const profiles = await supabaseRequest("/rest/v1/profiles?select=id,username,role,created_at&role=in.(member,admin)&order=created_at.asc", { auth: true });
  $("#adminResourceList").innerHTML = state.resources.map(item => `<div class="admin-item">${resourceArtwork(item, "admin")}<div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.category)} · v${escapeHTML(item.version)} · ${item.memberOnly ? "仅会员" : "公开"}</small></div><div class="admin-item-actions"><button data-edit="${escapeHTML(item.id)}">编辑</button><button data-delete="${escapeHTML(item.id)}">删除</button></div></div>`).join("") || "<p>暂无资源</p>";
  $("#adminUserList").innerHTML = profiles.map(user => `<div class="admin-user"><span>${escapeHTML(user.username.slice(0, 1).toUpperCase())}</span><div><strong>${escapeHTML(user.username)}</strong><small>${user.role === "admin" ? "管理员" : "X.Z.C 会员"}</small></div>${user.role === "admin" ? "" : `<button class="member-toggle" data-delete-user="${escapeHTML(user.id)}">删除会员</button>`}</div>`).join("");
}

function resetResourceForm() {
  const form = $("#resourceForm");
  if (previewSelectedCover.url) {
    URL.revokeObjectURL(previewSelectedCover.url);
    previewSelectedCover.url = null;
  }
  form.reset();
  state.editingResourceId = null;
  $("#resourceFormTitle").textContent = "发布新资源";
  $("#resourceSubmitText").textContent = "发布资源";
  $("#cancelResourceEdit").hidden = true;
  $("#resourceFileLabel").textContent = "资源文件（最大 50 MB）";
  $("#resourceFileHint").textContent = "新建资源时可不上传附件";
  $("#coverPreview").hidden = true;
  $("#coverPreviewImage").removeAttribute("src");
  delete $("#coverPreviewImage").dataset.existingSrc;
  $("#adminError").textContent = "";
}

function startEditResource(id) {
  const resource = state.resources.find(item => item.id === id);
  if (!resource) return;
  const form = $("#resourceForm");
  state.editingResourceId = id;
  form.elements.title.value = resource.title;
  form.elements.category.value = resource.category;
  form.elements.subcategory.value = resource.subcategory;
  form.elements.description.value = resource.description;
  form.elements.content.value = resource.content;
  form.elements.version.value = resource.version;
  form.elements.icon.value = resource.icon;
  form.elements.memberOnly.value = String(resource.memberOnly);
  form.elements.file.value = "";
  form.elements.cover.value = "";
  form.elements.removeCover.checked = false;
  $("#resourceFormTitle").textContent = `编辑：${resource.title}`;
  $("#resourceSubmitText").textContent = "保存更改";
  $("#cancelResourceEdit").hidden = false;
  $("#resourceFileLabel").textContent = "替换资源文件（最大 50 MB，可选）";
  $("#resourceFileHint").textContent = resource.fileName ? `当前文件：${resource.fileName}` : "当前没有可下载文件，可在这里补传";
  $("#coverPreview").hidden = !resource.coverPath;
  if (resource.coverPath) {
    $("#coverPreviewImage").src = publicCoverURL(resource.coverPath);
    $("#coverPreviewImage").dataset.existingSrc = publicCoverURL(resource.coverPath);
  } else {
    $("#coverPreviewImage").removeAttribute("src");
    delete $("#coverPreviewImage").dataset.existingSrc;
  }
  $("#adminError").textContent = "";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function previewSelectedCover(file) {
  if (previewSelectedCover.url) URL.revokeObjectURL(previewSelectedCover.url);
  if (!file?.size) return;
  previewSelectedCover.url = URL.createObjectURL(file);
  $("#coverPreviewImage").src = previewSelectedCover.url;
  $("#coverPreview").hidden = false;
  $("#resourceForm").elements.removeCover.checked = false;
}

async function invokeAdminUsers(payload) {
  const functionName = config.adminFunction || "admin-users";
  return supabaseRequest(`/functions/v1/${encodeURIComponent(functionName)}`, { method: "POST", auth: true, body: payload });
}

async function uploadStorageObject(storageBucket, path, file) {
  await supabaseRequest(`/storage/v1/object/${storageBucket}/${encodedStoragePath(path)}`, { method: "POST", auth: true, json: false, body: file, headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" } });
}

async function removeStorageObject(path, { ignoreMissing = false, storageBucket = bucket } = {}) {
  if (!path) return;
  try {
    await supabaseRequest(`/storage/v1/object/${storageBucket}/${encodedStoragePath(path)}`, { method: "DELETE", auth: true });
  } catch (error) {
    if (ignoreMissing && /object not found|not[_ -]?found/i.test(friendlyError(error))) return;
    throw error;
  }
}

async function deleteResource(id) {
  const resource = state.resources.find(item => item.id === id);
  if (!resource) return;
  if (resource.filePath) await removeStorageObject(resource.filePath, { ignoreMissing: true });
  if (resource.coverPath) await removeStorageObject(resource.coverPath, { ignoreMissing: true, storageBucket: coverBucket });
  await supabaseRequest(`/rest/v1/resources?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", auth: true, headers: { Prefer: "return=minimal" } });
  await loadResources();
  await renderAdminResources();
}

document.addEventListener("click", async event => {
  const category = event.target.closest("[data-category]");
  const categoryLink = event.target.closest("[data-category-link]");
  const query = event.target.closest("[data-query]");
  const resource = event.target.closest("[data-resource]");
  const download = event.target.closest("[data-download]");
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  const deleteUserButton = event.target.closest("[data-delete-user]");
  if (category) setCategory(category.dataset.category);
  if (categoryLink) setCategory(categoryLink.dataset.categoryLink);
  if (query) { state.query = query.dataset.query; $("#searchInput").value = state.query; renderResources(); }
  if (resource) openResource(resource.dataset.resource);
  if (download) downloadResource(download.dataset.download);
  if (editButton) startEditResource(editButton.dataset.edit);
  if (event.target.closest("[data-close-modal]")) closeModals();
  if (event.target.classList.contains("modal-backdrop")) closeModals();
  if (deleteButton && confirm("确定删除这个资源及其文件吗？")) {
    try { await deleteResource(deleteButton.dataset.delete); if (state.editingResourceId === deleteButton.dataset.delete) resetResourceForm(); showToast("资源已删除"); }
    catch (error) { showToast(friendlyError(error)); }
  }
  if (deleteUserButton && confirm("确定删除这个会员账号吗？")) {
    try { await invokeAdminUsers({ action: "delete", userId: deleteUserButton.dataset.deleteUser }); showToast("会员账号已删除"); await renderAdminResources(); }
    catch (error) { showToast(friendlyError(error)); }
  }
});

$("#resourceGrid").addEventListener("keydown", event => { if ((event.key === "Enter" || event.key === " ") && event.target.closest("[data-resource]")) { event.preventDefault(); openResource(event.target.closest("[data-resource]").dataset.resource); } });
$("#loginButton").addEventListener("click", openAuth);
$("#userButton").addEventListener("click", () => openModal("#userModal"));
$("#mobileMenu").addEventListener("click", () => $("#mainNav").classList.toggle("open"));
$("#searchFocus").addEventListener("click", () => { $("#searchInput").focus(); window.scrollTo({ top: 70, behavior: "smooth" }); });
$("#dismissAnnouncement").addEventListener("click", event => event.currentTarget.parentElement.remove());
$("#memberAction").addEventListener("click", () => state.user ? openModal("#userModal") : openAuth());
$("#searchInput").addEventListener("input", event => { state.query = event.target.value.trim(); renderResources(); });
$("#cancelResourceEdit").addEventListener("click", resetResourceForm);
$("#resourceForm").elements.cover.addEventListener("change", event => previewSelectedCover(event.target.files?.[0]));
$("#resourceForm").elements.removeCover.addEventListener("change", event => {
  const image = $("#coverPreviewImage");
  if (event.target.checked) {
    $("#resourceForm").elements.cover.value = "";
    image.removeAttribute("src");
  } else if (image.dataset.existingSrc) {
    image.src = image.dataset.existingSrc;
  }
  $("#coverPreview").hidden = !event.target.checked && !image.getAttribute("src");
});

$("#authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const data = Object.fromEntries(new FormData(formElement));
  try {
    if (!configReady()) throw new Error("请先在 supabase-config.js 填写项目 URL 和 Publishable Key");
    const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: usernameToEmail(data.username), password: data.password }),
    });
    const result = await parseResponse(response);
    if (!response.ok) throw new Error(friendlyError(result));
    saveSession(result);
    await loadUser();
    if (!state.user) throw new Error("账号没有会员权限");
    await loadResources();
    closeModals();
    formElement.reset();
    showToast("登录成功");
  } catch (error) { $("#authError").textContent = friendlyError(error); }
});

$("#logoutButton").addEventListener("click", async () => {
  try { if (state.session) await supabaseRequest("/auth/v1/logout", { method: "POST", auth: true }); } catch { /* 本地会话仍然清除 */ }
  clearSession();
  renderUser();
  await loadResources();
  closeModals();
  showToast("已退出登录");
});

$("#adminEntry").addEventListener("click", async () => {
  try { closeModals(); await renderAdminResources(); openModal("#adminModal"); }
  catch (error) { showToast(friendlyError(error)); }
});

$("#memberForm").addEventListener("submit", async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const payload = Object.fromEntries(new FormData(formElement));
  try {
    await invokeAdminUsers({ action: "create", username: payload.username, password: payload.password });
    formElement.reset();
    $("#memberError").textContent = "";
    showToast("会员账号已创建");
    await renderAdminResources();
  } catch (error) { $("#memberError").textContent = friendlyError(error); }
});

$("#resourceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const editingResource = state.resources.find(item => item.id === state.editingResourceId) || null;
  const file = form.get("file");
  const cover = form.get("cover");
  const removeCover = form.get("removeCover") === "on";
  let newFilePath = null;
  let newCoverPath = null;
  let resourceSaved = false;
  try {
    if (file?.size > 50 * 1024 * 1024) throw new Error("免费版单个文件不能超过 50 MB");
    if (cover?.size > 5 * 1024 * 1024) throw new Error("封面照片不能超过 5 MB");
    if (cover?.size && !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(cover.type)) throw new Error("封面仅支持 JPG、PNG、WebP 或 GIF");
    if (file?.size) {
      const extension = file.name.match(/\.[A-Za-z0-9]{1,10}$/)?.[0].toLowerCase() || "";
      newFilePath = `${crypto.randomUUID()}${extension}`;
      await uploadStorageObject(bucket, newFilePath, file);
    }
    if (cover?.size) {
      const extension = cover.name.match(/\.(?:jpe?g|png|webp|gif)$/i)?.[0].toLowerCase() || "";
      newCoverPath = `${crypto.randomUUID()}${extension}`;
      await uploadStorageObject(coverBucket, newCoverPath, cover);
    }
    const payload = {
      title: form.get("title"),
      category: form.get("category"),
      subcategory: form.get("subcategory") || "其他",
      description: form.get("description"),
      content: form.get("content") || "",
      version: form.get("version") || "1.0.0",
      icon: form.get("icon") || "NEW",
      member_only: form.get("memberOnly") === "true",
    };
    if (file?.size) Object.assign(payload, { file_path: newFilePath, file_name: file.name, file_type: file.type || "application/octet-stream", file_size: file.size });
    if (cover?.size) Object.assign(payload, { cover_path: newCoverPath, cover_name: cover.name, cover_type: cover.type });
    else if (editingResource && removeCover) Object.assign(payload, { cover_path: null, cover_name: null, cover_type: null });

    if (editingResource) {
      payload.updated_at = new Date().toISOString();
      await supabaseRequest(`/rest/v1/resources?id=eq.${encodeURIComponent(editingResource.id)}`, { method: "PATCH", auth: true, body: payload, headers: { Prefer: "return=minimal" } });
    } else {
      Object.assign(payload, {
        color: ["blue", "violet", "orange", "green", "cyan", "rose"][Math.floor(Math.random() * 6)],
        file_path: newFilePath,
        file_name: file?.size ? file.name : null,
        file_type: file?.size ? file.type || "application/octet-stream" : null,
        file_size: file?.size || null,
      });
      await supabaseRequest("/rest/v1/resources", { method: "POST", auth: true, body: payload, headers: { Prefer: "return=minimal" } });
    }
    resourceSaved = true;
    if (editingResource && file?.size && editingResource.filePath) {
      try { await removeStorageObject(editingResource.filePath, { ignoreMissing: true }); } catch { /* 新文件已生效，旧文件可稍后清理 */ }
    }
    if (editingResource && (cover?.size || removeCover) && editingResource.coverPath) {
      try { await removeStorageObject(editingResource.coverPath, { ignoreMissing: true, storageBucket: coverBucket }); } catch { /* 新封面已生效，旧封面可稍后清理 */ }
    }
    const successMessage = editingResource ? "资源更改已保存" : "资源发布成功";
    resetResourceForm();
    await loadResources();
    await renderAdminResources();
    showToast(successMessage);
  } catch (error) {
    if (newFilePath && !resourceSaved) { try { await removeStorageObject(newFilePath); } catch { /* 保留原始错误 */ } }
    if (newCoverPath && !resourceSaved) { try { await removeStorageObject(newCoverPath, { storageBucket: coverBucket }); } catch { /* 保留原始错误 */ } }
    $("#adminError").textContent = friendlyError(error);
  }
});

document.addEventListener("keydown", event => { if (event.key === "Escape") closeModals(); });
window.addEventListener("hashchange", handleAuthShortcut);

try {
  const saved = JSON.parse(localStorage.getItem(sessionKey));
  if (saved?.access_token && saved?.refresh_token) state.session = saved;
} catch { localStorage.removeItem(sessionKey); }

handleAuthShortcut();
renderCategories();

async function initialize() {
  await loadUser();
  await loadResources();
}

initialize();
