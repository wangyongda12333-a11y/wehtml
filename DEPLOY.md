# X.Z.C 资源站部署说明

当前推荐部署方式是 **GitHub Pages 前端 + Supabase 后端**。GitHub Pages 负责展示网站，Supabase 负责管理员/会员登录、资源数据和文件存储。

完整步骤见 [SUPABASE-SETUP.md](SUPABASE-SETUP.md)。部署完成后，网站登录入口为：

`https://你的GitHub用户名.github.io/仓库名/#login`

## 公开仓库安全规则

- `supabase-config.js` 只能填写 Project URL 和 Publishable/anon key，它们本来就是浏览器端公开配置。
- 绝对不要把 `service_role`、数据库密码、Supabase 登录密码或管理员密码提交到 GitHub。
- 权限由 `supabase/schema.sql` 的 RLS 策略控制，不能仅依靠网页隐藏按钮。
- 免费资源允许游客读取；会员资源只允许 `member` 或 `admin` 角色读取；上传、发布和删除仅允许管理员。

## 旧 Node.js 版本

`server.js`、`render.yaml`、`data` 和 `uploads` 是之前自建服务器版本的兼容文件。GitHub Pages 不会运行它们，Supabase 版本也不依赖它们。
