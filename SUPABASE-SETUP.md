# Supabase 配置步骤

完成以下一次性配置后，管理员就能直接在网站后台上传文件和发布文本。

## 1. 创建项目

1. 登录 <https://supabase.com/dashboard>，选择 **New project**。
2. 保存好数据库密码，但不要把密码写进代码或发送给其他人。
3. 等待项目创建完成。

## 2. 初始化数据库和文件权限

1. 打开项目的 **SQL Editor**。
2. 新建查询，粘贴并执行 `supabase/schema.sql` 的全部内容。
3. 执行成功后会生成 `profiles`、`resources` 两张表和一个私有的 `resources` Storage bucket。

该脚本会启用 RLS：游客只能下载免费文件，会员可以下载会员文件，只有管理员能上传、发布和删除。

如果项目以前已经执行过旧版初始化脚本，请另外执行 `supabase/migrations/20260719_resource_editor.sql`。它会新增封面字段、创建公开的 `resource-covers` 图片桶，并把“仅会员”升级为仅会员可观看和下载。迁移不会删除已有资源。

## 3. 创建首位管理员

1. 打开 **Authentication → Users → Add user**。
2. 选择 **Create new user**（不要选择 Invite user）。Email 填写 `wangyongda@example.com`，设置一个没有公开过的新密码，启用 Auto Confirm 后创建。
3. 回到 SQL Editor，执行：

```sql
update public.profiles
set role = 'admin'
where username = 'wangyongda';
```

旧密码已经出现在之前的聊天和部署记录中，不应继续用于公开网站。

建议在 **Authentication → Providers → Email** 中关闭公众注册；本网站本身没有注册入口，会员由管理员创建。

## 4. 部署会员管理函数

管理员在网页中创建和删除会员需要 Edge Function。函数源码位于 `supabase/functions/admin-users/index.ts`。当前项目实际部署名称为 `hyper-action`，并已通过 `supabase-config.js` 的 `adminFunction` 配置与网站连接。

可以在 Supabase Dashboard 的 **Edge Functions** 页面创建名为 `admin-users` 的函数，粘贴源码并部署；也可以使用 Supabase CLI：

```powershell
npx supabase login
npx supabase link --project-ref 你的PROJECT_REF
npx supabase functions deploy admin-users
```

Supabase 会自动给托管函数提供 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。不要把 service role key 放进 `supabase-config.js`。

## 5. 填写网页公开配置

在 **Project Settings → API Keys** 中找到：

- Project URL
- Publishable key（旧项目可能显示为 anon key）

编辑 `supabase-config.js`：

```js
window.XZC_SUPABASE = Object.freeze({
  url: "https://你的PROJECT_REF.supabase.co",
  anonKey: "你的Publishable key",
});
```

Publishable/anon key 可以出现在浏览器代码里，真正的数据安全由 RLS 负责；不要误填 secret 或 service role key。

## 6. 更新 GitHub Pages

把根目录中的这些文件上传或通过自动更新程序同步到 GitHub 仓库：

- `index.html`
- `styles.css`
- `app.js`
- `supabase-config.js`

然后访问：

`https://wangyongda12333-a11y.github.io/wehtml/#login`

用管理员账号 `wangyongda` 和你在 Supabase 中设置的新密码登录。进入“资源管理后台”后，可以：

- 上传最大 50 MB 的文件（Supabase 免费版限制）；
- 发布只有文字、没有附件的资源；
- 设置公开资源或仅会员可观看和下载的资源；
- 编辑已发布资源的标题、分类、简介、详细文字、权限和版本；
- 上传、更换或移除最大 5 MB 的封面照片；
- 替换已发布资源的下载文件；
- 创建和删除会员账号；
- 删除资源及其 Storage 文件。

## 7. 上线前检查

- 使用无痕窗口确认免费资源不登录也能下载。
- 确认会员资源在游客状态下无法下载。
- 确认普通会员看不到管理入口且不能调用上传接口。
- 在 Supabase Storage 和数据库之外保留一份定期备份。
