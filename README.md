# 适用于个人的 3D 打印经营台

前后端分离的 3D 打印接单经营工具：成本核算（材料/电/机器折旧/人工）、订单利润与欠款、耗材库存、打印记录、客户统计。**数据存服务端**，多设备访问同一地址即可共享。

## 架构

- **前端**：零构建原生 HTML/CSS/JS（`index.html + assets/`），通过 REST API 读写数据
- **后端**：零 npm 依赖的 Node/Workers 代码（`server/`），一套路由 + 存储适配器
- **API**：`GET/PUT /api/{materials|printers|records|orders|settings|achievements}`，`GET/PUT /api/data` 全量读写
- **存储适配器**：文件（Node/Docker）、Cloudflare KV（Workers）、Upstash Redis（Vercel 可选）、内存（兜底）

## 功能

- **仪表盘**：营收与利润合并卡，支持**按日 / 月 / 年筛选**展示，订单进度（进行中/已完成）、待收款提醒、低库存预警、客户排行、经营成就
- **成本计算器**：材料 + 电费 + 机器折旧 + 人工 全成本核算，建议报价 = 全成本 ×（1 + 利润加成%）；打印时长用**时/分下拉**（闹钟式）输入；「去开订单」一键把数据带入订单表单（含建议报价取整）
- **开单 / 订单列表**：独立两页；报价（应收）与多笔分期收款 → 自动算欠款；全成本自动算利润与利润率；列表支持关键字 / 状态 / **日期区间**筛选与四种排序；一键复制订单摘要
- **耗材库房**：整卷克重 / 剩余库存 / 低库存预警，打印记录自动扣减 / 删除加回，支持补货
- **打印机**：品牌下拉（拓竹 / 创想 / Prusa…）、功率电价、购入价 / 折旧年限 / 年维护费 / 使用率 → 每小时机器成本
- **打印记录**：汇总统计 + 近 12 个月成本图；**耗材 / 打印机 / 日期区间 / 关键字**筛选；导出 CSV / JSON
- **设置**：结算货币（下拉）、低库存预警线、人工时薪、利润加成%、深浅主题、备份 / 恢复 / 演示数据
- **PWA**：可安装到手机桌面；应用壳离线可用，数据实时走 API

## 成本模型

报价建议 =（耗材费 + 电费 + 机器折旧 + 人工 + 额外成本）×（1 + 利润加成%）

- 耗材费 = 材料单价（元/kg）÷ 1000 × 克数
- 电费 = 平均功率（W）÷ 1000 × 时长（h）× 电价（元/度）
- **机器折旧** =（购入价 + 年维护费 × 折旧年限）÷（折旧年限 × 8760h × 使用率）× 时长
- **人工** = 人工时薪 ÷ 60 × 接单处理分钟数（沟通 + 售后 + 交付）
- 利润 = 已收 − 总成本；欠款 = 报价 − 已收

> 只算材料和电就接单，短期看开张了，长期都是赔本买卖——机器会坏、时间值钱。

## 本地运行

```bash
npm start          # 等价于 node server/index.mjs，无需 npm install
# → http://localhost:8080（数据存 ./data/*.json，可用 DATA_DIR 环境变量改）
```

## 部署

### 方式一：Docker（推荐，含飞牛OS / 群晖 / 绿联等 NAS）

```bash
docker compose up -d   # 数据持久化在 named volume printforge-data（容器内 /data）
```

访问 `http://<设备IP>:8080`。

**飞牛OS（fnOS）操作路径**：

1. 把本项目文件夹上传到存储空间（如 `/vol1/docker/printforge`）
2. Docker 应用 → Compose → 新增项目，指向该文件夹（自动识别 `docker-compose.yml`）
3. 启动后端口映射 `8080:8080`，数据卷自动创建；局域网直接访问，配合远程访问可暴露公网

升级：`git pull && docker compose up -d --build`，数据在卷里不受影响。

### 方式二：Cloudflare Workers（KV 存储）

```bash
npx wrangler kv namespace create DATA   # 把输出的 id 填入 wrangler.jsonc
npx wrangler deploy
```

免费 KV 每日写入 1000 次，个人记账频率完全够用。不绑定 KV 时服务可启动但数据只存内存（重启即失），响应头会带 `x-storage-warning`。

### 方式三：Vercel（Serverless）

`vercel --prod` 零配置即可部署，但 serverless 文件系统是临时的——**要持久保存数据，需配置免费的 Upstash Redis**：

1. 在 [Upstash](https://upstash.com) 创建免费 Redis，拿到 REST URL 和 Token
2. Vercel 项目 → Settings → Environment Variables，添加 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`
3. 重新部署即可

### 方式四：任意有 Node 的机器 / NAS 裸跑

```bash
DATA_DIR=/vol1/printforge-data PORT=8080 node server/index.mjs
```

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
- 不想启用密码：不配置 `APP_PASSWORD` 且跳过首次设置即可，系统保持开放模式

## 数据与安全

- API 内置上述密码鉴权；即便如此，暴露公网仍建议叠加网关层访问控制（如 Cloudflare Access、反代密码）与 HTTPS
- 备份：Docker/NAS 用户直接备份数据目录；或「设置 → 导出全部数据」下 JSON
