# 🐣 零基础 5 分钟上手教程：从 0 申请第一个 Telegram 机器人到一键上线

没写过代码、没申请过 Telegram 机器人、也没买过服务器？**完全没关系！**  
按下面 6 个傻瓜步骤点点鼠标，**0 成本（Cloudflare 免费版）** 就能拥有你自己的个人名片小程序 + 私密小站导航 + 探针 + 防骚扰双向私聊机器人。

---

## 第 1 步：30 秒申请你的第一个 Telegram 机器人（拿 `BOT_TOKEN`）

1. 在 Telegram 顶部搜索并打开官方机器人 **[@BotFather](https://t.me/BotFather)**（认准蓝色官方认证勾）。
2. 发送 `/newbot`。
3. BotFather 会让你输入两样东西：
   - **机器人展示昵称**（可以是中文，比如 `Rose 小助手`）；
   - **机器人用户名**（必须英文且以 `bot` 结尾，比如 `my_rose_panel_bot`，不能跟别人重复）。
4. 创建成功后，你会收到一串形如 `123456789:AAHxxxxxxxxxxxxxxxxxxxxxxxx` 的密钥，这就是 **`BOT_TOKEN`**，先复制保存好（**切勿泄露给他人**）。
5. *(可选美化)* 顺手在 `@BotFather` 里：
   - 发 `/setuserpic` → 选刚建的机器人 → 发一张图片给机器人换头像；
   - 发 `/setdescription` → 写一句简介，陌生人打开对话前就能看到。

---

## 第 2 步：5 秒拿到你自己的数字 UID（填 `ADMIN_IDS`）

1. 在 Telegram 搜索 **[@userinfobot](https://t.me/userinfobot)**（或 [@RawDataBot](https://t.me/RawDataBot)），点 **Start**。
2. 记下回复里 `Id:` 后面的那串纯数字（例如 `1234567890`），这就是你的 **`ADMIN_IDS`**。

> 填上 `ADMIN_IDS` 后，系统 100% 精准识别你是站长，而且鉴权走内存 `<0.1ms` 极速完成，不消耗任何 KV 额度！

---

## 第 3 步：一键免费部署到 Cloudflare Workers（免装任何软件）

1. 先免费注册并登录 [GitHub](https://github.com/) 和 [Cloudflare](https://dash.cloudflare.com/)。
2. 直接点击仓库首页的 **Deploy to Cloudflare** 一键按钮（或先 Fork 本仓库，再进入 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Workers** → **Import a repository** 选择 `rose-panel-bot`）：
   - **Build command**：`npm run build`
   - **Deploy command**：`npx wrangler deploy`
   - 点击 **Save and Deploy** 等待约 30 秒。
3. 部署完成后，打开这个 Worker 的 **Settings → Variables & Bindings**：
   - **KV Namespace 绑定**：确认已存在名为 `TOPIC_MAP` 的 KV（没有的话新建一个 KV 绑定为 `TOPIC_MAP` 即可）。
   - **添加环境变量**（只需填下面 4 个最核心的）：
     | 变量名 | 类型 | 填什么 |
     | :--- | :--- | :--- |
     | `BOT_TOKEN` | **Secret (加密)** | 第 1 步从 `@BotFather` 拿到的 Token |
     | `WEBHOOK_SECRET` | **Secret (加密)** | 自己随便打一串英文+数字密码（如 `rose2026secret`） |
     | `ADMIN_IDS` | Text | 第 2 步拿到的你自己的数字 UID |
     | `BOT_USERNAME` | Text | 你的机器人用户名（**不要带 `@`**，如 `my_rose_panel_bot`） |
4. *(强烈推荐)* 在 Worker 的 **Settings → Domains & Routes** 绑定一个自己的自定义域名（如 `panel.yourdomain.com`），访问速度更快更稳。

---

## 第 4 步：10 秒一键激活机器人（`/setup`）

在浏览器里打开一次下面这个网址（把域名和密码换成你自己的）：

```text
https://你的域名/setup?secret=你刚填的WEBHOOK_SECRET
```

看到页面返回 `"ok": true` 就大功告成！这一步会自动帮你做好：
- 绑定 Telegram Webhook；
- 给机器人左下角装上 **「个人面板」** 小程序入口按钮；
- 给普通人、管理群和你自己私聊分别配置专属 `/` 快捷菜单。

> *(可选：支持在群里滑出小程序)* 去 `@BotFather` 发 `/newapp` → 选你的机器人 → 填标题/简介/图标 → Web App URL 填 `https://你的域名/` → 短名填 `panel`（然后把 `APP_SHORT_NAME` 变量设为 `panel`）。

---

## 第 5 步：30 秒一键绑定「私聊通知群」（`/bind`，告别查群 ID！）

> 如果你**只想做纯个人名片 + 小站 + 探针**，不需要别人通过机器人私聊你，可以**直接跳过这一步**！

想开启防骚扰双向私聊（别人私聊机器人自动转发给你，你在群里直接回复且不暴露主号）：

1. 在 Telegram 里**新建一个私密群**（比如叫 `我的通知群`），只拉进你刚创建的机器人（全群就你们 2 个成员）。
2. 点群名称 → **编辑** → 打开 **「话题 (Topics)」** 开关。
3. 在群成员里把机器人设为 **管理员**，务必勾选 **「管理话题」** 和 **「删除消息」**。
4. 直接在群里发一句：
   ```text
   /bind
   ```
5. 收到机器人回复 **「🎉 私聊通知群绑定成功！」** 就完成了！**完全不需要查 `-100...` 群 ID，也不用再回 Cloudflare 改环境变量。**

> 以后想换群？在新话题群里发一次 `/bind` 即可无缝切换；想关闭私聊转发，在群里发 `/unbind` 即可。

---

## 第 6 步：在手机上把面板装扮成你的专属风格 ✨

现在点开你的机器人，点左下角 **「个人面板」**，点右上角 **⚙️ 设置**，所有东西都能在手机上可视化改：

- **换动态贴纸主徽章**：直接私聊机器人发 `/set`，再发任意一张你喜欢的 TG 贴纸、收藏表情或 `t.me/addstickers/...` 链接，瞬间换上 60fps 动效徽章！
- **定制趣味表情包验证题**：私聊发 `/add`，发一张你收藏的表情包，再发 `题目 正确答案 错1 错2 错3`（用空格隔开就行），让每个来联系你的人都被可爱到，广告号却 0 破解率！
- **定制开屏加载页**：在 **⚙️ 设置 → 名片与徽章** 里可选 **✨ 徽章呼吸 / 🌹 表情跳动 / 🪄 卡片骨架屏**，并自定义开屏提示文案。
- **管理公开 & 私密小站**：在 **⚙️ 设置 → 个人小站** 添加博客、导航，自己的后台/网盘点一下标成 **🔒 仅我可见**（访客完全看不到）。
- **接入 Komari 探针**：在 **⚙️ 设置 → Komari 探针** 填入你的 Komari 地址即可（支持一键设为「仅自己可见」）。

---

## ❓ 新手常见问题 (FAQ)

### Q1：我的 Komari 探针和面板在同一个 Cloudflare 域名下，测试连接报「重定向循环」怎么办？
这是因为你该域名在 Cloudflare 的全局 SSL/TLS 模式是 **Flexible**，Worker 访问同域名子站时会被强制降级为 HTTP，而探针源站又强制跳 HTTPS。  
**解决方法**：在 Cloudflare 控制台 → 你的域名 → **Rules → Configuration Rules** 新建一条规则，条件选 `Hostname equals 你的探针域名`（和面板域名），把 **SSL** 单独改为 **Full** 即可，完全不影响同域名下其他站点。

### Q2：通知群的聊天界面本身可以美化吗？
Telegram 群聊外框由客户端控制，你可以直接在「通知群 → 右上角 `...` → 更改颜色 / 聊天壁纸」里给这个群单独换一套喜欢的背景图和玫瑰粉气泡色；机器人创建的新访客话题已默认配色为柔和的珊瑚玫瑰色图标。

### Q3：以后项目发布新版本，我怎么一键更新？
- **Cloudflare Git 自动构建用户**：回到你 Fork 的 GitHub 仓库，点一下 **`Sync fork → Update branch`**，Cloudflare 会自动构建部署新版，你的 KV 配置、小站和访客记录 **100% 自动保留**。
- **本地 CLI 部署用户**：在仓库目录执行 `git pull && npm install && npm run deploy` 即可。
