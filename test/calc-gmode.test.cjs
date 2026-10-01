/* 计算器耗材口径回归测试（per=按单个 / total=按整体，作用于主耗材+附加耗材）
   运行：node test/calc-gmode.test.cjs
   覆盖：
   - per 口径：各耗材按单件用量填写，单个克重=各耗材之和，总克重=单个×数量
   - total 口径：各耗材按整批总用量填写，总克重=各耗材之和，单个克重=总克重÷数量
   - qty=1 时两口径结果一致
   - 保存记录：mats 存各耗材总克数、记录存 gMode/gPer/qty/grams/itemName
   - 打印记录页显示新保存的记录与物体名称
   - 数量变化不改写克数输入框
   - 编辑回填：按记录 gMode 折算回表单输入值 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
let storeJs = fs.readFileSync(path.join(ROOT, "assets", "store.js"), "utf8");
let appJs = fs.readFileSync(path.join(ROOT, "assets", "app.js"), "utf8");

/* store.js 顶层 "use strict" 使顶层声明不挂到全局对象；store 与 app 必须在同一次 eval
   调用中执行（共享同一词法作用域，等价于浏览器多 <script> 的全局词法环境） */
storeJs = fs.readFileSync(path.join(ROOT, "assets", "store.js"), "utf8");
/* 在 app.js IIFE 尾部注入测试句柄（引用 IIFE 内标识符） */
const endMarker = "\n})();";
const idx = appJs.lastIndexOf(endMarker);
if(idx <= 0) throw new Error("app.js IIFE 结束标记未找到");
appJs = appJs.slice(0, idx) + `
  window.__T = {
    goto, calc, fillSelects, renderMatRows, renderRecords, renderRecList,
    setGMode, gModeNow, editingRecId: () => editingRecId, $, S
  };
` + appJs.slice(idx);

const M1 = { id:"m1", name:"Bambu Lab 拓竹 PLA Basic 曜石黑", brand:"Bambu Lab 拓竹", type:"PLA", colorName:"曜石黑", color:"#1a1a1a", pricePerKg:45, spool:1000, remaining:620 };
const M2 = { id:"m2", name:"Polymaker PLA 丝绸 火山橙", brand:"Polymaker", type:"PLA", colorName:"火山橙", color:"#e8590c", pricePerKg:52, spool:1000, remaining:150 };
const PRI = { id:"p1", name:"Bambu Lab 拓竹 P1S", brand:"拓竹 Bambu Lab", model:"P1S", powerW:120, elecPrice:0.49, price:5000, depYears:2, maintPerYear:1000, utilization:50 };

async function freshEnv(seedRecords){
  const dom = new JSDOM(html, { runScripts:"outside-only", pretendToBeVisual:true, url:"http://localhost/" });
  const w = dom.window;
  w.fetch = () => Promise.reject(new Error("offline"));   // 迫使 store 走本地模式
  w.scrollTo = () => {};
  if(!w.matchMedia) w.matchMedia = q => ({ matches:false, media:q, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } });
  w.alert = m => { throw new Error("alert: " + m); };
  w.confirm = () => true;
  w.localStorage.setItem("pp3d_materials", JSON.stringify([M1, M2]));
  w.localStorage.setItem("pp3d_printers", JSON.stringify([PRI]));
  w.localStorage.setItem("pp3d_records", JSON.stringify(seedRecords || []));
  w.localStorage.setItem("pp3d_orders", "[]");
  w.localStorage.setItem("pp3d_ach", "[]");
  w.eval(storeJs + "\n;\n" + appJs + "\n;window.Store = Store;"); // 同一 eval：词法共享；末尾把 Store 挂到 window 供测试读取
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
  return { w, T, set, setSel, click, dom, date: w.Store.today() };
}

let pass = 0, fail = 0;
function ck(name, cond, extra){
  if(cond){ pass++; console.log("  ✓ " + name); }
  else{ fail++; console.log("  ✗ " + name + (extra != null ? "  ← " + extra : "")); }
}
const num = v => Number(String(v));

