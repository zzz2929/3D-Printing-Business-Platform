/* 3D打印业务平台 版本信息 · 单一来源
   发新版时改这里 + package.json 的 version（保持一致）。
   前端通过 GET /api/version 获取；「检查更新」则拉取用户配置的远程 version.json
   并与 APP_VERSION 做比较。远程 version.json 建议格式：
   { "version":"2.5.0", "date":"2026-10-01", "notes":["xxx"], "downloadUrl":"https://…" } */
export const APP_VERSION = "1.0.0";
export const BUILD_DATE = "2026-09-12";

export const CHANGELOG = [
  { 
    v:"1.0.1", date:"2026-09-12", items:[
      "修复登录鉴权问题",
    ]
  },
  {
    v:"1.0.0", date:"2026-09-12", items:[
      "3D打印业务平台 正式发布：面向个人的 3D 打印接单经营台，前后端分离，数据存服务端、多设备访问即共享",
      "仪表盘：营收与利润、订单进度、待收款提醒、低库存预警、客户排行与经营成就",
      "成本计算器：材料 + 电费 + 机器折旧 + 人工 全成本核算，建议报价一键带入开单",
      "开单与订单列表：报价 / 分期收款 / 欠款与利润跟踪，支持关键字、状态、日期区间筛选与排序",
      "耗材库房与打印机：整卷克重、剩余库存与低库存预警、补货，打印记录自动扣减",
      "打印记录：汇总统计 + 近 12 个月成本图，多维筛选，支持 CSV / JSON 导出",
      "登录鉴权：PBKDF2 加盐哈希密码保护 + 30 天会话，可选开放模式",
      "PWA 可安装、离线可用；支持 Docker / NAS、Cloudflare Workers、Vercel 与裸跑 Node 部署"
    ]
  }
];

export function appVersion(){
  return { version:APP_VERSION, build:BUILD_DATE, changelog:CHANGELOG };
}
