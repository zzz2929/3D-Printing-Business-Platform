/* 3D打印业务平台 · 拓竹（Bambu Lab）耗材同步
   零依赖实现：MQTT 3.1.1 over TLS 客户端（node:tls）+ 拓竹云登录 REST
   两种来源：
     1) 局域网：打印机本身是 MQTT broker（tls://IP:8883，用户名 bblp，密码 = 局域网访问码）
        订阅 device/#（X1 系为 device/REPORT，P1/A1 系为 device/<SN>/report），
        P1/A1 只推增量，收到消息后向 device/<SN>/request 发 pushing.pushall 拉全量。
     2) 拓竹云：区域 MQTT（cn/eu/us.mqtt.bambulab.com:8883，用户名 u_<uid>（或邮箱），密码 = accessToken）
        订阅 device/+/report；设备名尽力通过 REST /v1/iot-service/api/user/bind 补充。
   仅「读取」AMS 托盘状态（耗材类型/品牌/颜色/剩余），不向打印机下发任何控制指令。 */
import tls from "node:tls";
import net from "node:net";

/* ---------- 区域端点 ---------- */
export const BAMBU_REGIONS = {
  cn: { label:"中国大陆", api:"https://api.bambulab.cn", web:"https://bambulab.cn", mqtt:"cn.mqtt.bambulab.com" },
  eu: { label:"欧洲",     api:"https://api.bambulab.com", web:"https://bambulab.com", mqtt:"eu.mqtt.bambulab.com" },
  us: { label:"北美",     api:"https://api.bambulab.com", web:"https://bambulab.com", mqtt:"us.mqtt.bambulab.com" }
};
const regionOf = r => BAMBU_REGIONS[r] || BAMBU_REGIONS.cn;

/* ---------- MQTT 3.1.1 最小编解码（仅客户端收发所需） ---------- */
function mqttStr(s){
  const b = Buffer.from(String(s), "utf8");
  if(b.length > 0xffff) throw new Error("mqtt string too long");
  const head = Buffer.alloc(2); head.writeUInt16BE(b.length);
  return Buffer.concat([head, b]);
}
function encRemLen(n){
  const out = [];
  do{ let d = n % 128; n = Math.floor(n / 128); if(n > 0) d |= 0x80; out.push(d); }while(n > 0);
  return Buffer.from(out);
}
function packet(header, body){ return Buffer.concat([Buffer.from([header]), encRemLen(body.length), body]); }

function encConnect({ clientId, username, password, keepAlive }){
  const vh = Buffer.concat([
    mqttStr("MQTT"), Buffer.from([0x04]), // 协议名 + level 4（3.1.1）
    Buffer.from([ (username ? 0x80 : 0) | (password ? 0x40 : 0) | 0x02 ]), // clean session
    Buffer.from([ (keepAlive >> 8) & 0xff, keepAlive & 0xff ])
  ]);
  const parts = [mqttStr(clientId)];
  if(username) parts.push(mqttStr(username));
  if(password) parts.push(mqttStr(password));
  return packet(0x10, Buffer.concat([vh, ...parts]));
}
function encSubscribe(packetId, topics){
  const body = Buffer.concat([ Buffer.from([ (packetId >> 8) & 0xff, packetId & 0xff ]),
    ...topics.map(t => Buffer.concat([mqttStr(t), Buffer.from([0x00])])) ]); // qos0
  return packet(0x82, body);
}
function encPublish(topic, payload){
  return packet(0x30, Buffer.concat([mqttStr(topic), Buffer.from(String(payload), "utf8")])); // qos0
}

/* 把一个 TCP 分片流解析为 MQTT 包（处理粘包与剩余长度变长编码） */
function parsePackets(buf){
  const out = [];
  let i = 0;
  while(i < buf.length){
    if(i >= buf.length) break;
    const header = buf[i];
    let len = 0, mul = 1, j = i + 1, ok = false;
    for(; j < buf.length; j++){
      const d = buf[j]; len += (d & 0x7f) * mul;
      if((d & 0x80) === 0){ j++; ok = true; break; }
      mul *= 128;
    }
    if(!ok || j + len > buf.length) break; // 包不完整，等待更多数据
    out.push({ header, type: header >> 4, body: buf.subarray(j, j + len) });
    i = j + len;
  }
  return { packets: out, rest: i < buf.length ? buf.subarray(i) : Buffer.alloc(0) };
}

