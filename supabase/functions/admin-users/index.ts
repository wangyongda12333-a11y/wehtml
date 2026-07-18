const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(value: unknown) {
  if (!value || typeof value !== "object") return "Supabase request failed";
  const body = value as Record<string, unknown>;
  return String(body.message || body.msg || body.error_description || "Supabase request failed");
}

async function api(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(errorMessage(body));
  return body;
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return null;
  const user = await userResponse.json() as { id: string };
  const profiles = await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&role=eq.admin&select=id`);
  return Array.isArray(profiles) && profiles[0] ? user : null;
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: "Method not allowed" });
  try {
    if (!await requireAdmin(request)) return json(403, { error: "需要管理员权限" });
    const body = await request.json() as Record<string, unknown>;

    if (body.action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!/^[a-z0-9_]{3,20}$/.test(username) || password.length < 8) {
        return json(400, { error: "账号只能包含字母、数字或下划线，密码至少 8 位" });
      }
      const existing = await api(`/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`);
      if (Array.isArray(existing) && existing.length) return json(409, { error: "会员账号已存在" });
      const created = await api("/auth/v1/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: `${username}@example.com`,
          password,
          email_confirm: true,
          user_metadata: { username },
        }),
      });
      const createdBody = created as { id?: string; user?: { id?: string } };
      const userId = createdBody.user?.id || createdBody.id;
      if (!userId) throw new Error("创建会员后未返回用户 ID");
      await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ role: "member" }),
      });
      return json(201, { user: { id: userId, username, role: "member" } });
    }

    if (body.action === "delete") {
      const userId = String(body.userId || "");
      const profiles = await api(`/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,role`);
      const profile = Array.isArray(profiles) ? profiles[0] as { role?: string } : null;
      if (!profile || profile.role === "admin") return json(404, { error: "会员账号不存在" });
      await api(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
      return json(200, { ok: true });
    }

    return json(400, { error: "未知操作" });
  } catch (error) {
    return json(500, { error: error instanceof Error ? error.message : "服务器错误" });
  }
});
