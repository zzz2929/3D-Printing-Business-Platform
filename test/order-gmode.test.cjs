/* 开单页编辑回归测试：开单页对计算器全部数据的可编辑能力，编辑方式与计算逻辑与计算器页完全一致
   运行：node test/order-gmode.test.cjs
   覆盖：
   - 去开订单：per/total 口径原始带入（克数按口径直填：per=单件 / total=整批，不再折算丢失 total 语义）
   - 保存订单：grams=主耗材总量、gPer=每件合计、mats=总量明细、gMode/batchQty/singleHours 落库
   - 开单页内部编辑：口径切换、数量变化不改写克数输入框、单个克重只读派生、单/总时长双向联动
   - 订单编辑回填：按 gMode 折算（total 直填 / per 折算 / 旧数据默认 per）
   - 从记录开单：按记录 gMode 带入 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
let storeJs = fs.readFileSync(path.join(ROOT, "assets", "store.js"), "utf8");
let appJs = fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");
const endMarker = "\n})();";
const idx = appJs.lastIndexOf(endMarker);
if(idx <= 0) throw new Error("app.js IIFE 结束标记未找到");
appJs = appJs.slice(0, idx) + `
  window.__T = {
    goto, calc, fillSelects, renderMatRows, renderRecords, renderRecList,
    setGMode, gModeNow, editingRecId: () => editingRecId, $, S,
    resetOrdForm
  };
` + appJs.slice(idx);

const M1 = { id:"m1", name:"Bambu Lab 拓竹 PLA Basic 曜石黑", brand:"Bambu Lab 拓竹", type:"PLA", colorName:"曜石黑", color:"#1a1a1a", pricePerKg:45, spool:1000, remaining:620 };
const M2 = { id:"m2", name:"Polymaker PLA 丝绸 火山橙", brand:"Polymaker", type:"PLA", colorName:"火山橙", color:"#e8590c", pricePerKg:52, spool:1000, remaining:150 };
const PRI = { id:"p1", name:"Bambu Lab 拓竹 P1S", brand:"拓竹 Bambu Lab", model:"P1S", powerW:120, elecPrice:0.49, price:5000, depYears:2, maintPerYear:1000, utilization:50 };

async function freshEnv(seedRecords, seedOrders){
  const dom = new JSDOM(html, { runScripts:"outside-only", pretendToBeVisual:true, url:"http://localhost/" });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error("offline"));
  w.scrollTo = () => {};
  if(!w.Element.prototype.scrollIntoView) w.Element.prototype.scrollIntoView = () => {};
  if(!w.matchMedia) w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } });
  w.alert = m => { throw new Error("alert: " + m); };
  w.confirm = () => true;
  w.localStorage.setItem("pp3d_materials", JSON.stringify([M1, M2]));
  w.localStorage.setItem("pp3d_printers", JSON.stringify([PRI]));
  w.localStorage.setItem("pp3d_records", JSON.stringify(seedRecords || []));
  w.localStorage.setItem("pp3d_orders", JSON.stringify(seedOrders || []));
  w.localStorage.setItem("pp3d_ach", "[]");
  w.eval(storeJs + "\n;\n" + appJs + "\n;window.Store = Store;");
  const mode = await w.Store.ready;
  if(mode !== "local") throw new Error("应进入本地模式，实际 " + mode);
  const T = w.__T;
  const set = (id, v) => {
    const el = w.document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new w.Event("input", { bubbles:true }));
  };
  const setSel = (id, v) => {
    const el = w.document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new w.Event("change", { bubbles:true }));
  };
  const click = id => w.document.getElementById(id).click();
  /* 设置计算器时长（小时 select 手动造选项保证值可用） */
  const setCalcHours = (h, mm) => {
    const hs = w.document.getElementById("rHoursH");
    const ms = w.document.getElementById("rHoursM");
    hs.innerHTML = '<option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option>';
    ms.innerHTML = '<option value="0">0</option><option value="15">15</option><option value="30">30</option><option value="45">45</option>';
    hs.value = String(h); ms.value = String(mm);
    hs.dispatchEvent(new w.Event("input", { bubbles:true }));
    ms.dispatchEvent(new w.Event("input", { bubbles:true }));
  };
  /* 填写订单收款行：件数（金额自动 = 件数 × 单价） */
  const setPayCount = v => {
    const pc = w.document.querySelector("#oPayments .pay-count");
    pc.value = String(v);
    pc.dispatchEvent(new w.Event("input", { bubbles:true }));
  };
  return { w, T, set, setSel, click, dom, date: w.Store.today(), setCalcHours, setPayCount };
}