/* ---------- 一次性 MQTT 会话：连接 → 订阅 → 收集 PUBLISH → 超时断开 ----------
   返回 { packets:[{topic, payload}], connack }；认证/网络错误以 reject 抛出（含中文可读信息）。
   tls:false 仅用于本地协议回环测试（假 broker）。 */
export function mqttSession({ host, port = 8883, username, password, topics, timeoutMs = 6000,
  rejectUnauthorized = false, onReady, onPublish, keepAlive = 60, tls: useTls = true }){
  return new Promise((resolve, reject) => {
    let settled = false;
    const packets = [];
    let connack = -1, buf = Buffer.alloc(0);
    const done = err => {
      if(settled) return; settled = true;
      clearTimeout(timer);
      try{ sock.destroy(); }catch(e){}
      if(err) reject(err instanceof Error ? err : new Error(String(err)));
      else resolve({ packets, connack });
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    let sock;
    try{
      sock = useTls
        ? tls.connect({ host, port, rejectUnauthorized, servername: host }, () => {
            sock.write(encConnect({ clientId: "pf3d_" + Date.now().toString(36), username, password, keepAlive }));
          })
        : net.connect({ host, port }, () => {
            sock.write(encConnect({ clientId: "pf3d_" + Date.now().toString(36), username, password, keepAlive }));
          });
    }catch(e){ return done(new Error("无法连接 " + host + ":" + port + "（" + e.message + "）")); }
    sock.setTimeout(timeoutMs, () => done(null));
    sock.on("error", e => done(new Error("连接失败：" + (e.message || e.code || "网络错误"))));
    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      const { packets: ps, rest } = parsePackets(buf);
      buf = rest;
      for(const p of ps){
        if(p.type === 2){ // CONNACK
          connack = p.body.length >= 2 ? p.body[1] : -1;
          if(connack !== 0) return done(new Error(
            connack === 4 || connack === 5 ? "MQTT 认证被拒绝（用户名或密码/访问码错误）"
              : "MQTT 连接被拒绝（错误码 " + connack + "）"));
          sock.write(encSubscribe(1, topics));
        }else if(p.type === 9){ // SUBACK
          if(onReady) try{ onReady(sock); }catch(e){}
        }else if(p.type === 3){ // PUBLISH
          if(p.body.length < 4) continue;
          const tlen = p.body.readUInt16BE(0);
          if(p.body.length < 2 + tlen) continue;
          const topic = p.body.subarray(2, 2 + tlen).toString("utf8");
          let off = 2 + tlen;
          const qos = (p.header >> 1) & 0x03;
          if(qos > 0) off += 2; // qos>0 时主体前有 2 字节包 id（订阅 qos0 时不会出现，防御性跳过）
          const payload = p.body.subarray(off).toString("utf8");
          packets.push({ topic, payload });
          if(onPublish) try{ onPublish(topic, payload); }catch(e){}
        }
      }
    });
  });
}

/* ---------- 通用：JSON 安全解析 ---------- */
function jparse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }

/* 型号推断：优先设备名（官方名/自定义名常含型号），再按序列号前缀（社区对照表，尽力而为） */
const MODEL_PATTERNS = ["X1C", "X1E", "P1S", "P1P", "A1 MINI", "A1", "X1"];
const MODEL_SN_PREFIX = { "00M": "X1C", "00K": "X1", "01P": "P1S", "030": "A1", "039": "A1 MINI" };
function modelFromDevName(name){
  const s = String(name || "").toUpperCase().replace(/BAMBU\s*LAB|拓竹/g, " ");
  for(const m of MODEL_PATTERNS) if(s.includes(m)) return m;
  return "";
}
function modelFromDevId(id){
  return MODEL_SN_PREFIX[String(id || "").toUpperCase().slice(0, 3)] || "";
}

