# 3D打印业务平台 · 适用于个人的 3D 打印经营台

3D 打印接单经营工具：成本核算（材料 / 电 / 机器折旧 / 人工）、订单利润与欠款、耗材库存、打印记录、客户统计。**数据存服务端**，多设备访问同一地址即可共享。

- **多种部署**：Docker / NAS、Cloudflare Workers、Vercel、任意 Node 机器，一套代码通吃
- **数据自有**：数据存你自己的服务器 / KV，随时导出 JSON 备份
- **PWA**：可安装到手机桌面，应用壳离线可用

## 目录

- [功能总览](#功能总览)
- [成本模型](#成本模型)
- [架构与项目结构](#架构与项目结构)
- [API 一览](#api-一览)
- [本地运行](#本地运行)
- [部署](#部署)
- [环境变量](#环境变量)
- [登录鉴权](#登录鉴权)
- [数据与安全](#数据与安全)
- [升级](#升级)

## 功能总览

| 模块                      | 能力                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **仪表盘**          | 营收与利润合并卡，按日 / 月 / 年筛选；订单进度（进行中 / 已完成）、待收款提醒、低库存预警、客户排行、经营成就                                                       |
| **成本计算器**      | 材料 + 电费 + 机器折旧 + 人工全成本核算，建议报价 = 全成本 ×（1 + 利润加成%）；打印时长用时 / 分下拉（闹钟式）输入；「去开订单」一键带入订单表单（含建议报价取整） |
| **开单 / 订单列表** | 独立两页；报价（应收）与多笔分期收款 → 自动算欠款；全成本自动算利润与利润率；列表支持关键字 / 状态 / 日期区间筛选与四种排序；一键复制订单摘要                      |
| **耗材库房**        | 整卷克重 / 剩余库存 / 低库存预警；打印记录自动扣减、删除加回；支持补货                                                                                              |
| **打印机**          | 品牌下拉（拓竹 / 创想 / Prusa…）、功率与电价、购入价 / 折旧年限 / 年维护费 / 使用率 → 每小时机器成本                                                              |
| **打印记录**        | 汇总统计 + 近 12 个月成本图；耗材 / 打印机 / 日期区间 / 关键字筛选；导出 CSV / JSON                                                                                 |
| **设置**            | 结算货币、低库存预警线、人工时薪、利润加成%；深浅主题；备份 / 恢复 / 演示数据；修改管理密码                                                                         |

## 成本模型

```
建议报价 =（耗材费 + 电费 + 机器折旧 + 人工 + 额外成本）×（1 + 利润加成%）
```

- **耗材费** = 材料单价（元/kg）÷ 1000 × 克数
- **电费** = 平均功率（W）÷ 1000 × 时长（h）× 电价（元/度）
- **机器折旧** =（购入价 + 年维护费 × 折旧年限）÷（折旧年限 × 8760h × 使用率）× 时长
- **人工** = 人工时薪 ÷ 60 × 接单处理分钟数（沟通 + 售后 + 交付）
- **利润** = 已收 − 总成本；**欠款** = 报价 − 已收

> 只算材料和电就接单，短期看开张了，长期都是赔本买卖——机器会坏、时间值钱。

## 架构与项目结构

```
├── index.html            # 前端单页（零构建原生 HTML/CSS/JS）
├── assets/
│   ├── app.js            # 页面逻辑与渲染
│   ├── store.js          # 前端数据层（REST API 封装）
│   └── style.css         # 样式（深浅主题）
├── server/               # Node 宿主
│   ├── index.mjs         # HTTP 服务：静态文件 + REST API
│   ├── router.mjs        # 与运行时无关的 API 路由核心
│   ├── auth.mjs          # PBKDF2 密码鉴权 + HMAC 会话 Cookie
│   ├── stores.mjs        # 存储适配器：文件 / KV / Upstash / 内存
│   └── version.mjs       # 版本信息与更新检查
├── api/[[...path]].js    # Vercel Serverless 入口
├── worker.js             # Cloudflare Workers 入口
├── Dockerfile / docker-compose.yml / nginx.conf
├── wrangler.jsonc / vercel.json
└── data/*.json           # Node 模式下的数据文件
```

## 本地运行

要求 Node ≥ 18。首次运行需安装依赖（邮件功能使用 nodemailer）：

```bash
npm install          # 安装依赖（nodemailer）
npm start            # 等价于 node server/index.mjs
# → http://localhost:2929
```

数据存放在 `./data/*.json`，可用 `DATA_DIR` 环境变量改变位置。

## 部署

### 方式一：Cloudflare Workers（免服务器 · 全程浏览器操作 · 免费额度充足）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zzz2929/3D-Printing-Business-Platform)

**点击上方按钮即可在浏览器里完成部署，无需本地命令行：**

1. 点击按钮 → 登录 Cloudflare 账号（没有就免费注册一个）→ 授权访问你的 GitHub → 选择本仓库
2. 向导会读取仓库里的 `wrangler.jsonc`，列出需要创建的资源：**KV 命名空间（DATA）**——这就是本应用的数据库，保持默认点「创建」即可，无需填任何 id
3. 点「创建并部署」（Create and Deploy）→ 等待构建完成 → 打开分配的 `xxx.workers.dev` 地址即可使用
4. 部署完成后 Cloudflare 会把你的 GitHub 仓库连到该项目：**以后改代码 push 到 main，自动重新部署**；也可以在 Dashboard → Workers & Pages 里手动「Create deployment」重试
5. 首次打开是开放模式，进「设置 → 数据与账号」创建管理员即可启用密码保护

**关于存储的说明：**本应用只需要 **KV** 键值存储；**不需要 R2**（应用不保存任何文件，R2 是对象存储，用于图片/视频类需求）。KV 免费额度为每日 10 万次读 / 1000 次写，个人记账频率完全够用。

**邮件（忘记密码）功能：**Workers 上依赖 `nodejs_compat` 兼容标记（`wrangler.jsonc` 已包含，nodemailer v10 支持 Workers）。SMTP 建议在管理员「设置 → 数据与账号 → 邮件服务（SMTP）」卡片里配置；如 Worker 打包报 nodemailer 相关错误，可改用 Vercel 部署邮件功能。

**命令行方式（可选）：**如果你本地装有 Node，也可以 `npx wrangler kv namespace create DATA` 后把输出的 id 填入 `wrangler.jsonc`，再 `npx wrangler deploy`——效果与面板操作相同。

### 方式二：Vercel（免服务器 · 浏览器一键部署 · 数据库存到 Upstash）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fzzz2929%2F3D-Printing-Business-Platform)

**点击上方按钮即可在浏览器里完成部署：**

1. 点击按钮 → 用 GitHub 登录 Vercel → 填写项目名 → 直接点 **Deploy**（首次部署不需要配任何东西，应用立即可用，只是数据临时保存）
2. **配置持久化数据库（重要）：**进入项目页 → **Storage（存储）** 标签 → **Marketplace（市场）** → 选择 **Upstash Redis**（有免费套餐）→ 点 **Connect** 连接到本项目 → Vercel 会自动注入 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN` 两个环境变量
3. 回到 **Deployments** 标签 → 对最新一次部署点 **⋯ → Redeploy**，让环境变量生效
4. 完成后数据永久保存在 Upstash Redis，多设备访问同一地址即共享；以后 git push 自动重新部署

**关于「Vercel 数据库」：**Vercel 自己不提供数据库，它在 **Storage 市场**里聚合了第三方存储（Upstash Redis、Neon Postgres、Blob 等）。本应用只需要 **Upstash Redis** 一种；**不需要 R2**（那是 Cloudflare 的对象存储，本应用不保存文件）。

**邮件功能：**Vercel Serverless 函数是 Node 环境，nodemailer 开箱即用，SMTP 在管理员设置页配置即可。

### 方式三：Docker（推荐自托管，含飞牛OS / 群晖 / 绿联等 NAS）

**一键安装**（镜像已发布到 Docker Hub，支持 amd64 / arm64，无需克隆代码）：

```bash
docker run -d --name 3d-printing-business --restart unless-stopped \
  -p 2929:2929 -v 3d-printing-business-data:/data \
  zzz2929/3d-printing-business:latest
```

或在 NAS 的 Docker 界面中搜索镜像 `zzz2929/3d-printing-business` 创建容器。

**从源码构建运行**：

```bash
docker compose up -d   # 数据持久化在 named volume 3d-printing-business-data（容器内 /data）
```

访问 `http://<设备IP>:2929`。

### 方式四：裸跑 Node / NAS 直跑

```bash
npm install          # 安装依赖（nodemailer）
DATA_DIR=/vol1/3d-printing-business-data PORT=2929 npm start
```

### 方式五：命令行部署到 Cloudflare / Vercel（可选）

不想用面板向导的话：

```bash
# Cloudflare
npx wrangler kv namespace create DATA   # 把输出的 id 填入 wrangler.jsonc
npx wrangler deploy

# Vercel
npx vercel          # 按提示登录并关联项目
npx vercel --prod   # 生产部署；Upstash 环境变量在 Vercel 面板或 vercel env add 配置
```
## 环境变量

| 变量                         | 默认值     | 说明                                     | 适用平台      |
| ---------------------------- | ---------- | ---------------------------------------- | ------------- |
| `PORT`                     | `2929`   | HTTP 监听端口                            | Node / Docker |
| `DATA_DIR`                 | `./data` | JSON 数据目录                            | Node / Docker |
| `SMTP_HOST`                | 未设置     | SMTP 服务器地址；**推荐在设置页配置**（见下方「SMTP 配置详解」），此处仅兜底 | 全部          |
| `SMTP_PORT`                | 自动       | 端口（465 自动启用 TLS）                 | 全部          |
| `SMTP_SECURE`              | —          | 设为 `1` 使用 TLS 直连                   | 全部          |
| `SMTP_USER` / `SMTP_PASS`  | —          | SMTP 认证账号（AUTH LOGIN）              | 全部          |
| `MAIL_FROM`                | SMTP_USER  | 发件人地址                               | 全部          |
| `MAIL_DEBUG`               | —          | 设为 `1` 时验证码打印到服务端日志（联调用）| 全部          |
| `UPSTASH_REDIS_REST_URL`   | —         | Upstash Redis REST 地址                  | Vercel        |
| `UPSTASH_REDIS_REST_TOKEN` | —         | Upstash Redis REST Token                 | Vercel        |

### 邮箱与忘记密码

SMTP 在管理员的「设置 → 数据与账号 → 邮件服务（SMTP）」卡片中直接配置（保存到服务端数据目录，改完即生效，支持发送测试邮件）；`SMTP_*` 环境变量仅作为兜底。配置后，用户在「用户管理 → 编辑」中绑定邮箱（自助绑定需输入发送到邮箱的验证码；管理员可直接设置他人邮箱），登录页的「忘记密码？」即可通过邮箱验证码重置密码。验证码 15 分钟有效、60 秒冷却、最多 5 次尝试。未配置 SMTP 时相关功能会提示"邮件服务未配置"。`MAIL_DEBUG=1` 时验证码打印到服务端日志（联调用）。

### SMTP 配置详解（每个字段怎么填、去哪里找）

配置入口：**管理员登录 → 设置 → 数据与账号 → 邮件服务（SMTP）**。逐字段说明：

| 字段 | 填什么 | 说明 |
| --- | --- | --- |
| 服务器地址 * | 邮件服务商的 SMTP 域名，如 `smtp.qq.com` | 由你的**发件邮箱**所属服务商决定，见下方对照表 |
| 端口 | `465` 或 `587` | `465` = TLS 直连（勾选「TLS 直连」）；`587` = STARTTLS（**不勾**）；`25` 基本被云服务器封禁，不要用 |
| TLS 直连 | 465 勾选，587 不勾 | 与端口配套，勾错是最常见的连不上的原因 |
| 认证用户名 | 一般就是**发件邮箱完整地址** | 如 `zhangsan@qq.com`；SendGrid 等专业发信服务例外（填固定值 `apikey`） |
| 认证密码 / 授权码 | **不是邮箱登录密码！** 是「授权码 / 应用专用密码」 | 见下方各服务商的获取方法 |
| 发件人地址 | 与认证用户名相同的邮箱 | 留空默认取认证用户名；部分服务商要求必须一致，否则拒信 |

**常见邮箱服务商对照与授权码获取位置：**

| 发件邮箱 | 服务器地址 | 端口/加密 | 密码填什么 · 授权码获取路径 |
| --- | --- | --- | --- |
| QQ 邮箱 `@qq.com` | `smtp.qq.com` | 465 / TLS | **授权码**。网页版 QQ 邮箱 → 设置 → 账号 → 「POP3/IMAP/SMTP…服务」→ 开启「IMAP/SMTP 服务」→ 按提示发短信 → 生成 16 位授权码 |
| 163 邮箱 `@163.com` | `smtp.163.com` | 465 / TLS | **授权码**。网页版 → 设置 → POP3/SMTP/IMAP → 开启服务 → 新增授权码（只显示一次，记好） |
| 126 邮箱 `@126.com` | `smtp.126.com` | 465 / TLS | 同 163 |
| Gmail `@gmail.com` | `smtp.gmail.com` | 465 / TLS | **应用专用密码**。Google 账号 → 安全性 → 开启两步验证 → 应用专用密码（App Password）生成 16 位；国内网络需自行解决连通性 |
| Outlook / Hotmail | `smtp-mail.outlook.com` | 587 / STARTTLS（不勾 TLS 直连） | 直接填**邮箱登录密码**（不支持授权码）；个人免费邮箱有每日发信上限 |
| 腾讯企业邮 `@xxx.com` | `smtp.exmail.qq.com` | 465 / TLS | **客户端专用密码**。管理后台开启「安全登录」后，成员在 设置 → 客户端专用密码 生成 |
| 阿里企业邮 | `smtp.qiye.aliyun.com` | 465 / TLS | 邮箱登录密码（管理员可在后台禁用 SMTP，需确认开启） |
| iCloud 邮箱 | `smtp.mail.me.com` | 587 / STARTTLS | **App 专用密码**。Apple ID → 登录与安全 → App 专用密码 |
| Zoho | `smtp.zoho.com` | 465 / TLS | **应用专用密码**。Zoho 账户 → 安全 → 应用密码 |
| SendGrid（专业发信） | `smtp.sendgrid.net` | 587 / STARTTLS | 用户名固定填 `apikey`，密码填 SendGrid 后台生成的 API Key |
| Mailgun（专业发信） | `smtp.mailgun.org` | 587 / STARTTLS | 后台 Domain 设置页的 SMTP 凭据 |

**配置步骤与排错：**

1. 填写上表信息 → 点「保存配置」→ 状态显示"邮件服务已启用"；
2. 在「测试收件邮箱」填一个你能收信的邮箱 → 点「发送测试邮件」→ 收到即配置成功；失败时错误详情会直接显示在卡片下方；
3. 常见报错：
   - `535 Authentication failed` / 认证失败 → 密码填成了邮箱登录密码，或授权码过期/复制带了空格；
   - `connection timeout` / 超时 → 端口或 TLS 直连勾选不对（465 勾、587 不勾）；云服务器（阿里云/腾讯云）默认封 25 端口，改用 465；
   - `550 / 553 Sender denied` → 发件人地址与认证账号不一致，或服务商未开通 SMTP 服务；
   - Gmail/Outlook 报"不安全的登录" → 必须使用授权码/应用专用密码，不能用登录密码；
4. 找不到授权码入口时，在邮箱网页版的「设置」里搜索关键词“SMTP”或“授权码”；
5. 联调时可设环境变量 `MAIL_DEBUG=1`：验证码不真实发信，直接打印到服务端日志。


## 登录鉴权

系统内置多用户密码保护：启用后，**未登录无法读取或修改任何数据**（订单、耗材、打印机、记录、设置全部受保护），前端会先弹出登录门。首个创建的用户自动成为管理员。

### 启用方式

| 模式                     | 方式                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| 全部平台（默认开放模式） | 打开页面 →「设置 → 数据」→「启用密码保护」卡片创建管理员账号（PBKDF2 加盐哈希存于用户数据中）；管理员登录后可在同页添加 / 删除用户、分配角色 |

- 会话凭据为 HMAC 签名的 HttpOnly Cookie，有效期 30 天；「设置 → 数据 → 退出登录」可主动登出
- 会话过期后保存数据会被拒绝并自动回到登录页，不会丢数据（改动仍在内存中，重新登录后可重新保存）
- 「设置」内可随时修改密码，改后该账号旧会话全部失效
- 不想启用密码：不创建管理员即可，系统保持开放模式（此时任何能访问本站的人都可以读写数据，请仅在可信网络中使用）

## 数据与安全

- API 内置上述密码鉴权；即便如此，暴露公网仍建议叠加网关层访问控制（如 Cloudflare Access、反代密码）与 HTTPS
- 备份：Docker/NAS 用户直接备份数据目录；或「设置 → 导出全部数据」下 JSON，恢复时在「设置 → 恢复」导入

## 升级

| 平台               | 操作                                                             |
| ------------------ | ---------------------------------------------------------------- |
| Docker / NAS       | `git pull && docker compose up -d --build`，数据在卷里不受影响 |
| Cloudflare Workers | `git pull && npx wrangler deploy`                              |
| Vercel             | `git pull && vercel --prod`                                    |
| 裸跑 Node          | `git pull` 后重启进程即可                                      |

前端会通过 `GET /api/version` 检查新版本并在页面提示更新（`version.json` 控制版本号与更新说明，`downloadUrl` 指向 Releases 页面）。
