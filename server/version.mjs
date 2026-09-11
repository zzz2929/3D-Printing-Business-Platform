/* PrintForge 版本信息 · 单一来源
   发新版时改这里 + package.json 的 version（保持一致）。
   前端通过 GET /api/version 获取；「检查更新」则拉取用户配置的远程 version.json
   并与 APP_VERSION 做比较。远程 version.json 建议格式：
   { "version":"2.5.0", "date":"2026-10-01", "notes":["xxx"], "downloadUrl":"https://…" } */
export const APP_VERSION = "2.4.0";
export const BUILD_DATE = "2026-09-10";

export const CHANGELOG = [
  {
    v:"2.4.0", date:"2026-09-10", items:[
      "新增登录鉴权：密码保护全部数据（PBKDF2 加盐哈希 + 30 天 HMAC 会话 Cookie）",
      "首次访问可引导设置管理密码；支持环境变量 APP_PASSWORD（Workers/Vercel 为 secret）",
      "设置页新增「退出登录」；会话过期自动回到登录门，不丢未保存的改动",
      "Node 宿主完整转发请求头（修复 Cookie 丢失），端口占用时给出友好提示"
    ]
  },
  {
    v:"2.3.0", date:"2026-09-09", items:[
      "耗材/打印机列表新增编辑按钮（表单编辑模式，保留原数据）",
      "设置页改版：新增默认处理耗时、订单号前缀、启动页、备份时间显示",
      "仪表盘支持日期区间筛选（与订单列表同款），保留近7天/近6月/近5年快捷按钮",
      "颜色名选择后取色框自动联动；耗材表单列宽优化（价格窄、颜色宽）"
    ]
  },
  {
    v:"2.2.0", date:"2026-09-09", items:[
      "前后端分离：REST API + 服务端存储（Node 文件 / Workers KV / Vercel+Redis），多设备共享数据",
      "订单列表独立成页；订单与打印记录支持日期区间筛选",
      "计算器打印时长改为时/分下拉（闹钟式）；「去开订单」自动带入全部数据与建议报价",
      "打印机品牌下拉；必填项红点与图例；结算货币改为下拉选择；新手引导",
      "旧版 localStorage 数据自动迁移上载；服务不可达自动降级本地模式"
    ]
  },
  {
    v:"2.1.0", date:"2026-09-09", items:[
      "成本累加模型：新增人工成本（时薪×处理耗时）与机器折旧（购入价/年限/维护/使用率）",
      "建议报价改为 全成本 ×（1 + 利润加成%），利润率与欠款跟踪"
    ]
  },
  {
    v:"2.0.0", date:"2026-09-08", items:[
      "品牌化重构为 PrintForge：机库深灰 × 热床琥珀新 UI，桌面侧栏 / 移动端自适应",
      "仪表盘、客户排行、经营成就、耗材库存与低库存预警、月度图表",
      "Docker / 飞牛OS / Cloudflare Workers / Vercel 多平台部署"
    ]
  }
];

export function appVersion(){
  return { version:APP_VERSION, build:BUILD_DATE, changelog:CHANGELOG };
}