/* ---------- 报告解析：print 报文 → 归一化托盘列表 ----------
   托盘：{ slot, ext, brand, type, color, weight, remain, remaining, uuid, tagUid, idx, name } */
export function parseReport(payload, devIdFromTopic){
  const msg = jparse(payload);
  const p = msg && (msg.print || msg);
  if(!p || typeof p !== "object") return null;
  const devId = p.dev_id || devIdFromTopic || "";
  const out = { devId, devName: p.dev_name || "", devModel: modelFromDevName(p.dev_name) || modelFromDevId(devId), trays: [] };
  const hexColor = c => {
    const s = String(c || "").trim().toUpperCase();
    if(!/^[0-9A-F]{6,8}$/.test(s) || /^0+$/.test(s.slice(0, 6))) return "";
    return "#" + s.slice(0, 6);
  };
  const normTray = (t, label, ext) => {
    if(!t || typeof t !== "object") return null;
    const type = String(t.tray_type || "").trim();
    const color = hexColor(t.tray_color);
    const weight = Math.max(0, parseFloat(t.tray_weight) || 0);
    // 兼容两种字段：老固件 tray_remain / 新固件 remain（均为 0-100 百分比）
    let remain = parseFloat(t.tray_remain);
    if(!isFinite(remain)) remain = parseFloat(t.remain);
    if(!isFinite(remain)) remain = null;
    if(remain != null) remain = Math.max(0, Math.min(100, remain));
    const uuid = String(t.tray_uuid || "").replace(/^0+$/, "");
    const tagUid = String(t.tag_uid || "").replace(/^0+$/, "");
    if(!type && !color && !uuid) return null; // 空槽位
    return {
      slot: label, ext: !!ext, type,
      brand: String(t.tray_sub_brands || "").trim(),
      color, weight, remain,
      remaining: remain != null ? Math.round(weight * remain / 100) : null,
      uuid, tagUid,
      idx: String(t.tray_info_idx || "").trim(),
      name: String(t.tray_name || "").trim()
    };
  };
  const ams = p.ams;
  if(ams && Array.isArray(ams.ams)){
    ams.ams.forEach((unit, ui) => {
      if(!unit || typeof unit !== "object") return;
      const unitName = "AMS-" + String.fromCharCode(65 + (parseInt(unit.id, 10) || ui)); // AMS-A/B/C…
      (Array.isArray(unit.tray) ? unit.tray : []).forEach((t, ti) => {
        if(!t || typeof t !== "object") return;
        const tray = normTray(t, unitName + "-" + ((parseInt(t.id, 10) || 0) + 1), false);
        if(tray) out.trays.push(tray);
      });
    });
  }
  const vt = normTray(p.vt_tray, "外部料盘", true); // 虚拟托盘 = 进料口外挂料卷
  if(vt) out.trays.push(vt);
  return out;
}

/* ---------- 局域网：抓取一台打印机的 AMS 快照 ----------
   X1 系每次上报全量；P1/A1 系只推增量 → 订阅后从报告 topic 记下序列号，
   在第 ~2s 和 ~4.5s 各向 device/<SN>/request 发一次 pushing.pushall 拉全量，同窗口内继续收集。 */
