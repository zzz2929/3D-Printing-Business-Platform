/* 3D打印业务平台 · 邮件发送（nodemailer）
   配置优先级：管理员在设置页保存的 SMTP 配置（store "smtp" 集合）> 环境变量兜底
   环境变量：SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / MAIL_FROM / MAIL_DEBUG */
import nodemailer from "nodemailer";

function envCfg(env){
  if(!env || !env.SMTP_HOST) return null;
  const secure = env.SMTP_SECURE === "1" || env.SMTP_SECURE === "true" || Number(env.SMTP_PORT) === 465;
  return {
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || (secure ? 465 : 587),
    secure,
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.MAIL_FROM || env.SMTP_USER || "",
    debug: env.MAIL_DEBUG === "1"
  };
}
function savedCfg(cfg){
  if(!cfg || !cfg.host) return null;
  return {
    host: cfg.host,
    port: Number(cfg.port) || (cfg.secure ? 465 : 587),
    secure: !!cfg.secure,
    user: cfg.user || "",
    pass: cfg.pass || "",
    from: cfg.from || "",
    debug: !!cfg.debug
  };
}

export function createMailer(env, getSavedConfig){
  const debugOnly = env && env.MAIL_DEBUG === "1" && !env.SMTP_HOST;

  async function resolveCfg(){
    try{
      const cfg = savedCfg(getSavedConfig ? await getSavedConfig() : null);
      if(cfg) return cfg;
    }catch(e){ /* 配置读取失败时回退环境变量 */ }
    const ec = envCfg(env);
    if(ec) return ec;
    if(debugOnly) return { debug: true };
    return null;
  }

  return {
    configured: async () => !!(await resolveCfg()),
    /* 当前生效配置（供管理端展示；密码不外传） */
    describe: async () => {
      const cfg = await resolveCfg();
      if(!cfg) return { configured:false };
      return { configured:true, debug:!!cfg.debug, host:cfg.host || "", port:cfg.port || "", secure:!!cfg.secure, user:cfg.user || "", from:cfg.from || "" };
    },
    /* 用指定配置发信（供“测试邮件”按钮在保存前试发；纯调试配置只打印日志） */
    sendWith: async (cfg, to, subject, text) => {
      const c = savedCfg(cfg);
      if(!c && !(cfg && cfg.debug)) throw new Error("SMTP 未配置（至少填写服务器地址）");
      if(!c || c.debug){ console.log("[MAIL:DEBUG]", "→", to, "·", subject, "·", text.replace(/\n/g, " ")); return; }
      const transport = nodemailer.createTransport({
        host: c.host, port: c.port, secure: c.secure,
        auth: c.user ? { user: c.user, pass: c.pass } : undefined,
        connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000
      });
      await transport.sendMail({ from: c.from || c.user, to, subject, text });
    },
    async send(to, subject, text){
      const cfg = await resolveCfg();
      if(!cfg) throw new Error("邮件服务未配置");
      return this.sendWith(cfg, to, subject, text);
    }
  };
}
