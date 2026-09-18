/* 3D打印业务平台 认证核心 · 多用户版
   - 密码：PBKDF2-SHA256 加盐哈希（WebCrypto，120k 迭代）
   - 会话：HMAC-SHA256 签名的过期时间戳令牌（Cookie，默认 30 天），
     签名密钥为用户记录内的随机 secret（改密码时轮换，与密码哈希解耦）
   - 用户：存储在 users 集合，字段：id, username, passwordHash, salt, secret, email, perms, role, disabled, createdAt
   - 角色：admin（管理员）/ normal（普通用户）；perms：页面权限（null = 全部允许）
   - 邮箱：用于忘记密码验证码；自助绑定需邮箱验证码，管理员可直接设置
   - 开放模式：未配置用户时进入开放模式 */

const enc = new TextEncoder();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 邮箱验证码：key -> { code, exp, next, tries }（内存态，重启即清，瞬时用途足够） */
const mailCodes = new Map();
const CODE_TTL = 15 * 60000, CODE_COOLDOWN = 60 * 1000, CODE_MAX_TRIES = 5;
function issueCode(key){
  const code = String(Math.floor(100000 + Math.random() * 900000));
  mailCodes.set(key, { code, exp: Date.now() + CODE_TTL, next: Date.now() + CODE_COOLDOWN, tries: 0 });
  return code;
}
function checkCode(key, code){
  const c = mailCodes.get(key);
  if(!c) return "验证码已过期，请重新获取";
  if(Date.now() > c.exp){ mailCodes.delete(key); return "验证码已过期，请重新获取"; }
  c.tries++;
  if(c.tries > CODE_MAX_TRIES){ mailCodes.delete(key); return "尝试次数过多，请重新获取验证码"; }
  if(String(code) !== c.code) return "验证码错误";
  mailCodes.delete(key);
  return null;
}

function toHex(buf){ return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function hmacHex(secret, msg){
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}
async function hashPassword(pw, salt){
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name:"PBKDF2", salt:enc.encode(salt), iterations:120000, hash:"SHA-256" }, key, 256);
  return toHex(bits);
}
function randomHex(bytes){ const a = new Uint8Array(bytes); crypto.getRandomValues(a); return toHex(a); }

/* 页面权限键：perms 为 null / 缺失 = 全部允许；否则以 perms[k] 布尔值为准 */
const PERM_KEYS = [
  "page_dash", "page_calc", "page_order", "page_olist",
  "page_mats", "mats_manage", "mats_list",
  "page_printers", "pri_add", "pri_list",
  "page_records", "page_settings",
  "set_general", "set_presets", "set_update", "set_account"
];

/* 密码强度验证：至少8位，包含大小写字母和数字 */
export function validatePassword(pw){
  if(!pw || typeof pw !== "string") return "密码不能为空";
  if(pw.length < 8) return "密码至少8位";
  if(!/[A-Z]/.test(pw)) return "密码必须包含大写字母";
  if(!/[a-z]/.test(pw)) return "密码必须包含小写字母";
  if(!/[0-9]/.test(pw)) return "密码必须包含数字";
  return null; // null = 验证通过
}

