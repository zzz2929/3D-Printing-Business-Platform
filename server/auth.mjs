/* 3D打印业务平台 认证核心 · 跨运行时（Node / Workers / Vercel）
   - 密码：PBKDF2-SHA256 加盐哈希（WebCrypto，120k 迭代）
   - 会话：HMAC-SHA256 签名的过期时间戳令牌（Cookie，默认 30 天）
   - 密码来源：环境变量 APP_PASSWORD，或服务端存储中的 auth 记录（首次访问时设置）
   - 均未配置时进入开放模式（不拦截），并允许通过 /api/setup 设置密码 */
const enc = new TextEncoder();

function toHex(buf){ return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
async function sha256hex(s){ return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
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

export function createAuth(store, envPw){
  let record;            // undefined = 未加载；null = 无记录
  async function rec(){
    if(record === undefined) record = envPw ? null : (await store.get("auth"));
    return record;
  }
  return {
    /* 是否已配置密码（配置后即启用拦截） */
    async configured(){
      if(envPw) return true;
      return !!(await rec());
    },
    /* 校验密码 */
    async verify(pw){
      if(!pw) return false;
      if(envPw) return pw === envPw;
      const r = await rec();
      if(!r) return false;
      return (await hashPassword(pw, r.salt)) === r.hash;
    },
    /* 首次设置密码（仅在未配置时允许） */
    async setup(pw){
      if(await this.configured()) throw new Error("已配置密码，请通过环境变量或删除 auth 记录后重设");
      if(!pw || String(pw).length < 4) throw new Error("密码至少 4 位");
      const salt = randomHex(16);
      const r = { salt, hash:await hashPassword(String(pw), salt), secret:randomHex(32), createdAt:Date.now() };
      await store.set("auth", r);
      record = r;
    },
    /* 令牌签名密钥 */
    async secret(){
      if(envPw) return sha256hex("3d-printing-business:" + envPw);
      const r = await rec();
      return r ? r.secret : "3d-printing-business-insecure";
    },
    /* 修改密码（仅在服务端存储密码时允许，环境变量密码不支持） */
    async changePassword(currentPw, newPw){
      if(envPw) throw new Error("环境变量密码不支持在线修改");
      const r = await rec();
      if(!r) throw new Error("未配置密码");
      if((await hashPassword(currentPw, r.salt)) !== r.hash) throw new Error("当前密码错误");
      if(!newPw || String(newPw).length < 4) throw new Error("新密码至少 4 位");
      const salt = randomHex(16);
      const newRec = { salt, hash:await hashPassword(newPw, salt), secret:randomHex(32), createdAt:Date.now() };
      await store.set("auth", newRec);
      record = newRec;
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

/* 令牌签发 / 校验：格式 exp.sig（HMAC(secret, "pf:"+exp)），默认 30 天 */
export async function issueToken(auth){
  const exp = Date.now() + 30 * 86400 * 1000;
  return exp + "." + (await hmacHex(await auth.secret(), "pf:" + exp));
}
export async function verifyToken(auth, req){
  const t = getCookie(req, "pf_token");
  if(!t) return false;
  const i = t.indexOf(".");
  if(i <= 0) return false;
  const exp = Number(t.slice(0, i)), sig = t.slice(i + 1);
  if(!Number.isFinite(exp) || exp < Date.now()) return false;
  return (await hmacHex(await auth.secret(), "pf:" + exp)) === sig;
}
