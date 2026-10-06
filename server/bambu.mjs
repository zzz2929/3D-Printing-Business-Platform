/* 3D打印业务平台 · 拓竹（Bambu Lab）耗材同步
   零依赖实现：MQTT 3.1.1 over TLS 客户端（node:tls）+ 拓竹云登录 REST
   两种来源：
     1) 局域网：打印机本身是 MQTT broker（tls://IP:8883，用户名 bblp，密码 = 局域网访问码）
        订阅 device/#（X1 系为 device/REPORT，P1/A1 系为 device/<SN>/report），
        P1/A1 只推增量，收到消息后向 device/<SN>/request 发 pushing.pushall 拉全量。
     2) 拓竹云：区域 MQTT（cn/eu/us.mqtt.bambulab.com:8883，用户名 u_<uid>（或邮箱），密码 = accessToken）
        订阅 device/<SN>/report（云 broker 的 ACL 仅授权精确主题，通配符 device/+/report 会被 0x80 拒绝）；
        设备名尽力通过 REST /v1/iot-service/api/user/bind 补充。
    P1/A1 系（P1S/P1P/A1/A1 MINI）在云端与局域网都只推增量：空闲待机时不会主动上报全量，
    因此两种模式都会在连接后向 device/<SN>/request 发送 pushing.pushall 主动拉取全量快照
    （云端优先用 REST 设备列表里的 dev_id，避免静默设备连一条 report 都不推时无从得知序列号）。
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
/* qos1 发布（带 packetId）：X2D 等新机型云端 gateway 对 request 主题仅认可 qos1 + 递增 sequence_id，
   否则 pushall 会被静默丢弃（实测对比验证：qos0/时间戳 seq/双载荷均无响应，qos1+递增立即回全量） */
