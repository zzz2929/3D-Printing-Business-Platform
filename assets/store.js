/* 3D打印业务平台 · 数据层：REST API 客户端（前后端分离）
   服务端存储；服务不可达时自动降级为 localStorage「本地模式」；
   旧版（v1/v2 纯前端）localStorage 数据在首次连接服务端时自动上载迁移 */
"use strict";

const Store = (function(){
  const COLS = ["materials", "printers", "records", "orders", "settings", "achievements"];
  const LEGACY = { mat:"pp3d_materials", pri:"pp3d_printers", rec:"pp3d_records", ord:"pp3d_orders", ach:"pp3d_ach", set:"pp3d_settings" };

  /* ---------- 预设默认值（材料大类-小类树 / 品牌 / 颜色名 / 打印机品牌） ----------
     - matBrands / matColors / priBrands：字符串数组
     - matCategories：[{ name, note?, subs:[{ name, desc }] }]
     设置里持久化的 presets 会与这份默认做合并（缺什么补什么），
     所以老用户第一次升级时无需任何操作就拿到完整耗材树。 */
  const DEFAULT_PRESETS = {
    matBrands: [
      "Bambu Lab 拓竹","Polymaker","eSUN 易生","SUNLU","Creality 创想三维",
      "ELEGOO 爱乐酷","Anycubic 纵维立方","Prusament","HATCHBOX","Kexcelled",
      "天瑞 TIANRUI","其他 / 通用"
    ],
    matCategories: [
      { name:"PLA", subs:[
        { name:"PLA Basic", desc:"PLA基础款，多彩平滑，适合新手打印" },
        { name:"PLA+", desc:"PLA增韧款，适合打印道具、护具等耐用物品" },
        { name:"PLA Matte", desc:"PLA哑光，细腻哑光，适合手办摆件等" },
        { name:"PLA Lite", desc:"PLA入门款，哑光隐纹，适合新手练手，但强度稍差" },
        { name:"PLA Silk", desc:"PLA丝绸，有光泽感，适合需要丝绸质感的模型" },
        { name:"PLA Silk+", desc:"PLA丝绸+，有更强的韧性，适合需要强度的丝绸质感模型" },
        { name:"PLA 多色丝绸", desc:"横向渐变，颜色随角度变化" },
        { name:"PLA 渐变", desc:"竖向渐变，颜色随高度变化" },
        { name:"PLA Translucent", desc:"PLA半透明，适合打印灯罩，色彩仿玻璃装饰" },
        { name:"PLA Glow", desc:"PLA夜光，暗处发光" },
        { name:"PLA Wood", desc:"PLA木质，添加木粉，模仿木头质感，有木香" },
        { name:"PLA Metal", desc:"PLA金属，金属光泽，高端质感，适合需要金属质感的模型" },
        { name:"PLA Marble", desc:"PLA大理石，添加石粉，仿大理石纹路，适合石头、房屋" },
        { name:"PLA Sparkle", desc:"PLA闪耀，添加闪粉，细腻美观，适合摆件挂饰等" },
        { name:"PLA Aero", desc:"PLA发泡，低密度轻量化，适合打印航模" },
        { name:"PLA-CF", desc:"PLA碳纤增强，抗弯折，适合需要强度的零件，5/10/15不同含量" },
        { name:"PLA 温变", desc:"遇热变色" },
        { name:"PVA 水溶", desc:"泡温水溶解，精细支撑，常用作精细手办模型的支撑" }
      ]},
      { name:"ABS&ASA", subs:[
        { name:"ABS", desc:"高韧耐久，高耐温，适合需要强度的零件" },
        { name:"ABS-CF", desc:"含碳纤，高尺寸稳定性，适合哑光质感的高刚度结构件" },
        { name:"ABS-GF", desc:"含玻纤，绝缘，耐腐蚀" },
        { name:"ABS-FR", desc:"阻燃ABS，防火安全，抗冲击，适合电子配件、汽车配件" },
        { name:"ABS Easy", desc:"ABS易打款，开放式易打印，适合无封箱玩家使用（注意通风）" },
        { name:"ASA", desc:"耐紫外线，耐高温，高韧坚固，适合户外应用和常规工程件" },
        { name:"ASA Aero", desc:"ABS发泡，坚韧抗冲击，低密度，耐水耐紫外线，适合受力件" },
        { name:"ASA-CF", desc:"ABS碳纤维，耐晒耐候，耐高温，高韧坚固，适合高机械强度模型" }
      ]},
      { name:"PETG", subs:[
        { name:"PETG Basic", desc:"PETG基础，最常见的PETG，适合打印挂钩、支架等" },
        { name:"PETG Matte", desc:"PETG哑光，质感好但打印难度大，新手慎用" },
        { name:"PETG Translucent", desc:"PETG半透明" },
        { name:"PETG Metal", desc:"PETG金属，高端金属质感，适合需要仿金属的模型" },
        { name:"PETG Marble", desc:"PETG大理石，添加石粉，仿大理石纹路，适合石头、房屋" },
        { name:"PETG-HF", desc:"PETG高速，流动性好，可开狂暴模式" },
        { name:"PETG-CF", desc:"PETG碳纤，抗弯折，适合需要强度的零件，5/10/15不同含量" },
        { name:"PETG-GF", desc:"PETG玻纤，绝缘，耐腐蚀，适合打印室外模型，5/10/15不同含量" },
        { name:"PETG-Diffuse", desc:"PETG光扩散，良好透光率与扩散效果，适合灯箱模型" }
      ]},
      { name:"柔性耗材", subs:[
        { name:"TPU 85A", desc:"更柔软，适合保护套、缓冲件和鞋子" },
        { name:"TPU 90A", desc:"适合打印鞋底、遥控车轮胎等，柔韧性强硬度并存" },
        { name:"TPU 95A", desc:"柔软高韧，抗冲击，适合需承受冲击、跌落、碰撞的零件" },
        { name:"TPU 98A", desc:"抗冲击性强，复弯后仍能保持性能，耐用性高" },
        { name:"TPU 64D", desc:"具有较高硬度和一定回弹性，适合打印手提袋一类" },
        { name:"TPU 68D", desc:"具有较高硬度和一定回弹性，适合打印手提袋一类" },
        { name:"TPU Aero", desc:"发泡TPU，布艺质感，柔软舒适，高回弹、减震耐磨、轻量化" },
        { name:"PEBA 95A", desc:"轻量、回弹高、抗冲击优秀、耐磨，适合珠类等高回弹物件" },
        { name:"PEBA 90A", desc:"高弹力、高韧性、耐磨，适合户外场景的物件" }
      ]},
      { name:"工程耗材", subs:[
        { name:"PA6", desc:"尼龙，耐磨，抗冲击，耐腐蚀，适合打印工程件" },
        { name:"PA66", desc:"相较于PA6更耐温" },
        { name:"PA6+", desc:"强韧耐磨，在PA6基础上增韧" },
        { name:"PA6-CF", desc:"含碳纤，高强高刚，高韧防震，适合自行车部件等，5-20含量" },
        { name:"PA6-GF", desc:"含玻纤，绝缘，耐腐蚀，适合承重件、抗弯抗冲击部件" },
        { name:"PC", desc:"良好性能，透光高亮，超耐高温，汽车/电子/光学医疗领域" },
        { name:"PC FR", desc:"阻燃，工程机械性能，适合电子、汽车和机械工程等关键场景" },
        { name:"PAHT-CF", desc:"更少吸水，耐热，刚强坚韧，能承受巨大力而不变形" },
        { name:"POM", desc:"高强高钢高弹，有自润滑，可用于医疗领域" },
        { name:"PET-CF", desc:"含碳纤，超低吸湿，高强高刚高耐温，适合湿度较高的环境" }
      ]},
      { name:"特种塑料", subs:[
        { name:"PPA", desc:"耐热、耐磨、高刚性、耐水耐高温，精度和强度要求高的部件" },
        { name:"PPA-CF", desc:"碳纤增强PPA，准金属强度，耐水耐高温，可替换汽车/工业零件" },
        { name:"PPS", desc:"天然阻燃耐腐蚀，适用于电子电器工业设备" },
        { name:"PPS-CF", desc:"高耐温，天然阻燃，强器械性能，适用于电子产品、汽车关键件" },
        { name:"PEEK", desc:"塑料之王，综合性能最强" }
      ]}
    ],
    matColors: [
      "曜石黑","象牙白","太空灰","中国红","火山橙","柠檬黄","松涛绿",
      "克莱因蓝","罗兰紫","樱花粉","咖啡棕","香槟金","钛银","透明","荧光绿","渐变色"
    ],
    priBrands: [
      "拓竹 Bambu Lab","创想三维 Creality","Prusa Research","纵维立方 Anycubic",
      "爱乐酷 Elegoo","QIDI 科技","Snapmaker","UltiMaker","拓斯 Tiertime","其他 / 自制"
    ]
  };
  /* 预设的深拷贝（防止后续被改） */
  const defaultPresets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));

  const STATUSES = [
    { key:"quote",    label:"待报价", color:"#8b95a1" },
    { key:"unpaid",   label:"待付款", color:"#ff6b6b" },
    { key:"printing", label:"打印中", color:"#4cc2ff" },
    { key:"shipped",  label:"已发货", color:"#b085f5" },
    { key:"done",     label:"已完成", color:"#3ecf8e" },
    { key:"canceled", label:"已取消", color:"#6b7684" }
  ];
  const stOf = k => STATUSES.find(s => s.key === k) || STATUSES[0];

  /* ---------- 工具 ---------- */
  function lsGet(k, def){ try{ const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; }catch(e){ return def; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function num(x){ const n = parseFloat(x); return isFinite(n) ? n : 0; }
  function today(){ const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function fmt(n, d){ return Number(n).toLocaleString("zh-CN", { maximumFractionDigits: d == null ? 1 : d }); }

  /* ---------- 状态 ---------- */
  let settings = { currency:"¥", theme:"dark", lowStock:200, laborHourly:65, markupPct:10, onboarded:false,
    presets: JSON.parse(JSON.stringify(DEFAULT_PRESETS)) };
  let materials = [], printers = [], records = [], orders = [];
  let achKeys = new Set();
  let mode = "server";            // server | local
  let readyResolve;
  const ready = new Promise(r => readyResolve = r);
  const syncFns = [];
  let saveSeq = 0, saving = 0;

  function money(v){ return settings.currency + (Math.round(num(v) * 100) / 100).toLocaleString("zh-CN", { minimumFractionDigits:2, maximumFractionDigits:2 }); }

  /* ---------- 预设（用户可自由扩展） ---------- */
  function presets(){ return settings.presets || (settings.presets = JSON.parse(JSON.stringify(DEFAULT_PRESETS))); }
  function flatMatTypes(){
    const out = [];
    presets().matCategories.forEach(c => c.subs.forEach(s => out.push(s.name)));
    return out;
  }
  function findSub(cat, sub){
    const c = presets().matCategories.find(x => x.name === cat);
    return c && c.subs.find(s => s.name === sub);
  }
  function findCategory(name){ return presets().matCategories.find(c => c.name === name); }
  function addUnique(list, name){
    name = String(name || "").trim();
    if(!name) return false;
    if(list.indexOf(name) >= 0) return false;
    list.push(name);
    return true;
  }
  function addMatBrand(name){
    if(addUnique(presets().matBrands, name)){ push("settings"); return true; }
    return false;
  }
  function addMatColor(name){
    if(addUnique(presets().matColors, name)){ push("settings"); return true; }
    return false;
  }
  function addPriBrand(name){
    if(addUnique(presets().priBrands, name)){ push("settings"); return true; }
    return false;
  }
  /* 大类：增 / 改 / 删（删大类会一并删其下所有小类） */
  function addCategory(name){
    name = String(name || "").trim();
    if(!name) return false;
    if(findCategory(name)) return false;
    presets().matCategories.push({ name, subs:[] });
    push("settings"); return true;
  }
  function renameCategory(oldN, newN){
    newN = String(newN || "").trim();
    const c = findCategory(oldN);
    if(!c || !newN) return false;
    if(oldN !== newN && findCategory(newN)) return false; // 重复
    c.name = newN; push("settings"); return true;
  }
  function setCategoryNote(name, note){
    const c = findCategory(name);
    if(!c) return false;
    c.note = String(note || "").trim(); push("settings"); return true;
  }
  function removeCategory(name){
    const ps = presets(), i = ps.matCategories.findIndex(c => c.name === name);
    if(i < 0) return false;
    ps.matCategories.splice(i, 1); push("settings"); return true;
  }
  /* 小类：增 / 改 / 删 */
  function addSub(cat, sub, desc){
    sub = String(sub || "").trim();
    const c = findCategory(cat);
    if(!c || !sub) return false;
    if(c.subs.find(s => s.name === sub)) return false;
    c.subs.push({ name:sub, desc:String(desc || "").trim() });
    push("settings"); return true;
  }
  function updateSub(cat, oldSub, newSub, newDesc){
    const c = findCategory(cat), s = c && c.subs.find(x => x.name === oldSub);
    if(!s) return false;
    newSub = String(newSub || "").trim() || oldSub;
    if(newSub !== oldSub && c.subs.find(x => x.name === newSub)) return false; // 重复
    s.name = newSub;
    if(newDesc != null) s.desc = String(newDesc || "").trim();
    push("settings"); return true;
  }
  function removeSub(cat, sub){
    const c = findCategory(cat);
    if(!c) return false;
    const i = c.subs.findIndex(s => s.name === sub);
    if(i < 0) return false;
    c.subs.splice(i, 1); push("settings"); return true;
  }
  function moveSub(cat, fromIdx, toIdx){
    const c = findCategory(cat);
    if(!c || fromIdx < 0 || toIdx < 0 || fromIdx >= c.subs.length || toIdx >= c.subs.length) return false;
    if(fromIdx === toIdx) return true;
    const item = c.subs[fromIdx]; c.subs.splice(fromIdx, 1); c.subs.splice(toIdx, 0, item);
    push("settings"); return true;
  }
  function moveCategory(fromIdx, toIdx){
    const arr = presets().matCategories;
    if(fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return false;
    if(fromIdx === toIdx) return true;
    const item = arr[fromIdx]; arr.splice(fromIdx, 1); arr.splice(toIdx, 0, item);
    push("settings"); return true;
  }
  /* 列表型预设：删 / 改 / 移动 */
  function removeFromList(listKey, name){
    const arr = presets()[listKey];
    if(!arr) return false;
    const i = arr.indexOf(name);
    if(i < 0) return false;
    arr.splice(i, 1); push("settings"); return true;
  }
  function updateInList(listKey, oldName, newName){
    newName = String(newName || "").trim();
    const arr = presets()[listKey];
    if(!arr || !newName) return false;
    const i = arr.indexOf(oldName);
    if(i < 0) return false;
    if(oldName !== newName && arr.indexOf(newName) >= 0) return false;
    arr[i] = newName; push("settings"); return true;
  }
  function moveInList(listKey, fromIdx, toIdx){
    const arr = presets()[listKey];
    if(!arr || fromIdx < 0 || toIdx < 0 || fromIdx >= arr.length || toIdx >= arr.length) return false;
    if(fromIdx === toIdx) return true;
    const item = arr[fromIdx]; arr.splice(fromIdx, 1); arr.splice(toIdx, 0, item);
    push("settings"); return true;
  }
  /* 重置：scope = "all" | "matCategories" | "matBrands" | "matColors" | "priBrands" */
  function resetPresets(scope){
    scope = scope || "all";
    if(scope === "all"){
      settings.presets = JSON.parse(JSON.stringify(defaultPresets));
    }else if(defaultPresets[scope]){
      settings.presets[scope] = JSON.parse(JSON.stringify(defaultPresets[scope]));
    }else return false;
    push("settings"); return true;
  }

  /* ---------- 同步（防抖 + 状态回调） ---------- */
  const dirty = new Set(); let flushT = null;
  function onSync(fn){ syncFns.push(fn); }
  function emit(st){ syncFns.forEach(f => { try{ f(st); }catch(e){} }); }
  async function push(col){
    dirty.add(col); emit("saving");
    clearTimeout(flushT);
    flushT = setTimeout(flush, 300);
  }
  async function flush(){
    const cols = Array.from(dirty); dirty.clear();
    saving += cols.length;
    for(const col of cols){
      const val = col === "settings" ? settings : col === "achievements" ? Array.from(achKeys) : stateCol(col);
      try{
        if(mode === "server"){
          const r = await fetch("/api/" + col, { method:"PUT", headers:{ "content-type":"application/json" }, body: JSON.stringify(val) });
          if(!r.ok) throw new Error("HTTP " + r.status);
        }else{
          lsSet(LEGACY[col === "settings" ? "set" : col === "achievements" ? "ach" : col], val);
        }
        saving--;
        if(saving <= 0){ saving = 0; emit("saved"); }
      }catch(e){
        saving = 0; dirty.add(col); emit("error");
        if(String(e.message).indexOf("401") >= 0){ location.reload(); return; } // 会话过期 → 回登录门
        console.warn("保存失败", col, e);
      }
    }
  }
  function pushAll(){ COLS.forEach(c => push(c)); }
  const stateCol = col => ({ materials, printers, records, orders })[col];

  /* ---------- 迁移：补默认字段 ---------- */
  function migrate(){
    if(materials.length === 0 && printers.length === 0 && orders.length === 0 && records.length === 0){
      materials = [{ id:uid(), name:"PLA 样例", type:"PLA", color:"#ffb02e", pricePerKg:45, spool:1000, remaining:1000 }];
      printers = [{ id:uid(), name:"打印机 样例", powerW:1300, elecPrice:0.49, brand:"其他", price:0, depYears:2, maintPerYear:0, utilization:50 }];
    }
    materials.forEach(m => {
      if(m.spool == null) m.spool = 1000;
      if(m.remaining == null) m.remaining = m.spool;
      if(m.brand == null) m.brand = m.name || "";       // 旧数据：名称视为品牌
      if(m.colorName == null) m.colorName = "";
      if(!m.name) m.name = matLabel(m);
    });
    printers.forEach(p => {
      if(p.brand == null) p.brand = "其他";
      if(p.model == null) p.model = p.name || "";        // 旧数据：名称视为型号
      if(p.price == null) p.price = 0;
      if(p.depYears == null) p.depYears = 2;
      if(p.maintPerYear == null) p.maintPerYear = 0;
      if(p.utilization == null) p.utilization = 50;
      if(!p.name) p.name = priLabel(p);
    });
    orders.forEach(o => {
      if(o.quote == null) o.quote = num(o.received);
      if(!Array.isArray(o.extras)) o.extras = [];
      if(!Array.isArray(o.payments)) o.payments = num(o.received) > 0 ? [{ date:o.date || today(), amount:num(o.received), note:"" }] : [];
      if(o.handlingMin == null) o.handlingMin = 0;
    });
    records.forEach(r => {
      if(r.consumed == null) r.consumed = num(r.grams);
      if(r.handlingMin == null) r.handlingMin = 0;
      if(r.cMach == null) r.cMach = 0;
      if(r.cLab == null) r.cLab = 0;
    });
    if(settings.markupPct == null){
      settings.markupPct = settings.markup != null ? Math.max(0, Math.round((num(settings.markup) - 1) * 100)) : 10;
    }
    if(settings.laborHourly == null) settings.laborHourly = 65;
    delete settings.markup;
    if(settings.currency == null) settings.currency = "¥";
    if(settings.theme == null) settings.theme = "dark";
    if(settings.lowStock == null) settings.lowStock = 200;
    /* 兜底预设：老 settings 没 presets 字段时补齐；缺某分类时合并默认 */
    if(!settings.presets || typeof settings.presets !== "object"){
      settings.presets = JSON.parse(JSON.stringify(defaultPresets));
    }else{
      ["matBrands","matCategories","matColors","priBrands"].forEach(k => {
        if(!settings.presets[k]) settings.presets[k] = JSON.parse(JSON.stringify(defaultPresets[k]));
      });
    }
  }

  /* 旧版纯前端数据上载（服务端为空 + 本地有旧数据时，一次性导入） */
  function maybeImportLegacy(){
    if(mode !== "server" || lsGet("pp3d_migrated", false)) return;
    const lm = lsGet(LEGACY.mat, []), lp = lsGet(LEGACY.pri, []), lr = lsGet(LEGACY.rec, []), lo = lsGet(LEGACY.ord, []);
    if(lm.length || lp.length || lr.length || lo.length){
      materials = lm; printers = lp; records = lr; orders = lo;
      const ls = lsGet(LEGACY.set, null); if(ls) Object.assign(settings, ls);
      achKeys = new Set(lsGet(LEGACY.ach, []));
      migrate(); pushAll();
    }
    lsSet("pp3d_migrated", true);
  }

  /* ---------- 初始化：连接服务端（含登录门） ---------- */
  let auth = { required:false, ok:true, openMode:false }; // 服务端鉴权状态
  async function tryLoad(){
    const r = await fetch("/api/data", { headers:{ "accept":"application/json" } });
    if(!r.ok) throw new Error("HTTP " + r.status);
    const d = await r.json();
    materials = Array.isArray(d.materials) ? d.materials : [];
    printers  = Array.isArray(d.printers) ? d.printers : [];
    records   = Array.isArray(d.records) ? d.records : [];
    orders    = Array.isArray(d.orders) ? d.orders : [];
    if(d.settings && typeof d.settings === "object") Object.assign(settings, d.settings);
    achKeys = new Set(Array.isArray(d.achievements) ? d.achievements : []);
    mode = "server";
    const serverEmpty = materials.length === 0 && printers.length === 0 && records.length === 0 && orders.length === 0;
    migrate();
    if(serverEmpty) maybeImportLegacy();
    readyResolve(mode);
    emit("saved"); // 初始加载完成，更新同步状态灯
  }
  async function init(){
    try{
      const st = await fetch("/api/auth", { headers:{ "accept":"application/json" } }).then(r => r.json());
      mode = "server";
      const u = st.user || {};
      auth = { required:!!st.required, ok:!!st.ok, openMode:!!st.openMode, role:u.role, userId:u.id, username:u.username };
      if(auth.required && !auth.ok){ readyResolve("auth"); return; } // 等待登录，app.js 弹登录门
      await tryLoad();
    }catch(e){
      // 服务端不可达 → 本地模式（双击 index.html 也能用）
      mode = "local";
      auth = { required:false, ok:true, openMode:false };
      materials = lsGet(LEGACY.mat, []); printers = lsGet(LEGACY.pri, []);
      records = lsGet(LEGACY.rec, []); orders = lsGet(LEGACY.ord, []);
      Object.assign(settings, lsGet(LEGACY.set, {}));
      achKeys = new Set(lsGet(LEGACY.ach, []));
      migrate();
      readyResolve(mode);
      emit("saved");
    }
  }
  /* 登录 / 登出（登录成功后自动加载数据） */
  async function login(username, pw){
    const r = await fetch("/api/login", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username, password:pw }) });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "登录失败");
    auth.ok = true;
    const u = d.user || {};
    auth.role = u.role; auth.userId = u.id; auth.username = u.username;
    await tryLoad();
  }
  /* 开放模式下创建第一个管理员（服务端首个注册用户自动为 admin），成功后整站转为密码保护 */
  async function createAdmin(username, pw){
    const r = await fetch("/api/register", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username, password:pw }) });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "创建失败");
    auth.ok = true; auth.required = true; auth.openMode = false;
    const u = d.user || {};
    auth.role = u.role; auth.userId = u.id; auth.username = u.username;
    return d;
  }
  /* 用户管理 API */
  async function apiUsers(){ return fetch("/api/users", { headers:{ "accept":"application/json" } }).then(r => r.json()); }
  async function apiRegister(username, password, role){
    const r = await fetch("/api/users", { method:"POST", headers:{ "content-type":"application/json" }, body:JSON.stringify({ username, password, role }) });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "注册失败");
    return d;
  }
  async function apiDeleteUser(userId){
    const r = await fetch("/api/users/" + encodeURIComponent(userId), { method:"DELETE" });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "删除失败");
    return d;
  }
  async function apiUpdateUser(userId, updates){
    const r = await fetch("/api/users/" + encodeURIComponent(userId), { method:"PATCH", headers:{ "content-type":"application/json" }, body:JSON.stringify(updates) });
    const d = await r.json().catch(() => ({}));
    if(!r.ok) throw new Error(d.error || "更新失败");
    return d;
  }
  async function logout(){
    try{ await fetch("/api/logout", { method:"POST" }); }catch(e){}
    location.reload();
  }

  /* ---------- 计算 ---------- */
  /* 展示名：耗材 = 品牌 + 类型 + 颜色名；打印机 = 品牌 + 型号 */
  function matLabel(m){
    return [m.brand, m.type, m.colorName].map(s => String(s || "").trim()).filter(Boolean).join(" ") || "未命名耗材";
  }
  function priLabel(p){
    const brand = String(p.brand || "").trim();
    const model = String(p.model || "").trim();
    if(brand && brand !== "其他" && brand !== "其他 / 自制") return (brand + " " + model).trim();
    return model || "未命名打印机";
  }
  function machineRate(pri){
    if(!pri) return 0;
    const years = Math.max(0.1, num(pri.depYears)), util = Math.min(100, num(pri.utilization));
    const total = num(pri.price) + num(pri.maintPerYear) * years;
    if(total <= 0 || util <= 0) return 0;
    return total / (years * 365 * 24 * util / 100);
  }
  function laborCost(minutes){ return num(settings.laborHourly) / 60 * num(minutes); }
  function computePrint(mat, pri, g, h){
    const cFil  = mat ? (num(mat.pricePerKg) / 1000) * num(g) : 0;
    const cElec = pri ? (num(pri.powerW) / 1000) * num(h) * num(pri.elecPrice) : 0;
    const cMach = pri ? machineRate(pri) * num(h) : 0;
    return { cFil, cElec, cMach, printCost: cFil + cElec + cMach };
  }
  function sumPayments(list){ return (list || []).reduce((s, x) => s + num(x.amount), 0); }
  function orderDue(o){ return Math.max(0, num(o.quote) - num(o.received)); }
  function matById(id){ return materials.find(m => m.id === id); }
  function priById(id){ return printers.find(p => p.id === id); }

  function orderStats(list){
    list = list || orders.filter(o => o.status !== "canceled");
    const rev = list.reduce((s,o) => s + num(o.received), 0);
    const quote = list.reduce((s,o) => s + num(o.quote), 0);
    const cost = list.reduce((s,o) => s + num(o.totalCost), 0);
    const profit = rev - cost;
    const due = list.reduce((s,o) => s + orderDue(o), 0);
    const active = orders.filter(o => !["done","canceled"].includes(o.status)).length;
    return { count:list.length, rev, quote, cost, profit, due, active, margin: cost > 0 ? profit / cost * 100 : 0 };
  }

  function monthly(list, field, n){
    const out = [];
    const now = new Date();
    for(let i = n - 1; i >= 0; i--){
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
      out.push({ key, label:(d.getMonth() + 1) + "月", value:0 });
    }
    const idx = {}; out.forEach(r => idx[r.key] = r);
    list.forEach(o => {
      const k = String(o.date || "").slice(0, 7);
      if(idx[k]) idx[k].value += num(o[field]);
    });
    return out;
  }

  function byCustomer(list){
    const map = {};
    (list || orders).forEach(o => {
      if(o.status === "canceled") return;
      const k = (o.wechat || o.custName || "").trim() || "未填客户";
      if(!map[k]) map[k] = { name:k, n:0, rev:0, cost:0, profit:0, due:0 };
      const c = map[k];
      c.n++; c.rev += num(o.received); c.cost += num(o.totalCost);
      c.profit += num(o.received) - num(o.totalCost); c.due += orderDue(o);
    });
    return Object.values(map).sort((a,b) => b.profit - a.profit || b.rev - a.rev);
  }

  /* ---------- 成就 ---------- */
  function buildAchStats(){
    const dates = orders.map(o => o.date).filter(Boolean).sort();
    let best = 0, cur = 0, prev = null;
    dates.forEach(d => {
      const t = new Date(d + "T00:00:00"); t.setDate(t.getDate() + 1);
      if(prev && t.toISOString().slice(0,10) === d) cur++; else cur = 1;
      if(cur > best) best = cur; prev = d;
    });
    return {
      count: orders.length,
      rev: orders.reduce((s,o) => s + num(o.received), 0),
      profit: orders.reduce((s,o) => s + num(o.received) - num(o.totalCost), 0),
      hours: orders.reduce((s,o) => s + num(o.hours), 0),
      hasRecv: orders.some(o => num(o.received) > 0),
      maxProfit: orders.reduce((m,o) => Math.max(m, num(o.received) - num(o.totalCost)), 0),
      anyLoss: orders.some(o => num(o.received) - num(o.totalCost) < 0),
      done: orders.filter(o => o.status === "done").length,
      bestStreak: best
    };
  }
  const ACHS = [
    { id:"first",      ic:"🐣", nm:"破壳第一单", ds:"接下人生第一单",        goal:s => s.count >= 1 ? 1 : 0 },
    { id:"recv",       ic:"💰", nm:"第一桶金",   ds:"收到第一笔收款",        goal:s => s.hasRecv ? 1 : 0 },
    { id:"ten",        ic:"📦", nm:"小有规模",   ds:"累计 10 单",            goal:s => Math.min(1, s.count / 10) },
    { id:"100h",       ic:"🏭", nm:"打印狂人",   ds:"累计打印 100 小时",     goal:s => Math.min(1, s.hours / 100) },
    { id:"streak",     ic:"🔥", nm:"七日连击",   ds:"连续 7 天接单",         goal:s => Math.min(1, s.bestStreak / 7) },
    { id:"profit100",  ic:"📈", nm:"暴利单",     ds:"单笔利润破 100",        goal:s => Math.min(1, s.maxProfit / 100) },
    { id:"profit1000", ic:"🌟", nm:"盈利千元",   ds:"累计利润破 1000",       goal:s => Math.min(1, s.profit / 1000) },
    { id:"loss",       ic:"💸", nm:"交学费",     ds:"亏过一笔（幽默）",      goal:s => s.anyLoss ? 1 : 0 },
    { id:"done20",     ic:"🤝", nm:"成交达人",   ds:"完成 20 单",            goal:s => Math.min(1, s.done / 20) }
  ];

  /* ---------- 备份 / 导入 ---------- */
  function exportPayload(){
    return { _app:"3d-printing-business", _version:3, _legacy:"3dprint-cost",
      settings, materials, printers, records, orders,
      achievements:Array.from(achKeys), exportedAt:new Date().toISOString() };
  }
  function importPayload(d){
    if(!d || typeof d !== "object") throw new Error("格式无法识别");
    if(Array.isArray(d.materials)) materials = d.materials;
    if(Array.isArray(d.printers))  printers  = d.printers;
    if(Array.isArray(d.records))   records   = d.records;
    if(Array.isArray(d.orders))    orders    = d.orders;
    if(d.settings && typeof d.settings === "object") Object.assign(settings, d.settings);
    if(Array.isArray(d.achievements)) achKeys = new Set(d.achievements);
    migrate(); pushAll();
  }
  function wipeAll(){
    materials = []; printers = []; records = []; orders = []; achKeys = new Set();
    pushAll(); migrate();
  }
  function loadDemo(){
    const d = today();
    const mk = (brand,type,cn,c,p,rem) => ({ id:uid(), name:brand+" "+type+" "+cn, brand, type, colorName:cn, color:c, pricePerKg:p, spool:1000, remaining:rem });
    materials = [
      mk("Bambu Lab 拓竹","PLA Basic","曜石黑","#1a1a1a",45,620), mk("Polymaker","PLA 丝绸","火山橙","#e8590c",52,150),
      mk("eSUN 易生","PETG","透明","#c8d8e0",68,840), mk("SUNLU","TPU 95A","黑色","#2b2b2b",95,95)
    ];
    printers = [
      { id:uid(), name:"Bambu Lab 拓竹 P1S", brand:"拓竹 Bambu Lab", model:"P1S", powerW:120, elecPrice:0.49, price:5000, depYears:2, maintPerYear:1000, utilization:50 },
      { id:uid(), name:"创想三维 Ender-3 V3", brand:"创想三维 Creality", model:"Ender-3 V3", powerW:180, elecPrice:0.49, price:1500, depYears:2, maintPerYear:500, utilization:40 }
    ];
    const m0 = materials[0].id, m1 = materials[1].id;
    records = [
      { id:uid(), date:d, created:Date.now(), materialId:m0, matName:"PLA 曜石黑", matType:"PLA", matColor:"#1a1a1a", pricePerKg:45, printerId:printers[0].id, priName:"P1S", powerW:120, elecPrice:0.49, grams:38.2, hours:3.5, cFil:1.72, cElec:0.21, cMach:2.8, cLab:16.25, total:20.98, consumed:38.2, handlingMin:15, note:"齿轮组 ×4" },
      { id:uid(), date:d, created:Date.now(), materialId:m1, matName:"PLA 火山橙", matType:"PLA", matColor:"#e8590c", pricePerKg:52, printerId:printers[1].id, priName:"Ender-3 V3", powerW:180, elecPrice:0.49, grams:86, hours:9.2, cFil:4.47, cElec:0.81, cMach:3.28, cLab:16.25, total:24.81, consumed:86, handlingMin:15, note:"花瓶 大号" }
    ];
    orders = [
      { id:uid(), orderNo:"ORD-" + d.replace(/-/g,"") + "-001", date:d, status:"printing",
        wechat:"wxid_zhang88", custName:"张老板", quote:128, received:60,
        materialId:m0, matName:"PLA 曜石黑", matColor:"#1a1a1a", printerId:printers[0].id, priName:"P1S",
        grams:38.2, hours:3.5, handlingMin:15, printCost:20.98,
        extras:[{ label:"建模", amount:20 },{ label:"运费", amount:8 }], extraCost:28, totalCost:48.98,
        payments:[{ date:d, amount:60, note:"定金" }], received:60, profit:11.02,
        modelFile:{ name:"齿轮组_v2.stl", size:"8.4 MB", note:"PETG 更好" }, note:"", updated:Date.now(), created:Date.now() },
      { id:uid(), orderNo:"ORD-" + d.replace(/-/g,"") + "-002", date:d, status:"done",
        wechat:"wxid_mei_01", custName:"小美", quote:129, received:129,
        materialId:m1, matName:"PLA 火山橙", matColor:"#e8590c", printerId:printers[1].id, priName:"Ender-3 V3",
        grams:86, hours:9.2, handlingMin:15, printCost:24.81,
        extras:[{ label:"包装", amount:3 }], extraCost:3, totalCost:27.81,
        payments:[{ date:d, amount:129, note:"全款" }], received:129, profit:101.19,
        modelFile:{ name:"花瓶_vase.stl", size:"3.1 MB", note:"" }, note:"回头客", updated:Date.now(), created:Date.now() }
    ];
    records.forEach(r => { const m = materials.find(x => x.id === r.materialId); if(m) m.remaining = Math.max(0, m.remaining - r.grams); });
    pushAll();
  }

  init();

  return {
    STATUSES, stOf, ACHS,
    get materials(){ return materials; }, get printers(){ return printers; },
    get records(){ return records; }, get orders(){ return orders; },
    get settings(){ return settings; }, get achKeys(){ return achKeys; },
    get mode(){ return mode; },
    get auth(){ return auth; },
    ready, onSync,
    login, logout, createAdmin,
    setSettings(p){ Object.assign(settings, p); push("settings"); },
    setAchKeys(s){ achKeys = s; push("achievements"); },
    saveMat(){ push("materials"); }, savePri(){ push("printers"); },
    saveRec(){ push("records"); }, saveOrd(){ push("orders"); },
    num, esc, fmt, today, uid, money,
    apiUsers, apiRegister, apiDeleteUser, apiUpdateUser,
    computePrint, machineRate, laborCost, sumPayments, orderDue, matById, priById, orderStats, monthly, byCustomer,
    matLabel, priLabel,
    buildAchStats, exportPayload, importPayload, wipeAll, loadDemo,
    /* 预设 API */
    presets, flatMatTypes, findSub, findCategory,
    addMatBrand, addMatColor, addPriBrand,
    addCategory, renameCategory, setCategoryNote, removeCategory, moveCategory,
    addSub, updateSub, removeSub, moveSub,
    removeFromList, updateInList, moveInList, resetPresets
  };
})();
