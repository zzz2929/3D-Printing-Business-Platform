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
const aliceCookie = cookie;

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

console.log("\n[管理员 all-data]");
cookie = bossCookie;
r = await api("GET", "/api/all-data?allUsers=1");
ck("admin all-data has both users", r.status === 200 && r.j && r.j[boss.id] && r.j[alice.id], "status " + r.status);
cookie = aliceCookie;
r = await api("GET", "/api/all-data?allUsers=1");
ck("normal user all-data rejected", r.j && !!r.j.error, JSON.stringify(r.j));

console.log("\n[登出/杂项]");
cookie = bossCookie;
r = await api("POST", "/api/logout");
ck("logout clears cookie", (r.status === 200) && cookie === "pf_token=");
r = await api("GET", "/api/version");
ck("version endpoint no-auth", r.status === 200 && r.j && r.j.version === "1.0.2", JSON.stringify(r.j && r.j.version));
r = await api("GET", "/api/whatever-unknown");
ck("unknown api → 401 (not 500)", r.status === 401, "got " + r.status);

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
