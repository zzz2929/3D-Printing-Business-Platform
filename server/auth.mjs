/* 3D打印业务平台 认证核心 · 多用户版
   - 密码：PBKDF2-SHA256 加盐哈希（WebCrypto，120k 迭代）
   - 会话：HMAC-SHA256 签名的过期时间戳令牌（Cookie，默认 30 天），
     签名密钥为用户记录内的随机 secret（改密码时轮换，与密码哈希解耦）
   - 用户：存储在 users 集合，字段：id, username, passwordHash, salt, secret, role, createdAt
   - 角色：admin（管理员）/ normal（普通用户）
   - 开放模式：未配置用户时进入开放模式 */

const enc = new TextEncoder();

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

/* 密码强度验证：至少8位，包含大小写字母和数字 */
export function validatePassword(pw){
  if(!pw || typeof pw !== "string") return "密码不能为空";
  if(pw.length < 8) return "密码至少8位";
  if(!/[A-Z]/.test(pw)) return "密码必须包含大写字母";
  if(!/[a-z]/.test(pw)) return "密码必须包含小写字母";
  if(!/[0-9]/.test(pw)) return "密码必须包含数字";
  return null; // null = 验证通过
}

export function createAuth(store){
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

  /* 签发 30 天会话令牌：exp.HMAC(secret, "pf:"+exp) */
  async function signToken(user){
    const exp = Date.now() + 30 * 86400 * 1000;
    return exp + "." + (await hmacHex(user.secret, "pf:" + exp));
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
      const hash = await hashPassword(pw, user.salt);
      if(hash !== user.passwordHash) return { error:"用户名或密码错误" };
      return {
        ok:true,
        user: { id:user.id, username:user.username, role:user.role }
      };
    },

    /* 验证会话令牌 */
    async verify(req){
      const t = getCookie(req, "pf_token");
      if(!t) return null;
      const i = t.indexOf(".");
      if(i <= 0) return null;
      const exp = Number(t.slice(0, i)), sig = t.slice(i + 1);
      if(!Number.isFinite(exp) || exp < Date.now()) return null;

      // 逐用户比对签名密钥
      const users = await loadUsers();
      for(const user of users){
        if((await hmacHex(user.secret, "pf:" + exp)) === sig){
          return { id:user.id, username:user.username, role:user.role };
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
      const user = { id, username, passwordHash, salt, secret:randomHex(32), role: finalRole, createdAt: Date.now() };
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
      return users.map(u => ({ id:u.id, username:u.username, role:u.role, createdAt:u.createdAt }));
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

    /* 更新用户信息（用户名或角色） */
    async updateUser(userId, updates, operator){
      if(operator?.role !== "admin") return { error:"只有管理员可以修改用户角色" };
      if(userId === operator.id) return { error:"不能修改自己的角色" };
      const users = await loadUsers();
      const user = users.find(u => u.id === userId);
      if(!user) return { error:"用户不存在" };

      // 修改角色
      if(updates.role){
        if(!["admin","normal"].includes(updates.role)){
          return { error:"角色只能是 admin 或 normal" };
        }
        user.role = updates.role;
      }

      await saveUsers();
      return { ok:true, user:{ id:user.id, username:user.username, role:user.role } };
    },

    /* 获取当前用户信息 */
    async getUserInfo(userId){
      const users = await loadUsers();
      const user = users.find(u => u.id === userId);
      if(!user) return null;
      return { id:user.id, username:user.username, role:user.role, createdAt:user.createdAt };
    }
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
export function tokenCookie(token){
  return "pf_token=" + encodeURIComponent(token) + "; HttpOnly; Path=/; Max-Age=" + 30 * 86400 + "; SameSite=Lax";
}
export const CLEAR_COOKIE = "pf_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax";
