# Working Hour Web

面向 iPhone 的本地工时记录网页 App。数据保存在当前设备的浏览器数据库中，不上传到服务器。

## 功能

- 每日上下工、实际开始时间、午饭扣除、休息日和备注
- 自然周工时、时薪、预估周薪、银行到账、现金和差额
- 导出可编辑的 Excel 周报
- 分享每周原始上下工时间
- 导出和导入完整 JSON备份
- 添加到 iPhone 主屏幕，并在首次加载后支持离线打开

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开 `http://localhost:3000`。

## 验证

```bash
npm test
```

## 上传 GitHub

把整个 `web` 文件夹作为一个独立仓库上传，或作为现有仓库的子目录提交。不要上传 `.env`、`.wrangler`、`dist`、`dist-pages` 和 `node_modules`。

## Cloudflare Pages 部署

在 Cloudflare 控制台进入 **Workers & Pages → Create → Pages → Connect to Git**，连接 GitHub 仓库后填写：

- 构建命令：`npm run build:pages`
- 输出目录：`dist-pages`
- Node.js 版本：`22.13` 或更高

不需要填写服务器、数据库或环境变量。

项目不需要 D1、R2 或其他付费数据库。使用 Cloudflare提供的网址即可保持零服务器费用。

## iPhone 安装

1. 使用 Safari打开部署后的网址。
2. 点击“分享”。
3. 选择“添加到主屏幕”。
4. 以后从主屏幕打开“工时记录”。

建议每周将 JSON备份保存到 iCloud Drive。清除 Safari网站数据会删除本机记录。