function encPublishQos1(packetId, topic, payload){
  return packet(0x32, Buffer.concat([mqttStr(topic),
    Buffer.from([(packetId >> 8) & 0xff, packetId & 0xff]),
    Buffer.from(String(payload), "utf8")]));
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
          // onPublish 返回 true → 数据已满足要求，提前结束窗口（避免干等满 timeoutMs）
          if(onPublish){
            let early = false;
            try{ early = onPublish(topic, payload) === true; }catch(e){}
            if(early){ done(null); return; }
          }
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

/* 请求设备推送全量状态（P1/A1/X2D 等默认只推增量，空闲待机时需主动拉取才有数据）。
   载荷与发送方式对齐客户端实现（hanye3Dprintergroup-control / Home Assistant ha-bambulab）：
   单载荷 { pushing:{ sequence_id:<递增>, command:"pushall" } } + qos1 发布。
   X2D 云端实测：qos0 / 时间戳 sequence_id / 附加 pushall:true 双载荷 均无响应，
   仅此格式（sequence_id 从 1 递增的小整数 + qos1 + 无多余字段）可稳定 0~2s 内拿到全量 report。
   重复发送无副作用：打印机可能回多遍全量，由收集端按 uuid/槽位去重。 */
let _pushPktId = 1; // qos1 publish 的 packetId（单连接内递增即可）
function pushFullState(sock, sn, getSeq){
  if(!sock || !sn) return;
  const payload = { pushing: { sequence_id: getSeq(), command: "pushall" } };
  try{ sock.write(encPublishQos1(_pushPktId++, "device/" + sn + "/request", JSON.stringify(payload))); }catch(e){}
}

/* 品牌规范化：AMS 报告的 tray_sub_brands 官方料为 "Bambu"，统一成平台预设品牌名，匹配与显示更一致 */
function normBrand(b){
  const s = String(b || "").trim();
  if(/^bambu$/i.test(s)) return "Bambu Lab 拓竹";
  return s;
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
    const name = String(t.tray_name || t.tray_id_name || "").trim();
    // 颜色全 0/缺失时按名称/类型关键字兜底（与云端耗材库 guessColor 一致，缓解 AMS 托盘颜色丢失显示灰块）
    let color = hexColor(t.tray_color);
    if(!color) color = guessColor(name, type);
    const weight = Math.max(0, parseFloat(t.tray_weight) || 0);
    // 兼容两种字段：老固件 tray_remain / 新固件 remain（均为 0-100 百分比）
    // X2D 等新机型无 RFID 标签时 remain=-1 → 剩余量未知（不能误算为 0%）
    let remain = parseFloat(t.tray_remain);
    if(!isFinite(remain)) remain = parseFloat(t.remain);
    if(!isFinite(remain) || remain < 0) remain = null;
    if(remain != null) remain = Math.max(0, Math.min(100, remain));
    const uuid = String(t.tray_uuid || "").replace(/^0+$/, "");
    const tagUid = String(t.tag_uid || "").replace(/^0+$/, "");
    if(!type && !color && !uuid) return null; // 空槽位
    return {
      slot: label, ext: !!ext, type,
      brand: normBrand(t.tray_sub_brands),
      color, weight, remain,
      remaining: remain != null ? Math.round(weight * remain / 100) : null,
      uuid, tagUid,
      idx: String(t.tray_info_idx || "").trim(),
      name
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
  const r = await mqttSession({
    host, port, username: "bblp", password: String(code),
    topics: ["device/#"], timeoutMs, tls: useTls,
    onPublish(topic){ const m = topic.match(/^device\/([0-9A-Za-z]{10,})\/report/i); if(m) seen.add(m[1]); },
    onReady(sock){
      let seq = 1;
      const getSeq = () => String(seq++);
      [500, 3000, 6000].forEach(at => setTimeout(() => Array.from(seen).forEach(sn => pushFullState(sock, sn, getSeq)), at));
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
  // 同一设备可能回多遍全量（多轮 pushall / 双 payload 格式）：按 uuid（无 uuid 按 槽位+类型+颜色）去重，保留剩余更多者
  const trayMap = new Map();
  withTrays.forEach(x => x.trays.forEach(t => {
    const k = t.uuid || (t.slot + "|" + t.type + "|" + t.color);
    const prev = trayMap.get(k);
    if(!prev) trayMap.set(k, t);
    else if(prev.remaining == null || (t.remaining != null && t.remaining > prev.remaining)) trayMap.set(k, t);
  }));
  return { devId: dev.devId, devName: dev.devName, devModel: dev.devModel || "", trays: Array.from(trayMap.values()) };
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
    return list.map(d => {
      const product = String(d.dev_product_name || "").trim(); // 产品名（如 X2D），优先作为设备名
      const model = String(d.dev_model_name || "").trim();     // 型号（如 N6-V2）
      return {
        devId: d.dev_id || "",
        name: String(d.dev_name || "").trim() || product || model,
        model: model || product || modelFromDevId(d.dev_id) || "",
        accessCode: d.dev_access_code || ""
      };
    }).filter(d => d.devId);
  }catch(e){ return []; }
}

/* 云端抓取：MQTT 精确订阅 device/<SN>/report 收集所有绑定设备的报告
   （通配符订阅会被云 broker 以 SUBACK 0x80 拒绝，必须用 REST 设备列表的序列号逐台精确订阅）。
   P1/A1/X2D 系在云端也只推增量 → 订阅确认后立即向 device/<SN>/request 发 pushall 主动拉全量，
   避免空闲打印机静默导致窗口内无数据；全部设备拿到有效托盘数据后提前结束窗口。 */
export async function fetchCloud({ region = "cn", email, token, timeoutMs = 12000, host, port = 8883, tls: useTls = true }){
  if(!token) throw new Error("缺少 accessToken");
  const mqttHost = host || regionOf(region).mqtt;
  // 用户名优先 u_<uid>（新版鉴权），连不上再退回邮箱（旧版）；uid 尽力获取
  let uid = "";
  try{
    const j = await restJson(regionOf(region).api + "/v1/design-user-service/my/preference", {
      headers: { authorization: "Bearer " + token }
    }, 6000);
    uid = String((j && (j.uid || (j.preference && j.preference.uid))) || "");
  }catch(e){}
  // 设备清单必须等待完成：既是设备名/型号来源，也是主动拉全量的序列号来源
  const meta = await cloudDevices({ region, token });
  const names = {};
  meta.forEach(d => { if(d.name || d.model) names[d.devId] = { name: d.name || "", model: d.model || "" }; });
  const seen = new Set(meta.map(d => d.devId).filter(Boolean)); // 已绑定设备：连接后即拉全量
  const gotDevs = new Set(); // 已收到有效托盘数据的设备（用于提前结束抓取窗口）
  let sockRef = null;
  const searchSeq = (() => { let n = 1; return () => String(n++); })(); // pushall sequence_id 从 1 递增（X2D 云端 gateway 校验）
  const pushAll = sock => Array.from(seen).forEach(sn => pushFullState(sock, sn, searchSeq));
  // 拓竹云 broker 的 ACL 只授权「精确主题」订阅（device/<SN>/report），通配符订阅会被拒绝（SUBACK 0x80）
  // → 必须用 REST 设备列表里的序列号逐台精确订阅，否则即使设备在线也一条数据都收不到
  let nextSubId = 2; // 包 ID 1 已被 mqttSession 初始订阅占用
  const subExact = (sock, sn) => {
    if(!sock || !sn) return;
    try{ sock.write(encSubscribe(nextSubId++, ["device/" + sn + "/report"])); }catch(e){}
  };
  const attempt = user => mqttSession({
    host: mqttHost, port, username: user, password: token,
    topics: seen.size ? Array.from(seen).map(sn => "device/" + sn + "/report") : ["device/+/report"],
    timeoutMs, tls: useTls,
    onPublish(topic, payload){
      // 新出现的序列号（REST 列表缺失/不全时的兜底）：动态补订精确主题并立即拉全量
      const m = topic.match(/^device\/([0-9A-Za-z]{10,})\/report/i);
      if(m && !seen.has(m[1])){
        seen.add(m[1]);
        if(sockRef){ pushFullState(sockRef, m[1]); subExact(sockRef, m[1]); }
      }
      // 所有已绑定设备都至少收到一份有效托盘数据 → 提前结束窗口（实测 X2D 全量 0~2s 即达）
      const info = parseReport(payload, (m || [])[1] || "");
      if(info && info.trays.length) gotDevs.add(info.devId || (m || [])[1] || "");
      return seen.size > 0 && gotDevs.size >= seen.size;
    },
    onReady(sock){
      sockRef = sock;
      [300, 4000, 9000].forEach(at => setTimeout(() => pushAll(sock), at));
    }
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
    if(r.connack === 0){
      const lanHint = meta.some(d => d.accessCode)
        ? "；已确认该设备支持局域网直连（访问码已通过云端获取，可在『局域网』模式填写打印机 IP + 访问码后再同步）"
        : "；可尝试切换『局域网』模式直连打印机";
      throw new Error("云连接成功但未收到设备数据：已精确订阅 " + seen.size + " 台绑定设备的 report 主题仍无上报，请确认打印机在线并已绑定到该拓竹账号" + lanHint);
    }
    throw new Error("云端 MQTT 认证失败或无数据：token 可能已过期，请重新登录拓竹账号");
  }
  devices.forEach(d => {
    const meta = names[d.devId] || {};
    if(!d.devName && meta.name) d.devName = meta.name;
    if(!d.devModel && meta.model) d.devModel = meta.model;
  });
  return { devices };
}

/* ---------- 拓竹云端耗材库（Bambu Studio「云同步」的切片预设） ----------
   GET /v1/iot-service/api/slicer/setting?version=1.0.0.0 列出全部预设（type=filament/printer/process），
   列表项不含类型/颜色 → 逐个取详情（官方限速约 10/s：并发 3 + 间隔 120ms，条数上限防超时）。
   返回 { items:[{ id, name, type, color, baseId }], failed, total } */
/* 颜色解析：#RRGGBB / #RRGGBBAA（取前 6 位）/ #RGB；全 0 (#000000/#00000000/#000) 视为
   "未设置颜色"返回空（Bambu 云端自定义耗材常见此值），而非纯黑 —— 纯黑应交由兜底链给合理色 */
function colorOf(v){
  const s = String(v || "").trim().replace(/^#/, "");
  let hex = "";
  if(/^[0-9a-fA-F]{6}$/.test(s)) hex = s;
  else if(/^[0-9a-fA-F]{8}$/.test(s)) hex = s.slice(0, 6);
  else if(/^[0-9a-fA-F]{3}$/.test(s)) hex = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if(!hex || /^0{6}$/.test(hex)) return "";
  return "#" + hex.toUpperCase();
}
/* 颜色兜底链：云端 filaament_colour 缺失/全 0 时，按名称/类型中的颜色关键字就近映射预设色，
   缓解 Bambu 官方已知 bug（自定义耗材云同步后颜色字段丢失）导致的灰色方块。无关键字 → 空。 */
const COLOR_KEYWORDS = [
  [/黑(色)?|black/i,      "#333333"],
  [/白(色)?|white|ivory/i,"#F5F5F5"],
  [/灰(色)?|grey|gray/i,  "#9E9E9E"],
  [/红(色)?|red|rose/i,   "#D32F2F"],
  [/橙(色)?|orange/i,     "#F57C00"],
  [/黄(色)?|yellow/i,     "#FBC02D"],
  [/绿(色)?|green/i,      "#388E3C"],
  [/蓝(色)?|blue|cyan|青/i,"#1976D2"],
  [/紫(色)?|purple|violet/i,"#7B1FA2"],
  [/粉(色)?|pink/i,       "#F48FB1"],
  [/棕(色)?|brown|coffee/i,"#5D4037"],
  [/金(色)?|gold/i,       "#B8860B"],
  [/银(色)?|silver/i,     "#B0BEC5"],
  [/透明|transparent|clear/i,"#E0E0E0"]
];
function guessColor(name, type){
  const text = String(name || "") + " " + String(type || "");
  for(const [re, c] of COLOR_KEYWORDS) if(re.test(text)) return c;
  return "";
}
/* 预设名 → 品牌/类型解析：官方命名 "Bambu PLA Basic @X1C" → 拓竹品牌 + "PLA Basic" */
function presetBrandType(name, type, baseId){
  const n = String(name || "").replace(/@.*$/, "").trim();
  if(/^(bambu\s*(lab)?|拓竹)/i.test(n)){
    const rest = n.replace(/^(bambu\s*lab|bambu|拓竹)/i, "").trim();
    return { brand: "Bambu Lab 拓竹", type: rest || type || "" };
  }
  if(/^G[A-Z]/.test(String(baseId || ""))) return { brand: "Bambu Lab 拓竹", type: type || n }; // 官方 RFID 前缀
  return { brand: "", type: type || n };
}
/* 云端耗材库抓取：默认同时取用户私有预设 + 官方公开预设（用户的 Bambu Studio 耗材库
   可引用官方耗材，只取 private 会让官方耗材缺失、与手机端对不上），按 baseId/名称去重后
   私有项排前；也可传 includePublic=false 只取私有。详情（类型/颜色/RFID 基底）逐条获取——
   官方限速约 10/s，用全局限速器控制在 ~8/s，条数不设硬上限（保护上限 150）。 */
export async function cloudPresetFilaments({ region = "cn", token, limit = 150, includePublic = true }){
  const base = regionOf(region).api;
  const H = { authorization: "Bearer " + token, "content-type": "application/json" };
  const raw = await restJson(base + "/v1/iot-service/api/slicer/setting?version=1.0.0.0", { headers: H }, 15000);
  // 响应结构（参考 Bambu Studio 云同步）：{ printer:{private:[],public:[]}, process:{...}, filament:{private:[],public:[]} }
  // private = 用户自己的预设，public = 官方公开预设；兼容平铺数组等其它形状
  let entries = [], privSet = null;
  const f = raw && typeof raw === "object" && !Array.isArray(raw) ? raw.filament : null;
  if(f && typeof f === "object"){
    const priv = Array.isArray(f.private) ? f.private : [];
    const pub = Array.isArray(f.public) ? f.public : [];
    privSet = new Set(priv);
    entries = includePublic ? priv.concat(pub) : priv.slice();
  }else if(raw && Array.isArray(raw.filaments)){
    entries = raw.filaments;
  }else if(raw && Array.isArray(raw.settings)){
    entries = raw.settings;
  }else if(raw && Array.isArray(raw.list)){
    entries = raw.list;
  }else if(Array.isArray(raw)){
    entries = raw;
  }else{
    const keys = raw && typeof raw === "object" ? Object.keys(raw).join(",") : typeof raw;
    throw new Error("云端耗材库响应格式未识别（顶层字段：" + keys + "）");
  }
  const filaments = entries
    .filter(e => e && String((e && e.type) || "filament") === "filament" && (e.name || e.setting_id));
  // 私有 + 官方合并时去重：同一 baseId（RFID 基底）/setting_id 只保留一份，私有项优先
  let ordered = filaments, pubSkipped = 0;
  if(privSet && includePublic){
    const seen = new Set();
    ordered = [];
    filaments.forEach(e => {
      const key = String(e.base_id || e.setting_id || e.name || "").trim();
      if(seen.has(key)){ if(!privSet.has(e)) pubSkipped++; return; }
      seen.add(key);
      ordered.push(e);
    });
  }
  // 用户私有预设保证全部入选（includePublic 时不受 limit 截断），public 在 limit 剩余额度内截断
  let chosen = ordered;
  if(Number.isFinite(limit) && ordered.length > limit){
    const privPart = privSet ? ordered.filter(e => privSet.has(e)) : [];
    const pubPart = privSet ? ordered.filter(e => !privSet.has(e)) : ordered;
    chosen = privPart.concat(pubPart.slice(0, Math.max(0, limit - privPart.length)));
  }
  const results = new Array(chosen.length).fill(null);
  let failed = 0, cursor = 0, lastAt = 0;
  const failedNames = [];
  const throttle = async () => { // 全局限速（多 worker 共享）：预占时间槽，任意两次请求间隔 ≥130ms ≈ 7.7/s < 官方 10/s
    const now = Date.now();
    const slot = Math.max(now, lastAt + 130);
    lastAt = slot;
    const wait = slot - now;
    if(wait > 0) await new Promise(r => setTimeout(r, wait));
  };
  const fetchDetail = async (e) => { // 单条详情抓取（公网超时卡顿等临时错误由调用方决定是否重试）
    await throttle();
    const d = await restJson(base + "/v1/iot-service/api/slicer/setting/" + encodeURIComponent(e.setting_id) + "?version=1.0.0.0", { headers: H }, 15000);
    const content = (d && (d.setting || d.content)) || d || {};
    const pick = v => (Array.isArray(v) ? v[0] : v);
    const baseId = String(pick(content.filament_settings_id) || e.base_id || "").trim();
    const bt = presetBrandType(e.name, String(pick(content.filament_type) || "").trim(), baseId);
    return {
      id: String(e.setting_id || e.id || ""),
      name: String(e.name || "").trim(),
      brand: bt.brand,
      type: bt.type,
      color: colorOf(pick(content.filament_colour)) || guessColor(e.name, bt.type),
      baseId
    };
  };
  const worker = async () => {
    while(cursor < chosen.length){
      const i = cursor++;
      const e = chosen[i];
      try{
        results[i] = await fetchDetail(e);
      }catch(err){
        try{ results[i] = await fetchDetail(e); } // 失败重试 1 次
        catch(err2){ failed++; failedNames.push(String(e.name || e.setting_id || "未知耗材")); }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  const items = results.filter(Boolean);
  return { items, failed, failedNames, total: chosen.length, totalAll: filaments.length, skipped: Math.max(0, filaments.length - chosen.length), publicSkipped: pubSkipped };
}

/* ---------- 汇总：根据配置抓取来源 ----------
   cfg.mode = "lan" | "cloud" → 只抓对应来源（二选一）；旧配置无 mode → 两种都抓（兼容旧配置）。
   云连接自愈：存了密码且 token 缺失 → 自动登录补齐；MQTT 认证失败（token 过期）且存有密码 → 自动重登一次并重试。
   cfg = { mode?, lan:[{ name, host, code }], cloud:{ region, email, password?, token } }
   返回 { sources, fetchedAt, newToken? }（重登成功时带 newToken，由调用方持久化） */
export async function fetchAll(cfg, { lanTimeoutMs = 9000, cloudTimeoutMs = 15000, withLibrary = true, libraryLimit = 150 } = {}){
  const sources = [];
  const jobs = [];
  const useLan = cfg.mode !== "cloud", useCloud = cfg.mode !== "lan";
  const c = cfg.cloud || {};
  let token = c.token || "";
  let newToken = "";
  // 自动补齐：存了密码但 token 缺失（上次登录后丢失 / 新账号只保存了密码）
  if(useCloud && !token && c.password && c.email){
    try{
      const r = await cloudLogin({ region: c.region, account: c.email, password: c.password });
      if(r.token){ token = r.token; newToken = r.token; }
    }catch(e){ /* 需要验证码等情况 → 走下方正常失败提示 */ }
  }
  const relogin = async () => { // token 过期自愈：重登一次
    if(!(c.password && c.email)) throw new Error("token 已过期：请重新登录拓竹账号");
    const r = await cloudLogin({ region: c.region, account: c.email, password: c.password }).catch(e => { throw new Error("自动重登失败：" + e.message); });
    if(!r.token) throw new Error("自动重登未成功：请重新登录拓竹账号");
    token = r.token; newToken = r.token;
    return token;
  };
  const isAuthError = e => /token|认证|过期|auth/i.test(String(e.message || ""));
  if(useLan) (Array.isArray(cfg.lan) ? cfg.lan : []).forEach((p, i) => {
    if(!p || !p.host) return;
    jobs.push(fetchLan({ host: p.host, code: p.code, timeoutMs: lanTimeoutMs })
      .then(d => sources.push({ kind:"lan", name: p.name || ("局域网打印机 " + (i + 1)), host: p.host, ok:true,
        devices:[{ devId: d.devId || "", devName: d.devName || p.name || p.host, devModel: d.devModel || "", trays: d.trays }] }))
      .catch(e => sources.push({ kind:"lan", name: p.name || ("局域网打印机 " + (i + 1)), host: p.host, ok:false, error: e.message })));
  });
  if(useCloud && (token || (c.password && c.email))){
    const cname = "拓竹云 · " + (c.email || regionOf(c.region).label);
    jobs.push((async () => {
      if(!token) throw new Error("拓竹云还未登录：请先登录拓竹账号或粘贴 accessToken");
      let d;
      try{
        d = await fetchCloud({ region: c.region, email: c.email, token, timeoutMs: cloudTimeoutMs });
      }catch(e){
        if(!isAuthError(e)) throw e;
        await relogin(); // token 过期自动重登后重试一次
        d = await fetchCloud({ region: c.region, email: c.email, token, timeoutMs: cloudTimeoutMs });
      }
      sources.push({ kind:"cloud", name: cname, region: c.region, ok:true, devices: d.devices });
    })().catch(e => sources.push({ kind:"cloud", name: cname, region: c.region, ok:false, error: e.message })));
    if(withLibrary){ // 云端耗材库（切片预设）→ 以"云端耗材库"来源参与耗材同步
      jobs.push((async () => {
        if(!token) throw new Error("拓竹云还未登录：请先登录拓竹账号");
        let lib;
        try{
          lib = await cloudPresetFilaments({ region: c.region, token, limit: libraryLimit });
        }catch(e){
          if(!isAuthError(e)) throw e;
          await relogin();
          lib = await cloudPresetFilaments({ region: c.region, token, limit: libraryLimit });
        }
        const trays = lib.items.map(f => ({
          slot: "云端", ext: false,
          type: f.type || "", brand: f.brand || "",
          color: f.color || "", weight: 1000, remain: 100, remaining: 1000,
          uuid: "", tagUid: "", idx: f.baseId || "", name: f.name || ""
        }));
        const libName = "云端耗材库（" + lib.items.length + " 项"
          + (lib.failed ? " · " + lib.failed + " 项读取失败" : "")
          + (lib.skipped ? " · 共 " + lib.totalAll + " 项已取前 " + lib.total : "") + "）";
        sources.push({ kind:"cloudlib", name: libName, ok:true, library: true, failed: lib.failed || 0,
          failedNames: lib.failedNames || [],
          devices: lib.items.length ? [{ devId: "__cloudlib__", devName: "拓竹云端耗材库", devModel: "", trays }] : [] });
      })().catch(e => sources.push({ kind:"cloudlib", name: "云端耗材库", ok:false, error: e.message })));
    }
  }
  await Promise.all(jobs);
  if(!jobs.length) throw new Error(cfg.mode === "cloud"
    ? "拓竹云还未登录：请先登录拓竹账号或粘贴 accessToken"
    : "尚未配置连接：请先添加打印机或登录拓竹账号");
  sources.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "lan" ? -1 : 1));
  const out = { sources, fetchedAt: Date.now() };
  if(newToken) out.newToken = newToken;
  return out;
}
