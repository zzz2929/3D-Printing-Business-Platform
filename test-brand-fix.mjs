// 验证脚本：模拟 X2D 云端托盘数据回放匹配与同步逻辑（含旧占位清理）

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

// 模拟云端返回的 4 个托盘
const trays = [
  { slot:"AMS-A-1", ext:false, type:"PETG", brand:"", color:"#FFFFFF", weight:0, remain:null, remaining:null, uuid:"", tagUid:"", idx:"P389b776", name:"" },
  { slot:"AMS-A-2", ext:false, type:"PETG", brand:"", color:"#F55A74", weight:0, remain:null, remaining:null, uuid:"", tagUid:"", idx:"P3094ffb", name:"" },
  { slot:"AMS-A-3", ext:false, type:"PLA",  brand:"", color:"#FFFFFF", weight:0, remain:null, remaining:null, uuid:"", tagUid:"", idx:"GFA00",   name:"" },
  { slot:"AMS-A-4", ext:false, type:"PLA",  brand:"", color:"#898989", weight:0, remain:null, remaining:null, uuid:"", tagUid:"", idx:"GFA00",   name:"" }
];

// 模拟材料库（空的，只有旧同步记录已被清理）
let materials = [
  { id:"demo1", name:"Bambu Lab 拓竹 PLA Basic 曜石黑", brand:"Bambu Lab 拓竹", type:"PLA Basic", colorName:"曜石黑", color:"#1a1a1a", pricePerKg:45, spool:1000, remaining:581.8 },
  { id:"demo2", name:"Polymaker PLA 丝绸 火山橙", brand:"Polymaker", type:"PLA 丝绸", colorName:"火山橙", color:"#e8590c", pricePerKg:52, spool:1000, remaining:64 },
  { id:"demo3", name:"eSUN 易生 PETG 透明", brand:"eSUN 易生", type:"PETG", colorName:"透明", color:"#c8d8e0", pricePerKg:68, spool:1000, remaining:840 },
  { id:"demo4", name:"SUNLU TPU 95A 黑色", brand:"SUNLU", type:"TPU 95A", colorName:"黑色", color:"#2b2b2b", pricePerKg:95, spool:1000, remaining:95 }
];

console.log("=== 初始材料库 ===");
materials.forEach(m => console.log(`  ${m.id}: ${m.name}`));

// 模拟新建耗材逻辑
const now = Date.now();
const created = [];
for(const t of trays){
  const m2 = {
    id: "m" + Math.random().toString(36).slice(2),
    brand: t.brand || "",
    type: t.type || "",
    color: t.color || "#9aa3ad",
    colorName: guessColorName(t.color),
    pricePerKg: 0,
    spool: t.weight > 0 ? t.weight : 1000,
    remaining: t.remaining != null ? Math.max(0, t.remaining) : 0,
    bambuDevId: "20P6BJ650900521", bambuSlot: t.slot, bambuSyncedAt: now
  };
  if(t.uuid) m2.bambuUuid = t.uuid;
  m2.name = matLabel(m2);
  created.push(m2);
}

console.log("\n=== 新建 4 个托盘耗材 ===");
created.forEach(m => {
  const label = trayLabel({ brand:m.brand, type:m.type, color:m.color, name:m.name });
  console.log(`  ${m.bambuSlot}: name="${m.name}" | trayLabel="${label}" | brand="${m.brand}" | type="${m.type}" | color="${m.color}" | colorName="${m.colorName}"`);
});

// 验证：brand 为空，name 应为 "PETG 白" / "PETG 樱花粉" / "PLA 白" / "PLA 太空灰"
const expected = [
  { slot:"AMS-A-1", name:"PETG 白", trayLabel:"PETG 白" },
  { slot:"AMS-A-2", name:"PETG 樱花粉", trayLabel:"PETG 樱花粉" },
  { slot:"AMS-A-3", name:"PLA 白", trayLabel:"PLA 白" },
  { slot:"AMS-A-4", name:"PLA 太空灰", trayLabel:"PLA 太空灰" }
];
let ok = true;
for(let i=0;i<4;i++){
  const e = expected[i], c = created[i];
  if(c.name !== e.name || trayLabel({brand:c.brand,type:c.type,color:c.color,name:c.name}) !== e.trayLabel){
    console.log(`  ❌ ${e.slot}: expected "${e.name}" / "${e.trayLabel}", got "${c.name}" / "${trayLabel({brand:c.brand,type:c.type,color:c.color,name:c.name})}"`);
    ok = false;
  }
}
if(ok) console.log("  ✅ 全部匹配预期");

// 验证：旧同步占位更新逻辑（假设存在一个 brand=Bambu Lab 拓竹 的旧占位）
const old = { id:"old1", brand:"Bambu Lab 拓竹", type:"PETG", color:"#FFFFFF", colorName:"", name:"Bambu Lab 拓竹 PETG", bambuDevId:"20P6BJ650900521", bambuSlot:"AMS-A-1", bambuSyncedAt: 1789912650432 };
const t = trays[0]; // 对应 AMS-A-1
if(!t.brand && old.brand === "Bambu Lab 拓竹"){ old.brand = ""; }
if(t.type && t.type !== old.type){ old.type = t.type; }
if(t.color && t.color !== old.color){ old.color = t.color; old.colorName = guessColorName(t.color); }
// brand 被清理后 colorName 可能仍为空，重新计算一次确保展示名完整
if(!old.colorName && old.color){ old.colorName = guessColorName(old.color); }
old.name = matLabel(old);
console.log(`\n=== 旧占位清理测试 ===`);
console.log(`  更新后: name="${old.name}" brand="${old.brand}" type="${old.type}" color="${old.color}" colorName="${old.colorName}"`);
console.log(old.name === "PETG 白" ? "  ✅ 旧占位已正确清理" : `  ❌ expected "PETG 白", got "${old.name}"`);
if(old.name !== "PETG 白") ok = false;

process.exit(ok ? 0 : 1);