let pass = 0, fail = 0;
function ck(name, cond, extra){
  if(cond){ pass++; console.log("  ✓ " + name); }
  else{ fail++; console.log("  ✗ " + name + (extra != null ? "  ← " + extra : "")); }
}
const num = v => Number(String(v));

/* ============ 用例8：去开订单 per 口径原始带入 + 保存订单 ============ */
(async () => {
  console.log("\n[8] 去开订单：per 口径（计算器 主5+附3、qty=3、单时长2h）→ 开单页原始口径 + 保存字段");
  const { w, T, set, setSel, click, setCalcHours, setPayCount } = await freshEnv();
  T.goto("calc");
  setSel("selMat", "m1"); set("rGrams", "5");
  T.renderMatRows([{ matId:"m2", each:"3" }]);
  set("rQty", "3"); set("rItemName", "齿轮支架");
  setCalcHours(2, 0);
  T.calc();
  click("toOrderBtn");
  ck("口径 tab=per", w.document.querySelector("#oModeTabs button.on").dataset.mode === "per");
  ck("oQty=3", w.document.getElementById("oQty").value === "3");
  ck("主耗材按单件直填 5", w.document.getElementById("oG").value === "5", "got " + w.document.getElementById("oG").value);
  ck("附加按单件直填 3", w.document.querySelector("#ordExtraRows .om-each").value === "3", "got " + w.document.querySelector("#ordExtraRows .om-each").value);
  ck("单个克重只读派生 8", num(w.document.getElementById("oGPer").value) === 8, "got " + w.document.getElementById("oGPer").value);
  ck("oGPer 为只读框", w.document.getElementById("oGPer").readOnly === true);
  ck("oGTotal=24", num(w.document.getElementById("oGTotal").value) === 24, "got " + w.document.getElementById("oGTotal").value);
  ck("单个时长带入 2", w.document.getElementById("oSh").value === "2", "got " + w.document.getElementById("oSh").value);
  ck("总时长带入 6", num(w.document.getElementById("oH").value) === 6, "got " + w.document.getElementById("oH").value);
  ck("物品名称带入", w.document.getElementById("oItem").value === "齿轮支架");
  /* 保存订单 */
  set("oQuote", "8"); setPayCount(3);
  click("saveOrd");
  const ord = w.Store.orders[0];
  ck("订单已保存", !!ord, "无订单");
  ck("grams=主耗材总量 15", num(ord.grams) === 15, "got " + ord && ord.grams);
  ck("gPer=每件合计 8", num(ord.gPer) === 8, "got " + ord && ord.gPer);
  ck("mats[0]=主耗材总量 15", num(ord.mats[0].grams) === 15);
  ck("mats[1]=附加总量 9", num(ord.mats[1].grams) === 9);
  ck("gMode=per", ord.gMode === "per", "got " + ord && ord.gMode);
  ck("batchQty=3", num(ord.batchQty) === 3);
  ck("singleHours=2", num(ord.singleHours) === 2, "got " + ord && ord.singleHours);
  ck("hours=6", num(ord.hours) === 6);
  ck("itemName 已存", ord.itemName === "齿轮支架");
})().then(() => {
  /* ============ 用例9：去开订单 total 口径原始带入 + 保存 ============ */
  return (async () => {
    console.log("\n[9] 去开订单：total 口径（计算器 主15+附9、qty=3）→ 直填整批总量，保存字段不变");
    const { w, T, set, setSel, click, setPayCount } = await freshEnv();
    T.goto("calc");
    T.setGMode("total");
    setSel("selMat", "m1"); set("rGrams", "15");
    T.renderMatRows([{ matId:"m2", each:"9" }]);
    set("rQty", "3");
    T.calc();
    click("toOrderBtn");
    ck("口径 tab=total", w.document.querySelector("#oModeTabs button.on").dataset.mode === "total");
    ck("主耗材整批直填 15", w.document.getElementById("oG").value === "15", "got " + w.document.getElementById("oG").value);
    ck("附加整批直填 9", w.document.querySelector("#ordExtraRows .om-each").value === "9", "got " + w.document.querySelector("#ordExtraRows .om-each").value);
    ck("oGTotal=24", num(w.document.getElementById("oGTotal").value) === 24);
    ck("oGPer=8", num(w.document.getElementById("oGPer").value) === 8);
    set("oQuote", "8"); setPayCount(3);
    click("saveOrd");
    const ord = w.Store.orders[0];
    ck("grams=15", num(ord.grams) === 15, "got " + (ord && ord.grams));
    ck("mats 15/9", num(ord.mats[0].grams) === 15 && num(ord.mats[1].grams) === 9, JSON.stringify(ord && ord.mats));
    ck("gMode=total", ord.gMode === "total");
    ck("gPer=8", num(ord.gPer) === 8);
  })();
}).then(() => {
  /* ============ 用例10：开单页内部编辑（total + 联动 + 保存） ============ */
  return (async () => {
    console.log("\n[10] 开单页内部：切 total、填 主20/附10、qty=4 → 派生值与保存字段正确，时长双向联动");
    const { w, T, set, setSel, click, setPayCount } = await freshEnv();
    T.goto("order");
    T.resetOrdForm(); /* 等价真实启动时 appStart→resetOrdForm 的初始状态 */
    setSel("oMat", "m1"); setSel("oPri", "p1");
    w.document.querySelector("#ordExtraRows .em-add").click(); /* 添加一行附加耗材（等价用户点按钮） */
    const row = w.document.querySelector("#ordExtraRows .om-row");
    row.querySelector(".om-mat").value = "m2";
    row.querySelector(".om-mat").dispatchEvent(new w.Event("change", { bubbles:true }));
    row.querySelector(".om-each").value = "10";
    row.querySelector(".om-each").dispatchEvent(new w.Event("input", { bubbles:true }));
    w.document.querySelector("#oModeTabs button[data-mode=total]").click(); /* 切 total 保留已填值 */
    set("oG", "20"); /* 主耗材整批总量 */
    set("oQty", "4");
    ck("oGTotal=30", num(w.document.getElementById("oGTotal").value) === 30, "got " + w.document.getElementById("oGTotal").value);
    ck("oGPer 派生 7.5", num(w.document.getElementById("oGPer").value) === 7.5, "got " + w.document.getElementById("oGPer").value);
    ck("数量变化不改写主耗材输入", w.document.getElementById("oG").value === "20", "got " + w.document.getElementById("oG").value);
    ck("数量变化不改写附加输入", w.document.querySelector("#ordExtraRows .om-each").value === "10");
    /* 时长双向联动：编辑单个 → 总 = 单 × 数量 */
    set("oSh", "2");
    ck("oSh=2 → oH=8", num(w.document.getElementById("oH").value) === 8, "got " + w.document.getElementById("oH").value);
    /* 编辑总时长 → 单个 = 总 ÷ 数量 */
    set("oH", "12");
    ck("oH=12 → oSh=3", num(w.document.getElementById("oSh").value) === 3, "got " + w.document.getElementById("oSh").value);
    /* 保存 */
    set("oQuote", "7.5"); setPayCount(4);
    click("saveOrd");
    const ord = w.Store.orders[0];
    ck("grams=20", num(ord.grams) === 20, "got " + (ord && ord.grams));
    ck("mats 20/10", num(ord.mats[0].grams) === 20 && num(ord.mats[1].grams) === 10, JSON.stringify(ord && ord.mats));
    ck("gPer=7.5", num(ord.gPer) === 7.5);
    ck("gMode=total", ord.gMode === "total");
    ck("batchQty=4", num(ord.batchQty) === 4);
    ck("singleHours=3", num(ord.singleHours) === 3, "got " + (ord && ord.singleHours));
    ck("hours=12", num(ord.hours) === 12);
  })();
}).then(() => {
  /* ============ 用例11：开单页内部 per 编辑 + 保存 ============ */
  return (async () => {
    console.log("\n[11] 开单页内部：per 口径 主5/附3、qty=3 → 派生 24/8，保存 15/9/per");
    const { w, T, set, setSel, click, setPayCount } = await freshEnv();
    T.goto("order");
    T.resetOrdForm(); /* 等价真实启动时 appStart→resetOrdForm 的初始状态 */
    setSel("oMat", "m1"); setSel("oPri", "p1");
    set("oG", "5");
    w.document.querySelector("#ordExtraRows .em-add").click(); /* 添加一行附加耗材 */
    const row = w.document.querySelector("#ordExtraRows .om-row");
    row.querySelector(".om-mat").value = "m2";
    row.querySelector(".om-mat").dispatchEvent(new w.Event("change", { bubbles:true }));
    row.querySelector(".om-each").value = "3";
    row.querySelector(".om-each").dispatchEvent(new w.Event("input", { bubbles:true }));
    set("oQty", "3");
    ck("oGTotal=24", num(w.document.getElementById("oGTotal").value) === 24, "got " + w.document.getElementById("oGTotal").value);
    ck("oGPer=8", num(w.document.getElementById("oGPer").value) === 8);
    ck("克数输入保持单件（数量 1→3 不改写）", w.document.getElementById("oG").value === "5" && w.document.querySelector("#ordExtraRows .om-each").value === "3");
    set("oQuote", "8"); setPayCount(3);
    click("saveOrd");
    const ord = w.Store.orders[0];
    ck("grams=15", num(ord.grams) === 15, "got " + (ord && ord.grams));
    ck("mats 15/9", num(ord.mats[0].grams) === 15 && num(ord.mats[1].grams) === 9);
    ck("gPer=8", num(ord.gPer) === 8);
    ck("gMode=per", ord.gMode === "per");
  })();
}).then(() => {
  /* ============ 用例12：订单编辑回填（total/per/旧数据） ============ */
  return (async () => {
    console.log("\n[12] 订单编辑回填：topl 直填整批 / per 折算单件 / 旧数据默认按单个");
    const mk = (o) => Object.assign({
      id:"oX", orderNo:"TEST-1", date:"2026-10-01", created:1, status:"quote", itemName:"回填订单", wechat:"", custName:"",
      batchQty:3, qty:3, priceEach:8, quote:24, materialId:"m1", matName:M1.name, matColor:M1.color,
      printerId:"p1", priName:"P1S", grams:15, gPer:8,
      mats:[ { materialId:"m1", matName:M1.name, grams:15, pricePerKg:45 }, { materialId:"m2", matName:M2.name, grams:9, pricePerKg:52 } ],
      hours:6, singleHours:2, handlingMin:15, printCost:0, inclFil:true, inclElec:true, inclMach:true, inclLab:true,
      extras:[], extraCost:0, totalCost:1, cFil:0, cElec:0, cMach:0, cLab:0, received:0, payments:[], profit:0,
      modelFile:{}, note:"", updated:1
    }, o);
    /* 12a：total 订单 */
    const envA = await freshEnv([], [mk({ id:"oA", gMode:"total" })]);
    envA.T.goto("olist");
    envA.w.document.querySelector('[data-edito="oA"]').click();
    ck("12a tab=total", envA.w.document.querySelector("#oModeTabs button.on").dataset.mode === "total", "12a");
    ck("12a 主耗材整批直填 15", envA.w.document.getElementById("oG").value === "15", "got " + envA.w.document.getElementById("oG").value);
    ck("12a 附加整批直填 9", envA.w.document.querySelector("#ordExtraRows .om-each").value === "9", "got " + envA.w.document.querySelector("#ordExtraRows .om-each").value);
    ck("12a oSh=2 / oH=6", envA.w.document.getElementById("oSh").value === "2" && num(envA.w.document.getElementById("oH").value) === 6);
    ck("12a oGPer 派生 8", num(envA.w.document.getElementById("oGPer").value) === 8);
    /* 12b：per 订单 */
    const envB = await freshEnv([], [mk({ id:"oB", gMode:"per" })]);
    envB.T.goto("olist");
    envB.w.document.querySelector('[data-edito="oB"]').click();
    ck("12b tab=per", envB.w.document.querySelector("#oModeTabs button.on").dataset.mode === "per", "12b");
    ck("12b 主耗材折算单件 5", envB.w.document.getElementById("oG").value === "5", "got " + envB.w.document.getElementById("oG").value);
    ck("12b 附加折算单件 3", envB.w.document.querySelector("#ordExtraRows .om-each").value === "3", "got " + envB.w.document.querySelector("#ordExtraRows .om-each").value);
    /* 12c：旧订单（无 gMode、无 mats、无 singleHours）→ 按单件折算、单时长由总时长反推 */
    const legacy = mk({ id:"oC" });
    delete legacy.gMode; delete legacy.mats; delete legacy.singleHours; delete legacy.batchQty; legacy.qty = 3;
    const envC = await freshEnv([], [legacy]);
    envC.T.goto("olist");
    envC.w.document.querySelector('[data-edito="oC"]').click();
    ck("12c 默认 tab=per", envC.w.document.querySelector("#oModeTabs button.on").dataset.mode === "per", "12c");
    ck("12c 主耗材折算单件 5", envC.w.document.getElementById("oG").value === "5", "got " + envC.w.document.getElementById("oG").value);
    ck("12c 单时长反推 2（总6÷3）", num(envC.w.document.getElementById("oSh").value) === 2, "got " + envC.w.document.getElementById("oSh").value);
    /* 12d：编辑保存后 gMode 保持 */
    envA.set("oQuote", "8");
    const pc = envA.w.document.querySelector("#oPayments .pay-count");
    pc.value = "3"; pc.dispatchEvent(new envA.w.Event("input", { bubbles:true }));
    envA.click("saveOrd");
    ck("12d 编辑保存后 gMode=total", envA.w.Store.orders[0].gMode === "total", "got " + envA.w.Store.orders[0].gMode);
  })();
}).then(() => {
  /* ============ 用例13：从记录开单（data-ordr）按记录 gMode 带入 ============ */
  return (async () => {
    console.log("\n[13] 从打印记录开单：per / total 记录按原口径带入可编辑");
    const rec = (id, gMode) => ({ id, date:"2026-10-01", created:1, materialId:"m1", matName:M1.name, matType:"PLA", matColor:M1.color, pricePerKg:45,
      printerId:"p1", priName:"P1S", qty:3, gMode, grams:24, gPer:8, hours:6, singleHours:2, handlingMin:15,
      cFil:1.02, cElec:0.2, cMach:1.5, cLab:0, total:12, sug:14, inclFil:true, inclElec:true, inclMach:true, inclLab:false,
      consumed:24, itemName:"记录开单", note:"", mats:[
        { materialId:"m1", matName:M1.name, grams:15, pricePerKg:45 },
        { materialId:"m2", matName:M2.name, grams:9, pricePerKg:52 } ] });
    /* 13a：per 记录 */
    const envA = await freshEnv([rec("r1", "per")], []);
    envA.T.goto("records");
    envA.w.document.querySelector('[data-ordr="r1"]').click();
    ck("13a tab=per", envA.w.document.querySelector("#oModeTabs button.on").dataset.mode === "per", "13a");
    ck("13a oG=5", envA.w.document.getElementById("oG").value === "5", "got " + envA.w.document.getElementById("oG").value);
    ck("13a 附加 each=3", envA.w.document.querySelector("#ordExtraRows .om-each").value === "3", "got " + envA.w.document.querySelector("#ordExtraRows .om-each").value);
    ck("13a oSh=2 / oH=6", envA.w.document.getElementById("oSh").value === "2" && num(envA.w.document.getElementById("oH").value) === 6);
    ck("13a oGTotal=24", num(envA.w.document.getElementById("oGTotal").value) === 24);
    /* 13b：total 记录 */
    const envB = await freshEnv([rec("r2", "total")], []);
    envB.T.goto("records");
    envB.w.document.querySelector('[data-ordr="r2"]').click();
    ck("13b tab=total", envB.w.document.querySelector("#oModeTabs button.on").dataset.mode === "total", "13b");
    ck("13b oG=15", envB.w.document.getElementById("oG").value === "15", "got " + envB.w.document.getElementById("oG").value);
    ck("13b 附加 each=9", envB.w.document.querySelector("#ordExtraRows .om-each").value === "9", "got " + envB.w.document.querySelector("#ordExtraRows .om-each").value);
    ck("13b oGTotal=24", num(envB.w.document.getElementById("oGTotal").value) === 24);
    ck("13b oGPer=8", num(envB.w.document.getElementById("oGPer").value) === 8);
  })();
}).then(() => {
  /* ============ 用例14：收款非必填（保存订单时未填收款也可保存） ============ */
  return (async () => {
    console.log("\n[14] 收款非必填：不填收款件数 → 保存成功，qty/received=0、payments 空、状态保持所选");
    const { w, T, set, setSel, click } = await freshEnv();
    T.goto("order");
    T.resetOrdForm();
    setSel("oMat", "m1"); setSel("oPri", "p1");
    set("oG", "15");
    w.document.querySelector("#oModeTabs button[data-mode=total]").click();
    set("oQuote", "8"); /* 报价仍必填（欠款跟踪依赖），收款可空 */
    click("saveOrd");
    const ords = w.Store.orders;
    ck("未填收款仍保存成功", ords.length === 1, "orders=" + ords.length);
    if(ords[0]){
      ck("qty=0", num(ords[0].qty) === 0, "got " + ords[0].qty);
      ck("received=0", num(ords[0].received) === 0);
      ck("payments 为空数组", Array.isArray(ords[0].payments) && ords[0].payments.length === 0);
      ck("quote=0（无收款件数 → 应收 0）", num(ords[0].quote) === 0, "got " + ords[0].quote);
      ck("状态保持所选 quote", ords[0].status === "quote", "got " + ords[0].status);
      ck("批次件数仍保存（成本口径独立）", num(ords[0].batchQty) === 1);
      ck("报价单价已存 8", num(ords[0].priceEach) === 8);
      ck("价格为空不触发自动转部分收款", ords[0].quote === 0 && ords[0].received === 0);
    }
    /* 编辑该订单：收款为空不报错，回填正常 */
    T.goto("olist");
    w.document.querySelector('[data-edito="' + ords[0].id + '"]').click();
    ck("空收款订单可正常打开编辑", num(w.document.getElementById("oQuote").value) === 8, "got " + w.document.getElementById("oQuote").value);
  })();
}).then(() => {
  console.log("\n========== 汇总 ==========");
  console.log("通过 " + pass + " / 失败 " + fail);
  process.exit(fail === 0 ? 0 : 1);
}).catch(e => {
  console.error("\n测试异常中断：", e && e.stack || e);
  process.exit(1);
});