export async function fetchLan({ host, port = 8883, code, timeoutMs = 9000, tls: useTls = true }){
  if(!host) throw new Error("缺少打印机 IP / 主机名");
  if(!code) throw new Error("缺少局域网访问码");
  const seen = new Set();
  const push = (sock, sn) => {
    try{ sock.write(encPublish("device/" + sn + "/request", JSON.stringify({ pushing:{ pushall:true }, user_id:"0" }))); }catch(e){}
  };
  const r = await mqttSession({
    host, port, username: "bblp", password: String(code),
    topics: ["device/#"], timeoutMs, tls: useTls,
    onPublish(topic){ const m = topic.match(/^device\/([0-9A-Za-z]{10,})\/report/i); if(m) seen.add(m[1]); },
    onReady(sock){
      [2000, 4500].forEach(at => setTimeout(() => seen.forEach(sn => push(sock, sn)), at));
    }
  });
  const infos = r.packets.map(pk => parseReport(pk.payload,
    (pk.topic.match(/^device\/([0-9A-Za-z]+)\/report/i) || [])[1] || "")).filter(Boolean);
  const withTrays = infos.filter(x => x.trays.length);
  if(!withTrays.length){
    if(r.connack === 0) throw new Error("已连上打印机但未收到耗材数据：请确认 AMS 已插好、局域网服务已开启，稍后重试");
    throw new Error("连接打印机超时或无响应：请检查 IP 与端口是否正确、打印机是否在线、局域网服务是否开启");
  }
  const dev = withTrays[0];
  return { devId: dev.devId, devName: dev.devName, devModel: dev.devModel || "", trays: withTrays.flatMap(x => x.trays) };
}

/* ---------- 拓竹云 ---------- */
async function restJson(url, opts = {}, timeoutMs = 10000){
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try{
    const r = await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
    const j = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error((j && (j.message || j.error)) || "HTTP " + r.status);
    return j;
  }finally{ clearTimeout(t); }
}

/* 同上但保留状态码与 Set-Cookie（2FA 的 accessToken 在响应 Cookie 里） */
async function restRaw(url, opts = {}, timeoutMs = 10000){
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try{
    const r = await fetch(url, Object.assign({}, opts, { signal: ctl.signal }));
    const j = await r.json().catch(() => null);
    let setCookies = [];
    if(r.headers.getSetCookie) setCookies = r.headers.getSetCookie();
    else { const sc = r.headers.get("set-cookie"); if(sc) setCookies = [sc]; }
    return { status: r.status, json: j, setCookies };
  }finally{ clearTimeout(t); }
}

/* 账号类型：手机号（5-15 位数字，可带 + 国际区号）或邮箱 */
function accountKind(account){
  const s = String(account || "").trim();
  if(/@/.test(s)) return "email";
  if(/^\+?\d{5,15}$/.test(s)) return "phone";
  return "invalid";
}

/* 下发登录验证码：手机号 → 短信，邮箱 → 邮件（端点与字段参考拓竹 App / 同类开源集成实现） */
export async function cloudSendCode({ region = "cn", account }){
  const base = regionOf(region).api;
  const kind = accountKind(account);
  if(kind === "invalid") throw new Error("请填写正确的手机号或邮箱");
  const isPhone = kind === "phone";
  const url = base + (isPhone ? "/v1/user-service/user/sendsmscode" : "/v1/user-service/user/sendemail/code");
  const body = isPhone
    ? { phone: String(account).trim(), type: "codeLogin" }
    : { email: String(account).trim(), type: "codeLogin" };
  await restJson(url, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  }).catch(e => {
    throw new Error((isPhone ? "短信" : "邮件") + "验证码发送失败：" + captchaHint(e));
  });
  return { ok: true, channel: isPhone ? "sms" : "email" };
}

/* 拓竹风控（HTTP 418 + 极验 gcaptcha4 质询 / Cloudflare）的可读提示 */
function captchaHint(e){
  const m = String((e && e.message) || "");
  if(/418|robot|captcha|geetest/i.test(m))
    return "拓竹要求人机验证（极验），第三方应用暂无法在服务端完成；建议改用 accessToken 方式登录";
  if(/403|cloudflare/i.test(m))
    return "请求被拓竹安全防护拦截；可稍后重试或改用 accessToken 登录";
  return m;
}

/* 云账号登录（流程参考拓竹 App 与同类开源集成的通用实现）：
   1) account + password        → 密码登录；账号开启验证时返回 { needCode:true, tfaKey? }
   2) account + code            → 提交验证码登录（验证码用 cloudSendCode 下发：手机走短信、邮箱走邮件）
   3) account + code + tfaKey   → 2FA：POST web 域 /api/sign-in/tfa，accessToken 在响应 Cookie
   成功返回 { token }。 */