/* ============ 用例1：per + qty=1（主5 + 附3）============ */
(async () => {
  console.log("\n[1] per / qty=1：单个克重与总克重均为各耗材之和");
  const { w, T, set, setSel, click } = await freshEnv();
  T.goto("calc");
  setSel("selMat", "m1"); set("rGrams", "5");
  T.renderMatRows([{ matId:"m2", each:"3" }]);
  set("rItemName", "齿轮支架");
  T.calc();
  ck("rGTotal=8", num(w.document.getElementById("rGTotal").value) === 8, "got " + w.document.getElementById("rGTotal").value);
  ck("rGPer=8", num(w.document.getElementById("rGPer").value) === 8, "got " + w.document.getElementById("rGPer").value);
  click("saveBtn");
  const r = w.Store.records[0];
  ck("gram字段 5", num(r.mats[0].grams) === 5, JSON.stringify(r.mats));
  ck("附加耗材字段 3", num(r.mats[1].grams) === 3);
  ck("记录总克数 8", num(r.grams) === 8, "got " + r.grams);
  ck("gPer=8", num(r.gPer) === 8);
  ck("gMode=per", r.gMode === "per", "got " + r.gMode);
  ck("qty=1", num(r.qty) === 1);
  ck("itemName 已保存", r.itemName === "齿轮支架", "got " + r.itemName);
  T.goto("records");
  const lh = w.document.getElementById("recList").innerHTML;
  ck("打印记录页显示新记录", lh.includes(r.matName), "列表无记录");
  ck("记录页显示物体名称", lh.includes("齿轮支架"), "无物体名称");
})().then(() => {
  /* ============ 用例2：per + qty=3 ============ */
  return (async () => {
    console.log("\n[2] per / qty=3：单个克重=各耗材之和，总克重=单个×数量");
    const { w, T, set, setSel, click } = await freshEnv();
    T.goto("calc");
    setSel("selMat", "m1"); set("rGrams", "5");
    T.renderMatRows([{ matId:"m2", each:"3" }]);
    set("rQty", "3"); set("rItemName", "手机壳");
    T.calc();
    ck("rGTotal=24", num(w.document.getElementById("rGTotal").value) === 24, "got " + w.document.getElementById("rGTotal").value);
    ck("rGPer=8", num(w.document.getElementById("rGPer").value) === 8, "got " + w.document.getElementById("rGPer").value);
    /* 数量变化不改写克数输入框 */
    ck("主耗材输入保持单件 5", w.document.getElementById("rGrams").value === "5");
    ck("附加输入保持单件 3", w.document.querySelector("#extraMats .em-row:not(.mat-main) .em-g").value === "3");
    click("saveBtn");
    const r = w.Store.records[0];
    ck("主耗材总量 15", num(r.mats[0].grams) === 15, "got " + r.mats[0].grams);
    ck("附加总量 9", num(r.mats[1].grams) === 9);
    ck("记录总克数 24", num(r.grams) === 24);
    ck("gPer=8", num(r.gPer) === 8);
    ck("itemName=手机壳", r.itemName === "手机壳");
  })();
}).then(() => {
  /* ============ 用例3：total + qty=1 ============ */
  return (async () => {
    console.log("\n[3] total / qty=1：总克重与单个克重仍为各耗材之和");
    const { w, T, set, setSel, click } = await freshEnv();
    T.goto("calc");
    T.setGMode("total");
    setSel("selMat", "m1"); set("rGrams", "5");
    T.renderMatRows([{ matId:"m2", each:"3" }]);
    T.calc();
    ck("rGTotal=8", num(w.document.getElementById("rGTotal").value) === 8);
    ck("rGPer=8", num(w.document.getElementById("rGPer").value) === 8);
    ck("total 提示文案", w.document.getElementById("gModeHint").textContent.includes("整批总用量"));
    click("saveBtn");
    const r = w.Store.records[0];
    ck("gMode=total", r.gMode === "total", "got " + r.gMode);
    ck("主耗材总量 5", num(r.mats[0].grams) === 5);
    ck("附加总量 3", num(r.mats[1].grams) === 3);
    ck("记录总克数 8", num(r.grams) === 8);
  })();
}).then(() => {
  /* ============ 用例4：total + qty=3 ============ */
  return (async () => {
    console.log("\n[4] total / qty=3：单个克重=总克重÷数量");
    const { w, T, set, setSel, click } = await freshEnv();
    T.goto("calc");
    T.setGMode("total");
    setSel("selMat", "m1"); set("rGrams", "15");
    T.renderMatRows([{ matId:"m2", each:"9" }]);
    set("rQty", "3");
    T.calc();
    ck("rGTotal=24", num(w.document.getElementById("rGTotal").value) === 24);
    ck("rGPer=8", num(w.document.getElementById("rGPer").value) === 8);
    click("saveBtn");
    const r = w.Store.records[0];
    ck("主耗材总量 15", num(r.mats[0].grams) === 15);
    ck("附加总量 9", num(r.mats[1].grams) === 9);
    ck("记录总克数 24", num(r.grams) === 24);
    ck("gPer=8", num(r.gPer) === 8);
    ck("gMode=total", r.gMode === "total");
  })();
}).then(() => {
  /* ============ 用例5：编辑回填（total 记录）============ */
  return (async () => {
    console.log("\n[5] 编辑回填 total 记录（mats 15/9、qty=3）→ 表单直填整批总量");
    const seed = [{ id:"rA", date:"2026-10-01", created:1, materialId:"m1", matName:M1.name, matType:"PLA", matColor:M1.color, pricePerKg:45,
      printerId:"p1", priName:"P1S", qty:3, gMode:"total", grams:24, gPer:8, hours:6, singleHours:2, handlingMin:15,
      cFil:1.02, cElec:0.2, cMach:1.5, cLab:0, total:12, sug:14, inclFil:true, inclElec:true, inclMach:true, inclLab:false,
      consumed:24, itemName:"回填件", note:"", mats:[
        { materialId:"m1", matName:M1.name, grams:15, pricePerKg:45 },
        { materialId:"m2", matName:M2.name, grams:9, pricePerKg:52 } ] }];
    const { w, T } = await freshEnv(seed);
    T.goto("records");
    w.document.querySelector("[data-edtr]").click(); // 触发编辑回填（内部 goto calc）
    ck("total tab 高亮", w.document.querySelector("#gModeTabs button.on").dataset.mode === "total");
    ck("主耗材直填整批总量 15", w.document.getElementById("rGrams").value === "15", "got " + w.document.getElementById("rGrams").value);
    ck("附加直填整批总量 9", w.document.querySelector("#extraMats .em-row:not(.mat-main) .em-g").value === "9", "got " + w.document.querySelector("#extraMats .em-row:not(.mat-main) .em-g").value);
    ck("qty=3", w.document.getElementById("rQty").value === "3");
    ck("rGPer=8", num(w.document.getElementById("rGPer").value) === 8);
    /* 直接保存应保持 total 口径并覆盖原记录 */
    w.document.getElementById("saveBtn").click();
    ck("编辑后仍 total", w.Store.records[0].gMode === "total");
    ck("编辑后 mats 不变 15/9", num(w.Store.records[0].mats[0].grams) === 15 && num(w.Store.records[0].mats[1].grams) === 9);
  })();
}).then(() => {
  /* ============ 用例6：编辑回填（per 记录）============ */
  return (async () => {
    console.log("\n[6] 编辑回填 per 记录（mats 15/9、qty=3）→ 表单折算为单件 5/3");
    const seed = [{ id:"rB", date:"2026-10-01", created:2, materialId:"m1", matName:M1.name, matType:"PLA", matColor:M1.color, pricePerKg:45,
      printerId:"p1", priName:"P1S", qty:3, gMode:"per", grams:24, gPer:8, hours:6, singleHours:2, handlingMin:15,
      cFil:1.02, cElec:0.2, cMach:1.5, cLab:0, total:12, sug:14, inclFil:true, inclElec:true, inclMach:true, inclLab:false,
      consumed:24, itemName:"回填单件", note:"", mats:[
        { materialId:"m1", matName:M1.name, grams:15, pricePerKg:45 },
        { materialId:"m2", matName:M2.name, grams:9, pricePerKg:52 } ] }];
    const { w, T } = await freshEnv(seed);
    T.goto("records");
    w.document.querySelector("[data-edtr]").click();
    ck("per tab 高亮", w.document.querySelector("#gModeTabs button.on").dataset.mode === "per");
    ck("主耗材折算单件 5", w.document.getElementById("rGrams").value === "5", "got " + w.document.getElementById("rGrams").value);
    ck("附加折算单件 3", w.document.querySelector("#extraMats .em-row:not(.mat-main) .em-g").value === "3", "got " + w.document.querySelector("#extraMats .em-row:not(.mat-main) .em-g").value);
    ck("qty=3", w.document.getElementById("rQty").value === "3");
    ck("rGPer=8", num(w.document.getElementById("rGPer").value) === 8);
  })();
}).then(() => {
  /* ============ 用例7：旧数据（无 gMode）编辑回填按 per 处理 ============ */
  return (async () => {
    console.log("\n[7] 旧数据（无 gMode 字段）编辑回填默认按单个口径");
    const seed = [{ id:"rC", date:"2026-09-20", created:3, materialId:"m1", matName:M1.name, matType:"PLA", matColor:M1.color, pricePerKg:45,
      printerId:"p1", priName:"P1S", qty:2, grams:16, gPer:8, hours:4, handlingMin:15,
      cFil:1.02, cElec:0.2, cMach:1.5, cLab:0, total:12, sug:14, inclFil:true, inclElec:true, inclMach:true, inclLab:false,
      consumed:16, itemName:"旧记录", note:"" }]; // 无 mats → recMats 派生
    const { w, T } = await freshEnv(seed);
    T.goto("records");
    w.document.querySelector("[data-edtr]").click();
    ck("默认 per tab", w.document.querySelector("#gModeTabs button.on").dataset.mode === "per");
    ck("主耗材折算 8", w.document.getElementById("rGrams").value === "8", "got " + w.document.getElementById("rGrams").value);
    ck("qty=2", w.document.getElementById("rQty").value === "2");
  })();
}).then(() => {
  console.log("\n========== 汇总 ==========");
  console.log("通过 " + pass + " / 失败 " + fail);
  process.exit(fail === 0 ? 0 : 1);
}).catch(e => {
  console.error("\n测试异常中断：", e && e.stack || e);
  process.exit(1);
});