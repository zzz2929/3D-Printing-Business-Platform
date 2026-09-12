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

### 方式一：Docker（推荐，含飞牛OS / 群晖 / 绿联等 NAS）

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

### 方式二：Docker Compose

```yaml
services:
  3d-printing-business:
    image: zzz2929/3d-printing-business:latest
    container_name: 3d-printing-business
    restart: unless-stopped
    ports:
      - "2929:2929"
    volumes:
      - 3d-printing-business-data:/data

volumes:
  3d-printing-business-data:
```

### 方式三：Cloudflare Workers（KV 存储）

```bash
npx wrangler kv namespace create DATA   # 把输出的 id 填入 wrangler.jsonc
npx wrangler deploy
```

免费 KV 每日写入 1000 次，个人记账频率完全够用。不绑定 KV 时服务可启动但数据只存内存（重启即失），响应头会带 `x-storage-warning`。

### 方式四：Vercel（Serverless）

`vercel --prod` 零配置即可部署，但 serverless 文件系统是临时的——**要持久保存数据，需配置免费的 Upstash Redis**：

1. 在 [Upstash](https://upstash.com) 创建免费 Redis，拿到 REST URL 和 Token
2. Vercel 项目 → Settings → Environment Variables，添加 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`
3. 重新部署即可

### 方式四：任意有 Node 的机器 / NAS 裸跑

```bash
DATA_DIR=/vol1/3d-printing-business-data PORT=2929 node server/index.mjs
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
