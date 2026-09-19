/* 端到端冒烟测试：node test/e2e.mjs [baseUrl]
   前置：以全新 DATA_DIR 启动服务（开放模式） */
const B = process.argv[2] || "http://127.0.0.1:2971";
let cookie = "";
let pass = 0, fail = 0;

async function api(method, path, body){
  const r = await fetch(B + path, {
    method,
    headers: Object.assign({ "content-type": "application/json" }, cookie ? { cookie } : {}),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const setC = r.headers.get("set-cookie");
  if(setC) cookie = setC.split(";")[0];
  let j = null;
  try{ j = await r.json(); }catch(e){}
  return { status: r.status, j };
}
function ck(name, cond, extra){
  if(cond){ pass++; console.log("  ✓ " + name); }
  else{ fail++; console.log("  ✗ " + name + (extra ? "  ← " + extra : "")); }
}

console.log("base:", B);

console.log("\n[静态白名单]");
for(const [p, want] of [["/data/users.json", 404], ["/server/index.mjs", 404], ["/package.json", 404],
  ["/index.html", 200], ["/assets/app.js", 200], ["/assets/store.js", 200], ["/sw.js", 200],
  ["/manifest.webmanifest", 200], ["/icon.svg", 200]]){
  const r = await fetch(B + p);
  ck(`GET ${p} → ${want}`, r.status === want, "got " + r.status);
}

console.log("\n[开放模式]");
cookie = "";
let r = await api("GET", "/api/auth");
ck("openMode true", r.j && r.j.openMode === true && r.j.required === false, JSON.stringify(r.j));
r = await api("GET", "/api/data");
ck("open mode data readable", r.status === 200 && r.j && "materials" in r.j, "status " + r.status);

console.log("\n[创建管理员]");
r = await api("POST", "/api/register", { username: "boss", password: "Passw0rd1" });
ck("register ok", r.status === 200 && r.j && r.j.ok === true, JSON.stringify(r.j));
ck("first user is admin", r.j && r.j.user && r.j.user.role === "admin");
ck("set-cookie issued", !!cookie);
r = await api("GET", "/api/auth");
ck("auth now required, user returned", r.j && r.j.required === true && r.j.ok === true && r.j.user && r.j.user.username === "boss", JSON.stringify(r.j));
ck("response has no password fields", !r.j.user.passwordHash && !r.j.user.salt && !r.j.user.secret);

console.log("\n[会话保护]");
cookie = "";
r = await api("GET", "/api/data");
ck("no session → 401", r.status === 401, "got " + r.status);
r = await api("POST", "/api/login", { username: "boss", password: "nope1234A" });
ck("wrong password → 401", r.status === 401, "got " + r.status);
r = await api("POST", "/api/login", { username: "ghost", password: "nope1234A" });
ck("unknown user → 401", r.status === 401, "got " + r.status);
r = await api("POST", "/api/login", { username: "BOSS", password: "Passw0rd1" });
ck("case-insensitive login", r.status === 200 && !!cookie, JSON.stringify(r.j));

console.log("\n[数据读写与隔离]");
r = await api("PUT", "/api/materials", [{ id: "boss1", name: "BOSS-PLA" }]);
ck("boss PUT materials", r.status === 200 && r.j && r.j.ok === true);
r = await api("GET", "/api/materials");
ck("boss GET own data", r.status === 200 && Array.isArray(r.j) && r.j[0] && r.j[0].name === "BOSS-PLA");
r = await api("PUT", "/api/data", { settings: { theme: "light" }, orders: [] });
ck("boss PUT /api/data", r.status === 200 && r.j && r.j.ok === true);

r = await api("POST", "/api/users", { username: "alice", password: "Alice12345", role: "normal" });
ck("admin creates normal user", r.status === 200 && r.j && r.j.user && r.j.user.role === "normal", JSON.stringify(r.j));
r = await api("POST", "/api/users", { username: "hacker", password: "Hack12345", role: "admin" });
ck("admin CAN create another admin (by design)", r.status === 200 && r.j && r.j.user.role === "admin", JSON.stringify(r.j));
const bossCookie = cookie;

cookie = "";
r = await api("POST", "/api/register", { username: "evil", password: "Evil12345", role: "admin" });
ck("anonymous register after lockdown → 401", r.status === 401, "got " + r.status);

r = await api("POST", "/api/login", { username: "alice", password: "Alice12345" });
ck("alice login", r.status === 200 && !!cookie);
r = await api("GET", "/api/materials");
ck("alice sees empty own data (not boss's)", r.status === 200 && (r.j === null || (Array.isArray(r.j) && r.j.length === 0)), JSON.stringify(r.j));
r = await api("GET", "/api/users");
ck("alice cannot list users", r.j && !!r.j.error, JSON.stringify(r.j));
r = await api("PUT", "/api/materials", [{ id: "a1", name: "ALICE-PLA" }]);
ck("alice writes own data", r.status === 200);
let aliceCookie = cookie;

cookie = bossCookie;
r = await api("GET", "/api/materials");
ck("boss data unaffected by alice", Array.isArray(r.j) && r.j[0].name === "BOSS-PLA");

console.log("\n[改密码与令牌轮换]");
cookie = aliceCookie;
r = await api("POST", "/api/change-password", { currentPassword: "Alice12345", newPassword: "NewPass123" });
ck("change password ok", r.status === 200 && r.j && r.j.ok === true, JSON.stringify(r.j));
r = await api("GET", "/api/auth");
ck("old token invalidated after pw change", r.j && r.j.ok === false, JSON.stringify(r.j));
r = await api("POST", "/api/login", { username: "alice", password: "NewPass123" });
ck("login with new password", r.status === 200);
r = await api("POST", "/api/change-password", { currentPassword: "WRONG", newPassword: "Xxxx1234" });
ck("wrong current pw rejected", r.j && !!r.j.error, JSON.stringify(r.j));
r = await api("POST", "/api/change-password", { currentPassword: "NewPass123", newPassword: "weak" });
ck("weak new pw rejected", r.j && !!r.j.error, JSON.stringify(r.j));

console.log("\n[用户管理]");
cookie = bossCookie;
r = await api("GET", "/api/users");
ck("admin lists users", Array.isArray(r.j) && r.j.length === 3, JSON.stringify(r.j));
ck("user list has no secrets", r.j.every(u => !u.passwordHash && !u.salt && !u.secret));
const alice = r.j.find(u => u.username === "alice");
const hacker = r.j.find(u => u.username === "hacker");
const boss = r.j.find(u => u.username === "boss");
r = await api("PATCH", "/api/users/" + hacker.id, { role: "normal" });
ck("admin demotes admin→normal", r.status === 200, JSON.stringify(r.j));
r = await api("DELETE", "/api/users/" + hacker.id);
ck("admin deletes user", r.status === 200 && r.j && r.j.ok === true, JSON.stringify(r.j));
r = await api("DELETE", "/api/users/" + boss.id);
ck("admin cannot delete self", r.j && !!r.j.error, JSON.stringify(r.j));

cookie = aliceCookie;
r = await api("GET", "/api/users");
ck("normal user cannot list", r.j && !!r.j.error);
r = await api("DELETE", "/api/users/" + boss.id);
ck("normal user cannot delete", r.j && !!r.j.error);

console.log("\n[用户编辑：改名 / 重置密码 / 停用]");
cookie = bossCookie;
r = await api("PATCH", "/api/users/" + alice.id, { username: "alice2" });
ck("admin renames user", r.status === 200 && r.j.user && r.j.user.username === "alice2", JSON.stringify(r.j));
r = await api("PATCH", "/api/users/" + alice.id, { username: "boss" });
ck("rename to existing name rejected", r.j && !!r.j.error, JSON.stringify(r.j));
r = await api("PATCH", "/api/users/" + alice.id, { username: "a" });
ck("too-short name rejected", r.j && !!r.j.error, JSON.stringify(r.j));
r = await api("PATCH", "/api/users/" + alice.id, { password: "ResetPass9" });
ck("admin resets password", r.status === 200 && r.j.ok === true, JSON.stringify(r.j));
let aliceOldCookie = aliceCookie; aliceCookie = "";
r = await api("POST", "/api/login", { username: "alice2", password: "ResetPass9" });
ck("login with new name + reset password", r.status === 200, JSON.stringify(r.j));
r = await api("POST", "/api/login", { username: "alice", password: "Alice12345" });
ck("old name + old password rejected", r.status === 401, "got " + r.status);
cookie = aliceOldCookie;
r = await api("GET", "/api/auth");
ck("alice old session invalidated after reset", r.j && r.j.ok === false, JSON.stringify(r.j));
r = await api("POST", "/api/login", { username: "alice2", password: "ResetPass9" });
cookie = bossCookie;
r = await api("PATCH", "/api/users/" + alice.id, { disabled: true });
ck("admin disables user", r.status === 200 && r.j.user.disabled === true, JSON.stringify(r.j));
cookie = "";
r = await api("POST", "/api/login", { username: "alice2", password: "ResetPass9" });
ck("disabled user cannot login", r.status === 401 && r.j.error.includes("停用"), JSON.stringify(r.j));
cookie = bossCookie;
r = await api("PATCH", "/api/users/" + alice.id, { disabled: false });
ck("admin re-enables user", r.status === 200 && r.j.user.disabled === false);
cookie = "";
r = await api("POST", "/api/login", { username: "alice2", password: "ResetPass9" });
ck("re-enabled user can login", r.status === 200);
const aliceCookie2 = cookie;
cookie = bossCookie;
r = await api("PATCH", "/api/users/" + boss.id, { disabled: true });
ck("admin cannot disable self", r.j && !!r.j.error, JSON.stringify(r.j));
r = await api("PATCH", "/api/users/" + boss.id, { role: "normal" });
ck("admin cannot change own role", r.j && !!r.j.error, JSON.stringify(r.j));
r = await api("PATCH", "/api/users/" + boss.id, { username: "boss2" });
ck("admin CAN rename self", r.status === 200 && r.j.user.username === "boss2", JSON.stringify(r.j));
cookie = aliceCookie2;
r = await api("PATCH", "/api/users/" + boss2id(boss), { username: "hax" });
ck("normal user cannot PATCH others", r.j && !!r.j.error, JSON.stringify(r.j));
function boss2id(b){ return b.id; }

console.log("\n[页面权限 perms]");
cookie = bossCookie;
const alice2id = (await api("GET", "/api/users")).j.find(u => u.username === "alice2").id;
const PERM_ALL = ["page_dash","page_calc","page_order","page_olist","page_mats","mats_manage","mats_list","page_printers","pri_add","pri_list","page_records","page_settings","set_general","set_presets","set_update","set_account"];
const allOff = {}; PERM_ALL.forEach(k => allOff[k] = false);
r = await api("PATCH", "/api/users/" + alice2id, { perms: allOff });
ck("all pages off rejected", r.j && !!r.j.error, JSON.stringify(r.j));
const limited = Object.assign({}, allOff, { page_dash: true, page_records: true });
r = await api("PATCH", "/api/users/" + alice2id, { perms: limited });
ck("admin sets limited perms", r.status === 200 && r.j.user && r.j.user.perms && r.j.user.perms.page_dash === true && r.j.user.perms.page_calc === false, JSON.stringify(r.j));
cookie = "";
r = await api("POST", "/api/login", { username: "alice2", password: "ResetPass9" });
ck("login returns perms", r.j && r.j.user && r.j.user.perms && r.j.user.perms.page_dash === true, JSON.stringify(r.j && r.j.user));
r = await api("GET", "/api/auth");
ck("session verify returns perms", r.j && r.j.user && r.j.user.perms && r.j.user.perms.page_records === true && r.j.user.perms.page_calc === false, JSON.stringify(r.j.user));
cookie = bossCookie;
r = await api("PATCH", "/api/users/" + alice2id, { perms: { page_dash: true } });
ck("partial perms object ok (unset = false)", r.status === 200 && r.j.user.perms.page_dash === true && r.j.user.perms.page_olist === false, JSON.stringify(r.j));
cookie = aliceCookie2;
r = await api("PATCH", "/api/users/" + alice2id, { perms: limited });
ck("normal user cannot set perms", r.j && !!r.j.error, JSON.stringify(r.j));
cookie = bossCookie;
const allOn = {}; PERM_ALL.forEach(k => allOn[k] = true);
r = await api("PATCH", "/api/users/" + alice2id, { perms: allOn });
ck("restore all perms", r.status === 200 && r.j.user.perms.page_calc === true);

console.log("\n[邮箱绑定与忘记密码]");
// MAIL_DEBUG=1：验证码随响应返回，可走完整流程；未开 debug 且未配 SMTP 时应得到明确错误
cookie = aliceCookie2;
r = await api("POST", "/api/mail/code", { email: "alice2@example.com" });
const debugMode = r.j && r.j.debugCode;
if(debugMode){
  r = await api("POST", "/api/mail/bind", { email: "alice2@example.com", code: debugMode });
  ck("bind email with debug code", r.status === 200 && r.j.ok === true, JSON.stringify(r.j));
  r = await api("POST", "/api/mail/bind", { email: "alice2@example.com", code: "000000" });
  ck("wrong code rejected", r.status === 400, JSON.stringify(r.j));
}else{
  ck("mail unconfigured → clear error", r.status === 400 && (r.j.error || "").includes("未配置"), JSON.stringify(r.j));
}
// 管理员可直接设置他人邮箱
cookie = bossCookie;
r = await api("PATCH", "/api/users/" + alice2id, { email: "alice2@example.com" });
ck("admin sets email directly", r.status === 200 && r.j.user.email === "alice2@example.com", JSON.stringify(r.j));
r = await api("PATCH", "/api/users/" + alice2id, { email: "not-an-email" });
ck("bad email rejected", r.j && !!r.j.error);
r = await api("PATCH", "/api/users/" + boss.id, { email: "alice2@example.com" });
ck("duplicate email rejected", r.j && !!r.j.error, JSON.stringify(r.j));
cookie = "";
r = await api("POST", "/api/login", { username: "alice2", password: "ResetPass9" });
ck("auth user has email", r.j.user && r.j.user.email === "alice2@example.com", JSON.stringify(r.j.user));

// 忘记密码全流程（依赖 MAIL_DEBUG；无 debug 环境只验证防枚举）
r = await api("POST", "/api/forgot", { username: "alice2" });
ck("forgot always ok", r.status === 200 && r.j.ok === true, JSON.stringify(r.j));
const resetCode = r.j && r.j.debugCode; // 先取 alice2 的验证码，再测 ghost（避免覆盖响应）
r = await api("POST", "/api/forgot", { username: "ghost-user" });
ck("forgot unknown user also ok (anti-enum)", r.status === 200 && r.j.ok === true);
if(resetCode){
  const code = resetCode; // 注意：此处 r.j 已被 ghost 响应覆盖，必须用上面捕获的 resetCode
  r = await api("POST", "/api/forgot/reset", { username: "alice2", code: "000000", newPassword: "Xx9ooo99" });
  ck("wrong reset code rejected", r.status === 400, JSON.stringify(r.j));
  r = await api("POST", "/api/forgot/reset", { username: "alice2", code, newPassword: "weak" });
  ck("weak new password rejected", r.status === 400, JSON.stringify(r.j));
r = await api("POST", "/api/forgot/reset", { username: "alice2", code, newPassword: "Forgot999A" });
  ck("reset with code ok", r.status === 200 && r.j.ok === true, JSON.stringify(r.j));
  r = await api("POST", "/api/login", { username: "alice2", password: "Forgot999A" });
  ck("login with reset password", r.status === 200, JSON.stringify(r.j));
  const alice2CookieNew = cookie;
  cookie = aliceCookie2;
  r = await api("GET", "/api/auth");
  ck("old session dead after forgot-reset", r.j && r.j.ok === false, JSON.stringify(r.j));
  cookie = alice2CookieNew; // 换用重置后的新会话，后续 403 断言才有效
}

console.log("\n[SMTP 配置管理]");
// 沿用当前普通用户会话
const normalCookie = cookie;
r = await api("GET", "/api/smtp");
ck("normal user cannot read smtp", r.status === 403, "got " + r.status);
cookie = bossCookie;
r = await api("GET", "/api/smtp");
ck("admin reads smtp config", r.status === 200 && r.j && typeof r.j.hasPass === "boolean", JSON.stringify(r.j));
ck("password never returned", r.j.pass === undefined);
r = await api("POST", "/api/smtp", { host: "" });
ck("empty host rejected", r.status === 400, JSON.stringify(r.j));
r = await api("POST", "/api/smtp", { host: "smtp.invalid", port: 465, secure: true, user: "test@invalid", pass: "secret123", from: "test@invalid" });
ck("admin saves smtp config", r.status === 200 && r.j.ok === true, JSON.stringify(r.j));
r = await api("GET", "/api/smtp");
ck("config persisted with masked pass", r.j.host === "smtp.invalid" && r.j.hasPass === true && r.j.pass === undefined, JSON.stringify(r.j));
r = await api("POST", "/api/mail/test", { to: "dest@example.invalid", host: "smtp.invalid", port: 465, secure: true, user: "test@invalid", pass: "secret123" });
ck("test mail surfaces smtp error", r.status === 400 && (r.j.error || "").startsWith("发送失败"), JSON.stringify(r.j));
// 沿用当前普通用户会话
cookie = normalCookie; // 切回普通用户会话
r = await api("POST", "/api/mail/test", { to: "dest@example.invalid" });
ck("normal user cannot send test mail", r.status === 403, "got " + r.status);

console.log("\n[会话有效期配置]");
cookie = bossCookie;
r = await api("GET", "/api/authcfg");
ck("admin reads session days (default 30)", r.status === 200 && r.j.sessionDays === 30, JSON.stringify(r.j));
r = await api("POST", "/api/authcfg", { sessionDays: 7 });
ck("admin sets session days = 7", r.status === 200 && r.j.sessionDays === 7, JSON.stringify(r.j));
r = await api("GET", "/api/authcfg");
ck("session days persisted", r.j.sessionDays === 7);
r = await api("POST", "/api/authcfg", { sessionDays: 0 });
ck("days = 0 accepted (永久)", r.status === 200 && r.j.sessionDays === 0, JSON.stringify(r.j));
r = await api("POST", "/api/authcfg", { sessionDays: 400 });
ck("days = 400 rejected", r.status === 400, JSON.stringify(r.j));
cookie = "";
r = await api("POST", "/api/login", { username: "alice2", password: "Forgot999A" });
const bobCookieSaved = cookie; cookie = "";
ck("login after setting still ok", r.status === 200);
cookie = bobCookieSaved;
r = await api("GET", "/api/authcfg");
ck("normal user cannot read authcfg", r.status === 403, "got " + r.status);
r = await api("POST", "/api/authcfg", { sessionDays: 90 });
ck("normal user cannot set authcfg", r.status === 403, "got " + r.status);
cookie = bossCookie;
r = await api("POST", "/api/authcfg", { sessionDays: 30 });
ck("restore 30 days", r.status === 200);

console.log("\n[管理员 all-data]");
cookie = bossCookie;
r = await api("GET", "/api/all-data?allUsers=1");
ck("admin all-data has both users", r.status === 200 && r.j && r.j[boss.id] && r.j[alice.id], "status " + r.status);
cookie = aliceCookie;
r = await api("GET", "/api/all-data?allUsers=1");
ck("normal user all-data rejected", r.j && !!r.j.error, JSON.stringify(r.j));

console.log("\n[拓竹同步]");
cookie = "";
r = await api("GET", "/api/bambu");
ck("bambu config requires login → 401", r.status === 401, "got " + r.status);
cookie = bossCookie;
r = await api("GET", "/api/bambu");
ck("bambu config default empty", r.status === 200 && r.j && Array.isArray(r.j.lan) && r.j.lan.length === 0, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { lan:[{ name:"P1S", host:"127.0.0.1", code:"secret88" }], cloud:{ region:"cn", email:"me@x.com", password:"pw123456" } });
ck("bambu config saved", r.status === 200 && r.j && r.j.ok === true && r.j.config && r.j.config.lan[0].hasCode === true, JSON.stringify(r.j));
const bambuRowId = r.j.config.lan[0].id;
ck("bambu config masked (no code/password leak)", JSON.stringify(r.j).indexOf("secret88") < 0 && JSON.stringify(r.j).indexOf("pw123456") < 0);
r = await api("GET", "/api/bambu");
ck("bambu config masked on re-read", JSON.stringify(r.j).indexOf("secret88") < 0 && JSON.stringify(r.j).indexOf("pw123456") < 0
  && r.j.lan[0].hasCode === true && r.j.cloud.hasPassword === true && r.j.cloud.email === "me@x.com", JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { lan:[{ id:bambuRowId, name:"P1S", host:"127.0.0.1" }], cloud:{ region:"cn", email:"me@x.com" } });
ck("blank secrets keep old values", r.status === 200 && r.j.config.lan[0].hasCode === true && r.j.config.cloud.hasPassword === true, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { mode:"cloud", cloud:{ region:"cn", email:"me@x.com" } });
ck("mode=cloud saved, lan rows preserved", r.status === 200 && r.j.config.mode === "cloud" && r.j.config.lan.length === 1, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { mode:"lan", lan:[{ id:bambuRowId, name:"P1S", host:"127.0.0.1" }] });
ck("mode=lan saved, cloud email preserved", r.status === 200 && r.j.config.mode === "lan" && r.j.config.cloud.email === "me@x.com" && r.j.config.cloud.hasPassword === true, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { mode:"lan", lan:[] });
ck("mode=lan without printer rejected", r.status === 400, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { action:"fetch" });
ck("fetch unreachable printer → per-source error, 200", r.status === 200 && r.j.sources && r.j.sources.length === 1 && r.j.sources[0].ok === false, JSON.stringify(r.j));
ck("fetch source error readable", typeof r.j.sources[0].error === "string" && r.j.sources[0].error.length > 3);
r = await api("POST", "/api/bambu", { mode:"cloud", cloud:{} });
ck("mode=cloud blank fields keep email (留空保留)", r.status === 200 && r.j.config.mode === "cloud" && r.j.config.cloud.email === "me@x.com", JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { action:"fetch" });
ck("cloud mode without token → 400 提示登录", r.status === 400 && /拓竹云还未登录/.test(r.j.error || ""), JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { action:"cloudLogin" });
ck("cloudLogin without account → 400", r.status === 400, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { action:"cloudLogin", email:"13800138000" });
ck("cloudLogin phone without password/code → 400", r.status === 400 && /密码/.test(r.j.error || ""), JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { action:"cloudLogin", sendCode:true, email:"not-an-account" });
ck("sendCode bad account format → 400", r.status === 400 && /手机号或邮箱/.test(r.j.error || ""), JSON.stringify(r.j));
cookie = "";
r = await api("POST", "/api/login", { username: "alice2", password: "Forgot999A" });
ck("alice2 fresh login for bambu tests", r.status === 200, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { mode:"cloud", cloud:{} });
ck("alice mode=cloud no email → 400", r.status === 400 && /邮箱/.test(r.j.error || ""), JSON.stringify(r.j));
r = await api("GET", "/api/bambu");
ck("per-user bambu isolation (alice empty)", r.status === 200 && r.j.lan.length === 0 && !r.j.cloud.email, JSON.stringify(r.j));
r = await api("POST", "/api/bambu", { action:"fetch" });
ck("fetch without config → 400 hint", r.status === 400 && /尚未配置/.test(r.j.error || ""), JSON.stringify(r.j));
cookie = bossCookie;

console.log("\n[静态缓存与保存即刷新]");
const sr = await fetch(B + "/assets/app.js");
ck("assets 协商缓存 no-cache", (sr.headers.get("cache-control") || "").includes("no-cache"), sr.headers.get("cache-control"));
await sr.arrayBuffer();
const ctlSse = new AbortController();
let sseCt = "";
try{
  const sse = await fetch(B + "/__reload", { signal: ctlSse.signal });
  sseCt = sse.headers.get("content-type") || "";
  ctlSse.abort(); // 只校验响应头，不消费事件流
}catch(e){}
ck("保存即刷新 SSE 端点", sseCt.includes("text/event-stream"), sseCt);

console.log("\n[登出/杂项]");
cookie = bossCookie;
r = await api("POST", "/api/logout");
ck("logout clears cookie", (r.status === 200) && cookie === "pf_token=");
r = await api("GET", "/api/version");
ck("version endpoint no-auth", r.status === 200 && r.j && r.j.version === "1.0.3", JSON.stringify(r.j && r.j.version));
r = await api("GET", "/api/whatever-unknown");
ck("unknown api → 401 (not 500)", r.status === 401, "got " + r.status);

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
