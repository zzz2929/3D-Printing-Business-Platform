/* 端到端验证：真实 X2D 云端数据 → 前端同步逻辑回放 */
import { fetchCloud } from './server/bambu.mjs';
import { createReadStream } from 'node:fs';

const token = 'AQAuvlLPZ_BlHsXLVGWLNAm3EUGFSaTf8HPpph9JeRCufDnQHkpQuHkD-U9p3KDX1vaUrVDskbT9-lQJYG7WAbJ75m3wZwAfsNxlnBTTAYV4VvXfygpVFOMQzTro_38ll4FawlCAmjPhkhdb';

// 复现前端的 COLOR_FALLBACK 与 guessColorName
const COLOR_FALLBACK = { "#FFFFFF":"白", "#898989":"太空灰", "#F55A74":"樱花粉", "#FF0F0F":"中国红", "#000000":"曜石黑" };
function guessColorName(hex){
  if(!hex) return "";
  const up = hex.toUpperCase();
  return COLOR_FALLBACK[up] || "";
}
function matLabel(m){
  return [m.brand, m.type, m.colorName].map(s => String(s || "").trim()).filter(Boolean).join(" ") || "未命名耗材";
}
function trayLabel(t){
  if(t.name) return String(t.name).trim();
  const parts = [t.brand, t.type, t.color ? (guessColorName(t.color) || t.color) : ""].filter(Boolean);
  if(parts.length >= 2) return parts.join(" ");
  return (t.type || t.color ? [t.type, t.color ? (guessColorName(t.color) || t.color) : ""].filter(Boolean).join(" ") : "未知耗材");
}

console.log("=== 连接拓竹云获取真实托盘数据 ===");
const r = await fetchCloud({ region: 'cn', email: '17633539411', token, timeoutMs: 12000 });
const dev = r.devices[0];
console.log(`设备: ${dev.devName} (${dev.devId}) — ${dev.trays.length} 个托盘`);

// 读取当前服务端材料库（模拟前端加载）
const materialsPath = './data/u_ae78223a8284130eb6caa4adf1466529_materials.json';
let materials = [];
try{
  const txt = await new Response(createReadStream(materialsPath)).text();
  materials = JSON.parse(txt);
} catch(e){ console.log("材料库为空或不存在，从空开始"); }

console.log(`\n当前材料库共 ${materials.length} 条:`);
materials.forEach(m => console.log(`  ${m.id}: ${m.name} | brand="${m.brand}" type="${m.type}" color="${m.color}"`));

// 模拟 matchBambuTray 逻辑（简化版，与 app.js 逻辑一致）
function matchBambuTray(t, devId, taken){
  const takenIds = taken || new Set();
  if(devId && t.slot){
    const byBind = materials.find(x => x.bambuDevId === devId && x.bambuSlot === t.slot);
    if(byBind){ takenIds.add(byBind.id); return { m: byBind, how:"bind" }; }
  }
  if(t.uuid){
    const byUuid = materials.find(x => x.bambuUuid === t.uuid);
    if(byUuid){ takenIds.add(byUuid.id); return { m: byUuid, how:"uuid" }; }
  }
  const tt = String(t.type || "").toLowerCase().trim(), cc = String(t.color || "").toUpperCase();
  const typeEq = x => String(x.type || "").toLowerCase().trim() === tt;
  const typeNear = x => {
    const xt = String(x.type || "").toLowerCase().trim();
    return tt && xt && (xt.startsWith(tt) || tt.startsWith(xt));
  };
  if(tt){
    const self = materials.filter(x => typeNear(x) && !x.bambuSyncedAt
      && !(x.bambuDevId && x.bambuSlot) && !takenIds.has(x.id));
    if(self.length === 1){ takenIds.add(self[0].id); return { m: self[0], how:"type" }; }
  }
  const byPair = materials.find(x => typeEq(x) && String(x.color || "").toUpperCase() === cc)
    || materials.find(x => typeNear(x) && String(x.color || "").toUpperCase() === cc);
  if(byPair){ takenIds.add(byPair.id); return { m: byPair, how:"pair" }; }
  return { m: null, how:"none" };
}

// 模拟同步逻辑
const now = Date.now();
let updated = 0, created = 0;
const taken = new Set();
const results = [];

for(const t of dev.trays){
  const { m, how } = matchBambuTray(t, dev.devId, taken);
  if(m){
    // 模拟更新
    if(!t.brand && m.brand === "Bambu Lab 拓竹"){ m.brand = ""; }
    if(t.type && t.type !== m.type){ m.type = t.type; }
    if(t.color && t.color !== m.color){ m.color = t.color; m.colorName = guessColorName(t.color); }
    if(!m.colorName && m.color){ m.colorName = guessColorName(m.color); }
    m.name = matLabel(m);
    m.bambuDevId = dev.devId; m.bambuSlot = t.slot; m.bambuSyncedAt = now;
    updated++;
    results.push({ slot: t.slot, action: "update", how, name: m.name, brand: m.brand, type: m.type, color: m.color });
  } else {
    // 模拟新建
    const m2 = {
      id: "mu" + Math.random().toString(36).slice(2, 9),
      brand: t.brand || "",
      type: t.type || "",
      color: t.color || "#9aa3ad",
      colorName: guessColorName(t.color),
      pricePerKg: 0,
      spool: t.weight > 0 ? t.weight : 1000,
      remaining: t.remaining != null ? Math.max(0, t.remaining) : 0,
      bambuDevId: dev.devId, bambuSlot: t.slot, bambuSyncedAt: now
    };
    if(t.uuid) m2.bambuUuid = t.uuid;
    m2.name = matLabel(m2);
    materials.push(m2);
    created++;
    results.push({ slot: t.slot, action: "create", name: m2.name, brand: m2.brand, type: m2.type, color: m2.color });
  }
}

console.log(`\n=== 同步结果（更新 ${updated} · 新建 ${created}） ===`);
results.forEach(r => {
  console.log(`  ${r.slot}: ${r.action === 'update' ? '更新' : '新建'} "${r.name}" | brand="${r.brand}" type="${r.type}" color="${r.color}"${r.how ? ' ('+r.how+')' : ''}`);
});

// 验证：确保没有品牌被错误标记为"拓竹"
const hasBambuBrand = materials.some(m => m.brand === "Bambu Lab 拓竹" && m.bambuSyncedAt === now);
const allCorrect = results.every(r => r.brand === "" && !r.name.includes("拓竹"));
console.log(`\n=== 验证 ===`);
console.log(`  是否有新建/更新项 brand="Bambu Lab 拓竹": ${hasBambuBrand ? '❌ 是' : '✅ 否'}`);
console.log(`  所有同步项 name 不含"拓竹": ${allCorrect ? '✅ 是' : '❌ 否'}`);

// 展示最终材料库中本次同步相关的记录
console.log(`\n=== 同步后材料库中相关记录 ===`);
materials.filter(m => m.bambuSyncedAt === now).forEach(m => {
  console.log(`  ${m.bambuSlot}: ${m.name} | brand="${m.brand}" type="${m.type}" color="${m.color}" colorName="${m.colorName}"`);
});

process.exit((!hasBambuBrand && allCorrect) ? 0 : 1);