export async function cloudLogin({ region = "cn", account, password, code, tfaKey }){
  const r = regionOf(region);
  const acc = String(account || "").trim();
  if(!acc) throw new Error("请填写拓竹账号（手机号或邮箱）");
  if(accountKind(acc) === "invalid") throw new Error("账号格式不正确：请填写手机号或邮箱");
  if(code && tfaKey){ // 2FA：tfaKey + 验证码，token 在 Set-Cookie 的 token 字段
    const out = await restRaw(r.web + "/api/sign-in/tfa", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ tfaKey, tfaCode: String(code) })
    });
    const ck = (out.setCookies || []).map(c => /^token=([^;]+)/.exec(c)).find(Boolean);
    if(ck) return { token: decodeURIComponent(ck[1]) };
    if(out.json && out.json.accessToken) return { token: out.json.accessToken };
    throw new Error("2FA 验证码校验未通过");
  }
  if(code && !password){ // 验证码登录（不自动重发验证码）
    const j = await restJson(r.api + "/v1/user-service/user/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: acc, code: String(code) })
    });
    if(j && j.accessToken) return { token: j.accessToken };
    throw new Error((j && (j.message || j.error)) || "验证码校验未通过或已过期");
  }
  if(!password) throw new Error("请填写密码；或点「获取验证码」改用短信验证码登录");
  const j = await restJson(r.api + "/v1/user-service/user/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ account: acc, password, apiError: "" })
  }).catch(e => {
    throw new Error("登录请求失败：" + captchaHint(e));
  });
  if(j && j.accessToken) return { token: j.accessToken };
  const lt = String((j && j.loginType) || "");
  if(lt === "verifyCode" || lt === "verify_code") return { needCode: true }; // 需短信/邮件验证码，用 cloudSendCode 下发
  if(lt === "tfa" || (j && (j.tfaKey || (j.tfa && j.tfa.tfaKey))))
    return { needCode: true, tfaKey: (j && j.tfaKey) || (j && j.tfa && j.tfa.tfaKey) || "" };
  if(j && j.tfa) return { needCode: true, tfaKey: j.tfa.tfaKey || "" };
  const msg = String((j && (j.message || j.error)) || "");
  throw new Error(msg || "登录未成功，请检查账号密码（若提示需要验证码，请点「发送验证码」后填写再登录）");
}

/* 云设备列表（尽力而为，用于显示设备名；失败不影响 MQTT 抓取） */
export async function cloudDevices({ region = "cn", token }){
  try{
    const j = await restJson(regionOf(region).api + "/v1/iot-service/api/user/bind", {
      headers: { authorization: "Bearer " + token, "content-type": "application/json" }
    }, 6000);
    const list = (j && j.devices) || [];
    return list.map(d => ({ devId: d.dev_id || "", name: d.dev_name || "", model: d.dev_model_name || "" }))
      .filter(d => d.devId);
  }catch(e){ return []; }
}

