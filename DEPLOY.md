# X.Z.C 资源站部署说明

本项目包含 Node.js 后端，不能只部署到 GitHub Pages。请把整个项目部署为 Node.js Web Service。

## 必需配置

- 启动命令：`npm start`
- Node.js：20 或更高版本
- 健康检查：`/api/health`
- 服务必须使用平台提供的 `PORT`，并监听 `0.0.0.0`

必须在云平台设置以下环境变量：

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `ADMIN_USERNAME`：管理员账号
- `ADMIN_PASSWORD`：新的高强度管理员密码
- `STORAGE_DIR`：持久磁盘目录，例如 `/var/data`

不要把 `ADMIN_PASSWORD` 写入代码或上传到 GitHub。

## 数据持久化

数据库和上传文件会写入 `STORAGE_DIR` 下的 `data`、`uploads` 目录。云平台必须给该目录挂载持久磁盘，否则重新部署后会员、资源和上传文件可能丢失。

仓库只应提交 `data/seed.json`，不要提交 `data/db.json`。已有公开仓库如果曾经提交过数据库，请删除已跟踪的 `data/db.json`、轮换管理员密码，并确认自动更新程序不会再次上传该文件。

`render.yaml` 是 Render 的部署模板，会创建 Node.js Web Service 并挂载 1 GB 持久磁盘。该方案可能产生费用，请在创建服务前查看平台显示的价格。