export function createAuth(store, mailer){
  let usersCache = null;
  let usersArr = null;

  async function loadUsers(){
    if(usersCache !== null) return usersCache;
    const raw = await store.get("users");
    usersArr = raw && Array.isArray(raw) ? raw : [];
    /* 老数据迁移：补随机会话密钥（此前由 passwordHash 派生，存在泄露即伪造会话的风险） */
    let dirty = false;
    for(const u of usersArr){
      if(!u.secret || typeof u.secret !== "string"){ u.secret = randomHex(32); dirty = true; }
    }
    if(dirty) await store.set("users", usersArr);
    usersCache = usersArr;
    return usersCache;
  }

  async function saveUsers(){
    usersCache = usersArr;
    await store.set("users", usersArr);
  }

  async function findUser(username){
    const users = await loadUsers();
    return users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  /* 会话有效期（天）：管理员可在设置页配置，默认 30 天；0 表示永久 */
  async function sessionDays(){
    const cfg = await store.get("authcfg");
    const d = cfg ? Number(cfg.sessionDays) : NaN; // 注意 Number(null)===0，未配置时必须走 NaN 分支
    return (d >= 0 && d <= 365) ? d : 30;
  }
  const FOREVER_MS = 100 * 365 * 86400 * 1000; // 100 年，用作“永久”的过期时间
  async function signToken(user){
    const days = await sessionDays();
    const exp = days === 0 ? Date.now() + FOREVER_MS : Date.now() + days * 86400 * 1000;
    return exp + "." + (await hmacHex(user.secret, "pf:" + exp));
  }

  const mail = mailer || { configured: () => false, send: async () => { throw new Error("邮件服务未配置"); } };
  const debugMail = process.env.MAIL_DEBUG === "1";
  function userPublic(u){
    return { id:u.id, username:u.username, role:u.role, disabled:!!u.disabled, email:u.email || "", perms:u.perms || null };
  }

  return {
    /* 检查是否启用认证（有任何用户时启用） */
    async configured(){
      const users = await loadUsers();
      return users.length > 0;
    },

    /* 验证登录 */
    async login(username, pw){
      if(!username || !pw) return { error:"用户名和密码不能为空" };
      if(!(await this.configured())) return { error:"系统未配置，请先在设置页创建管理员" };
      const user = await findUser(username);
      if(!user) return { error:"用户名或密码错误" };
      if(user.disabled) return { error:"账号已被停用，请联系管理员" };
      const hash = await hashPassword(pw, user.salt);
      if(hash !== user.passwordHash) return { error:"用户名或密码错误" };
      return { ok:true, user: userPublic(user) };
    },

    /* 验证会话令牌 */
    async verify(req){
      const t = getCookie(req, "pf_token");
      if(!t) return null;
      const i = t.indexOf(".");
      if(i <= 0) return null;
      const exp = Number(t.slice(0, i)), sig = t.slice(i + 1);
      if(!Number.isFinite(exp) || exp < Date.now()) return null;

      // 逐用户比对签名密钥（已停用账号一律拒绝）
      const users = await loadUsers();
      for(const user of users){
        if(user.disabled) continue;
        if((await hmacHex(user.secret, "pf:" + exp)) === sig){
          return userPublic(user);
        }
      }
      return null;
    },

    /* 签发令牌（给当前用户） */
    async issueTokenForUser(user){
      const users = await loadUsers();
      const u = users.find(x => x.id === user.id);
      if(!u) throw new Error("用户不存在");
      return signToken(u);
    },

    /* 注册用户（开放模式或管理员可操作） */
    async register(username, password, role = "normal", operator){
      if(!username || username.trim().length < 2) return { error:"用户名至少2个字符" };
      username = username.trim();
      if(!/^[a-zA-Z0-9_]+$/.test(username)) return { error:"用户名只能包含字母、数字和下划线" };
      const pwErr = validatePassword(password);
      if(pwErr) return { error:pwErr };

      const users = await loadUsers();
      
      // 检查是否已有用户（第一个注册的是管理员）
      const isFirstUser = users.length === 0;
      const finalRole = isFirstUser ? "admin" : role;
      
      // 非管理员不能创建管理员
      if(!isFirstUser && role === "admin" && operator?.role !== "admin"){
        return { error:"只有管理员可以创建管理员账号" };
      }

      // 检查用户名是否已存在
      if(users.some(u => u.username.toLowerCase() === username.toLowerCase())){
        return { error:"用户名已存在" };
      }

      const id = randomHex(16);
      const salt = randomHex(16);
      const passwordHash = await hashPassword(password, salt);
      const user = { id, username, passwordHash, salt, secret:randomHex(32), role: finalRole, perms:null, disabled:false, createdAt: Date.now() };
      users.push(user);
      await saveUsers();
      return { ok:true, user:{ id, username, role:finalRole } };
    },

    /* 删除用户 */
    async deleteUser(userId, operator){
      if(operator?.role !== "admin") return { error:"只有管理员可以删除用户" };
      if(userId === operator.id) return { error:"不能删除自己" };
      const users = await loadUsers();
      const idx = users.findIndex(u => u.id === userId);
      if(idx === -1) return { error:"用户不存在" };
      users.splice(idx, 1);
      await saveUsers();
      return { ok:true };
    },

    /* 获取用户列表 */
    async listUsers(operator){
      if(operator?.role !== "admin") return { error:"只有管理员可以查看用户列表" };
      const users = await loadUsers();
      return users.map(u => ({ id:u.id, username:u.username, role:u.role, disabled:!!u.disabled, perms:u.perms || null, email:u.email || "", createdAt:u.createdAt }));
    },

    /* 修改密码 */
    async changePassword(userId, currentPw, newPw, operator){
      const users = await loadUsers();
      const user = users.find(u => u.id === userId);
      if(!user) return { error:"用户不存在" };
      
      // 非管理员只能改自己的密码
      if(operator?.role !== "admin" && operator?.id !== userId){
        return { error:"无权操作" };
      }
      
      // 非管理员改密码需要验证原密码
      if(operator?.role !== "admin"){
        if(typeof currentPw !== "string" || !currentPw) return { error:"请输入当前密码" };
        const hash = await hashPassword(currentPw, user.salt);
        if(hash !== user.passwordHash) return { error:"当前密码错误" };
      }

      const pwErr = validatePassword(newPw);
      if(pwErr) return { error:pwErr };

      user.salt = randomHex(16);
      user.passwordHash = await hashPassword(newPw, user.salt);
      user.secret = randomHex(32); // 轮换会话密钥，使该用户所有旧令牌失效
      await saveUsers();
      return { ok:true };
    },

    /* 更新用户信息（管理员）：用户名 / 密码重置 / 角色 / 停用 */
    async updateUser(userId, updates, operator){
      if(operator?.role !== "admin") return { error:"只有管理员可以修改用户" };
      if(!updates || typeof updates !== "object") return { error:"没有要修改的内容" };
      const users = await loadUsers();
      const user = users.find(u => u.id === userId);
      if(!user) return { error:"用户不存在" };

      // 改用户名：校验格式与唯一性（会话按用户 id 签发，改名不影响登录态）
      if(updates.username !== undefined){
        const nu = String(updates.username).trim();
        if(nu.length < 2 || !/^[a-zA-Z0-9_]+$/.test(nu)){
          return { error:"用户名至少2个字符，只能包含字母、数字和下划线" };
        }
        if(users.some(u => u.id !== userId && u.username.toLowerCase() === nu.toLowerCase())){
          return { error:"用户名已存在" };
        }
        user.username = nu;
      }

      // 重置密码：轮换 salt 与会话密钥，该账号所有旧会话立即失效
      if(updates.password !== undefined && updates.password !== ""){
        if(typeof updates.password !== "string") return { error:"密码格式不正确" };
        const pwErr = validatePassword(updates.password);
        if(pwErr) return { error:pwErr };
        user.salt = randomHex(16);
        user.passwordHash = await hashPassword(updates.password, user.salt);
        user.secret = randomHex(32);
      }

      // 改角色：不能改自己（避免管理员把自己降级后无人管理）
      if(updates.role !== undefined){
        if(userId === operator.id) return { error:"不能修改自己的角色" };
        if(!["admin","normal"].includes(updates.role)){
          return { error:"角色只能是 admin 或 normal" };
        }
        user.role = updates.role;
      }

      // 停用 / 启用：不能停用自己（登录与已有会话同时失效）
      if(updates.disabled !== undefined){
        if(userId === operator.id) return { error:"不能停用自己" };
        user.disabled = !!updates.disabled;
      }

      // 页面权限：白名单键逐项布尔化；至少保留一个可访问页面（防锁死）
      if(updates.perms !== undefined){
        if(!updates.perms || typeof updates.perms !== "object" || Array.isArray(updates.perms)){
          return { error:"权限格式不正确" };
        }
        const perms = {};
        for(const k of PERM_KEYS) perms[k] = !!updates.perms[k];
        if(!PERM_KEYS.some(k => k.startsWith("page_") && perms[k])){
          return { error:"至少需要保留一个可访问页面" };
        }
        user.perms = perms;
      }

      // 邮箱：管理员直接设置（可信操作），校验格式与唯一性
      if(updates.email !== undefined){
        const em = String(updates.email || "").trim();
        if(em){
          if(!EMAIL_RE.test(em)) return { error:"邮箱格式不正确" };
          if(users.some(u => u.id !== userId && (u.email || "").toLowerCase() === em.toLowerCase())){
            return { error:"该邮箱已被其他账号绑定" };
          }
        }
        user.email = em || "";
      }

      await saveUsers();
      return { ok:true, user: userPublic(user) };
    },

    /* ---------- 邮箱绑定与忘记密码 ---------- */

    /* 用户请求绑定邮箱验证码（需登录） */
    async requestBindCode(user, email){
      email = String(email || "").trim();
      if(!EMAIL_RE.test(email)) return { error:"邮箱格式不正确" };
      const users = await loadUsers();
      if(users.some(u => u.id !== user.id && (u.email || "").toLowerCase() === email.toLowerCase())){
        return { error:"该邮箱已被其他账号绑定" };
      }
      if(!(await mail.configured())) return { error:"邮件服务未配置，请联系管理员在服务端设置 SMTP" };
      const key = "bind:" + user.id;
      const prev = mailCodes.get(key);
      if(prev && Date.now() < prev.next) return { error:"发送太频繁，请 1 分钟后再试" };
      const code = issueCode(key);
      const debugCode = debugMail ? code : undefined; // MAIL_DEBUG=1 时随响应返回，供联调/测试
      try{
        await mail.send(email, "绑定邮箱验证码", "你正在绑定 3D打印业务平台 账号邮箱。\n验证码：" + code + "\n15 分钟内有效。如非本人操作请忽略。");
      }catch(e){
        mailCodes.delete(key);
        return { error:"邮件发送失败：" + e.message };
      }
      return debugCode ? { ok:true, debugCode } : { ok:true };
    },

    /* 用户提交验证码完成绑定 */
    async bindEmail(user, email, code){
      email = String(email || "").trim();
      if(!EMAIL_RE.test(email)) return { error:"邮箱格式不正确" };
      const err = checkCode("bind:" + user.id, code);
      if(err) return { error:err };
      const users = await loadUsers();
      const u = users.find(x => x.id === user.id);
      if(!u) return { error:"用户不存在" };
      if(users.some(x => x.id !== user.id && (x.email || "").toLowerCase() === email.toLowerCase())){
        return { error:"该邮箱已被其他账号绑定" };
      }
      u.email = email;
      await saveUsers();
      return { ok:true, email };
    },

    /* 忘记密码：发送重置验证码（不暴露用户是否存在/是否绑定邮箱） */
    async requestResetCode(username){
      const users = await loadUsers();
      const user = users.find(u => u.username.toLowerCase() === String(username || "").trim().toLowerCase());
      if(user && !user.disabled && user.email && (await mail.configured())){
        const key = "reset:" + user.id;
        const prev = mailCodes.get(key);
        if(!(prev && Date.now() < prev.next)){
          const code = issueCode(key);
          try{
            await mail.send(user.email, "重置密码验证码", "你正在重置 3D打印业务平台 账号（" + user.username + "）的密码。\n验证码：" + code + "\n15 分钟内有效。如非本人操作请忽略。");
          }catch(e){
            mailCodes.delete(key);
            return { error:"邮件发送失败：" + e.message };
          }
          if(debugMail) return { ok:true, debugCode:code };
        }
      }
      return { ok:true }; // 一律 ok，避免枚举
    },

    /* 忘记密码：验证码 + 新密码完成重置（轮换 salt/secret，旧会话全部失效） */
    async resetWithCode(username, code, newPassword){
      const users = await loadUsers();
      const user = users.find(u => u.username.toLowerCase() === String(username || "").trim().toLowerCase());
      if(!user) return { error:"验证码错误或已过期" };
      const pwErr = validatePassword(newPassword);
      if(pwErr) return { error:pwErr }; // 先校验密码格式，不消费验证码
      const err = checkCode("reset:" + user.id, code);
      if(err) return { error:err };
      user.salt = randomHex(16);
      user.passwordHash = await hashPassword(newPassword, user.salt);
      user.secret = randomHex(32);
      await saveUsers();
      return { ok:true };
    },

    /* 获取当前用户信息 */
    async getUserInfo(userId){
      const users = await loadUsers();
      const user = users.find(u => u.id === userId);
      if(!user) return null;
      return { id:user.id, username:user.username, role:user.role, createdAt:user.createdAt };
    },
    sessionDays
  };
}

/* Cookie 助手 */
export function getCookie(req, name){
  const c = req.headers.get("cookie") || "";
  for(const part of c.split(/;\s*/)){
    const i = part.indexOf("=");
    if(i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
export function tokenCookie(token, days){
  const d = Number(days);
  const maxAge = (d === 0) ? 100 * 365 * 86400 : ((d >= 1 && d <= 365) ? d : 30) * 86400;
  return "pf_token=" + encodeURIComponent(token) + "; HttpOnly; Path=/; Max-Age=" + maxAge + "; SameSite=Lax";
}
export const CLEAR_COOKIE = "pf_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