/* 云端抓取：MQTT 订阅 device/+/report 收集所有设备报告 */
export async function fetchCloud({ region = "cn", email, token, timeoutMs = 9000 }){
  if(!token) throw new Error("缺少 accessToken");
  const host = regionOf(region).mqtt;
  // 用户名优先 u_<uid>（新版鉴权），连不上再退回邮箱（旧版）；uid 尽力获取
  let uid = "";
  try{
    const j = await restJson(regionOf(region).api + "/v1/design-user-service/my/preference", {
      headers: { authorization: "Bearer " + token }
    }, 6000);
    uid = String((j && (j.uid || (j.preference && j.preference.uid))) || "");
  }catch(e){}
  const names = {};
  cloudDevices({ region, token }).then(ds => ds.forEach(d => { if(d.name || d.model) names[d.devId] = { name: d.name || "", model: d.model || "" }; })).catch(() => {});
  const attempt = user => mqttSession({
    host, port: 8883, username: user, password: token, topics: ["device/+/report"], timeoutMs
  });
  let r = await attempt(uid ? "u_" + uid : email);
  if(uid && r.connack !== 0) r = await attempt(email); // u_<uid> 不行则退回邮箱
  const byDev = {};
  r.packets.forEach(pk => {
    const sn = (pk.topic.match(/^device\/([0-9A-Za-z]+)\/report/i) || [])[1] || "";
    const info = parseReport(pk.payload, sn);
    if(!info || !info.trays.length) return;
    const key = info.devId || sn;
    if(!byDev[key]) byDev[key] = { devId: key, devName: info.devName || (names[key] && names[key].name) || "", devModel: info.devModel || (names[key] && names[key].model) || "", trays: [] };
    // 同一设备多条报告：uuid 相同的取剩余更多者，uuid 未知则按 槽位+类型+颜色 去重
    info.trays.forEach(t => {
      const k = t.uuid ? null : (t.slot + "|" + t.type + "|" + t.color);
      const prev = byDev[key].trays.find(x => (t.uuid ? x.uuid === t.uuid : (x.slot + "|" + x.type + "|" + x.color) === k));
      if(!prev) byDev[key].trays.push(t);
      else if(prev.remaining == null || (t.remaining != null && t.remaining > prev.remaining)) Object.assign(prev, t);
    });
  });
  const devices = Object.values(byDev);
  if(!devices.length){
    if(r.connack === 0) throw new Error("云连接成功但未收到设备数据：请确认打印机在线并已绑定到该拓竹账号");
    throw new Error("云端 MQTT 认证失败或无数据：token 可能已过期，请重新登录拓竹账号");
  }
  devices.forEach(d => {
    const meta = names[d.devId] || {};
    if(!d.devName && meta.name) d.devName = meta.name;
    if(!d.devModel && meta.model) d.devModel = meta.model;
  });
  return { devices };
}

/* ---------- 汇总：根据配置抓取来源 ----------
   cfg.mode = "lan" | "cloud" → 只抓对应来源（二选一）；
   旧配置无 mode → 两种都抓（兼容升级前的既有配置）。
   cfg = { mode?, lan:[{ name, host, code }], cloud:{ region, email, token } }
   返回 { sources:[{ kind, name, ok, error?, devices:[{ devId, devName, trays }] }], fetchedAt } */
export async function fetchAll(cfg, { lanTimeoutMs = 9000, cloudTimeoutMs = 9000 } = {}){
  const sources = [];
  const jobs = [];
  const useLan = cfg.mode !== "cloud", useCloud = cfg.mode !== "lan";
  if(useLan) (Array.isArray(cfg.lan) ? cfg.lan : []).forEach((p, i) => {
    if(!p || !p.host) return;
    jobs.push(fetchLan({ host: p.host, code: p.code, timeoutMs: lanTimeoutMs })
      .then(d => sources.push({ kind:"lan", name: p.name || ("局域网打印机 " + (i + 1)), host: p.host, ok:true,
        devices:[{ devId: d.devId || "", devName: d.devName || p.name || p.host, devModel: d.devModel || "", trays: d.trays }] }))
      .catch(e => sources.push({ kind:"lan", name: p.name || ("局域网打印机 " + (i + 1)), host: p.host, ok:false, error: e.message })));
  });
  const c = cfg.cloud || {};
  if(useCloud && c.token){
    jobs.push(fetchCloud({ region: c.region, email: c.email, token: c.token, timeoutMs: cloudTimeoutMs })
      .then(d => sources.push({ kind:"cloud", name: "拓竹云 · " + (c.email || regionOf(c.region).label), region: c.region, ok:true, devices: d.devices }))
      .catch(e => sources.push({ kind:"cloud", name: "拓竹云 · " + (c.email || regionOf(c.region).label), region: c.region, ok:false, error: e.message })));
  }
  await Promise.all(jobs);
  if(!jobs.length) throw new Error(cfg.mode === "cloud"
    ? "拓竹云还未登录：请先登录拓竹账号或粘贴 accessToken"
    : "尚未配置连接：请先添加打印机或登录拓竹账号");
  sources.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "lan" ? -1 : 1));
  return { sources, fetchedAt: Date.now() };
}
