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
├── server/               # Node 宿主（零 npm 依赖）
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

要求 Node ≥ 18，无需 `npm install`：

```bash
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
    # 标记此容器由Watchtower管理
    labels:
      - "com.centurylinklabs.watchtower.enable=true"

  # 自动更新容器 - 检测到新镜像后自动重建
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      # 时区
      - TZ=Asia/Shanghai
      # 检测间隔（秒），默认300秒(5分钟)，这里设30分钟
      - WATCHTOWER_POLL_INTERVAL=1800
      # 更新前清理旧镜像
      - WATCHTOWER_CLEANUP=true
      # 通知（可选，取消注释可启用邮件通知）
      # - WATCHTOWER_NOTIFICATIONS=email
      # - WATCHTOWER_NOTIFICATION_EMAIL_FROM=发件邮箱
      # - WATCHTOWER_NOTIFICATION_EMAIL_TO=收件邮箱
      # - WATCHTOWER_NOTIFICATION_EMAIL_SERVER=smtp.qq.com
      # - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_PORT=587
      # - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_USER=你的邮箱
      # - WATCHTOWER_NOTIFICATION_EMAIL_SERVER_PASSWORD=授权码
    restart: unless-stopped

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
| `APP_PASSWORD`             | 未设置     | 管理密码；不设置时可在页面首次引导中设置 | 全部          |
| `UPSTASH_REDIS_REST_URL`   | —         | Upstash Redis REST 地址                  | Vercel        |
| `UPSTASH_REDIS_REST_TOKEN` | —         | Upstash Redis REST Token                 | Vercel        |

## 登录鉴权

系统内置密码保护：启用后，**未登录无法读取或修改任何数据**（订单、耗材、打印机、记录、设置全部受保护），前端会先弹出登录门。

### 启用方式（三选一）

| 平台                     | 方式                                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Docker / NAS / 裸跑 Node | 什么都不用配——首次打开页面会引导你「设置管理密码」（PBKDF2 加盐哈希存于`data/auth.json`）；也可用环境变量 `APP_PASSWORD=你的密码` |
| Cloudflare Workers       | `npx wrangler secret put APP_PASSWORD`（输入密码后重新部署）                                                                          |
| Vercel                   | 项目环境变量添加`APP_PASSWORD`（建议同时配置 Upstash，否则密码记录无法持久化）                                                        |

- 会话凭据为 HMAC 签名的 HttpOnly Cookie，有效期 30 天；「设置 → 数据 → 退出登录」可主动登出
- 会话过期后保存数据会被拒绝并自动回到登录页，不会丢数据（改动仍在内存中，重新登录后可重新保存）
- 「设置」内可随时修改管理密码，改后旧会话全部失效
- 不想启用密码：不配置 `APP_PASSWORD` 且跳过首次设置即可，系统保持开放模式

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
