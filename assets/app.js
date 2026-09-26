/* 3D打印业务平台 · 界面与交互 */
"use strict";

(function(){
  const S = Store;
  const $ = id => document.getElementById(id);
  const FACES = ["(≧▽≦)","(´▽`ʃ♡ƪ)","(｡•̀ᴗ-)✧","ヾ(•ω•`)o","✧(≖ ‿ ≖)✧","(๑•̀ㅂ•́)و✧"];
  const randFace = () => FACES[Math.floor(Math.random() * FACES.length)];

  /* ---------- 动画：GSAP（CDN 不可达或系统开启「减少动态效果」时自动降级为无动画） ---------- */
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function fx(fn){ if(!window.gsap || reduceMotion) return; try{ fn(window.gsap); }catch(e){} }

  /* 总成本勾选面板的齿轮按钮（打印记录总成本 / 仪表盘营收·利润 共用） */
  const CPBTN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  const CPBTN = '<button class="cpbtn" data-costpick title="勾选计入哪些成本" aria-label="勾选计入哪些成本" aria-haspopup="true">' + CPBTN_ICON + '</button>';

  const PAGE_TITLES = { dash:"仪表盘", calc:"成本计算器", order:"开单", olist:"订单列表", mats:"耗材库房", printers:"打印机", records:"打印记录", settings:"设置" };
  const RENDERERS = {};

  /* ---------- 页面权限 ----------
     管理员不受限；普通用户按 perms 勾选（null / 缺失 = 全部允许）。
     perms 由管理员在「用户管理 → 编辑」里勾选，存于服务端用户记录。 */
  const PAGE_PERM = { dash:"page_dash", calc:"page_calc", order:"page_order", olist:"page_olist", mats:"page_mats", printers:"page_printers", records:"page_records", settings:"page_settings" };
  const PERM_DEFS = [
    { group:"页面", items:[
      ["page_dash","仪表盘"],["page_calc","成本计算器"],["page_order","开单"],["page_olist","订单列表"],
      ["page_mats","耗材库房"],["page_printers","打印机"],["page_records","打印记录"],["page_settings","设置"]
    ]},
    { group:"耗材页", items:[["mats_manage","耗材管理（表单）"],["mats_list","我的耗材（列表）"]]},
    { group:"打印机页", items:[["pri_add","添加打印机（表单）"],["pri_list","我的打印机（列表）"]]},
    { group:"设置页", items:[["set_general","常规"],["set_presets","预设管理"],["set_update","版本与更新"],["set_account","数据与账号"]]}
  ];
  function can(perm){
    if(!perm) return true;
    if(S.auth.role === "admin") return true;
    const p = S.auth.perms;
    return p ? p[perm] !== false : true;
  }
  function applyPerms(){
    document.querySelectorAll("#nav button[data-tab]").forEach(b => {
      b.style.display = can(PAGE_PERM[b.getAttribute("data-tab")]) ? "" : "none";
    });
    [["matFormCard","mats_manage"],["matListCard","mats_list"],["priFormCard","pri_add"],["priListCard","pri_list"]]
      .forEach(([id, perm]) => { const el = $(id); if(el) el.hidden = !can(perm); });
    renderSetTabs();
  }

  /* 打印机品牌下拉已改为 attachCombo 风格的 input（在下方初始化），无需额外清空 */

  /* 常用颜色快选 */
  const PRESET_COLORS = [
    ["曜石黑","#1a1a1a"],["象牙白","#f5f2ea"],["太空灰","#9aa3ad"],["中国红","#d03a2b"],
    ["火山橙","#e8590c"],["柠檬黄","#f5b301"],["松涛绿","#2f9e44"],["克莱因蓝","#1971c2"],
    ["罗兰紫","#7048e8"],["樱花粉","#f783ac"],["咖啡棕","#8d6e4a"],["香槟金","#c9a86a"]
  ];
  $("colorPresets").innerHTML = PRESET_COLORS.map(([n,c],i) =>
    `<button type="button" class="sw-p" data-c="${c}" data-n="${n}" title="${n}" style="background:${c}"></button>`).join("");
  $("colorPresets").addEventListener("click", e => {
    const b = e.target.closest(".sw-p"); if(!b) return;
    $("mColor").value = b.getAttribute("data-c");
    $("mColorName").value = b.getAttribute("data-n");
    document.querySelectorAll(".sw-p").forEach(x => x.classList.toggle("on", x === b));
  });

  /* ---------- 通用 ---------- */
  let toastT;
  function toast(msg){
    const t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2200);
  }
  /* 应用内确认 / 输入弹窗（替代 window.confirm / prompt） */
  let dlgResolve = null;
  function showDialog(msg, opts){
    opts = opts || {};
    return new Promise(res => {
      dlgResolve = res;
      $("dlgMsg").textContent = msg;
      $("dlgInput").hidden = !opts.input;
      if(opts.input) $("dlgInput").value = opts.def || "";
      $("dlgOk").textContent = opts.okText || "确定";
      const dlg = $("dlg");
      dlg.hidden = false;
      dlg.style.opacity = ""; dlg.style.visibility = ""; // 清除 gsap 可能残留的 autoAlpha:0
      fx(g => {
        g.from(dlg, { autoAlpha:0, duration:0.18, ease:"power1.out", clearProps:"opacity,visibility" });
        g.from("#dlg .ob-card", { y:18, scale:0.96, autoAlpha:0, duration:0.3, ease:"power3.out", clearProps:"all" });
      });
      (opts.input ? $("dlgInput") : $("dlgOk")).focus();
    });
  }
  function closeDialog(v){
    if($("dlg").hidden) return;
    $("dlg").hidden = true;
    const r = dlgResolve; dlgResolve = null;
    if(r) r(v);
  }
  function confirmBox(msg){ return showDialog(msg); }
  function promptBox(msg, def){ return showDialog(msg, { input:true, def }); }
  $("dlgOk").addEventListener("click", () => closeDialog($("dlgInput").hidden ? true : $("dlgInput").value));
  $("dlgCancel").addEventListener("click", () => closeDialog($("dlgInput").hidden ? false : null));
  $("dlgInput").addEventListener("keydown", e => { if(e.key === "Enter") $("dlgOk").click(); });
  document.addEventListener("keydown", e => {
    if(e.key === "Escape" && !$("dlg").hidden) closeDialog($("dlgInput").hidden ? false : null);
  });

  /* ---------- 可输可选下拉（combo）：点箭头始终展示全部选项，输入时过滤，支持自由输入 ----------
     opts.onAdd(v)    当用户输入的内容不在列表里、且触发"保存/失焦"时调用。
                      返回 true 视为已加入预设并把值显示为已选项；返回 false 视为放弃。
     opts.onFree(v)   可选：替代 onAdd 的更通用钩子。 */
  function attachCombo(input, getOptions, opts){
    opts = opts || {};
    const wrap = document.createElement("span"); wrap.className = "combo";
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "combo-caret"; btn.title = "展开选项";
    wrap.appendChild(btn);
    const pop = document.createElement("div"); pop.className = "combo-pop"; wrap.appendChild(pop);
    let searchVal = "";
    function renderList(){
      const ql = searchVal.trim().toLowerCase();
      const all = getOptions();
      const list = all.filter(o => !ql || o.toLowerCase().includes(ql));
      const searchHtml = `<div class="combo-search-row"><input type="text" class="combo-search-input" placeholder="搜索…" value="${S.esc(searchVal)}" /></div>`;
      const addHtml = (ql && list.length === 0)
        ? `<button type="button" class="combo-item combo-add" data-add="${S.esc(searchVal.trim())}">＋ 添加为新的预设「<b>${S.esc(searchVal.trim())}</b>」</button>` : "";
      const itemsHtml = list.map(o => `<button type="button" class="combo-item${o === input.value ? " on" : ""}">${S.esc(o)}</button>`).join("");
      const emptyHtml = (!ql && list.length === 0) ? '<div class="combo-empty">暂无预设，在上方搜索栏输入名称后添加</div>' : '';
      pop.innerHTML = searchHtml + addHtml + itemsHtml + emptyHtml;
      const si = pop.querySelector(".combo-search-input");
      if(si){
        si.addEventListener("input", e => {
          searchVal = e.target.value;
          const pos = e.target.selectionStart;
          renderList();
          const ni = pop.querySelector(".combo-search-input");
          if(ni){ ni.focus(); ni.setSelectionRange(pos, pos); }
        });
        si.addEventListener("keydown", e => {
          if(e.key === "Enter"){ e.preventDefault(); const ab = pop.querySelector("[data-add]"); if(ab) ab.click(); }
        });
      }
    }
    function open(){ searchVal = ""; renderList(); pop.classList.add("open"); btn.classList.add("open"); }
    function close(){ pop.classList.remove("open"); btn.classList.remove("open"); searchVal = ""; }
    btn.addEventListener("click", e => { e.stopPropagation(); pop.classList.contains("open") ? close() : open(); });
    input.addEventListener("focus", () => open());
    input.addEventListener("input", () => { searchVal = input.value; if(!pop.classList.contains("open")){ pop.classList.add("open"); btn.classList.add("open"); } renderList(); });
    pop.addEventListener("click", e => {
      const addBtn = e.target.closest("[data-add]");
      if(addBtn){
        const v = addBtn.getAttribute("data-add");
        let ok = true;
        if(typeof opts.onAdd === "function") ok = opts.onAdd(v);
        else if(typeof opts.onFree === "function") ok = opts.onFree(v);
        if(ok){
          input.value = v; close();
          input.dispatchEvent(new Event("input", { bubbles:true }));
          input.dispatchEvent(new Event("change", { bubbles:true }));
          toast("已加入预设：「" + v + "」");
        }else close();
        return;
      }
      const it = e.target.closest(".combo-item"); if(!it) return;
      input.value = it.textContent; close();
      input.dispatchEvent(new Event("input", { bubbles:true }));
      input.dispatchEvent(new Event("change", { bubbles:true }));
    });
    document.addEventListener("click", e => { if(!wrap.contains(e.target)) close(); });
  }

  /* ---------- 二级选择器（cascader）：点击触发器，弹出"左大类 / 右小类+说明"面板 ----------
     - getCategories(): [{ name, note? }]
     - getSubs(catName): [{ name, desc? }]
     - onPick(subName, catName, subObj) 选中后回调（subObj.desc 为说明）
     - 支持"输入新值"自动加入预设（仅小类级）：通过 opts.onAddSub(catName, subName) 钩子
     - opts.onAddCat(name) 提供时，左栏底部显示"＋ 添加大类"内联表单；返回 false 表示重名
  */
  function attachCascader(input, opts){
    const wrap = document.createElement("span"); wrap.className = "combo cascader";
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "combo-caret"; btn.title = "展开选项";
    wrap.appendChild(btn);
    const pop = document.createElement("div"); pop.className = "casc-pop";
    wrap.appendChild(pop);
    let activeCat = null;
    let searchVal = "";
    let addingCat = false;   // 左栏底部正在展开"添加大类"表单
    let focusAddCat = false; // 下一次 render 后聚焦大类名输入框

    function getCats(){ return opts.getCategories().slice(); }
    function getSubs(c){ return opts.getSubs(c).slice(); }
    function refreshActive(){
      const cats = getCats();
      if(!activeCat || !cats.find(c => c.name === activeCat)) activeCat = cats[0] ? cats[0].name : null;
    }
    function addCatHtml(){
      if(typeof opts.onAddCat !== "function") return "";
      return addingCat
        ? '<div class="casc-addcat-form">' +
            '<input type="text" class="casc-pop-input casc-addcat-input" placeholder="大类名称" />' +
            '<div class="casc-addcat-btns">' +
              '<button type="button" class="casc-pop-confirm" data-addcat-ok="1">确定</button>' +
              '<button type="button" class="casc-pop-cancel" data-addcat-cancel="1">取消</button>' +
            '</div>' +
          '</div>'
        : '<button type="button" class="casc-addcat" data-addcat="1">＋ 添加大类</button>';
    }
    function bindAddCatInput(){
      const ai = pop.querySelector(".casc-addcat-input");
      if(!ai) return;
      ai.addEventListener("keydown", e => {
        e.stopPropagation();
        if(e.key === "Enter"){ e.preventDefault(); confirmAddCat(); }
        else if(e.key === "Escape"){ e.preventDefault(); addingCat = false; render(); }
      });
      if(focusAddCat){ focusAddCat = false; ai.focus(); }
    }
    function confirmAddCat(){
      const ai = pop.querySelector(".casc-addcat-input");
      const v = (ai ? ai.value : "").trim();
      if(!v){ toast("请先输入大类名称"); if(ai) ai.focus(); return; }
      if(!opts.onAddCat(v)){ toast("该大类已存在"); if(ai){ ai.focus(); ai.select(); } return; }
      addingCat = false;
      activeCat = v; searchVal = ""; // 新大类置为选中，方便紧接着补小类
      render();
      toast("已新增大类：「" + v + "」");
    }
    function render(){
      const cats = getCats();
      if(!cats.length){
        const canAdd = typeof opts.onAddCat === "function";
        pop.innerHTML = '<div class="combo-empty">' + (canAdd ? "还没有任何大类" : "还没有任何大类，去「设置 → 预设管理」添加") + '</div>' +
          (canAdd ? '<div class="casc-empty-add">' + addCatHtml() + '</div>' : "");
        bindAddCatInput();
        return;
      }
      refreshActive();
      const cur = cats.find(c => c.name === activeCat);
      const allSubs = cur ? getSubs(cur.name) : [];
      const ql = searchVal.trim().toLowerCase();
      const subs = allSubs.filter(s => !ql || s.name.toLowerCase().includes(ql) || (s.desc && s.desc.toLowerCase().includes(ql)));
      const searchHtml = `<div class="casc-search-row"><input type="text" class="casc-search-input" placeholder="搜索小类…" value="${S.esc(searchVal)}" /></div>`;
      const addHtml = (ql && subs.length === 0)
        ? `<button type="button" class="casc-sub casc-add" data-addsub="${S.esc(searchVal.trim())}"><div class="casc-sub-n">＋ 添加为新的预设「<b>${S.esc(searchVal.trim())}</b>」</div><div class="casc-sub-d">添加到「${S.esc(cur.name)}」下</div></button>` : "";
      const subsHtml = subs.map(s => `<button type="button" class="casc-sub" data-sub="${S.esc(s.name)}" data-cat="${S.esc(cur.name)}"><div class="casc-sub-n">${S.esc(s.name)}</div>${s.desc ? `<div class="casc-sub-d">${S.esc(s.desc)}</div>` : ""}</button>`).join("");
      const emptyHtml = (!ql && subs.length === 0) ? '<div class="combo-empty">该大类下还没有小类，在上方搜索栏输入名称后添加</div>' : '';
      pop.innerHTML =
        '<div class="casc-grid">' +
          '<div class="casc-left">' +
            cats.map(c => `<button type="button" class="casc-cat${c.name === activeCat ? " on" : ""}" data-cat="${S.esc(c.name)}">${S.esc(c.name)}</button>`).join("") + addCatHtml() +
          '</div>' +
          '<div class="casc-right">' +
            searchHtml + addHtml + subsHtml + emptyHtml +
          '</div>' +
        '</div>';
      const si = pop.querySelector(".casc-search-input");
      if(si){
        si.addEventListener("input", e => {
          searchVal = e.target.value;
          const pos = e.target.selectionStart;
          render();
          const ni = pop.querySelector(".casc-search-input");
          if(ni){ ni.focus(); ni.setSelectionRange(pos, pos); }
        });
        si.addEventListener("keydown", e => {
          if(e.key === "Enter"){ e.preventDefault(); const ab = pop.querySelector("[data-addsub]"); if(ab) ab.click(); }
        });
      }
      bindAddCatInput();
    }
    function open(){ searchVal = input.value; render(); pop.classList.add("open"); btn.classList.add("open"); }
    function close(){ pop.classList.remove("open"); btn.classList.remove("open"); searchVal = ""; addingCat = false; focusAddCat = false; }
    btn.addEventListener("click", e => { e.stopPropagation(); pop.classList.contains("open") ? close() : open(); });
    input.addEventListener("focus", () => open());
    input.addEventListener("input", () => { searchVal = input.value; if(!pop.classList.contains("open")){ pop.classList.add("open"); btn.classList.add("open"); } render(); });
    pop.addEventListener("click", e => {
      e.stopPropagation();
      if(e.target.closest("[data-addcat]")){ addingCat = true; focusAddCat = true; render(); return; }
      if(e.target.closest("[data-addcat-ok]")){ confirmAddCat(); return; }
      if(e.target.closest("[data-addcat-cancel]")){ addingCat = false; render(); return; }
      const cat = e.target.closest("[data-cat]");
      const sub = e.target.closest("[data-sub]");
      const addSub = e.target.closest("[data-addsub]");
      if(cat && !sub && !addSub){
        activeCat = cat.getAttribute("data-cat"); searchVal = ""; render(); return;
      }
      if(sub){
        const catName = sub.getAttribute("data-cat");
        const subName = sub.getAttribute("data-sub");
        const subObj = (opts.getSubs(catName) || []).find(x => x.name === subName);
        input.value = subName; close();
        input.dispatchEvent(new Event("input", { bubbles:true }));
        input.dispatchEvent(new Event("change", { bubbles:true }));
        if(typeof opts.onPick === "function") opts.onPick(subName, catName, subObj || { name:subName });
        return;
      }
      if(addSub){
        const v = addSub.getAttribute("data-addsub");
        if(typeof opts.onAddSub === "function"){
          const ok = opts.onAddSub(activeCat, v, "");
          if(ok){ input.value = v; close();
            input.dispatchEvent(new Event("input", { bubbles:true }));
            input.dispatchEvent(new Event("change", { bubbles:true }));
            toast("已加入「" + activeCat + "」下：「" + v + "」");
          }else close();
        }
      }
    });
    pop.addEventListener("wheel", e => e.stopPropagation());
    document.addEventListener("click", e => { if(!wrap.contains(e.target)) close(); });
    wrap.refresh = () => { if(pop.classList.contains("open")) render(); };
  }

  /* ---------- 把耗材/打印机表单的字段接入预设 ---------- */
  const MAT_BRANDS  = () => S.presets().matBrands;
  const MAT_CATS    = () => S.presets().matCategories.map(c => ({ name:c.name }));
  const MAT_SUBS    = n => { const c = S.findCategory(n); return c ? c.subs : []; };
  const COLOR_NAMES = () => S.presets().matColors;
  const PRI_BRANDS  = () => S.presets().priBrands;
  attachCombo($("mBrand"), MAT_BRANDS,    { onAdd:v => S.addMatBrand(v) });
  attachCascader($("mType"), {
    getCategories: MAT_CATS, getSubs: MAT_SUBS,
    onPick: () => {},  // input.value 已自动写好
    onAddSub: (cat, sub, desc) => S.addSub(cat, sub, desc),
    onAddCat: v => S.addCategory(v)
  });
  attachCombo($("mColorName"), COLOR_NAMES, { onAdd:v => S.addMatColor(v) });
  /* 打印机品牌：从 <select> 改为 attachCombo 风格，支持输入新品牌 */
  attachCombo($("pBrand"), PRI_BRANDS, { onAdd:v => S.addPriBrand(v) });

  /* 颜色名 → 取色框联动 */
  const COLOR_HEX = {};
  PRESET_COLORS.forEach(([n, c]) => COLOR_HEX[n] = c);
  Object.assign(COLOR_HEX, { "钛银":"#c0c6cc", "透明":"#dff1f5", "荧光绿":"#54e34a", "渐变色":"#b06ab3" });
  function syncColorFromName(){
    const n = $("mColorName").value.trim();
    const hex = S.matColorHexOf(n) || COLOR_HEX[n]; // 优先用预设里编辑过的色值
    if(hex) $("mColor").value = hex;
  }
  $("mColorName").addEventListener("input", syncColorFromName);
  $("mColorName").addEventListener("change", syncColorFromName);

  /* 迷你柱状图（HTML 弹性柱，避免 SVG 拉伸变形）；列数过多时横向滚动，每列保底宽度不挤压标签 */
  function barChart(data, opts){
    opts = opts || {};
    const max = Math.max(...data.map(d => Math.abs(d.value)), 0.0001);
    const cls = opts.color === "var(--ok)" ? "pos" : "acc";
    const hasGroup = data.some(d => d.group); // 有月份分组时按月分段，滚动时标签吸附左缘
    // 按最长标签估算列最小宽度（10px 字号：数字≈7px、中文≈10px + 左右留白）
    const minCol = Math.max(...data.map(d => d.label.length)) * 7 + 14;
    const cols = data.map(d => {
      const h = Math.max(2, Math.abs(d.value) / max * 100);
      const c = d.value < 0 ? "neg" : cls;
      return `<div class="hcol"><div class="hbar-wrap"><div class="hbar ${c}" style="height:${h.toFixed(1)}%" title="${S.esc(d.tip || (d.full || d.label) + " · " + S.money(d.value))}"></div></div><div class="hlab">${S.esc(d.label)}</div></div>`;
    }).join("");
    let groups = "";
    if(hasGroup){
      const months = [];
      data.forEach(d => {
        if(d.group) months.push({ label:d.group, days:0 });
        months[months.length - 1].days++;
      });
      // 段宽 flex-grow=天数，与上方柱列的 flex 布局同比例，月界天然对齐（误差亚像素）
      groups = '<div class="hgroups">' + months.map(m =>
        `<div class="hmonth" style="flex-grow:${m.days}"><span class="hgroup">${S.esc(m.label)}</span></div>`
      ).join("") + "</div>";
    }
    return '<div class="hchart-scroll" style="height:' + (opts.height || 150) + 'px">'
      + '<div class="hchart-body"><div class="hchart" style="--hcol-min:' + minCol + 'px">' + cols + '</div>' + groups + '</div></div>';
  }
  /* 渲染柱状图并自动滚动到最近一根有数据的柱子（列宽富余时保持原样不滚） */
  function mountBarChart(el, data, opts){
    el.innerHTML = barChart(data, opts);
    const sc = el.querySelector(".hchart-scroll");
    if(!sc) return;
    let i = data.length - 1;
    while(i > 0 && data[i].value === 0) i--;
    const col = sc.querySelectorAll(".hcol")[i];
    if(col){
      const r1 = sc.getBoundingClientRect(), r2 = col.getBoundingClientRect();
      sc.scrollLeft += r2.right - r1.right; // 该柱右缘对齐可视区右缘
    }
  }

  /* ---------- 路由 ---------- */
  let currentTab = "dash";
function goto(tab){
    /* 离开计算器页时自动退出编辑模式，防止表单残留误更新旧记录 */
    if(tab !== "calc" && editingRecId){
      editingRecId = null;
      const sb = $("saveBtn"); if(sb) sb.textContent = "保存为打印记录";
      const cb = $("cancelEditBtn"); if(cb) cb.style.display = "none";
    }
    if(!PAGE_TITLES[tab]) tab = "dash";
    if(!can(PAGE_PERM[tab])){
      const first = Object.keys(PAGE_PERM).find(t => can(PAGE_PERM[t]));
      if(first && first !== tab) return goto(first);
    }
    currentTab = tab;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("on"));
    const page = $("page-" + tab); if(page) page.classList.add("on");
    document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("on", b.getAttribute("data-tab") === tab));
    $("pageTitle").textContent = PAGE_TITLES[tab];
    if(location.hash !== "#/" + tab) history.replaceState(null, "", "#/" + tab);
    RENDERERS[tab]();
    window.scrollTo({ top:0 });
    /* 页面切换动画：整页淡入上移 + 卡片错落入场（GSAP，未加载时自动跳过） */
    fx(g => {
      const page = $("page-" + tab);
      if(!page) return;
      g.fromTo(page, { autoAlpha:0, y:14 }, { autoAlpha:1, y:0, duration:0.28, ease:"power2.out", clearProps:"transform" });
      const cards = page.querySelectorAll(":scope > .card");
      if(cards.length) g.from(cards, { y:12, autoAlpha:0, duration:0.32, stagger:0.06, ease:"power2.out", clearProps:"all" });
    });
    navStartLoop(); // 激活态图标常驻动效随页面切换重启
  }
  $("nav").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]"); if(!b) return;
    goto(b.getAttribute("data-tab"));
  });
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-goto]"); if(g) goto(g.getAttribute("data-goto"));
  });
  window.addEventListener("hashchange", () => {
    const t = (location.hash.match(/^#\/(\w+)/) || [])[1];
    if(t && t !== currentTab) goto(t);
  });

  /* ---------- 选择器填充 ---------- */
  function matOpts(){ return '<option value="">— 选择耗材 —</option>' + S.materials.map(m => `<option value="${m.id}">${S.esc(m.name)} · 剩 ${S.fmt(m.remaining, 0)}g</option>`).join(""); }
  function priOpts(){ return '<option value="">— 选择打印机（可选） —</option>' + S.printers.map(p => `<option value="${p.id}">${S.esc(p.name)}（${S.num(p.powerW)}W）</option>`).join(""); }
  function fillSelects(){
    const selMatEl = $("selMat"); // 主耗材选择器由耗材区动态渲染
    if(selMatEl){ const v = selMatEl.value; selMatEl.innerHTML = matOpts(); selMatEl.value = v; }
    if($("oMat")){ const el = $("oMat"), v = el.value; el.innerHTML = matOpts(); el.value = v; }
    ["selPri","oPri"].forEach(id => { const el = $(id), v = el.value; el.innerHTML = priOpts(); el.value = v; });
    if($("extraMats")) renderMatRows(); // 重建耗材区（主耗材行 + 附加行），保留已选值
  }

  /* ============ 仪表盘 ============ */
  /* 范围日期选择器（flatpickr 本地化）：触发器 + 隐藏 from/to 双输入，原有 change/input 逻辑无感复用 */
  function initRangePicker(triggerId, fromId, toId){
    const from = $(fromId), to = $(toId), trigger = $(triggerId);
    if(!window.flatpickr){ // 组件缺失时退回原生日期输入
      trigger.parentElement.style.display = "none";
      [from, to].forEach(el => { el.type = "date"; });
      return null;
    }
    const fire = () => [from, to].forEach(el => {
      el.dispatchEvent(new Event("input", { bubbles:true }));
      el.dispatchEvent(new Event("change", { bubbles:true }));
    });
    const fp = window.flatpickr(trigger, {
      locale: "zh",
      mode: "range",
      dateFormat: "Y-m-d",
      disableMobile: true,
      onChange(ds){
        if(ds.length !== 2) return; // range 模式：选满起止两天才应用
        from.value = fp.formatDate(ds[0], "Y-m-d");
        to.value = fp.formatDate(ds[1], "Y-m-d");
        fire();
      }
    });
    return {
      // 把隐藏输入的值回写到选择器（快捷区间/清空按钮改值后调用）
      sync(){ fp.setDate([from.value, to.value].filter(Boolean), false); }
    };
  }
  /* 时间筛选与订单列表同款（日期从/到），外加快捷区间按钮 */
  function isoDate(d){ return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
  let dashSel = { preset:"month" }; // {preset} 或 {from,to}
  const dashPick = initRangePicker("dashRange", "dashFrom", "dashTo");
  function dashRange(){
    const t = S.today(), now = new Date();
    if(dashSel.preset === "7d"){ const s = new Date(now); s.setDate(now.getDate() - 6); return { from:isoDate(s), to:t, label:"近7天" }; }
    if(dashSel.preset === "6m"){ const s = new Date(now.getFullYear(), now.getMonth() - 5, 1); return { from:isoDate(s), to:t, label:"近6个月" }; }
    if(dashSel.preset === "5y"){ return { from:(now.getFullYear() - 4) + "-01-01", to:t, label:"近5年" }; }
    return { from:t.slice(0,7) + "-01", to:t, label:"本月" };
  }
  function inRange(o, r){ const d = String(o.date || ""); return d >= r.from && d <= r.to; }
  function orderProfit(o){ return S.num(o.received) - S.num(o.totalCost); }
  function dashMarkActive(){
    document.querySelectorAll("#dashQuick button").forEach(b => b.classList.toggle("on", b.getAttribute("data-q") === dashSel.preset));
  }
  function dashApply(r, preset){
    dashSel = preset ? { preset } : { from:r.from, to:r.to };
    $("dashFrom").value = r.from; $("dashTo").value = r.to;
    if(dashPick) dashPick.sync();
    dashMarkActive(); renderDash();
  }
  $("dashQuick").addEventListener("click", e => {
    const b = e.target.closest("button[data-q]"); if(!b) return;
    dashSel = { preset:b.getAttribute("data-q") }; // 先切 preset，dashRange 才按新区间算
    dashApply(dashRange(), dashSel.preset);
  });
  $("dashFrom").addEventListener("change", () => { dashSel = { from:$("dashFrom").value, to:$("dashTo").value }; dashMarkActive(); renderDash(); });
  $("dashTo").addEventListener("change", () => { dashSel = { from:$("dashFrom").value, to:$("dashTo").value }; dashMarkActive(); renderDash(); });
  $("dashClear").addEventListener("click", () => { dashSel = { preset:"month" }; const r = dashRange(); $("dashFrom").value = r.from; $("dashTo").value = r.to; if(dashPick) dashPick.sync(); dashMarkActive(); renderDash(); });

  /* 趋势序列：按区间跨度自动选粒度（≤31天按日，≤2年按月，更长按年） */
  function trendSeries(from, to){
    const d1 = new Date(from + "T00:00:00"), d2 = new Date(to + "T00:00:00");
    const days = Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
    const out = [];
    if(days <= 31){
      for(let i = 0; i < days; i++){
        const d = new Date(d1); d.setDate(d1.getDate() + i);
        out.push({
          key:isoDate(d),
          label:String(d.getDate()), // 柱下只显示「日」，月份由 group 单独标出
          full:(d.getMonth() + 1) + "/" + d.getDate(),
          group:(i === 0 || d.getDate() === 1) ? (d.getMonth() + 1) + "月" : "",
          value:0
        });
      }
      S.orders.forEach(o => { const b = out.find(x => x.key === o.date); if(b) b.value += orderProfit(o); });
    }else if(days <= 800){
      const y1 = +from.slice(0,4), m1 = +from.slice(5,7), y2 = +to.slice(0,4), m2 = +to.slice(5,7);
      let y = y1, m = m1;
      while(y < y2 || (y === y2 && m <= m2)){
        out.push({ key:y + "-" + String(m).padStart(2,"0"), label:m + "月", value:0 });
        m++; if(m > 12){ m = 1; y++; }
      }
      S.orders.forEach(o => { const b = out.find(x => x.key === String(o.date || "").slice(0,7)); if(b) b.value += orderProfit(o); });
    }else{
      const y1 = +from.slice(0,4), y2 = +to.slice(0,4);
      for(let y = y1; y <= y2; y++) out.push({ key:String(y), label:y + "年", value:0 });
      S.orders.forEach(o => { const b = out.find(x => x.key === String(o.date || "").slice(0,4)); if(b) b.value += orderProfit(o); });
    }
    return out;
  }

  /* ---------- 总成本勾选：统计计入哪些成本项（记录页总成本 / 仪表盘成本共用） ---------- */
  let statsIncl = { fil:true, elec:true, mach:true, lab:true };
  const STATS_INCL_KEY = "pp3d_statsincl_v1";
  function loadStatsIncl(){
    try{
      const s = JSON.parse(localStorage.getItem(STATS_INCL_KEY) || "null");
      if(s && typeof s === "object") Object.assign(statsIncl, { fil:!!s.fil, elec:!!s.elec, mach:!!s.mach, lab:!!s.lab });
    }catch(_){}
  }
  function saveStatsIncl(){
    try{ localStorage.setItem(STATS_INCL_KEY, JSON.stringify(statsIncl)); }catch(_){}
  }
  function statsCostOf(r){ // 打印记录：按勾选口径计算成本
    return (statsIncl.fil ? S.num(r.cFil) : 0) + (statsIncl.elec ? S.num(r.cElec) : 0)
         + (statsIncl.mach ? S.num(r.cMach) : 0) + (statsIncl.lab ? S.num(r.cLab) : 0);
  }
  function orderCostOf(o){ // 订单：新版订单按勾选四项；历史订单（无四项）按保存的合计全额计入
    if(!Object.prototype.hasOwnProperty.call(o, "cFil")) return S.num(o.totalCost);
    return (statsIncl.fil ? S.num(o.cFil) : 0) + (statsIncl.elec ? S.num(o.cElec) : 0)
         + (statsIncl.mach ? S.num(o.cMach) : 0) + (statsIncl.lab ? S.num(o.cLab) : 0);
  }
  function reRenderStats(){
    if(currentTab === "records") renderRecords();
    else if(currentTab === "dash") renderDash();
  }
  function mountCostPick(){
    loadStatsIncl();
    if(!$("costPickPanel")){
      const wrap = document.createElement("div");
      wrap.innerHTML = '<div class="cost-pick" id="costPickPanel" hidden>' +
        '<div class="cp-title">总成本计入哪些成本项</div>' +
        [["fil","耗材费"],["elec","电费"],["mach","机器折旧"],["lab","人工费"]]
          .map(([k, t]) => `<label><input type="checkbox" data-cp="${k}" ${statsIncl[k] ? "checked" : ""}> ${t}</label>`).join("") +
        '<div class="cp-foot"><button class="btn sm" id="cpDone">完成</button></div></div>';
      document.body.appendChild(wrap.firstElementChild);
    }
    const panel = $("costPickPanel");
    panel.querySelectorAll("[data-cp]").forEach(cb => cb.addEventListener("change", () => {
      statsIncl[cb.getAttribute("data-cp")] = cb.checked;
      saveStatsIncl();
      reRenderStats();
    }));
    $("cpDone").addEventListener("click", () => { panel.hidden = true; });
  }
  document.addEventListener("click", (e) => {
    const trig = e.target.closest ? e.target.closest("[data-costpick]") : null;
    const panel = $("costPickPanel");
    if(trig && panel){
      const r = trig.getBoundingClientRect();
      panel.hidden = !panel.hidden;
      if(!panel.hidden){
        panel.style.left = Math.max(8, Math.min(window.innerWidth - 230, r.left)) + "px";
        panel.style.top = (r.bottom + 6) + "px";
      }
      fx(g => {
        g.fromTo(trig, { scale: 0.82 }, { scale: 1, duration: 0.4, ease: "back.out(2.5)", clearProps: "transform" });
        g.to(trig.querySelector("svg"), { rotation: "+=90_cw", duration: 0.35, ease: "power2.out", transformOrigin: "50% 50%", overwrite: "auto" });
      });
      return;
    }
    if(panel && !panel.hidden && !(e.target.closest && e.target.closest("#costPickPanel"))) panel.hidden = true;
  });

  /* 齿轮按钮微交互：悬停旋转 / 键盘聚焦转动 / 点击回弹（GSAP 不可达或系统开启「减少动态效果」时自动降级为静态样式） */
  const gearSvg = b => b && b.querySelector("svg");
  document.addEventListener("mouseover", e => {
    const b = e.target.closest ? e.target.closest(".cpbtn[data-costpick]") : null;
    if(!b || b.dataset.hov === "1") return;
    b.dataset.hov = "1";
    fx(g => g.to(gearSvg(b), { rotation: 180, duration: 0.55, ease: "power2.out", transformOrigin: "50% 50%", overwrite: "auto" }));
  });
  document.addEventListener("mouseout", e => {
    const b = e.target.closest ? e.target.closest(".cpbtn[data-costpick]") : null;
    if(!b) return;
    if(e.relatedTarget && b.contains(e.relatedTarget)) return;
    b.dataset.hov = "";
    fx(g => g.to(gearSvg(b), { rotation: 0, duration: 0.4, ease: "power2.out", transformOrigin: "50% 50%", overwrite: "auto" }));
  });
  document.addEventListener("focus", e => {
    const b = e.target.closest ? e.target.closest(".cpbtn[data-costpick]") : null;
    if(!b) return;
    fx(g => g.to(gearSvg(b), { rotation: 90, duration: 0.45, ease: "power2.out", transformOrigin: "50% 50%", overwrite: "auto" }));
  }, true);
  document.addEventListener("blur", e => {
    const b = e.target.closest ? e.target.closest(".cpbtn[data-costpick]") : null;
    if(!b) return;
    fx(g => g.to(gearSvg(b), { rotation: 0, duration: 0.35, ease: "power2.out", transformOrigin: "50% 50%", overwrite: "auto" }));
  }, true);

  /* 导航图标微交互：悬停动效（仪表盘/计算器/开单/订单/耗材/打印机/打印记录/设置）
     GSAP 不可达或系统开启「减少动态效果」时自动降级为静态样式 */
  const NAV_HOVER = {
    dash:{ y:-2, scale:1.1 }, calc:{ y:-2, scale:1.1 }, order:{ y:-2, scale:1.1 },
    olist:{ y:-2, scale:1.1 }, mats:{ rotation:45, scale:1.1 }, printers:{ y:-3, rotation:-4 },
    records:{ y:-2, scale:1.1 }, settings:{ rotation:180 }
  };
  const navIconOf = b => b && b.querySelector("svg.ic");
  const navHoverIn = b => {
    if(!b || b.dataset.hov === "1") return;
    b.dataset.hov = "1";
    stopNavLoop(); // 悬停期间暂停激活态常驻动效，避免相互覆盖
    const v = NAV_HOVER[b.getAttribute("data-tab")];
    if(!v) return;
    fx(g => g.to(navIconOf(b), Object.assign({}, v, { duration: 0.5, ease: "back.out(1.6)", transformOrigin: "50% 50%", overwrite: "auto" })));
  };
  const navHoverOut = b => {
    if(!b) return;
    b.dataset.hov = "";
    const v = NAV_HOVER[b.getAttribute("data-tab")];
    if(!v) return;
    fx(g => g.to(navIconOf(b), { rotation: 0, y: 0, scale: 1, duration: 0.4, ease: "power2.out", transformOrigin: "50% 50%", overwrite: "auto", onComplete: navStartLoop }));
  };
  document.addEventListener("mouseover", e => {
    const b = e.target.closest ? e.target.closest(".nav button[data-tab]") : null;
    if(b) navHoverIn(b);
  });
  document.addEventListener("mouseout", e => {
    const b = e.target.closest ? e.target.closest(".nav button[data-tab]") : null;
    if(!b) return;
    if(e.relatedTarget && b.contains(e.relatedTarget)) return;
    navHoverOut(b);
  });

  /* 激活态导航图标：常驻轻动效（齿轮 / 线轴缓慢旋转，其余轻微呼吸上浮；GSAP 不可达或系统开启「减少动态效果」时自动跳过） */
  let navLoopTween = null;
  function stopNavLoop(){ if(navLoopTween){ navLoopTween.kill(); navLoopTween = null; } }
  function navStartLoop(){
    stopNavLoop();
    const b = document.querySelector(".nav button.on");
    if(!b || !window.gsap || reduceMotion) return;
    const ic = b.querySelector("svg.ic");
    if(!ic) return;
    const tab = b.getAttribute("data-tab");
    if(tab === "settings"){
      navLoopTween = gsap.to(ic, { rotation: 360, duration: 8, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
    } else if(tab === "mats"){
      navLoopTween = gsap.to(ic, { rotation: 360, duration: 10, ease: "none", repeat: -1, transformOrigin: "50% 50%" });
    } else {
      navLoopTween = gsap.fromTo(ic, { y: 1.5 }, { y: -1.5, duration: 2.2, ease: "sine.inOut", yoyo: true, repeat: -1 });
    }
  }
  function renderDash(){
    if(!$("dashFrom").value){ const rr = dashRange(); $("dashFrom").value = rr.from; $("dashTo").value = rr.to; if(dashPick) dashPick.sync(); }
    const r = { from:$("dashFrom").value, to:$("dashTo").value };
    const title = dashSel.preset ? { "7d":"近7天", "6m":"近6个月", "5y":"近5年", "month":"本月" }[dashSel.preset] : "所选区间";
    const inP = S.orders.filter(o => o.status !== "canceled" && inRange(o, r));
    const rev = inP.reduce((s,o) => s + S.num(o.received), 0);
    const cost = inP.reduce((s,o) => s + orderCostOf(o), 0);
    const profit = rev - cost;
    const st = S.orderStats();
    const prog = S.orders.filter(o => inRange(o, r));
    const active = prog.filter(o => !["done","canceled"].includes(o.status)).length;
    const doneN = prog.filter(o => o.status === "done").length;

    $("dashRangeTitle").textContent = title + "经营";
    $("dashStats").innerHTML = [
      ["营收 · 利润 " + CPBTN, S.money(rev), `利润 ${S.money(profit)} · 利润率 ${rev > 0 ? (profit / rev * 100).toFixed(1) : 0}% · ${inP.length} 单`, profit >= 0 ? "up" : "down"],
      ["待收款（全部）", S.money(st.due), st.due > 0 ? "有未结订单" : "已结清", st.due > 0 ? "down" : ""],
      ["进行中订单", String(active), title + "已完成 " + doneN + " 单", "hi"],
      ["累计订单", String(st.count), "历史总数 · 已完成 " + S.orders.filter(o => o.status === "done").length + " 单", ""]
    ].map(([k, v, s, cls]) => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");

    // 趋势图
    const series = trendSeries(r.from, r.to);
    $("trendTitle").textContent = "区间利润走势";
    $("trendHint").textContent = "期间利润 " + S.money(profit);
    if(series.every(m => m.value === 0)) $("profitChart").innerHTML = '<div class="empty">这段时间还没有订单数据</div>';
    else mountBarChart($("profitChart"), series, { color:"var(--ok)" });

    // 经营提醒
    const alerts = [];
    S.materials.forEach(m => {
      if(S.num(m.remaining) <= S.num(S.settings.lowStock))
        alerts.push(`<div class="alert warn">🧵 <span><b>${S.esc(S.matLabel(m))}</b> 只剩 <b>${S.fmt(m.remaining, 0)}g</b>，低于预警线 ${S.fmt(S.settings.lowStock, 0)}g，记得补货。</span></div>`);
    });
    const dueOrders = S.orders.filter(o => o.status !== "canceled" && S.orderDue(o) > 0).sort((a,b) => S.orderDue(b) - S.orderDue(a));
    if(dueOrders.length)
      alerts.push(`<div class="alert info">💰 <span><b>${dueOrders.length}</b> 笔订单待收款，合计 <b>${S.money(st.due)}</b>，最大一笔：${S.esc(dueOrders[0].orderNo)}（${S.money(S.orderDue(dueOrders[0]))}）。</span></div>`);
    if(!alerts.length) alerts.push('<div class="alert ok">✅ <span>一切正常：库存充足，没有待收款。</span></div>');
    $("dashAlerts").innerHTML = alerts.join("");

    // 最近订单（期间内）
    const recent = inP.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 5);
    $("dashRecent").innerHTML = recent.length ? recent.map(o => {
      const stt = S.stOf(o.status);
      return `<div class="ord" style="margin:8px 0"><div class="top">
        <span class="no">${S.esc(o.orderNo)}</span>
        <span class="badge" style="--bc:${stt.color}"><i></i>${stt.label}</span></div>
        <div class="nums"><span>${S.esc(o.date)}</span><span>利润 <b class="${orderProfit(o) >= 0 ? "tot" : "loss"}">${S.money(orderProfit(o))}</b></span>${S.orderDue(o) > 0 ? `<span class="loss">待收 ${S.money(S.orderDue(o))}</span>` : ""}</div></div>`;
    }).join("") : '<div class="empty">' + (S.orders.length ? title + "没有订单" : "还没有订单<br><span class=\"hint\">去「开单」页开第一单</span>") + "</div>";

    // 客户排行（期间内）
    const custs = S.byCustomer(inP).slice(0, 5);
    $("dashCustomers").innerHTML = custs.length
      ? `<table><thead><tr><th>客户</th><th class="num">单数</th><th class="num">利润</th></tr></thead><tbody>` +
        custs.map(c => `<tr><td>${S.esc(c.name)}</td><td class="num">${c.n}</td><td class="num ${c.profit >= 0 ? "tot" : "loss"}">${S.money(c.profit)}</td></tr>`).join("") + "</tbody></table>"
      : '<div class="empty">暂无客户数据</div>';

    renderAch();
  }

  function renderAch(){
    const s = S.buildAchStats();
    $("achList").innerHTML = S.ACHS.map(a => {
      const p = Math.max(0, Math.min(1, a.goal(s))), on = p >= 1;
      return `<div class="ach ${on ? "on" : ""}"><div class="ic2">${a.ic}</div>
        <div class="body" style="flex:1"><div class="nm">${a.nm} ${on ? "✓" : ""}</div><div class="ds">${a.ds}</div>
        <div class="pg"><i style="width:${(p * 100).toFixed(0)}%"></i></div></div></div>`;
    }).join("");
  }

/* ============ 计算器 ============ */
  /* ---------- 多耗材：一条打印记录可消耗多种耗材 ---------- */
  function recMats(r){
    if(Array.isArray(r.mats) && r.mats.length) return r.mats;
    if(!r || !r.materialId) return [];
    return [{ materialId:r.materialId, matName:r.matName, matColor:r.matColor, grams:S.num(r.grams), pricePerKg:S.num(r.pricePerKg) }];
  }
  function matsGramSum(mats){ return (mats||[]).reduce((s,x) => s + S.num(x.grams), 0); }
  function matsCost(mats){ return (mats||[]).reduce((s,x) => s + S.num(x.pricePerKg)/1000 * S.num(x.grams), 0); }
  function matsLabel(mats, withG){ return (mats||[]).map(x => (x.matName || "未知耗材") + (withG && S.num(x.grams) > 0 ? " " + S.fmt(S.num(x.grams),1) + "g" : "")).join(" · "); }
  function applyMatsStock(r, sign){
    recMats(r).forEach(x => {
      const m = S.matById(x.materialId); if(!m) return;
      const g = S.num(x.grams); if(!(g > 0)) return;
      if(sign < 0) m.remaining = Math.max(0, S.num(m.remaining) - g);
      else m.remaining = Math.min(S.num(m.spool), S.num(m.remaining) + g);
    });
  }
  let lastCalc = null; // 供「去开订单」自动带入
  let editingRecId = null; // 正在编辑的打印记录 id（非空时保存按钮走更新逻辑）
  function calc(){
    const m = S.matById($("selMat").value), p = S.priById($("selPri").value);
    const qty = Math.max(1, S.num($("rQty").value) || 1);
    const g = S.num($("rGrams").value);
    const sh = S.num($("rHoursH").value) + S.num($("rHoursM").value) / 60; // 单个打印时长（h）
    const totHv = S.num($("rTotHoursH").value) + S.num($("rTotHoursM").value) / 60; // 总打印时长（h），可手动选择
    const h = totHv > 0 ? totHv : qty * sh;
    const min = S.num($("rMin").value);

    $("matHint").textContent = m ? `单价 ${S.money(S.num(m.pricePerKg))}/kg · 剩余 ${S.fmt(m.remaining, 0)}g` : "必选：去「耗材」页添加";
    $("priHint").textContent = p ? `功率 ${S.num(p.powerW)}W · 电价 ${S.num(p.elecPrice)} 元/度 · 机器 ${S.money(S.machineRate(p))}/h` : "可选：不选则只算耗材与人工";
    /* 附加耗材：同一打印消耗多种耗材时按明细合计耗材成本与总克数 */
    const extras = extraMatsFromDom();
    const gExtra = extras.reduce((s,x) => s + x.grams, 0);
    const gTotal = g + gExtra;
    const c = S.computePrint(m, p, gTotal, h);
    c.cFil = (m ? S.num(m.pricePerKg)/1000 * g : 0) + extras.reduce((s,x) => { const mm = S.matById(x.matId); return s + (mm ? S.num(mm.pricePerKg)/1000 * x.grams : 0); }, 0);
    const et = $("extraTot"); if(et) et.textContent = extras.length ? "耗材成本 " + S.money(c.cFil) : "同一打印消耗多种耗材时在此添加";
    const rt = $("rGTotal"); if(rt) rt.value = gTotal > 0 ? S.fmt(gTotal, 1) : "0";
    const lab = (m || p || min) ? S.laborCost(min) : 0;
    /* 勾选才计入总成本；未勾选项半透明展示，金额仍可见 */
    const incl = { fil:$("cbFil").checked, elec:$("cbElec").checked, mach:$("cbMach").checked, lab:$("cbLab").checked };
    const all = (incl.fil ? c.cFil : 0) + (incl.elec ? c.cElec : 0) + (incl.mach ? c.cMach : 0) + (incl.lab ? lab : 0);
    $("costBig").textContent = S.money(all);
    $("costFil").textContent = S.money(c.cFil);
    $("costElec").textContent = S.money(c.cElec);
    $("costMach").textContent = S.money(c.cMach);
    $("costLab").textContent = S.money(lab);
    $("cbFil").closest(".line").classList.toggle("off", !incl.fil);
    $("cbElec").closest(".line").classList.toggle("off", !incl.elec);
    $("cbMach").closest(".line").classList.toggle("off", !incl.mach);
    $("cbLab").closest(".line").classList.toggle("off", !incl.lab);
    // 分成本项加成：每项按各自加成比例算，未勾选不计入也不加成
    const mp = S.settings.markupPct || {fil:10, elec:10, mach:10, lab:10};
    const sug = (incl.fil ? c.cFil * (1 + S.num(mp.fil)  / 100) : 0)
              + (incl.elec ? c.cElec * (1 + S.num(mp.elec) / 100) : 0)
              + (incl.mach ? c.cMach * (1 + S.num(mp.mach) / 100) : 0)
              + (incl.lab ? lab * (1 + S.num(mp.lab)  / 100) : 0);
    const sugParts = [];
    if(incl.fil)  sugParts.push(`耗材+${S.fmt(mp.fil, 0)}%`);
    if(incl.elec) sugParts.push(`电费+${S.fmt(mp.elec, 0)}%`);
    if(incl.mach) sugParts.push(`机器+${S.fmt(mp.mach, 0)}%`);
    if(incl.lab)  sugParts.push(`人工+${S.fmt(mp.lab, 0)}%`);
    $("costSug").textContent = sug > 0 ? S.money(sug) + "（" + sugParts.join(" ") + "）" : "—";
    lastCalc = { matId:$("selMat").value, priId:$("selPri").value, qty, g:gTotal, gMain:g, h, sh, min, note:$("rNote").value.trim(), sug, incl, mats: extras.map(x => ({ matId:x.matId, grams:x.grams })) };
    saveCalcState();
    return { m, p, qty, g, gMain:g, gTotal, h, sh, min, c, lab, all, sug, incl, extras };
  }
  ["selPri","rMin","cbFil","cbElec","cbMach","cbLab"].forEach(id => $(id).addEventListener("input", calc));
  /* 附加耗材行：DOM 为唯一事实源；仅在增删行/材料刷新/回填时重建，输入时仅更新提示与成本 */
  function extraMatsFromDom(){
    return [...document.querySelectorAll("#extraMats .em-row:not(.mat-main)")].map(row => ({
      matId: row.querySelector(".em-mat").value,
      grams: S.num(row.querySelector(".em-g").value)
    })).filter(x => x.matId && x.grams > 0);
  }
  function renderMatRows(state, append){
    const box = $("extraMats"); if(!box) return;
    const prev = { sel: $("selMat") ? $("selMat").value : "", grams: $("rGrams") ? $("rGrams").value : "" };
    const rows = state && Array.isArray(state) ? state : [...box.querySelectorAll(".em-row:not(.mat-main)")].map(row => ({ matId: row.querySelector(".em-mat").value, grams: row.querySelector(".em-g").value }));
    if(append) rows.push({ matId:"", grams:"" });
    box.innerHTML =
      '<div class="em-row mat-main"><label class="em-lab">耗材<i class="dot"></i></label>' +
        '<select id="selMat" class="em-mat">' + matOpts() + '</select>' +
        '<input id="rGrams" class="em-g" type="number" min="0" step="0.1" placeholder="主耗材克数" value="' + S.esc(String(prev.grams)) + '">' +
        '<span class="em-unit">g</span>' +
        '<span class="em-hint" id="matHint">—</span></div>' +
      '<div class="em-head">附加耗材 <span class="em-tip" id="extraTot"></span></div>' +
      rows.map((o, i) => {
        const matId = o.matId || "", grams = o.grams != null ? o.grams : "";
        const m = matId ? S.matById(matId) : null;
        const opts = '<option value="">— 选择耗材 —</option>' + S.materials.map(x => `<option value="${x.id}" ${x.id === matId ? "selected" : ""}>${S.esc(S.matLabel(x))} · 剩 ${S.fmt(x.remaining,0)}g</option>`).join("");
        return `<div class="em-row" data-i="${i}"><select class="em-mat" aria-label="附加耗材">${opts}</select><input class="em-g" type="number" min="0" step="0.1" placeholder="克数" value="${S.esc(String(grams))}"><span class="em-unit">g</span><button class="em-del" type="button" title="移除该耗材">×</button><span class="em-hint">${m ? "单价 " + S.money(S.num(m.pricePerKg)) + "/kg · 剩余 " + S.fmt(m.remaining,0) + "g" : "必选耗材后填克数"}</span></div>`;
      }).join("") +
      '<button class="btn ghost sm em-add" type="button">＋ 添加耗材</button>';
    const sm = $("selMat"); if(sm && prev.sel) sm.value = prev.sel;
    if(window.gsap && !reduceMotion){ try{ gsap.fromTo(box.querySelectorAll(".em-row:not(.mat-main)"), { autoAlpha:0, y:6 }, { autoAlpha:1, y:0, duration:0.22, stagger:0.04, ease:"power2.out", clearProps:"all" }); }catch(_){} }
  }
  const emBox = $("extraMats");
  if(emBox){
    emBox.addEventListener("change", e => { if(e.target.closest(".em-row")) calc(); });
    emBox.addEventListener("input", e => {
      const row = e.target.closest(".em-row"); if(!row || e.target.id === "rGrams") return;
      /* 附加耗材克数变化：按总克数口径联动单个克数（总克数 = 主耗材 + 附加合计） */
      if(e.target.classList.contains("em-g") && gAnchor !== "gPer"){
        const qty = Math.max(1, S.num($("rQty").value) || 1);
        if(S.num($("rGrams").value) > 0 || gExtraSum() > 0) $("rGPer").value = Math.round((S.num($("rGrams").value) + gExtraSum()) / qty * 10) / 10;
      }
      calc();
    });
    emBox.addEventListener("click", e => {
      const del = e.target.closest(".em-del");
      if(del){ del.closest(".em-row").remove(); calc(); return; }
      const add = e.target.closest(".em-add");
      if(add){ renderMatRows(null, true); calc(); }
    });
  }
  /* 打印数量 × 单个克重 ↔ 总克重 联动（以最后编辑的字段为基准，避免互相覆盖） */
  let gAnchor = "grams"; // 最后一次用户编辑的克数字段：grams（主耗材）/ gPer / qty
  function gExtraSum(){ return extraMatsFromDom().reduce((s,x) => s + x.grams, 0); }
  $("rQty").addEventListener("input", () => {
    const qty = Math.max(1, S.num($("rQty").value) || 1);
    const gPer = S.num($("rGPer").value);
    if(gAnchor === "gPer" && gPer > 0){ const v = qty * gPer - gExtraSum(); $("rGrams").value = Math.max(0, Math.round(v * 10) / 10); }
    else if(S.num($("rGrams").value) > 0 || gExtraSum() > 0){ $("rGPer").value = Math.round((S.num($("rGrams").value) + gExtraSum()) / qty * 10) / 10; }
    gAnchor = "qty";
    /* 时长联动：单个时长是锚点时总时间=qty×单个；总时间是锚点时保持总时间、反推单个 */
    if(hAnchor !== "total" || !(S.num($("rTotHoursH").value) + S.num($("rTotHoursM").value) / 60 > 0)){
      syncTotalHours();
    }else{
      const t = S.num($("rTotHoursH").value) + S.num($("rTotHoursM").value) / 60;
      if(t > 0) setSingleFromTotal(t, qty);
    }
    calc();
  });
  $("rGPer").addEventListener("input", () => {
    const qty = Math.max(1, S.num($("rQty").value) || 1);
    if(S.num($("rGPer").value) > 0){ const v = qty * S.num($("rGPer").value) - gExtraSum(); $("rGrams").value = Math.max(0, Math.round(v * 10) / 10); }
    gAnchor = "gPer";
    calc();
  });
  /* rGrams 由耗材区动态渲染（主耗材行），用 document 级委托绑定输入联动 */
  document.addEventListener("input", e => {
    if(!e.target || e.target.id !== "rGrams") return;
    const qty = Math.max(1, S.num($("rQty").value) || 1);
    const grams = S.num($("rGrams").value);
    if(grams > 0 || gExtraSum() > 0) $("rGPer").value = Math.round((grams + gExtraSum()) / qty * 10) / 10;
    gAnchor = "grams";
    calc();
  });

  /* 单个打印时长 ↔ 总打印时间 联动（以最后编辑的字段为基准） */
  let hAnchor = "single"; // 最后编辑的时长字段：single=单个打印时长 / total=总打印时间
    function syncTotalHours(){
    const qty = Math.max(1, S.num($("rQty").value) || 1);
    const sh = S.num($("rHoursH").value) + S.num($("rHoursM").value) / 60;
    const total = qty * sh;
    if(total > 0){
      const th = Math.floor(total);
      const tm = Math.round((total - th) * 60);
      $("rTotHoursH").value = String(th);
      $("rTotHoursM").value = String(Math.min(55, Math.round(tm / 5) * 5));
    }else{
      $("rTotHoursH").value = "0";
      $("rTotHoursM").value = "0";
    }
  }
  function setSingleFromTotal(t, qty){
    const sh = t / Math.max(1, qty || 1);
    $("rHoursH").value = String(Math.floor(sh));
    const mins = Math.round((sh - Math.floor(sh)) * 60);
    $("rHoursM").value = String(Math.min(55, Math.round(mins / 5) * 5));
  }
  $("rHoursH").addEventListener("input", () => { hAnchor = "single"; syncTotalHours(); calc(); });
  $("rHoursM").addEventListener("input", () => { hAnchor = "single"; syncTotalHours(); calc(); });
    ["rTotHoursH","rTotHoursM"].forEach(id => $(id).addEventListener("input", () => {
    hAnchor = "total";
    const qty = Math.max(1, S.num($("rQty").value) || 1);
    const t = S.num($("rTotHoursH").value) + S.num($("rTotHoursM").value) / 60;
    if(t > 0) setSingleFromTotal(t, qty);
    calc();
  }));
  /* 计算器表单本地持久化：整页刷新（会话过期重登 / 保存即刷新 / 手动刷新）后自动恢复已填选项 */
  const CALC_KEY = "pp3d_calcform_v1";
  let calcStateReady = false; // 初始化恢复完成后才允许写入持久化
  function saveCalcState(){
    if(!calcStateReady) return;
    try{
      localStorage.setItem(CALC_KEY, JSON.stringify({
        selMat:$("selMat").value, selPri:$("selPri").value,
        rQty:$("rQty").value, rGPer:$("rGPer").value, rGrams:$("rGrams").value,
        rHoursH:$("rHoursH").value, rHoursM:$("rHoursM").value, rTotHoursH:$("rTotHoursH").value, rTotHoursM:$("rTotHoursM").value,
        rMin:$("rMin").value, rNote:$("rNote").value,
        cbFil:$("cbFil").checked, cbElec:$("cbElec").checked, cbMach:$("cbMach").checked, cbLab:$("cbLab").checked,
        gAnchor, hAnchor, extraRows: extraMatsFromDom().map(x => ({ matId:x.matId, grams:x.grams }))
      }));
    }catch(_){}
  }
  function restoreCalcState(){
    try{
      const s = JSON.parse(localStorage.getItem(CALC_KEY) || "null");
      if(!s || typeof s !== "object") return;
      if(s.selMat) $("selMat").value = s.selMat;
      if(s.selPri) $("selPri").value = s.selPri;
      if(s.rQty) $("rQty").value = s.rQty;
      if(s.rGPer != null) $("rGPer").value = String(s.rGPer);
      if(s.rGrams != null) $("rGrams").value = String(s.rGrams);
      if(s.rHoursH != null) $("rHoursH").value = String(s.rHoursH);
      if(s.rHoursM != null) $("rHoursM").value = String(s.rHoursM);
      if(s.rTotHoursH != null) $("rTotHoursH").value = String(s.rTotHoursH);
      if(s.rTotHoursM != null) $("rTotHoursM").value = String(s.rTotHoursM);
      /* 兼容旧版数字存档：rTotHours → 拆成时/分 */
      if(s.rTotHours != null && s.rTotHoursH == null && s.rTotHoursM == null){
        const tv = S.num(s.rTotHours);
        if(tv > 0){
          $("rTotHoursH").value = String(Math.floor(tv));
          $("rTotHoursM").value = String(Math.min(55, Math.round((tv - Math.floor(tv)) * 60 / 5) * 5));
        }
      }
      if(s.rMin) $("rMin").value = s.rMin;
      if(s.rNote) $("rNote").value = s.rNote;
      if(s.cbFil != null) $("cbFil").checked = !!s.cbFil;
      if(s.cbElec != null) $("cbElec").checked = !!s.cbElec;
      if(s.cbMach != null) $("cbMach").checked = !!s.cbMach;
      if(s.cbLab != null) $("cbLab").checked = !!s.cbLab;
      if(s.gAnchor && ["grams","gPer","qty"].includes(s.gAnchor)) gAnchor = s.gAnchor;
      if(s.hAnchor && ["single","total"].includes(s.hAnchor)) hAnchor = s.hAnchor;
      if(Array.isArray(s.extraRows)) renderMatRows(s.extraRows.map(x => ({ matId:x.matId || "", grams:x.grams != null ? x.grams : "" })));
      calc(); // 恢复完成立即重算总克数与成本显示
    }catch(_){}
  }

  /* 防重复保存：保存成功后按钮禁用，表单有任何输入（或清除/取消/编辑）才恢复 */
  function enableSaveBtn(){
    const b = $("saveBtn");
    b.disabled = false;
    b.textContent = editingRecId ? "保存修改" : "保存为打印记录";
  }
  document.addEventListener("input", (e) => {
    if(e.target && e.target.closest("#page-calc")) enableSaveBtn();
  }, true);
  $("saveBtn").addEventListener("click", () => {
    const { m, p, g, h, sh, min, c, lab, all, incl } = calc();
    const extras = extraMatsFromDom();
    if(!m){ $("homeMsg").textContent = "请先选择耗材（必填）"; toast("耗材为必填项"); return; }
    if(g <= 0){ $("homeMsg").textContent = "请填写主耗材克重（必填）"; toast("主耗材克重为必填项"); return; }
    if(all <= 0){ $("homeMsg").textContent = "至少勾选一项成本计入"; toast("请至少勾选一项成本"); return; }
    $("saveBtn").disabled = true; $("saveBtn").textContent = "已保存"; // 防连点：保存成功后禁用，修改表单才恢复
    const note = $("rNote").value.trim();
    /* 编辑模式：更新原记录并联动库存（先回补旧克数，再按新材料/新克数扣减） */
    if(editingRecId){
      const i = S.records.findIndex(r => r.id === editingRecId);
      if(i < 0){ editingRecId = null; toast("原记录已不存在，已退出编辑"); enableSaveBtn(); }
      else {
        const old = S.records[i];
        applyMatsStock(old, +1); // 先按旧记录明细回补库存（旧单耗材记录自动派生）
        const mats = [{ materialId:m.id, matName:m.name, matColor:m.color, grams:g, pricePerKg:S.num(m.pricePerKg) }]
          .concat(extras.map(x => { const mm = S.matById(x.matId); return { materialId:x.matId, matName:mm ? mm.name : null, matColor:mm ? mm.color : null, grams:x.grams, pricePerKg:S.num(mm ? mm.pricePerKg : 0) }; }));
        const gTotal2 = mats.reduce((s,x) => s + S.num(x.grams), 0);
        S.records[i] = Object.assign({}, old, {
          mats,
          materialId:m.id, matName:m.name, matType:m.type, matColor:m.color, pricePerKg:S.num(m.pricePerKg),
          printerId:p ? p.id : null, priName:p ? p.name : null, powerW:p ? S.num(p.powerW) : 0, elecPrice:p ? S.num(p.elecPrice) : 0,
          grams:gTotal2, qty:S.num($("rQty").value) || 1, gPer:S.num($("rGPer").value) || 0, singleHours:sh, hours:h, handlingMin:min, cFil:c.cFil, cElec:c.cElec, cMach:c.cMach, cLab:lab, total:all, sug:lastCalc && lastCalc.sug,
          inclFil:incl.fil, inclElec:incl.elec, inclMach:incl.mach, inclLab:incl.lab,
          consumed:gTotal2, note
        });
        applyMatsStock(S.records[i], -1); // 再按新明细扣减
        S.saveRec(); S.saveMat();
        $("cancelEditBtn").style.display = "none";
        editingRecId = null;
        $("homeMsg").textContent = "已更新：" + (mats.length > 1 ? mats.length + " 种耗材 · 总 " + S.fmt(gTotal2,1) + "g" : m.name + " · " + S.fmt(gTotal2,1) + "g") + " · 计入成本 " + S.money(all);
        toast("记录已更新，库存已按耗材逐项同步 " + randFace());
        fillSelects(); calc();
        if(currentTab === "records") renderRecords();
        return;
      }
    }
    const mats = [{ materialId:m.id, matName:m.name, matColor:m.color, grams:g, pricePerKg:S.num(m.pricePerKg) }]
      .concat(extras.map(x => { const mm = S.matById(x.matId); return { materialId:x.matId, matName:mm ? mm.name : null, matColor:mm ? mm.color : null, grams:x.grams, pricePerKg:S.num(mm ? mm.pricePerKg : 0) }; }));
    const gTotal2 = mats.reduce((s,x) => s + S.num(x.grams), 0);
    const rec0 = { id:S.uid(), date:S.today(), created:Date.now(), mats,
      materialId:m.id, matName:m.name, matType:m.type, matColor:m.color, pricePerKg:S.num(m.pricePerKg),
      printerId:p ? p.id : null, priName:p ? p.name : null, powerW:p ? S.num(p.powerW) : 0, elecPrice:p ? S.num(p.elecPrice) : 0,
      grams:gTotal2, qty:S.num($("rQty").value) || 1, gPer:S.num($("rGPer").value) || 0, singleHours:sh, hours:h, handlingMin:min, cFil:c.cFil, cElec:c.cElec, cMach:c.cMach, cLab:lab, total:all, sug:lastCalc && lastCalc.sug,
      inclFil:incl.fil, inclElec:incl.elec, inclMach:incl.mach, inclLab:incl.lab,
      consumed:gTotal2, note };
    S.records.unshift(rec0);
    applyMatsStock(rec0, -1); // 按明细逐项扣减库存
    S.saveRec(); S.saveMat();
    $("homeMsg").textContent = "已保存：" + (mats.length > 1 ? mats.length + " 种耗材 · 总 " + S.fmt(gTotal2,1) + "g" : m.name + " · " + S.fmt(gTotal2,1) + "g") + " · 计入成本 " + S.money(all);
    toast("记录已保存，库存已按耗材逐项扣减 " + randFace());
    fillSelects(); calc();
    if(currentTab === "records") renderRecords();
  });
  /* 取消编辑：退出编辑模式、清空表单 */
  $("cancelEditBtn").addEventListener("click", () => {
    editingRecId = null;
    $("saveBtn").textContent = "保存为打印记录";
    $("cancelEditBtn").style.display = "none";
    $("rGrams").value = ""; $("rQty").value = "1"; $("rGPer").value = ""; $("rHoursH").value = "0"; $("rHoursM").value = "0"; $("rTotHoursH").value = "0"; $("rTotHoursM").value = "0"; $("rMin").value = ""; $("rNote").value = ""; hAnchor = "single";
    $("homeMsg").textContent = "";
    applyDefaultLeadMin(); // 取消编辑后按默认处理耗时回到新打印状态
    enableSaveBtn();
    fillSelects(); calc();
    toast("已取消编辑");
  });

  /* 清除：手动清空本次打印输入（保存后不再自动清空） */
  $("clearCalcBtn").addEventListener("click", () => {
    editingRecId = null;
    $("saveBtn").textContent = "保存为打印记录";
    $("cancelEditBtn").style.display = "none";
    $("selMat").value = ""; $("selPri").value = "";
    $("rGrams").value = ""; $("rQty").value = "1"; $("rGPer").value = ""; $("rHoursH").value = "0"; $("rHoursM").value = "0"; $("rTotHoursH").value = "0"; $("rTotHoursM").value = "0"; $("rMin").value = ""; $("rNote").value = ""; hAnchor = "single";
    ["cbFil","cbElec","cbMach","cbLab"].forEach(id => $(id).checked = true);
    $("homeMsg").textContent = "";
    lastCalc = null;
    applyDefaultLeadMin(); // 清除后重新填入默认处理耗时
    enableSaveBtn();
    fillSelects(); calc();
    toast("已清除本次打印输入");
  });

  /* 去开订单：把计算器数据自动填入新增订单 */
  $("toOrderBtn").addEventListener("click", () => {
    if(!lastCalc) return;
    editingOrdId = null;
    $("ordFormTitle").textContent = "新增订单";
    $("cancelOrd").style.display = "none";
    if(!$("oNo").value && !$("oDate").value){ resetOrdForm(); }
    $("oDate").value = S.today();
    if(lastCalc.matId) $("oMat").value = lastCalc.matId;
    if(lastCalc.priId) $("oPri").value = lastCalc.priId;
    $("oG").value = lastCalc.g || "";
    $("oH").value = lastCalc.h ? Math.round(lastCalc.h * 100) / 100 : "";
    $("oMin").value = lastCalc.min || "";
    /* 同步计算器的成本计入勾选 */
    if(lastCalc.incl){
      $("ocbFil").checked = lastCalc.incl.fil;
      $("ocbElec").checked = lastCalc.incl.elec;
      $("ocbMach").checked = lastCalc.incl.mach;
      $("ocbLab").checked = lastCalc.incl.lab;
    }
    if(lastCalc.note && !$("oNote").value) $("oNote").value = lastCalc.note;
    if(lastCalc.sug > 0) $("oQuote").value = Math.ceil(lastCalc.sug); // 建议报价取整带入
    $("oStatus").value = "quote";
    orderCalc();
    toast("已把计算器数据带入订单，请确认金额");
  });

  /* ============ 订单 ============ */
  $("oStatus").innerHTML = S.STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join("");
  $("fStatus").innerHTML = '<option value="all">全部状态</option>' + S.STATUSES.map(s => `<option value="${s.key}">${s.label}</option>`).join("");

  let editingOrdId = null;
  function extRow(label, amount){
    const d = document.createElement("div"); d.className = "extras-row";
    d.innerHTML = `<input class="el" type="text" value="${S.esc(label)}" placeholder="名目（建模/运费…）" />
      <input class="ea" type="number" min="0" step="0.01" value="${S.num(amount) || ""}" placeholder="金额" />
      <button class="row-btn danger" type="button" title="删除此行"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    d.querySelector("button").addEventListener("click", () => { d.remove(); orderCalc(); });
    d.querySelectorAll("input").forEach(i => i.addEventListener("input", orderCalc));
    return d;
  }
  function getExtras(){
    return Array.from($("oExtras").children)
      .map(r => ({ label:r.querySelector(".el").value.trim(), amount:S.num(r.querySelector(".ea").value) }))
      .filter(x => x.label || x.amount);
  }
  $("addExt").addEventListener("click", () => { $("oExtras").appendChild(extRow("", 0)); });

  function payRow(date, amount, note){
    const d = document.createElement("div"); d.className = "pay-row";
    d.innerHTML = `<input class="pd" type="date" value="${S.esc(date)}" />
      <input class="pa" type="number" min="0" step="0.01" value="${S.num(amount) || ""}" placeholder="金额" />
      <input class="pn" type="text" value="${S.esc(note)}" placeholder="备注（定金/尾款…）" />
      <button class="row-btn danger" type="button" title="删除此行"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    d.querySelector("button").addEventListener("click", () => { d.remove(); orderCalc(); });
    d.querySelectorAll("input").forEach(i => i.addEventListener("input", orderCalc));
    return d;
  }
  function getPayments(){
    return Array.from($("oPayments").children)
      .map(r => ({ date:r.querySelector(".pd").value, note:r.querySelector(".pn").value.trim(), amount:S.num(r.querySelector(".pa").value) }))
      .filter(x => x.amount > 0);
  }
  $("addPay").addEventListener("click", () => { $("oPayments").appendChild(payRow(S.today(), "", "")); orderCalc(); });

  function orderCalc(){
    const m = S.matById($("oMat").value), p = S.priById($("oPri").value);
    const c = S.computePrint(m, p, $("oG").value, $("oH").value);
    const lab = S.laborCost($("oMin").value);
    const ec = getExtras().reduce((s,x) => s + x.amount, 0);
    const rv = S.sumPayments(getPayments());
    // 克重报价：克数 × 单价自动算报价；报价框为空、或尚未被手动修改（auto 标记）时写入，
    // 手改过报价后不再覆盖，清空报价框则恢复自动
    const qEl = $("oQuote");
    const qpg = S.num($("oQuotePerGram").value), grams = S.num($("oG").value);
    if(qpg > 0 && grams > 0 && (qEl.value === "" || qEl.dataset.auto !== "0")){
      qEl.value = (qpg * grams).toFixed(2);
      qEl.dataset.auto = "1";
    }
    const quote = S.num($("oQuote").value);
    /* 勾选才计入本单成本（额外成本始终计入） */
    const incl = { fil:$("ocbFil").checked, elec:$("ocbElec").checked, mach:$("ocbMach").checked, lab:$("ocbLab").checked };
    // 建议报价（按成本项各自加成比例汇总）
    const mp = S.settings.markupPct || {fil:10, elec:10, mach:10, lab:10};
    const sug = (incl.fil ? c.cFil * (1 + S.num(mp.fil) / 100) : 0)
              + (incl.elec ? c.cElec * (1 + S.num(mp.elec) / 100) : 0)
              + (incl.mach ? c.cMach * (1 + S.num(mp.mach) / 100) : 0)
              + (incl.lab ? lab * (1 + S.num(mp.lab) / 100) : 0);
    const sugParts = [];
    if(incl.fil)  sugParts.push(`耗材+${S.fmt(mp.fil, 0)}%`);
    if(incl.elec) sugParts.push(`电费+${S.fmt(mp.elec, 0)}%`);
    if(incl.mach) sugParts.push(`机器+${S.fmt(mp.mach, 0)}%`);
    if(incl.lab)  sugParts.push(`人工+${S.fmt(mp.lab, 0)}%`);
    $("oSug").textContent = sug > 0 ? S.money(sug) + "（" + sugParts.join(" ") + "）" : "—";
    const ct = (incl.fil ? c.cFil : 0) + (incl.elec ? c.cElec : 0) + (incl.mach ? c.cMach : 0) + (incl.lab ? lab : 0) + ec;
    const profit = rv - ct, due = Math.max(0, quote - rv);
    const est = quote - ct; // 预估利润 = 报价 − 成本（按报价口径）
    const big = $("oProfit");
    big.textContent = (profit < 0 ? "-" : "") + S.money(Math.abs(profit)).replace(S.settings.currency, "");
    big.className = "lcd-big " + (profit >= 0 ? "ok" : "loss");
    const estEl = $("oEst");
    estEl.textContent = (est < 0 ? "-" : "") + S.money(Math.abs(est)).replace(S.settings.currency, "");
    estEl.className = "lcd-big sub " + (est >= 0 ? "" : "loss");
    $("oPc").textContent = S.money(c.cFil);
    $("oElec").textContent = S.money(c.cElec);
    $("oMach").textContent = S.money(c.cMach);
    $("oLab").textContent = S.money(lab);
    $("ocbFil").closest(".line").classList.toggle("off", !incl.fil);
    $("ocbElec").closest(".line").classList.toggle("off", !incl.elec);
    $("ocbMach").closest(".line").classList.toggle("off", !incl.mach);
    $("ocbLab").closest(".line").classList.toggle("off", !incl.lab);
    $("oEc").textContent = S.money(ec); $("oCt").textContent = S.money(ct);
    $("oRvQ").textContent = S.money(rv) + " / " + S.money(quote);
    $("oMargin").textContent = ct > 0 ? (est / ct * 100).toFixed(1) + " %" : "—";
    $("recvTotal").textContent = S.money(rv);
    $("dueTotal").textContent = S.money(due);
    return { pc:c.cFil + c.cElec, fil:c.cFil, elec:c.cElec, mach:c.cMach, lab, incl, ec, ct, rv, quote, due, profit, est, extras:getExtras(), pays:getPayments() };
  }
  // 报价框手动输入过则停用克重自动覆盖；先于 orderCalc 注册，保证触发顺序
  $("oQuote").addEventListener("input", () => { $("oQuote").dataset.auto = "0"; });
  ["oMat","oPri","oG","oH","oMin","oQuote","oQuotePerGram","ocbFil","ocbElec","ocbMach","ocbLab"].forEach(id => $(id).addEventListener("input", orderCalc));

  function nextOrderNo(){
    const d = S.today().replace(/-/g, "");
    const pre = (S.settings.ordPrefix || "ORD").toUpperCase();
    const same = S.orders.filter(o => (o.orderNo || "").indexOf(pre + "-" + d) === 0);
    return pre + "-" + d + "-" + String(same.length + 1).padStart(3, "0");
  }
  function resetOrdForm(){
    editingOrdId = null;
    $("ordFormTitle").textContent = "新增订单";
    $("cancelOrd").style.display = "none"; $("ordFormBody").style.display = "";
    $("oNo").value = ""; $("oDate").value = S.today(); $("oStatus").value = "quote";
    $("oWx").value = ""; $("oName").value = ""; $("oQuote").value = "";
    $("oQuote").dataset.auto = ""; $("oQuotePerGram").value = "";
    $("oMat").value = ""; $("oPri").value = ""; $("oG").value = ""; $("oH").value = ""; $("oMin").value = "";
    ["ocbFil","ocbElec","ocbMach","ocbLab"].forEach(id => $(id).checked = true);
    $("oExtras").innerHTML = ""; ["建模","运费","包装","其他"].forEach(l => $("oExtras").appendChild(extRow(l, 0)));
    $("oPayments").innerHTML = ""; $("oPayments").appendChild(payRow(S.today(), "", ""));
    $("oFName").value = ""; $("oFSize").value = ""; $("oFNote").value = ""; $("oNote").value = "";
    $("ordMsg").textContent = ""; orderCalc();
  }
    $("clearOrdBtn").addEventListener("click", () => { resetOrdForm(); toast("已清除订单表单"); });
  $("cancelOrd").addEventListener("click", resetOrdForm);

  $("saveOrd").addEventListener("click", () => {
    if(!$("oDate").value){ toast("请选择订单日期（必填）"); $("oDate").focus(); return; }
    if(S.num($("oQuote").value) <= 0){ toast("请填写报价金额（必填，欠款跟踪依赖它）"); $("oQuote").focus(); return; }
    const c = orderCalc();
    const no = $("oNo").value.trim() || nextOrderNo();
    const m = S.matById($("oMat").value), p = S.priById($("oPri").value);
    const rec = {
      id: editingOrdId || S.uid(), orderNo:no, date:$("oDate").value || S.today(),
      status:$("oStatus").value,
      wechat:$("oWx").value.trim(), custName:$("oName").value.trim(), quote:c.quote,
      materialId:m ? m.id : null, matName:m ? m.name : null, matColor:m ? m.color : null,
      printerId:p ? p.id : null, priName:p ? p.name : null,
      grams:S.num($("oG").value), hours:S.num($("oH").value), handlingMin:S.num($("oMin").value),
      printCost:(c.incl.fil ? c.fil : 0) + (c.incl.elec ? c.elec : 0) + (c.incl.mach ? c.mach : 0) + (c.incl.lab ? c.lab : 0),
      inclFil:c.incl.fil, inclElec:c.incl.elec, inclMach:c.incl.mach, inclLab:c.incl.lab,
      extras:c.extras, extraCost:c.ec, totalCost:c.ct, cFil:c.fil, cElec:c.elec, cMach:c.mach, cLab:c.lab,
      received:c.rv, payments:c.pays, profit:c.profit,
      modelFile:{ name:$("oFName").value.trim(), size:$("oFSize").value.trim(), note:$("oFNote").value.trim() },
      note:$("oNote").value.trim(),
      updated:Date.now(), created: editingOrdId ? undefined : Date.now()
    };
    if(editingOrdId){
      const i = S.orders.findIndex(o => o.id === editingOrdId);
      if(i >= 0) S.orders[i] = Object.assign(S.orders[i], rec, { created:S.orders[i].created });
    } else S.orders.unshift(rec);
    S.saveOrd();
    toast((editingOrdId ? "已更新：" : "已保存：") + no + (rec.profit >= 0 ? " " + randFace() : "（这单亏了，下次报高点呀）"));
    const newAch = checkAch();
    if(!editingOrdId) resetOrdForm();
    renderOrders();
    if(newAch.length) setTimeout(() => toast("🏆 解锁成就：" + newAch.join("、")), 900);
  });

  /* 筛选 */
  const filt = { q:"", status:"all", sort:"date-desc", from:"", to:"" };
  $("fSearch").addEventListener("input", () => { filt.q = $("fSearch").value.trim().toLowerCase(); renderOrdList(); });
  $("fStatus").addEventListener("change", () => { filt.status = $("fStatus").value; renderOrdList(); });
  $("fSort").addEventListener("change", () => { filt.sort = $("fSort").value; renderOrdList(); });
  const fPick = initRangePicker("fRange", "fFrom", "fTo");
  $("fFrom").addEventListener("change", () => { filt.from = $("fFrom").value; renderOrdList(); });
  $("fTo").addEventListener("change", () => { filt.to = $("fTo").value; renderOrdList(); });
  $("fClear").addEventListener("click", () => {
    Object.assign(filt, { q:"", status:"all", sort:"date-desc", from:"", to:"" });
    $("fSearch").value = ""; $("fStatus").value = "all"; $("fSort").value = "date-desc";
    $("fFrom").value = ""; $("fTo").value = "";
    if(fPick) fPick.sync();
    renderOrdList();
  });

  function summaryText(o){
    const st = S.stOf(o.status);
    const lines = [
      "订单 " + (o.orderNo || "") + " · " + st.label,
      "日期：" + (o.date || ""),
      (o.custName ? "客户：" + o.custName : "") + (o.matName ? "\n耗材：" + o.matName + (o.grams ? " × " + S.fmt(o.grams, 1) + "g" : "") : ""),
      "报价：" + S.money(o.quote), "已收：" + S.money(o.received),
      (S.orderDue(o) > 0 ? "待收：" + S.money(S.orderDue(o)) : ""),
      "总成本：" + S.money(o.totalCost),
      "预估利润（报价−成本）：" + S.money(S.num(o.quote) - S.num(o.totalCost)),
      "实时利润（已收−成本）：" + S.money(S.num(o.received) - S.num(o.totalCost)),
      (o.note ? "备注：" + o.note : "")
    ];
    return lines.filter(Boolean).join("\n");
  }
  function copyText(t){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t).then(() => toast("订单摘要已复制，可直接发给客户"), () => fallbackCopy(t));
    } else fallbackCopy(t);
  }
  function fallbackCopy(t){
    const ta = document.createElement("textarea"); ta.value = t;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); toast("订单摘要已复制"); }catch(e){ toast("复制失败，请手动复制"); }
    document.body.removeChild(ta);
  }

  function renderOrdList(){
    let list = S.orders.slice();
    if(filt.status !== "all") list = list.filter(o => o.status === filt.status);
    if(filt.from) list = list.filter(o => (o.date || "") >= filt.from);
    if(filt.to) list = list.filter(o => (o.date || "") <= filt.to);
    if(filt.q){
      list = list.filter(o => [o.orderNo, o.wechat, o.custName, o.note, o.matName, o.modelFile && o.modelFile.name]
        .some(v => String(v || "").toLowerCase().includes(filt.q)));
    }
    const sorters = {
      "date-desc": (a,b) => String(b.date).localeCompare(String(a.date)) || (b.updated || 0) - (a.updated || 0),
      "date-asc": (a,b) => String(a.date).localeCompare(String(b.date)),
      "profit-desc": (a,b) => (S.num(b.received) - S.num(b.totalCost)) - (S.num(a.received) - S.num(a.totalCost)),
      "due-desc": (a,b) => S.orderDue(b) - S.orderDue(a)
    };
    list.sort(sorters[filt.sort] || sorters["date-desc"]);
    $("ordCount").textContent = "共 " + list.length + " 单";
    const box = $("ordList");
    if(!list.length){
      box.innerHTML = '<div class="empty">' + (S.orders.length ? "没有符合筛选条件的订单" : "还没有订单<br><span class=\"hint\">展开上方表单，开出第一单</span>") + "</div>";
      return;
    }
    box.innerHTML = list.map(o => {
      const st = S.stOf(o.status), profit = S.num(o.received) - S.num(o.totalCost), due = S.orderDue(o);
      const est = S.num(o.quote) - S.num(o.totalCost); // 预估利润 = 报价 − 成本
      const mf = o.modelFile && o.modelFile.name ? `📎 ${S.esc(o.modelFile.name)}${o.modelFile.size ? " (" + S.esc(o.modelFile.size) + ")" : ""}` : "";
      return `<div class="ord">
        <div class="top"><span class="no">${S.esc(o.orderNo)}</span>
          <span class="badge" style="--bc:${st.color}"><i></i>${st.label}</span></div>
        <div class="meta"><span>📅 ${S.esc(o.date)}</span>
          ${o.wechat ? `<span>💬 ${S.esc(o.wechat)}</span>` : ""}${o.custName ? `<span>🙋 ${S.esc(o.custName)}</span>` : ""}</div>
        ${mf ? `<div class="meta">${mf}${o.modelFile.note ? " · " + S.esc(o.modelFile.note) : ""}</div>` : ""}
        ${(o.payments && o.payments.length > 1) ? `<div class="meta">💰 ${o.payments.map(p => S.esc(p.note || "收款") + " " + S.money(p.amount)).join(" · ")}</div>` : ""}
        <div class="nums">
          <span>报价 <b>${S.money(o.quote)}</b></span>
          <span>已收 <b>${S.money(o.received)}</b></span>
          ${due > 0 ? `<span class="loss">待收 <b>${S.money(due)}</b></span>` : ""}
          <span>成本 <b>${S.money(o.totalCost)}</b></span>
          <span class="${est >= 0 ? "tot" : "loss"}">预估 <b>${S.money(est)}</b></span>
          <span class="${profit >= 0 ? "tot" : "loss"}">利润 <b>${S.money(profit)}</b></span>
        </div>
        ${o.note ? `<div class="meta">📝 ${S.esc(o.note)}</div>` : ""}
        <div class="acts">
          <select class="ost" data-id="${o.id}">
            ${S.STATUSES.map(s => `<option value="${s.key}" ${s.key === o.status ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
          <button class="btn ghost sm" data-copy="${o.id}">复制摘要</button>
          <button class="btn ghost sm" data-edito="${o.id}">编辑</button>
          <button class="btn danger ghost sm" data-delo="${o.id}">删除</button>
        </div></div>`;
    }).join("");
    box.querySelectorAll(".ost").forEach(sel => sel.addEventListener("change", () => {
      const o = S.orders.find(x => x.id === sel.getAttribute("data-id"));
      if(o){ o.status = sel.value; o.updated = Date.now(); S.saveOrd(); renderOrders(); toast("状态已更新：" + S.stOf(o.status).label); }
    }));
    box.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", () => {
      const o = S.orders.find(x => x.id === b.getAttribute("data-copy")); if(o) copyText(summaryText(o));
    }));
    box.querySelectorAll("[data-edito]").forEach(b => b.addEventListener("click", () => editOrder(b.getAttribute("data-edito"))));
    box.querySelectorAll("[data-delo]").forEach(b => b.addEventListener("click", async () => {
      if(await confirmBox("删除该订单？删除后不可恢复.")){
        const i = S.orders.findIndex(x => x.id === b.getAttribute("data-delo"));
        if(i >= 0) S.orders.splice(i, 1);
        S.saveOrd(); renderOrders(); toast("已删除");
      }
    }));
  }

  function renderOrders(){
    const st = S.orderStats();
    $("ordStats").innerHTML = [
      ["订单总数", String(st.count), "已取消不计", "", ""],
      ["累计营收", S.money(st.rev), "报价 " + S.money(st.quote), "", ""],
      ["待收款", S.money(st.due), st.due > 0 ? "有未结订单" : "已结清", st.due > 0 ? "down" : "up", ""],
      ["累计利润", S.money(st.profit), "利润率 " + (st.margin > 0 ? st.margin.toFixed(1) : 0) + " %", st.profit >= 0 ? "up" : "down", ""]
    ].map(([k, v, s, cls]) => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`).join("");
    renderOrdList();
  }

  function editOrder(id){
    const o = S.orders.find(x => x.id === id); if(!o) return;
    editingOrdId = id;
    $("ordFormTitle").textContent = "编辑订单 · " + (o.orderNo || "");
    $("cancelOrd").style.display = ""; $("ordFormBody").style.display = "";
    goto("order");
    $("oNo").value = o.orderNo || ""; $("oDate").value = o.date || S.today(); $("oStatus").value = o.status || "quote";
    $("oWx").value = o.wechat || ""; $("oName").value = o.custName || ""; $("oQuote").value = S.num(o.quote) || "";
    $("oQuote").dataset.auto = ""; // 编辑载入后允许克重报价覆盖
    $("oPayments").innerHTML = "";
    if(o.payments && o.payments.length) o.payments.forEach(p => $("oPayments").appendChild(payRow(p.date || S.today(), p.amount, p.note)));
    else if(S.num(o.received) > 0) $("oPayments").appendChild(payRow(o.date || S.today(), o.received, ""));
    else $("oPayments").appendChild(payRow(S.today(), "", ""));
    $("oMat").value = o.materialId || ""; $("oPri").value = o.printerId || "";
    $("oG").value = o.grams || ""; $("oH").value = o.hours || ""; $("oMin").value = o.handlingMin || "";
    /* 编辑时还原计入勾选（旧数据无标志视为全计入） */
    $("ocbFil").checked = o.inclFil !== false;
    $("ocbElec").checked = o.inclElec !== false;
    $("ocbMach").checked = o.inclMach !== false;
    $("ocbLab").checked = o.inclLab !== false;
    $("oExtras").innerHTML = "";
    (o.extras && o.extras.length ? o.extras : [{ label:"建模", amount:0 }]).forEach(e => $("oExtras").appendChild(extRow(e.label, e.amount)));
    const mf = o.modelFile || {};
    $("oFName").value = mf.name || ""; $("oFSize").value = mf.size || ""; $("oFNote").value = mf.note || ""; $("oNote").value = o.note || "";
    orderCalc();
    $("ordFormBody").scrollIntoView({ behavior:"smooth", block:"start" });
  }

  /* ============ 耗材 ============ */
  let editingMatId = null;
  function resetMatForm(){
    editingMatId = null;
    $("matFormTitle").textContent = "添加耗材";
    $("addMat").textContent = "添加耗材";
    $("cancelEditMat").style.display = "none";
    $("mBrand").value = ""; $("mType").value = ""; $("mColorName").value = ""; $("mPrice").value = "";
    $("mColor").value = "#ffb02e";
    $("mSpool").value = "1000"; $("mRemain").value = "1000";
    document.querySelectorAll(".sw-p").forEach(x => x.classList.remove("on"));
  }
  function editMat(id){
    const m = S.matById(id); if(!m) return;
    editingMatId = id;
    $("matFormTitle").textContent = "编辑耗材 · " + m.name;
    $("addMat").textContent = "保存修改";
    $("cancelEditMat").style.display = "";
    $("mBrand").value = m.brand || ""; $("mType").value = m.type || "";
    $("mColor").value = m.color || "#ffb02e"; $("mColorName").value = m.colorName || "";
    $("mPrice").value = S.num(m.pricePerKg) || "";
    $("mSpool").value = S.num(m.spool) || 1000; $("mRemain").value = S.num(m.remaining) || 0;
    document.querySelectorAll(".sw-p").forEach(x => x.classList.toggle("on", x.getAttribute("data-c") === (m.color || "").toLowerCase()));
    document.querySelector("#page-mats .card").scrollIntoView({ behavior:"smooth", block:"start" });
  }
    $("clearMatBtn").addEventListener("click", () => { resetMatForm(); toast("已清除耗材表单"); });
  $("cancelEditMat").addEventListener("click", resetMatForm);
  $("addMat").addEventListener("click", () => {
    const brand = $("mBrand").value.trim(), type = $("mType").value.trim();
    if(!type){ toast("请填写耗材类型（必填）"); $("mType").focus(); return; }
    const price = S.num($("mPrice").value);
    if(price <= 0){ toast("请填写材料单价（必填，成本计算依赖它）"); $("mPrice").focus(); return; }
    const spool = Math.max(0, S.num($("mSpool").value));
    const fields = { brand, type, color:$("mColor").value, colorName:$("mColorName").value.trim(),
      pricePerKg:price, spool, remaining:Math.min(spool, S.num($("mRemain").value) || spool) };
    if(editingMatId){
      const m = S.matById(editingMatId);
      if(m){ Object.assign(m, fields); m.name = S.matLabel(m); toast("耗材已更新：" + m.name); }
    }else{
      const m = Object.assign({ id:S.uid() }, fields);
      m.name = S.matLabel(m);
      S.materials.push(m);
      toast("耗材已添加");
    }
    S.saveMat();
    if(!editingMatId) resetMatForm(); // 新增后清空便于继续添加；编辑保存后保留选项
    renderMaterials(); fillSelects(); calc();
  });
  function renderMaterials(){
    const box = $("matList");
    if(!S.materials.length){ box.innerHTML = '<div class="empty">还没有耗材<br><span class="hint">在上方添加第一卷料</span></div>'; return; }
    box.innerHTML = `<table><thead><tr><th>耗材</th><th>颜色</th><th class="num">价格(元/kg)</th><th style="min-width:130px">库存</th><th class="num">剩余</th><th></th></tr></thead><tbody>` +
      S.materials.map(m => {
        const rem = S.num(m.remaining), spool = Math.max(1, S.num(m.spool)), pct = Math.min(100, rem / spool * 100);
        const low = S.num(S.settings.lowStock) > 0 && rem <= S.num(S.settings.lowStock);
        const cls = low ? "low" : (pct < 35 ? "mid" : "ok");
        return `<tr>
          <td><span class="sw" style="background:${S.esc(m.color)}"></span>${S.esc(m.name)}${low ? ' <span class="badge" style="--bc:var(--danger)"><i></i>低库存</span>' : ""}</td>
          <td><span class="pill">${S.esc(m.colorName || m.type)}</span></td>
          <td class="num">${S.fmt(m.pricePerKg, 2)}</td>
          <td><div class="stock"><i class="${cls}" style="width:${pct.toFixed(1)}%"></i></div><div class="hint">${S.fmt(rem, 0)} / ${S.fmt(spool, 0)} g</div></td>
          <td class="num">${S.fmt(rem, 0)} g</td>
          <td style="white-space:nowrap">
            <button class="btn ghost sm" data-editm="${m.id}">编辑</button>
            <button class="btn ghost sm" data-refill="${m.id}">补货</button>
            <button class="btn danger ghost sm" data-delm="${m.id}">删除</button>
          </td></tr>`;
      }).join("") + "</tbody></table>";
    box.querySelectorAll("[data-editm]").forEach(b => b.addEventListener("click", () => editMat(b.getAttribute("data-editm"))));
    box.querySelectorAll("[data-refill]").forEach(b => b.addEventListener("click", async () => {
      const m = S.matById(b.getAttribute("data-refill")); if(!m) return;
      const v = await promptBox("「" + m.name + "」补货了多少克？（整卷一般为 " + S.fmt(m.spool, 0) + "g）", S.fmt(m.spool, 0));
      if(v == null) return;
      m.remaining = Math.min(S.num(m.spool), S.num(m.remaining) + S.num(v));
      S.saveMat(); renderMaterials(); fillSelects(); toast("已补货，剩余 " + S.fmt(m.remaining, 0) + "g");
    }));
    box.querySelectorAll("[data-delm]").forEach(b => b.addEventListener("click", async () => {
      const m = S.matById(b.getAttribute("data-delm")); if(!m) return;
      if(await confirmBox("删除耗材「" + m.name + "」？已有记录不受影响。")){
        const i = S.materials.indexOf(m);
        if(i >= 0) S.materials.splice(i, 1);
        S.saveMat(); renderMaterials(); fillSelects(); calc();
      }
    }));
  }

  /* ============ 拓竹同步（局域网 / 拓竹云 AMS → 耗材库） ============
     服务端经 MQTT 读取 AMS 托盘快照（访问码/token 只存服务端）；
     前端按 uuid（RFID）或 类型+颜色 匹配已有耗材，更新库存或新建。 */
  const bambuState = { cfg:{ lan:[], cloud:{} }, snap:null, mode:"lan", loginMode:"sms" }; // mode：连接方式（局域网/云二选一）；loginMode：云登录方式（短信/密码）
  function canUseBambu(){ return S.mode === "server"; }
  function bambuCfgMsg(msg, bad){
    const el = $("bambuCfgMsg");
    el.textContent = msg || "";
    el.classList.toggle("bad", !!bad);
  }
  /* 模式切换：选哪个模式只显示哪个的表单，同步也只走该模式（另一模式的配置保留但不使用） */
  function setBambuMode(mode){
    bambuState.mode = mode === "cloud" ? "cloud" : "lan";
    document.querySelectorAll("#bambuModeSeg button").forEach(b =>
      b.classList.toggle("on", b.getAttribute("data-mode") === bambuState.mode));
    $("bambuLanSection").hidden = bambuState.mode !== "lan";
    $("bambuCloudSection").hidden = bambuState.mode !== "cloud";
    $("bambuCloudLoginBtn").hidden = bambuState.mode !== "cloud";
  }
  /* 连接方式摘要（耗材页状态与设置页卡片头共用） */
  function bambuDesc(){
    const cfg = bambuState.cfg || {}, cloud = cfg.cloud || {};
    if((cfg.mode || "lan") === "cloud"){
      return (cloud.email || cloud.hasToken)
        ? "拓竹云" + (cloud.email ? "（" + cloud.email + "）" : "")
        : "拓竹云模式 · 未登录";
    }
    const n = (cfg.lan || []).length;
    return n ? n + " 台局域网打印机" : "局域网模式 · 未添加打印机";
  }
  function renderBambuStatus(){
    const cfgEl = $("bambuCfgStatus"), atEl = $("bambuFetchedAt");
    if(!canUseBambu()){
      if(cfgEl) cfgEl.textContent = "本地模式不可用";
      return;
    }
    const last = bambuState.cfg && bambuState.cfg.last && bambuState.cfg.last.fetchedAt
      ? " · 上次抓取 " + new Date(bambuState.cfg.last.fetchedAt).toLocaleString("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "";
    if(cfgEl) cfgEl.textContent = bambuDesc() + last;
    if(atEl) atEl.textContent = bambuState.cfg && bambuState.cfg.last && bambuState.cfg.last.fetchedAt
      ? "上次抓取 " + new Date(bambuState.cfg.last.fetchedAt).toLocaleString("zh-CN", { month:"numeric", day:"numeric", hour:"2-digit", minute:"2-digit" }) : "";
  }
  async function loadBambu(){
    const card = $("bambuCfgCard");
    if(!canUseBambu()){
      if(card) card.hidden = true;
      return renderBambuStatus();
    }
    try{ bambuState.cfg = await S.bambuGet(); }
    catch(e){ bambuState.cfg = { lan:[], cloud:{} }; }
    if(card) card.hidden = false;
    setBambuMode((bambuState.cfg && bambuState.cfg.mode) === "cloud" ? "cloud" : "lan");
    renderBambuLanRows();
    renderBambuStatus();
  }
  /* ---- 连接配置 ---- */
  function bambuLanRow(r){
    r = r || {};
    const d = document.createElement("div");
    d.className = "extras-row bambu-lan";
    d.dataset.id = r.id || "";
    d.innerHTML = `<input class="bl-name" type="text" placeholder="备注（可选）" value="${S.esc(r.name || "")}" />
      <input class="bl-host" type="text" placeholder="打印机 IP，如 192.168.1.66" value="${S.esc(r.host || "")}" />
      <input class="bl-code" type="password" placeholder="${r.hasCode ? "已保存 · 留空不修改" : "局域网访问码"}" autocomplete="new-password" />
      <button class="row-btn danger" type="button" title="删除此行"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`;
    d.querySelector("button").addEventListener("click", () => {
      d.remove();
      if(!$("bambuLanList").children.length) $("bambuLanList").appendChild(bambuLanRow());
    });
    return d;
  }
  function renderBambuLanRows(){
    const box = $("bambuLanList"); box.innerHTML = "";
    ((bambuState.cfg && bambuState.cfg.lan) || []).forEach(r => box.appendChild(bambuLanRow(r)));
    if(!box.children.length) box.appendChild(bambuLanRow());
  }
  $("bambuLanAdd").addEventListener("click", () => {
    $("bambuLanList").appendChild(bambuLanRow());
    const rows = $("bambuLanList").children;
    const last = rows[rows.length - 1];
    if(last) last.querySelector(".bl-host").focus();
  });
  function collectBambuCfg(){
    const payload = { mode: bambuState.mode };
    if(bambuState.mode === "lan"){
      payload.lan = [];
      Array.from($("bambuLanList").children).forEach(d => {
        const row = {
          id: d.dataset.id || "",
          name: d.querySelector(".bl-name").value.trim(),
          host: d.querySelector(".bl-host").value.trim()
        };
        const code = d.querySelector(".bl-code").value.trim();
        if(code) row.code = code; // 留空 = 服务端保留原访问码
        if(row.host || row.name || code) payload.lan.push(row);
      });
      // 云字段不上送 → 服务端保留原值（切换模式后不丢配置）
    }else{
      const cloud = {
        region: $("bambuCloudRegion").value,
        email: $("bambuCloudEmail").value.trim()
      };
      if($("bambuCloudPass").value) cloud.password = $("bambuCloudPass").value;
      if($("bambuCloudToken").value.trim()) cloud.token = $("bambuCloudToken").value.trim();
      payload.cloud = cloud;
      // lan 不上送 → 服务端保留原列表
    }
    return payload;
  }
  $("bambuModeSeg").addEventListener("click", e => {
    const b = e.target.closest("button[data-mode]"); if(!b) return;
    setBambuMode(b.getAttribute("data-mode"));
    if(bambuState.mode === "lan") renderBambuLanRows();
    bambuCfgMsg("");
  });
  $("bambuCfgSave").addEventListener("click", async () => {
    const btn = $("bambuCfgSave");
    const payload = collectBambuCfg();
    if(payload.mode === "lan"){
      if(!payload.lan.some(p => p.host)){ bambuCfgMsg("请至少填写一台打印机的 IP 地址", true); return; }
    }else if(!payload.cloud.email && !payload.cloud.token){
      bambuCfgMsg("请填写拓竹账号（手机号或邮箱，或直接粘贴 accessToken）", true); return;
    }
    btn.disabled = true;
    try{
      const d = await S.bambuSave(payload);
      if(d.config) bambuState.cfg = d.config;
      renderBambuLanRows(); renderBambuStatus();
      $("bambuCloudPass").value = ""; $("bambuCloudToken").value = "";
      bambuCfgMsg("连接配置已保存（访问码 / token 只保存在服务端，不会回传浏览器）");
      toast("拓竹连接配置已保存");
    }catch(e){ bambuCfgMsg(e.message, true); }
    finally{ btn.disabled = false; }
  });
  /* 拓竹云登录（参考拓竹设备管理类应用的通用交互）：
     登录方式二选一 —— 手机短信（手机号 + 短信验证码）或 账号密码；
     密码登录被要求验证时自动切到短信方式填码；2FA 账号填动态验证码（无需发码）。
     accessToken 粘贴后「保存连接配置」即可，作为风控兜底。 */
  function bambuAccountKind(v){
    const s = String(v || "").trim();
    if(/@/.test(s)) return "email";
    if(/^\+?\d{5,15}$/.test(s)) return "phone";
    return "invalid";
  }
  function setBambuLoginMode(lm){
    bambuState.loginMode = lm === "password" ? "password" : "sms";
    document.querySelectorAll("#bambuLoginSeg button").forEach(b =>
      b.classList.toggle("on", b.getAttribute("data-lm") === bambuState.loginMode));
    const sms = bambuState.loginMode === "sms";
    $("bambuSmsRow").hidden = !sms;
    $("bambuPwRow").hidden = sms;
    $("bambuAccountLabel").textContent = sms ? "手机号" : "账号（手机号 / 邮箱）";
    $("bambuCloudEmail").placeholder = sms ? "手机号" : "手机号或邮箱";
    $("bambuCloudEmail").setAttribute("inputmode", sms ? "tel" : "text");
    $("bambuCloudLoginBtn").textContent = sms ? "验证并登录" : "登录拓竹云";
    $("bambuCodeLabel").textContent = sms ? "短信验证码" : "验证码";
    $("bambuCodeHint").textContent = sms ? "点击「获取验证码」后查收手机短信" : "密码登录被要求验证时，点击「获取验证码」（邮箱账号收邮件）";
    // 切换方式时复位发码按钮（取消进行中的倒计时）
    clearTimeout(bambuCodeTimer);
    $("bambuCodeSend").disabled = false;
    $("bambuCodeSend").textContent = "获取验证码";
  }
  $("bambuLoginSeg").addEventListener("click", e => {
    const b = e.target.closest("button[data-lm]"); if(!b) return;
    setBambuLoginMode(b.getAttribute("data-lm"));
    bambuCfgMsg("");
  });
  let bambuCodeTimer = null;
  function bambuCodeCountdown(){
    const btn = $("bambuCodeSend");
    let left = 60;
    btn.disabled = true;
    btn.textContent = left + "s";
    clearTimeout(bambuCodeTimer);
    const tick = () => {
      btn.textContent = (--left) + "s";
      if(left > 0){ bambuCodeTimer = setTimeout(tick, 1000); }
      else { btn.disabled = false; btn.textContent = "获取验证码"; }
    };
    bambuCodeTimer = setTimeout(tick, 1000);
  }
  $("bambuCodeSend").addEventListener("click", async () => {
    const account = $("bambuCloudEmail").value.trim();
    if(bambuAccountKind(account) === "invalid"){ bambuCfgMsg("请先填写正确的手机号或邮箱", true); return; }
    const btn = $("bambuCodeSend");
    btn.disabled = true; btn.textContent = "发送中…";
    try{
      const d = await S.bambuCloudLogin({ region: $("bambuCloudRegion").value, email: account, sendCode: true });
      if(!d.channel){ // 旧版服务端没有发码接口，会把该请求当配置保存
        btn.disabled = false; btn.textContent = "获取验证码";
        bambuCfgMsg("服务端版本较旧（不支持短信验证码）：请重启服务（npm start 或 docker compose up -d --build）并强刷页面后重试", true);
        return;
      }
      bambuCodeCountdown();
      bambuCfgMsg(d.channel === "sms" ? "验证码已短信发送到该手机号，收到后填入再点「验证并登录」" : "该账号是邮箱：验证码已发送到邮箱，收到后填入再点「验证并登录」");
      $("bambuCloudCode").focus();
    }catch(e){
      btn.disabled = false; btn.textContent = "获取验证码";
      bambuCfgMsg(e.message, true);
    }
  });
  $("bambuCloudLoginBtn").addEventListener("click", async () => {
    const btn = $("bambuCloudLoginBtn");
    const account = $("bambuCloudEmail").value.trim();
    const password = $("bambuCloudPass").value;
    const code = $("bambuCloudCode").value.trim();
    const lm = bambuState.loginMode || "sms"; // 兜底：旧状态缺省按短信方式处理
    if(bambuAccountKind(account) === "invalid"){ bambuCfgMsg("请先填写正确的手机号或邮箱", true); return; }
    if(lm === "sms" && !code){ bambuCfgMsg("请先点击「获取验证码」，收到后填写验证码", true); return; }
    if(lm === "password" && !password){ bambuCfgMsg("请填写密码后点「登录拓竹云」；或切换到「手机短信」方式用验证码登录", true); return; }
    btn.disabled = true; bambuCfgMsg("正在登录拓竹云…");
    try{
      const d = await S.bambuCloudLogin({
        region: $("bambuCloudRegion").value, email: account,
        password: lm === "password" ? password : undefined,
        code: code || undefined,
        tfaKey: $("bambuTfaKey").value || undefined
      });
      if(d.needCode){
        $("bambuTfaKey").value = d.tfaKey || "";
        if(d.tfaKey){ // 2FA：动态验证码无需点「获取验证码」
          setBambuLoginMode("sms");
          $("bambuCodeSend").disabled = true;
          $("bambuCodeSend").textContent = "无需发码";
          $("bambuCodeHint").textContent = "该账号开启了 2FA：请输入 Authenticator / 恢复码等动态验证码";
          bambuCfgMsg("该账号开启了 2FA，请填写动态验证码后点「验证并登录」");
        }else{
          setBambuLoginMode("sms");
          bambuCfgMsg("该账号需要验证：请点「获取验证码」，收到短信后填入再点「验证并登录」");
        }
        $("bambuCloudCode").focus();
        return;
      }
      if(d.config) bambuState.cfg = d.config;
      renderBambuLanRows(); renderBambuStatus();
      $("bambuCloudPass").value = ""; $("bambuCloudCode").value = ""; $("bambuTfaKey").value = "";
      $("bambuCodeSend").disabled = false; $("bambuCodeSend").textContent = "获取验证码";
      $("bambuCodeHint").textContent = "点击「获取验证码」后查收手机短信";
      setBambuLoginMode("sms");
      bambuCfgMsg("拓竹云登录成功，accessToken 已保存到服务端");
      toast("拓竹云已登录");
    }catch(e){ bambuCfgMsg(e.message, true); }
    finally{ btn.disabled = false; }
  });
  $("bambuCfgClear").addEventListener("click", async () => {
    if(!(await confirmBox("清除全部拓竹连接配置（含两种模式的已存配置）？"))) return;
    try{
      await S.bambuClear();
      bambuState.cfg = { lan:[], cloud:{} };
      renderBambuLanRows(); renderBambuStatus();
      bambuCfgMsg("已清除全部连接配置");
      $("bambuPrinterBox").hidden = true;
      $("bambuTrayBox").hidden = true;
      $("bambuReFetch").hidden = true;
    }catch(e){ bambuCfgMsg(e.message, true); }
  });
  /* ---- 抓取与同步（打印机 + 耗材） ---- */
  const BAMBU_POWER_EST = { "X1C":130, "X1E":150, "X1":130, "P1S":110, "P1P":100, "A1":110, "A1 MINI":75 }; // 打印功率经验均值，可改
// 常见色兜底：预设配色里没有的托盘色（纯白/灰/粉等）也能读出颜色名
  const COLOR_FALLBACK = { "#FFFFFF":"白", "#898989":"太空灰", "#F55A74":"樱花粉", "#FF0F0F":"中国红", "#000000":"曜石黑" };
  function guessColorName(hex){
    if(!hex) return "";
    const m = S.presets().matColorHex || {};
    const up = hex.toUpperCase();
    for(const k in m){ if(String(m[k] || "").toUpperCase() === up) return k; }
    return COLOR_FALLBACK[up] || "";
  }
  function trayLabel(t){
    if(t.name) return String(t.name).trim(); // 打印机端自定义名优先（tray_name / tray_id_name）
    const parts = [t.brand, t.type, t.color ? (guessColorName(t.color) || t.color) : ""].filter(Boolean);
    if(parts.length >= 2) return parts.join(" "); // 品牌 + 类型 + 颜色（通常 ≥2 项）
    // 云端 brand 为空时至少保留类型+颜色；实在啥都没有才兜底
    return (t.type || t.color ? [t.type, t.color ? (guessColorName(t.color) || t.color) : ""].filter(Boolean).join(" ") : "未知耗材");
  }
  function matchBambuTray(t, devId, taken){
    const takenIds = taken || new Set();
    // ① 已绑定：用户手动把托盘绑定到材料库记录（按设备+槽位）
    if(devId && t.slot){
      const byBind = S.materials.find(x => x.bambuDevId === devId && x.bambuSlot === t.slot);
      if(byBind){ takenIds.add(byBind.id); return { m: byBind, how:"bind" }; }
    }
    if(t.uuid){
      const byUuid = S.materials.find(x => x.bambuUuid === t.uuid);
      if(byUuid){ takenIds.add(byUuid.id); return { m: byUuid, how:"uuid" }; }
    }
    const tt = String(t.type || "").toLowerCase().trim(), cc = String(t.color || "").toUpperCase();
    const typeEq = x => String(x.type || "").toLowerCase().trim() === tt;
    const typeNear = x => { // 拓竹常报大类（PLA），平台类型更细（PLA Basic）：前后缀任一匹配
      const xt = String(x.type || "").toLowerCase().trim();
      return tt && xt && (xt.startsWith(tt) || tt.startsWith(xt));
    };
    // ② 用户自建耗材优先：同类型自建记录未绑定其它槽位、本轮未占用时优先匹配（无 RFID 时托盘色不可靠）
    if(tt){
      const self = S.materials.filter(x => typeNear(x) && !x.bambuSyncedAt
        && !(x.bambuDevId && x.bambuSlot) && !takenIds.has(x.id));
      if(self.length === 1){ takenIds.add(self[0].id); return { m: self[0], how:"type" }; }
    }
    // ③ 精确匹配：类型+颜色 或 相近类型+颜色（含历史同步的拓竹记录）
    const byPair = S.materials.find(x => typeEq(x) && String(x.color || "").toUpperCase() === cc)
      || S.materials.find(x => typeNear(x) && String(x.color || "").toUpperCase() === cc);
    if(byPair){ takenIds.add(byPair.id); return { m: byPair, how:"pair" }; }
    return { m: null, how:"none" };
  }
  /* 手动绑定托盘 → 材料库记录；绑定写入材料字段并持久化（服务端材料库） */
  function bambuBindTray(devId, slot, mid){
    let changed = false;
    S.materials.forEach(x => {
      if(x.bambuDevId === devId && x.bambuSlot === slot && x.id !== mid){
        delete x.bambuDevId; delete x.bambuSlot; changed = true;
      }
      if(mid && x.id === mid){
        x.bambuDevId = devId; x.bambuSlot = slot; changed = true;
      }
    });
    if(changed){ S.saveMat(); }
    return changed;
  }
  /* 扁平设备列表（打印机同步用） */
  function bambuDevices(){
    const snap = bambuState.snap; if(!snap) return [];
    const out = [];
    snap.sources.forEach(src => (src.devices || []).forEach(d =>
      out.push(Object.assign({ srcKind: src.kind, srcOk: src.ok }, d))));
    return out;
  }
  function matchBambuPrinter(d){
    const model = String(d.devModel || "").toLowerCase().trim();
    const name = String(d.devName || "").toLowerCase().trim();
    if(model){
      const byModel = S.printers.find(x => String(x.model || "").toLowerCase().trim() === model);
      if(byModel) return byModel;
    }
    if(name){
      const byName = S.printers.find(x => String(x.name || "").toLowerCase() === name
        || String(x.model || "").toLowerCase() === name);
      if(byName) return byName;
    }
    return null;
  }
  async function bambuFetchSnap(){
    const btn = $("bambuBtnSync");
    btn.disabled = true; const old = btn.textContent; btn.textContent = "获取中…";
    try{
      bambuState.snap = await S.bambuFetch();
      if(bambuState.cfg) bambuState.cfg.last = { fetchedAt: bambuState.snap.fetchedAt };
      renderBambuPrinterPreview();
      renderBambuTrayPreview();
      renderBambuStatus();
      $("bambuReFetch").hidden = false;
      $("bambuPrinterBox").scrollIntoView({ behavior:"smooth", block:"nearest" });
    }catch(e){
      // 获取失败（多为未配置/云 token 过期）：提示写进拓竹卡片
      toast(e.message || "获取失败");
      $("bambuCfgMsg").textContent = e.message || "获取失败";
      $("bambuCfgMsg").classList.add("bad");
    }finally{ btn.disabled = false; btn.textContent = old; }
  }
  $("bambuBtnSync").addEventListener("click", bambuFetchSnap);
  $("bambuReFetch").addEventListener("click", bambuFetchSnap);
  /* ---- 打印机预览与同步 ---- */
  function renderBambuPrinterPreview(){
    const box = $("bambuPrinterList");
    const devices = bambuDevices();
    $("bambuPrinterBox").hidden = !bambuState.snap;
    $("bambuPrinterCount").textContent = devices.length ? "· " + devices.length + " 台" : "";
    if(!devices.length){
      box.innerHTML = '<div class="empty" style="padding:10px">未发现设备：请确认打印机在线（局域网）或已绑定拓竹账号（云）</div>';
      return;
    }
    box.innerHTML = devices.map(d => {
      const p = matchBambuPrinter(d);
      const model = d.devModel || "";
      const power = BAMBU_POWER_EST[model];
      const act = p
        ? `<span class="badge" style="--bc:var(--ok)"><i></i>更新 ${S.esc(p.name)}</span>`
        : `<span class="badge" style="--bc:var(--accent)"><i></i>新建${power ? " · 约" + power + "W" : ""}</span>`;
      return `<div class="bambu-tray">
        <span class="pill">${d.srcKind === "lan" ? "局域网" : "拓竹云"}</span>
        <span class="bt-name">${S.esc(d.devName || d.devId || "拓竹打印机")}${model ? " · " + S.esc(model) : ""}</span>
        <span class="muted bt-slot">${S.esc(d.devId || "")}</span>${act}</div>`;
    }).join("");
  }
  $("bambuApplyPri").addEventListener("click", async () => {
    const devices = bambuDevices();
    if(!devices.length){ toast("请先「获取设备与耗材」"); return; }
    const optUpdate = $("bambuPriOptUpdate").checked, optCreate = $("bambuPriOptCreate").checked;
    if(!optUpdate && !optCreate){ toast("请至少勾选一种同步方式"); return; }
    if(optCreate && !(await confirmBox("未匹配的拓竹设备将新建为打印机：功率为经验预估值，电价 / 购入价等需之后手动补充，继续？"))) return;
    const now = Date.now();
    let updated = 0, created = 0, skipped = 0;
    devices.forEach(d => {
      const model = d.devModel || "";
      const p = matchBambuPrinter(d);
      if(p){
        if(!optUpdate){ skipped++; return; }
        if(model && !String(p.model || "").trim()) p.model = model; // 只补空缺，不覆盖用户填写
        p.bambuDevId = d.devId || p.bambuDevId || "";
        p.bambuSyncedAt = now;
        updated++;
      }else{
        if(!optCreate){ skipped++; return; }
        const p2 = {
          id: S.uid(),
          brand: "拓竹 Bambu Lab",
          model: model || (d.devName || "拓竹打印机"),
          powerW: BAMBU_POWER_EST[model] || 100,
          elecPrice: 0,
          price: 0, depYears: 2, maintPerYear: 0, utilization: 50,
          bambuDevId: d.devId || "", bambuSyncedAt: now
        };
        p2.name = S.priLabel(p2);
        S.printers.push(p2);
        created++;
      }
    });
    if(updated || created){ S.savePri(); renderPrinters(); fillSelects(); calc(); }
    renderBambuPrinterPreview();
    toast("打印机同步完成：更新 " + updated + " · 新建 " + created + (skipped ? " · 跳过 " + skipped : ""));
  });
  /* ---- 耗材预览与同步 ---- */
  function renderBambuTrayPreview(){
    const box = $("bambuTrayList");
    const snap = bambuState.snap;
    $("bambuTrayBox").hidden = !snap;
    if(!snap){ box.innerHTML = ""; return; }
    let total = 0, html = "";
    snap.sources.forEach(src => {
      html += `<div class="bambu-src"><span class="pill">${src.kind === "lan" ? "局域网" : "拓竹云"}</span> <b>${S.esc(src.name)}</b>` +
        (src.ok ? "" : `<span class="badge" style="--bc:var(--danger)"><i></i>${S.esc(src.error || "失败")}</span>`) + `</div>`;
      (src.devices || []).forEach(dev => {
        html += `<div class="bambu-dev">${S.esc(dev.devName || dev.devId || "设备")}</div>`;
        if(!(dev.trays || []).length){
          html += '<div class="empty" style="padding:10px">未读到 AMS 托盘数据</div>';
          return;
        }
total += dev.trays.length;
        const taken = new Set();
        html += dev.trays.map(t => {
          const devId = dev.devId || "";
          const { m } = matchBambuTray(t, devId, taken);
          const selId = m ? m.id : "";
          const opts = ['<option value="">新建（不匹配）</option>']
            .concat(S.materials.map(x => `<option value="${x.id}"${x.id === selId ? " selected" : ""}>${S.esc(x.name)}</option>`))
            .join("");
          const act = m
            ? `<span class="badge" style="--bc:var(--ok)"><i></i>更新 ${S.esc(m.name)}</span>`
            : `<span class="badge" style="--bc:var(--accent)"><i></i>新建</span>`;
          return `<div class="bambu-tray">
            <span class="sw" style="background:${S.esc(t.color || "#666")}"></span>
            <span class="bt-name">${S.esc(trayLabel(t))}</span>
            <select class="tray-pick" data-dev="${S.esc(devId)}" data-slot="${S.esc(t.slot || "")}" title="手动指定该托盘对应哪条耗材记录（点同步前生效并记住）">${opts}</select>
            <span class="muted bt-slot">${S.esc(t.slot)}${t.remain != null ? " · " + Math.round(t.remain) + "%" : ""}</span>
            <span class="num bt-rem">${t.remaining != null ? S.fmt(t.remaining, 0) + " g" : "—"}</span>${act}</div>`;
        }).join("");
      });
    });
$("bambuTrayCount").textContent = total ? "· " + total + " 卷" : "";
    box.innerHTML = total ? html : html + '<div class="empty">所有连接都没有读到托盘数据</div>';
  }
  /* 手动改选：把某托盘绑定到材料库指定记录（或解除绑定 → 新建） */
  $("bambuTrayList").addEventListener("change", e => {
    const sel = e.target;
    if(!sel || sel.tagName !== "SELECT" || !sel.classList.contains("tray-pick")) return;
    const devId = sel.dataset.dev || "", slot = sel.dataset.slot || "";
    const mid = sel.value || "";
    bambuBindTray(devId, slot, mid);
    renderBambuTrayPreview();
    toast(mid ? "已绑定该托盘到所选耗材，再次同步将沿用" : "已解除绑定，该托盘同步时将新建耗材");
  });
  $("bambuApply").addEventListener("click", async () => {
    const snap = bambuState.snap; if(!snap) return;
    const optUpdate = $("bambuOptUpdate").checked, optCreate = $("bambuOptCreate").checked;
    if(!optUpdate && !optCreate){ toast("请至少勾选一种同步方式"); return; }
    if(optCreate && !(await confirmBox("未匹配的 AMS 料卷将按「品牌 + 类型 + 颜色」新建为耗材（单价需之后手动补充），继续？"))) return;
    const now = Date.now();
    let updated = 0, created = 0, skipped = 0;
snap.sources.forEach(src => (src.devices || []).forEach(dev => {
      const taken = new Set();
      (dev.trays || []).forEach(t => {
      const devId = dev.devId || "";
      const { m } = matchBambuTray(t, devId, taken);
      if(m){
        if(!optUpdate){ skipped++; return; }
        if(t.remaining != null) m.remaining = Math.min(Math.max(0, t.remaining), Math.max(S.num(m.spool), t.weight || 0));
        if(t.uuid) m.bambuUuid = t.uuid;
        m.bambuDevId = devId; m.bambuSlot = t.slot; m.bambuSyncedAt = now;
        // 清理旧同步硬编码的"拓竹"占位：云端 brand 为空时，去掉本地默认 brand
        if(!t.brand && m.brand === "Bambu Lab 拓竹"){ m.brand = ""; }
        // 同步类型/颜色（允许用户在 Bambu Studio 换料后更新）
        if(t.type && t.type !== m.type){ m.type = t.type; }
        if(t.color && t.color !== m.color){ m.color = t.color; m.colorName = guessColorName(t.color); }
        // brand 被清理后 colorName 可能仍为空，重新计算一次确保展示名完整
        if(!m.colorName && m.color){ m.colorName = guessColorName(m.color); }
        m.name = S.matLabel(m);
        updated++;
      }else{
        if(!optCreate){ skipped++; return; }
        const m2 = {
          id: S.uid(),
          brand: t.brand || "", // 托盘无品牌信息时不硬塞"拓竹"
          type: t.type || "",
          color: t.color || "#9aa3ad",
          colorName: guessColorName(t.color),
          pricePerKg: 0,
          spool: t.weight > 0 ? t.weight : 1000,
          remaining: t.remaining != null ? Math.max(0, t.remaining) : 0,
          bambuDevId: devId, bambuSlot: t.slot, bambuSyncedAt: now
        };
        if(t.uuid) m2.bambuUuid = t.uuid;
        m2.name = S.matLabel(m2);
        S.materials.push(m2);
        created++;
      }
      });
    }));
    if(updated || created){
      S.saveMat();
      renderMaterials(); fillSelects(); calc();
    }
    renderBambuTrayPreview();
    renderBambuStatus();
    toast("耗材同步完成：更新 " + updated + " · 新建 " + created + (skipped ? " · 跳过 " + skipped : ""));
  });

  /* ============ 打印机 ============ */
  let editingPriId = null;
  function resetPriForm(){
    editingPriId = null;
    $("priFormTitle").textContent = "添加打印机";
    $("addPri").textContent = "添加打印机";
    $("cancelEditPri").style.display = "none";
    $("pModel").value = ""; $("pPow").value = ""; $("pElec").value = ""; $("pPrice").value = ""; $("pMaint").value = "";
    $("pDep").value = "2"; $("pUtil").value = "50";
  }
  function editPri(id){
    const p = S.priById(id); if(!p) return;
    editingPriId = id;
    $("priFormTitle").textContent = "编辑打印机 · " + p.name;
    $("addPri").textContent = "保存修改";
    $("cancelEditPri").style.display = "";
    $("pBrand").value = S.printers.some(x => x.brand === p.brand) ? p.brand : "其他 / 自制";
    $("pModel").value = p.model || p.name || "";
    $("pPow").value = S.num(p.powerW) || "";
    $("pElec").value = S.num(p.elecPrice) || "";
    $("pPrice").value = S.num(p.price) || "";
    $("pDep").value = S.num(p.depYears) || 2;
    $("pMaint").value = S.num(p.maintPerYear) || "";
    $("pUtil").value = S.num(p.utilization) || 50;
    document.querySelector("#page-printers .card").scrollIntoView({ behavior:"smooth", block:"start" });
  }
    $("clearPriBtn").addEventListener("click", () => { resetPriForm(); toast("已清除打印机表单"); });
  $("cancelEditPri").addEventListener("click", resetPriForm);
  $("addPri").addEventListener("click", () => {
    const model = $("pModel").value.trim();
    if(!model){ toast("请填写打印机型号（必填）"); $("pModel").focus(); return; }
    const fields = { brand:$("pBrand").value, model, powerW:S.num($("pPow").value), elecPrice:S.num($("pElec").value),
      price:S.num($("pPrice").value), depYears:Math.max(0.1, S.num($("pDep").value) || 2),
      maintPerYear:S.num($("pMaint").value), utilization:Math.min(100, Math.max(1, S.num($("pUtil").value) || 50)) };
    if(editingPriId){
      const p = S.priById(editingPriId);
      if(p){ Object.assign(p, fields); p.name = S.priLabel(p); toast("打印机已更新：" + p.name); }
    }else{
      const p = Object.assign({ id:S.uid() }, fields);
      p.name = S.priLabel(p);
      S.printers.push(p);
      toast("打印机已添加");
    }
    S.savePri();
    if(!editingPriId) resetPriForm(); // 新增后清空便于继续添加；编辑保存后保留选项
    renderPrinters(); fillSelects(); calc();
  });
  function renderPrinters(){
    const box = $("priList");
    if(!S.printers.length){ box.innerHTML = '<div class="empty">还没有打印机<br><span class="hint">在上方添加你的第一台机器</span></div>'; return; }
    box.innerHTML = `<table><thead><tr><th>名称</th><th>品牌</th><th class="num">功率(W)</th><th class="num">电费/h</th><th class="num">机器折旧/h</th><th class="num">机器合计/h</th><th></th></tr></thead><tbody>` +
      S.printers.map(p => {
        const rate = S.machineRate(p);
        const elecH = S.num(p.powerW) / 1000 * S.num(p.elecPrice);
        return `<tr><td>${S.esc(p.name)}<div class="hint">购入 ${S.fmt(p.price, 0)} 元 · 折旧 ${S.fmt(p.depYears, 1)} 年 · 年维 ${S.fmt(p.maintPerYear, 0)} 元 · 使用率 ${S.fmt(p.utilization, 0)}%</div></td>
        <td><span class="pill">${S.esc(p.brand || "其他")}</span></td>
        <td class="num">${S.fmt(p.powerW, 0)}</td><td class="num">${S.money(elecH)}</td>
        <td class="num">${S.money(rate)}</td><td class="num tot">${S.money(rate + elecH)}</td>
        <td style="white-space:nowrap">
          <button class="btn ghost sm" data-editp="${p.id}">编辑</button>
          <button class="btn danger ghost sm" data-delp="${p.id}">删除</button>
        </td></tr>`;
      }).join("") + "</tbody></table>";
    box.querySelectorAll("[data-editp]").forEach(b => b.addEventListener("click", () => editPri(b.getAttribute("data-editp"))));
    box.querySelectorAll("[data-delp]").forEach(b => b.addEventListener("click", async () => {
      const p = S.priById(b.getAttribute("data-delp")); if(!p) return;
      if(await confirmBox("删除打印机「" + p.name + "」？已有记录不受影响。")){
        const i = S.printers.indexOf(p);
        if(i >= 0) S.printers.splice(i, 1);
        S.savePri(); renderPrinters(); fillSelects(); calc();
      }
    }));
  }

  /* ============ 打印记录 ============ */
  const recFilt = { q:"", mat:"all", pri:"all", from:"", to:"" };
  const frPick = initRangePicker("frRange", "frFrom", "frTo");
  [["frSearch","q","value"],["frMat","mat","value"],["frPri","pri","value"],["frFrom","from","value"],["frTo","to","value"]]
    .forEach(([id, key]) => $(id).addEventListener("input", () => { recFilt[key] = $(id).value; renderRecList(); }));
  $("frClear").addEventListener("click", () => {
    Object.assign(recFilt, { q:"", mat:"all", pri:"all", from:"", to:"" });
    $("frSearch").value = ""; $("frMat").value = "all"; $("frPri").value = "all";
    $("frFrom").value = ""; $("frTo").value = "";
    if(frPick) frPick.sync();
    renderRecList();
  });

  function renderRecords(){
    // 填充筛选下拉
    const fm = $("frMat"), fp = $("frPri");
    const mv = fm.value, pv = fp.value;
    fm.innerHTML = '<option value="all">全部耗材</option>' + S.materials.map(m => `<option value="${m.id}">${S.esc(m.name)}</option>`).join("");
    fp.innerHTML = '<option value="all">全部打印机</option>' + S.printers.map(p => `<option value="${p.id}">${S.esc(p.name)}</option>`).join("");
    fm.value = mv && S.matById(mv) ? mv : "all";
    fp.value = pv && S.priById(pv) ? pv : "all";
    recFilt.mat = fm.value; recFilt.pri = fp.value;

    const rs = S.records;
    const total = rs.reduce((s,r) => s + statsCostOf(r), 0), sumH = rs.reduce((s,r) => s + S.num(r.hours), 0), sumG = rs.reduce((s,r) => s + S.num(r.grams), 0);
    $("stats").innerHTML = [
      ["总记录", String(rs.length), "", ""],
      ["总耗材 / 时长", S.fmt(sumG, 0) + " g · " + S.fmt(sumH, 1) + " h", "", ""],
      ["总成本 " + CPBTN, S.money(total), "", "hi"],
      ["单克 / 单时成本", (sumG > 0 ? S.money(total / sumG) : "—") + " · " + (sumH > 0 ? S.money(total / sumH) : "—"), "", ""]
    ].map(([k, v, s, cls]) => `<div class="stat ${cls}"><div class="k">${k}</div><div class="v" style="font-size:${v.length > 14 ? "16px" : "19px"}">${v}</div></div>`).join("");

    const months = S.monthly(rs.map(r => ({ date:r.date, value:r.total })), "value", 12);
    if(months.every(m => m.value === 0)) $("monthChart").innerHTML = '<div class="empty">还没有月度数据</div>';
    else mountBarChart($("monthChart"), months, { height:130 });

    renderRecList();
  }

  function renderRecList(){
    let rs = S.records.slice();
    if(recFilt.mat !== "all") rs = rs.filter(r => recMats(r).some(x => x.materialId === recFilt.mat));
    if(recFilt.pri !== "all") rs = rs.filter(r => r.printerId === recFilt.pri);
    if(recFilt.from) rs = rs.filter(r => (r.date || "") >= recFilt.from);
    if(recFilt.to) rs = rs.filter(r => (r.date || "") <= recFilt.to);
    if(recFilt.q){
      rs = rs.filter(r => [matsLabel(recMats(r), false), r.note, r.priName].some(v => String(v || "").toLowerCase().includes(recFilt.q)));
    }
    const box = $("recList");
    if(!S.records.length){ box.innerHTML = '<div class="empty">还没有打印记录<br><span class="hint">去「计算器」算第一笔</span></div>'; return; }
    if(!rs.length){ box.innerHTML = '<div class="empty">没有符合筛选条件的记录</div>'; return; }
    box.innerHTML = rs.map(r => {
      const ms = recMats(r), g = S.num(r.grams), h = S.num(r.hours);
      const cFil = S.num(r.cFil), cElec = S.num(r.cElec), cMach = S.num(r.cMach), cLab = S.num(r.cLab);
      const sug = S.num(r.sug), tot = S.num(r.total);
      const rq = S.num(r.qty);
      const cells = [];
      if(rq > 1) cells.push(["数量", rq + " 件"]);
      cells.push(["用量", g > 0 ? S.fmt(g, 1) + " g" : "—"], [rq > 1 ? "总时长" : "时长", h > 0 ? S.fmt(h, 1) + " h" : "—"]);
      if(rq > 1 && h > 0) cells.push(["单个时长", S.fmt(h / rq, 2) + " h"]);
      if(ms.length > 1) cells.push(["耗材明细", matsLabel(ms, true)]);
      if(S.num(r.handlingMin) > 0) cells.push(["处理", S.fmt(S.num(r.handlingMin), 0) + " 分"]);
      if(ms.length <= 1 && S.num(r.pricePerKg) > 0) cells.push(["耗材单价", S.money(S.num(r.pricePerKg)) + "/kg"]);
      if(S.num(r.powerW) > 0) cells.push(["功率", S.fmt(S.num(r.powerW), 0) + " W"]);
      if(S.num(r.elecPrice) > 0) cells.push(["电价", S.money(S.num(r.elecPrice)) + "/度"]);
      if(sug > 0) cells.push(["建议报价", S.money(sug)]);
      if(g > 0) cells.push(["单克成本", S.money(tot / g)]);
      if(h > 0) cells.push(["单时成本", S.money(tot / h)]);
      return `<div class="rec">
        <div class="top">
          <div class="t-l">
            <span class="date">${S.esc(r.date || "")}</span>
            <span class="sw" style="background:${S.esc(r.matColor || "#888")}"></span>
            <span class="mat">${S.esc(r.matName || "未知耗材")}</span>
            ${ms.length > 1 ? `<span class="m-plus" title="${S.esc(matsLabel(ms, true))}">+${ms.length-1}</span>` : ""}
            ${r.matType ? `<span class="type">${S.esc(r.matType)}</span>` : ""}
            ${r.priName ? `<span class="pri">${S.esc(r.priName)}</span>` : ""}
          </div>
          <div class="total">${S.money(tot)}</div>
        </div>
        <div class="grid">${cells.map(([k, v]) => `<div class="cell"><span class="k">${k}</span><span class="v">${v}</span></div>`).join("")}</div>
        <div class="costs">
          <span>耗材 <b>${S.money(cFil)}</b></span>
          <span>电费 <b>${S.money(cElec)}</b></span>
          <span>机器 <b>${S.money(cMach)}</b></span>
          <span>人工 <b>${S.money(cLab)}</b></span>
          <span class="tot">合计 <b>${S.money(tot)}</b></span>
        </div>
        ${r.note ? `<div class="note">${S.esc(r.note)}</div>` : ""}
        <div class="acts">
          <button class="btn ghost sm" data-edtr="${r.id}" title="编辑这条记录">编辑</button>
          <button class="btn primary ghost sm" data-ordr="${r.id}" title="用这条记录开单">开单</button>
          <button class="btn danger ghost sm" data-delr="${r.id}" title="删除这条记录">删除</button>
        </div>
      </div>`;
    }).join("");
    // 编辑记录：回填计算器表单并进入编辑模式
    box.querySelectorAll("[data-edtr]").forEach(b => b.addEventListener("click", () => {
      const r = S.records.find(x => x.id === b.getAttribute("data-edtr")); if(!r) return;
      editingRecId = r.id;
      goto("calc");
      // 先确保选择器已填充（避免 goto 时 fillSelects 用旧空值覆盖）
      fillSelects();
      const ms = recMats(r);
      $("selMat").value = (ms[0] && ms[0].materialId) || "";
      $("selPri").value = r.printerId || "";
      $("rGrams").value = ms[0] && ms[0].grams != null ? String(ms[0].grams) : "";
      renderMatRows(ms.slice(1).map(x => ({ matId:x.materialId || "", grams:x.grams != null ? x.grams : "" }))); // 耗材区回填（主耗材由上方 selMat/rGrams 设置，附加行在此回填）
      $("rQty").value = S.num(r.qty) > 0 ? String(r.qty) : "1";
      $("rGPer").value = S.num(r.grams) > 0 ? String(Math.round(S.num(r.grams) / Math.max(1, S.num(r.qty) || 1) * 10) / 10) : "";
      /* 单个打印时长：优先用记录保存的单个时长，旧数据按 总时长 ÷ 数量 反推 */
      const sh0 = r.singleHours != null ? S.num(r.singleHours) : S.num(r.hours) / Math.max(1, S.num(r.qty) || 1);
      $("rHoursH").value = String(Math.floor(sh0));
      const mins0 = Math.round((sh0 - Math.floor(sh0)) * 60);
      $("rHoursM").value = String(Math.min(55, Math.round(mins0 / 5) * 5));
      const th0 = S.num(r.hours) || 0;
      $("rTotHoursH").value = String(Math.floor(th0));
      $("rTotHoursM").value = String(Math.min(55, Math.round((th0 - Math.floor(th0)) * 60 / 5) * 5));
      hAnchor = "total"; // 编辑记录：以总打印时间为事实，改数量时保持总时间、反推单个时长
      $("rMin").value = r.handlingMin != null ? String(r.handlingMin) : "";
      $("rNote").value = r.note || "";
      $("cbFil").checked = r.inclFil !== false;
      $("cbElec").checked = r.inclElec !== false;
      $("cbMach").checked = r.inclMach !== false;
      $("cbLab").checked = r.inclLab !== false;
      enableSaveBtn();
      $("cancelEditBtn").style.display = "";
      $("homeMsg").textContent = "编辑中：" + S.esc(r.matName || "");
      calc();
      toast("已载入该记录，保存后更新原记录");
    }));
    // 添加为订单
    box.querySelectorAll("[data-ordr]").forEach(b => b.addEventListener("click", () => {
      const r = S.records.find(x => x.id === b.getAttribute("data-ordr")); if(!r) return;
      goto("order");
      // 先确保选择器已填充（避免 goto 时 fillSelects 用旧空值覆盖）
      fillSelects();
      // 填充打印数据到订单表单
      $("oDate").value = r.date || S.today();
      $("oMat").value = r.materialId || "";
      $("oPri").value = r.printerId || "";
      $("oG").value = S.fmt(r.grams, 1);
      $("oH").value = S.fmt(r.hours, 1);
      $("oMin").value = S.fmt(r.handlingMin, 0);
      $("oQuote").value = S.num(r.sug != null ? r.sug : r.total) || "";
      $("oQuote").dataset.auto = ""; // 载入参考报价后允许克重报价覆盖
      $("oNote").value = r.note ? "来自打印记录：" + r.note : "";
      orderCalc();
      toast("已载入打印记录，请补充客户信息后保存订单");
    }));
    // 删除记录
    box.querySelectorAll("[data-delr]").forEach(b => b.addEventListener("click", async () => {
      const r = S.records.find(x => x.id === b.getAttribute("data-delr")); if(!r) return;
      if(await confirmBox("删除这条记录？" + (S.num(r.consumed) > 0 ? "\n对应库存会加回。" : ""))){
        applyMatsStock(r, +1); // 按明细逐项回补库存
        if(recMats(r).some(x => S.matById(x.materialId))){ S.saveMat(); fillSelects(); }
        const i = S.records.indexOf(r);
        if(i >= 0) S.records.splice(i, 1);
        S.saveRec(); renderRecords(); toast("已删除");
      }
    }));
  }

  function download(name, content, type){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  $("csvBtn").addEventListener("click", () => {
    if(!S.records.length){ toast("没有记录可导出"); return; }
    const head = ["日期","耗材","类型","打印机","克数(g)","时长(h)","处理分钟","耗材+电费","机器折旧","人工","合计","备注"];
    const rows = S.records.map(r => { const ms = recMats(r); return [r.date, ms.length > 1 ? matsLabel(ms, false) : r.matName, r.matType, r.priName, S.num(r.grams), S.num(r.hours),
      S.num(r.handlingMin), (S.num(r.cFil) + S.num(r.cElec)).toFixed(2), S.num(r.cMach).toFixed(2),
      S.num(r.cLab).toFixed(2), S.num(r.total).toFixed(2), r.note || ""]; });
    const csv = "\uFEFF" + [head].concat(rows).map(r => r.map(c => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
    download("3d-printing-business_records_" + S.today() + ".csv", csv, "text/csv;charset=utf-8");
    toast("CSV 已导出");
  });
  /* 备份导出（记录页与设置页共用） */
  function exportBackup(){
    download("3d-printing-business_backup_" + S.today() + ".json", JSON.stringify(S.exportPayload(), null, 2), "application/json");
    S.setSettings({ lastExportAt:Date.now() }); renderSettings();
    toast("备份已导出");
  }
  $("expBtn").addEventListener("click", exportBackup);
  $("impBtn").addEventListener("click", () => $("impFile").click());
  $("impFile").addEventListener("change", e => {
    const f = e.target.files[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try{ S.importPayload(JSON.parse(rd.result)); refreshAll(); toast("导入成功 " + randFace()); }
      catch(err){ toast("导入失败：" + err.message); }
    };
    rd.readAsText(f); e.target.value = "";
  });
  $("clrBtn").addEventListener("click", async () => {
    if(!S.records.length){ toast("没有记录"); return; }
    const g0 = S.records.reduce((s,r) => s + S.num(r.consumed), 0);
    if(await confirmBox("清空全部 " + S.records.length + " 条打印记录？不可恢复。" + (g0 > 0 ? "\n对应耗材库存会全部加回。" : ""))){
      S.records.forEach(r => applyMatsStock(r, +1)); // 清空前逐条按明细回补库存
      const touched = S.records.some(r => recMats(r).some(x => S.matById(x.materialId)));
      S.records.splice(0); S.saveRec();
      if(touched){ S.saveMat(); fillSelects(); }
      renderRecords(); toast("已清空，库存已加回");
    }
  });

  /* ============ 设置页 Tab 切换 ============ */
  let activeSetPane = "general";
  let setPaneShown = null; // 上次渲染的面板，用于仅在真正切换时播放动画
  const SET_PANE_PERM = { general:"set_general", presets:"set_presets", update:"set_update", data:"set_account" };
  function renderSetTabs(){
    document.querySelectorAll("#setTabs button").forEach(b => {
      b.hidden = !can(SET_PANE_PERM[b.getAttribute("data-p")]); // 无权限的标签直接隐藏
      b.classList.toggle("on", b.getAttribute("data-p") === activeSetPane);
    });
    // 当前激活面板无权限时，切到第一个有权限的
    if(!can(SET_PANE_PERM[activeSetPane])){
      const first = [...document.querySelectorAll("#setTabs button")].find(b => !b.hidden);
      if(first) activeSetPane = first.getAttribute("data-p");
    }
    document.querySelectorAll(".set-pane").forEach(p =>
      p.hidden = p.id !== "setp-" + activeSetPane
    );
    if(setPaneShown !== activeSetPane){
      const firstShow = setPaneShown === null;
      setPaneShown = activeSetPane;
      if(!firstShow) fx(g => {
        const pane = $("setp-" + activeSetPane);
        if(!pane || pane.hidden) return;
        g.fromTo(pane, { autoAlpha:0, y:8 }, { autoAlpha:1, y:0, duration:0.22, ease:"power1.out", clearProps:"transform" });
      });
    }
    if(activeSetPane === "presets"){
      if(typeof renderPresets === "function") renderPresets();
    }
    if(activeSetPane === "data"){
      if(typeof loadUserMgmt === "function") loadUserMgmt();
    }
  }
  $("setTabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-p]"); if(!b) return;
    activeSetPane = b.getAttribute("data-p"); renderSetTabs();
    fx(g => {
      const ic = b.querySelector("svg.ic");
      if(ic) g.fromTo(ic, { scale: 0.55, rotation: -14 }, { scale: 1, rotation: 0, duration: 0.4, ease: "back.out(2)", clearProps: "transform" });
    });
  });

  /* ============ 设置 ============ */
  let activePresetPane = "matCategories";
  let presetPaneShown = null;
  function renderSettings(){
    $("setCur").value = S.settings.currency;
    if($("setCur").selectedIndex === -1) $("setCur").selectedIndex = 0;
    $("setLow").value = S.settings.lowStock;
    $("setLabor").value = S.settings.laborHourly;
    const _mp = S.settings.markupPct || {};
    $("setPctFil").value  = _mp.fil  != null ? _mp.fil  : 10;
    $("setPctElec").value = _mp.elec != null ? _mp.elec : 10;
    $("setPctMach").value = _mp.mach != null ? _mp.mach : 10;
    $("setPctLab").value  = _mp.lab  != null ? _mp.lab  : 10;
    $("setLeadMin").value = S.settings.leadMin != null ? S.settings.leadMin : 15;
    $("setOrdPrefix").value = S.settings.ordPrefix || "ORD";
    $("setStart").value = S.settings.startPage || "dash";
    $("setTheme").value = S.settings.theme;
    $("setFontSize").value = String(S.settings.fontScale || 1);
    $("setFont").value = S.settings.font || "sys";
    $("setUpdateUrl").value = S.settings.updateUrl || "";
    const le = S.settings.lastExportAt;
    $("backupInfo").textContent = le ? "上次导出备份：" + new Date(le).toLocaleString("zh-CN") + "。" : "尚未导出过备份。";
    renderSetTabs();
  }
  $("setCur").addEventListener("change", () => { S.setSettings({ currency:$("setCur").value || "¥" }); refreshAll(); });
  $("setLow").addEventListener("change", () => { S.setSettings({ lowStock:S.num($("setLow").value) }); if(currentTab === "mats") renderMaterials(); renderDash(); });
  $("setLabor").addEventListener("change", () => { S.setSettings({ laborHourly:S.num($("setLabor").value) }); calc(); orderCalc(); });
  const _mkUp = () => S.setSettings({ markupPct:{
    fil: Math.max(0, S.num($("setPctFil").value)),
    elec:Math.max(0, S.num($("setPctElec").value)),
    mach:Math.max(0, S.num($("setPctMach").value)),
    lab: Math.max(0, S.num($("setPctLab").value))
  } });
  ["setPctFil","setPctElec","setPctMach","setPctLab"].forEach(id => $(id).addEventListener("change", () => { _mkUp(); calc(); orderCalc(); }));
  $("setLeadMin").addEventListener("change", () => {
    S.setSettings({ leadMin:Math.max(0, S.num($("setLeadMin").value)) });
    applyDefaultLeadMin(); // 改动后立即同步到计算器“处理耗时”
  });
  $("setOrdPrefix").addEventListener("change", () => { S.setSettings({ ordPrefix:$("setOrdPrefix").value.trim().toUpperCase() || "ORD" }); });
  $("setStart").addEventListener("change", () => { S.setSettings({ startPage:$("setStart").value }); });
  $("setTheme").addEventListener("change", () => {
    const val = $("setTheme").value;
    S.settings.theme = val; // 直接赋值，确保立即生效
    applyTheme(); updateMeta();
    S.setSettings({ theme: val }); // 异步保存到服务端
  });
  $("setFontSize").addEventListener("change", () => {
    S.setSettings({ fontScale:Number($("setFontSize").value) || 1 });
    applyFont(); toast("字号已调整");
  });
  $("setFont").addEventListener("change", () => {
    S.setSettings({ font:$("setFont").value });
    applyFont(); toast("字体已切换");
  });
  $("setExp").addEventListener("click", exportBackup);
  $("setImp").addEventListener("click", () => $("impFile").click());
  $("setDemo").addEventListener("click", async () => {
    if(await confirmBox("载入演示数据会覆盖现有数据，继续？")){ S.loadDemo(); refreshAll(); toast("演示数据已载入 " + randFace()); }
  });
  $("setClr").addEventListener("click", async () => {
    if(await confirmBox("清空全部数据（耗材/打印机/记录/订单/成就）？此操作不可恢复，建议先导出备份。")){
      S.wipeAll(); refreshAll(); toast("已清空，样例数据已就位");
    }
  });

  /* ============ 预设管理（设置页） ============ */
  /* 防回车换行 + 失焦保存的小工具 */
  function bindEditable(el, onSave){
    el.addEventListener("keydown", e => {
      if(e.key === "Enter"){ e.preventDefault(); el.blur(); }
      if(e.key === "Escape"){ el.blur(); }
    });
    el.addEventListener("blur", () => {
      const v = el.textContent.trim();
      onSave(v);
    });
  }

  function renderPresets(){
    document.querySelectorAll("#presetTabs button").forEach(b => {
      b.classList.toggle("on", b.getAttribute("data-pane") === activePresetPane);
    });
    ["matCategories","matBrands","matColors","priBrands"].forEach(k => {
      $("pane-" + k).hidden = k !== activePresetPane;
    });
    if(presetPaneShown !== activePresetPane){
      const firstShow = presetPaneShown === null;
      presetPaneShown = activePresetPane;
      if(!firstShow) fx(g => {
        const pane = $("pane-" + activePresetPane);
        if(!pane || pane.hidden) return;
        g.fromTo(pane, { autoAlpha:0, y:8 }, { autoAlpha:1, y:0, duration:0.22, ease:"power1.out", clearProps:"transform" });
      });
    }
    if(activePresetPane === "matCategories") renderPresetCategories();
    else if(activePresetPane === "matBrands") renderPresetList("matBrands", "耗材品牌");
    else if(activePresetPane === "matColors") renderPresetList("matColors", "颜色名", true);
    else if(activePresetPane === "priBrands") renderPresetList("priBrands", "打印机品牌");
  }
  $("presetTabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-pane]"); if(!b) return;
    activePresetPane = b.getAttribute("data-pane"); renderPresets();
  });

  /* 树形面板：耗材大类 / 小类（两列布局） */
  let selectedCat = null;  // 当前选中的大类名
  function renderPresetCategories(){
    const box = $("pane-matCategories");
    const ps = S.presets();
    const cats = ps.matCategories;
    
    // 默认选中第一个大类
    if(!selectedCat || !cats.find(c => c.name === selectedCat)){
      selectedCat = cats.length > 0 ? cats[0].name : null;
    }
    
    // 生成大类列表 HTML
    const catListHtml = cats.map((cat, ci) => `
      <div class="cat-list-item${cat.name === selectedCat ? ' selected' : ''}" data-cat="${S.esc(cat.name)}" data-i="${ci}" draggable="true">
        <div class="drag-handle" title="拖拽排序">☰</div>        <div class="cat-name" contenteditable="true" spellcheck="false" title="点击编辑名称">${S.esc(cat.name)}</div>
        <span class="cat-count">${cat.subs.length}</span>
        <div class="edits">
          <button class="row-btn pin-cat-btn${ci === 0 ? " pinned" : ""}" data-pincat="${S.esc(cat.name)}" data-i="${ci}" type="button" title="置顶显示"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg></button>
          <button class="row-btn danger del-cat-btn" data-delcat="${S.esc(cat.name)}" type="button" title="删除该大类（含其下所有小类）"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        </div>
      </div>`).join("");
    
    // 新增大类的输入框
    const addCatHtml = `
      <div class="preset-add-row cat-add-row">
        <input id="pcAddCat" placeholder="新增大类名" />
        <button class="btn sm" id="pcAddCatBtn" type="button">添加</button>
      </div>`;
    
    // 生成右侧小类列表
    const selectedCategory = cats.find(c => c.name === selectedCat);
    let subListHtml = "";
    if(selectedCategory){
      subListHtml = selectedCategory.subs.map((s, si) => `
        <div class="preset-sub-row" data-cat="${S.esc(selectedCat)}" data-sub="${S.esc(s.name)}" data-sub-i="${si}" draggable="true">
          <div class="sub-drag-handle" title="拖拽排序">☰</div>          <div class="sub-body">
            <div class="sub-nm" contenteditable="true" spellcheck="false" title="点击编辑名称">${S.esc(s.name)}</div>
            <div class="sub-ds" contenteditable="true" spellcheck="false" data-placeholder="点此添加说明…">${S.esc(s.desc || "")}</div>
          </div>
          <div class="edits">
            <button class="row-btn pin-sub-btn${si === 0 ? " pinned" : ""}" data-pinsub="${si}" type="button" title="置顶显示"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg></button>
            <button class="row-btn danger del-sub-btn" data-sub="${S.esc(s.name)}" type="button" title="删除该小类"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          </div>
        </div>`).join("");
      subListHtml += `
        <div class="preset-add-row sub-add-row">
          <input id="subNameIn" placeholder="新增小类名" />
          <input id="subDescIn" placeholder="简短说明（可留空）" />
          <button class="btn ghost sm" id="addSubBtn" type="button">添加</button>
        </div>`;
    } else {
      subListHtml = '<div class="preset-empty">请先选择一个左侧大类</div>';
    }
    
    // 两列布局
    box.innerHTML = `
      <div class="cat-two-col">
        <div class="cat-left-panel">
          <div class="cat-list-header">
            <span class="muted">耗材大类</span>
          </div>
          <div class="cat-list" id="catList">${catListHtml}</div>
          ${addCatHtml}
        </div>
        <div class="cat-right-panel">
          <div class="cat-list-header">
            <span class="muted">${selectedCat ? '小类（' + selectedCat + '）' : '小类列表'}</span>
          </div>
          <div class="sub-list" id="subList">${subListHtml}</div>
        </div>
      </div>`;
    
    // 绑定事件
    bindCatEvents(box, cats);
  }
  
  function bindCatEvents(box, cats){
    const catList = $("catList");
    
    // 大类选择
    box.querySelectorAll(".cat-list-item").forEach(item => {
      item.addEventListener("click", e => {
        if(e.target.closest(".del-cat-btn") || e.target.closest(".pin-cat-btn") || e.target.closest(".drag-handle")) return;
        if(e.target.closest(".cat-name")) return; // 点击名称但不编辑时
        selectedCat = item.getAttribute("data-cat");
        renderPresetCategories();
      });
    });
    
    // 大类置顶
    catList.querySelectorAll(".pin-cat-btn").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        if(S.moveCategory(+b.getAttribute("data-i"), 0)){ selectedCat = b.getAttribute("data-pincat"); renderPresetCategories(); toast("已置顶"); }
      });
    });

    // 大类名称：直接点击编辑，回车/失焦保存（与品牌/颜色列表一致）
    catList.querySelectorAll(".cat-name").forEach(el => {
      const oldCat = el.closest(".cat-list-item").getAttribute("data-cat");
      bindEditable(el, v => {
        if(!v || v === oldCat){ el.textContent = oldCat; return; }
        if(S.renameCategory(oldCat, v)){
          if(selectedCat === oldCat) selectedCat = v;
          renderPresetCategories();
        } else { el.textContent = oldCat; toast("改名失败：已存在同名大类"); }
      });
    });
    
    // 大类拖拽排序
    catList.addEventListener("dragstart", e => {
      const el = e.target.closest(".cat-list-item"); if(!el) return;
      el.classList.add("dragging"); e.dataTransfer.setData("text/plain", el.getAttribute("data-i")); e.dataTransfer.effectAllowed = "move";
    });
    catList.addEventListener("dragend", e => {
      const el = e.target.closest(".cat-list-item"); if(el) el.classList.remove("dragging");
      catList.querySelectorAll(".drag-over").forEach(x => x.classList.remove("drag-over"));
    });
    catList.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    catList.addEventListener("dragenter", e => {
      const el = e.target.closest(".cat-list-item"); if(el && !el.classList.contains("dragging")) el.classList.add("drag-over");
    });
    catList.addEventListener("dragleave", e => {
      const el = e.target.closest(".cat-list-item");
      if(el && !el.contains(e.relatedTarget)) el.classList.remove("drag-over");
    });
    catList.addEventListener("drop", e => {
      e.preventDefault();
      const from = e.dataTransfer.getData("text/plain");
      const toEl = e.target.closest(".cat-list-item");
      if(!toEl || from === toEl.getAttribute("data-i")) return;
      const fi = +from, ti = +toEl.getAttribute("data-i");
      if(S.moveCategory(fi, ti)) toast("已调整大类顺序");
    });
    
    // 大类名编辑（已由编辑按钮处理，移除了自动编辑功能）
    
    // 删除大类
    catList.querySelectorAll(".del-cat-btn").forEach(b => {
      b.addEventListener("click", async e => {
        e.stopPropagation();
        const cat = b.getAttribute("data-delcat");
        const c = S.findCategory(cat);
        const n = c ? c.subs.length : 0;
        if(await confirmBox("删除大类「" + cat + "」？" + (n ? "其下 " + n + " 个小类也会一起删除。" : ""))){
          S.removeCategory(cat);
          if(selectedCat === cat) selectedCat = null;
          renderPresetCategories();
        }
      });
    });
    
    // 新增大类
    $("pcAddCatBtn").addEventListener("click", () => {
      const inp = $("pcAddCat"); if(!inp) return;
      const v = inp.value.trim();
      if(!v){ toast("请输入大类名"); return; }
      if(S.addCategory(v)){ inp.value = ""; selectedCat = v; renderPresetCategories(); toast("已新增大类：「" + v + "」"); }
      else toast("已存在同名大类");
    });
    $("pcAddCat").addEventListener("keydown", e => { if(e.key === "Enter") $("pcAddCatBtn").click(); });
    
    // 小类列表事件
    const subList = $("subList");
    if(subList && selectedCat){
      // 小类拖拽排序
      subList.addEventListener("dragstart", e => {
        const el = e.target.closest(".preset-sub-row"); if(!el) return;
        el.classList.add("dragging");
        e.dataTransfer.setData("text/plain", el.getAttribute("data-sub-i"));
        e.dataTransfer.effectAllowed = "move";
      });
      subList.addEventListener("dragend", e => {
        const el = e.target.closest(".preset-sub-row"); if(el) el.classList.remove("dragging");
        subList.querySelectorAll(".drag-over").forEach(x => x.classList.remove("drag-over"));
      });
      subList.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
      subList.addEventListener("dragenter", e => {
        const el = e.target.closest(".preset-sub-row");
        if(el && !el.classList.contains("dragging")) el.classList.add("drag-over");
      });
      subList.addEventListener("dragleave", e => {
        const el = e.target.closest(".preset-sub-row");
        if(el && !el.contains(e.relatedTarget)) el.classList.remove("drag-over");
      });
      subList.addEventListener("drop", e => {
        e.preventDefault();
        const from = +e.dataTransfer.getData("text/plain");
        const toEl = e.target.closest(".preset-sub-row");
        if(!toEl) return;
        const to = +toEl.getAttribute("data-sub-i");
        if(from === to) return;
        S.moveSub(selectedCat, from, to);
        renderPresetCategories();
      });
      
      // 小类置顶
      subList.querySelectorAll(".pin-sub-btn").forEach(b => {
        b.addEventListener("click", e => {
          e.stopPropagation();
          S.moveSub(selectedCat, +b.getAttribute("data-pinsub"), 0);
          renderPresetCategories();
          toast("已置顶");
        });
      });

      // 小类：点击名称/说明直接编辑，回车/失焦保存（与品牌/颜色列表一致）
      subList.querySelectorAll(".preset-sub-row").forEach(row => {
        const oldSub = row.getAttribute("data-sub");
        const nm = row.querySelector(".sub-nm");
        const ds = row.querySelector(".sub-ds");
        const save = (newName, newDesc) => {
          const nameArg = (!newName || newName === oldSub) ? null : newName;
          if(S.updateSub(selectedCat, oldSub, nameArg, newDesc)){
            renderPresetCategories();
          } else {
            nm.textContent = oldSub; toast("已存在同名小类");
          }
        };
        bindEditable(nm, v => save(v, ds.textContent.trim()));
        bindEditable(ds, () => save(nm.textContent.trim() === oldSub ? null : nm.textContent.trim(), ds.textContent.trim()));
      });
      
      // 删除小类
      subList.querySelectorAll(".del-sub-btn").forEach(b => {
        b.addEventListener("click", async e => {
          e.stopPropagation();
          const sub = b.getAttribute("data-sub");
          if(await confirmBox("删除小类「" + selectedCat + " / " + sub + "」？")){
            S.removeSub(selectedCat, sub); renderPresetCategories();
          }
        });
      });
      
      // 新增小类
      $("addSubBtn").addEventListener("click", () => {
        const nameIn = $("subNameIn"), descIn = $("subDescIn");
        if(!nameIn) return;
        const v = nameIn.value.trim();
        if(!v){ toast("请填写小类名"); nameIn.focus(); return; }
        const ok = S.addSub(selectedCat, v, (descIn.value || "").trim());
        if(ok){ nameIn.value = ""; descIn.value = ""; renderPresetCategories(); toast("已新增小类：「" + v + "」"); }
        else toast("该大类下已存在同名小类");
      });
      $("subNameIn").addEventListener("keydown", e => { if(e.key === "Enter") $("addSubBtn").click(); });
    }
  }

  /* 列表式面板：品牌 / 颜色 / 打印机品牌 */
  function renderPresetList(key, label, colorMode){
    const box = $("pane-" + key);
    const ps = S.presets();
    const arr = ps[key] || [];
    const HEX_RE = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
    box.innerHTML = (arr.length
      ? '<div class="preset-list" data-list-key="' + key + '">' + arr.map((v, i) => {
          const colorHtml = colorMode ? (() => {
            const hex = S.matColorHexOf(v);
            return `<span class="sw" data-swatch style="background:${S.esc(hex)}"></span>` +
                   `<input class="hex-in" data-hexin value="${S.esc(hex)}" placeholder="#RRGGBB" maxlength="7" spellcheck="false" title="十六进制颜色代码" />`;
          })() : "";
          return `
          <div class="preset-row" data-i="${i}" draggable="true">
            <div class="drag-handle" title="拖拽排序">☰</div>            ${colorHtml}
            <div class="nm" contenteditable="true" spellcheck="false">${S.esc(v)}</div>
            <div class="edits">
              <button class="row-btn${i === 0 ? " pinned" : ""}" data-pin="${i}" type="button" title="置顶显示"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/></svg></button>
              <button class="row-btn danger" data-del="${i}" type="button" title="删除"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
            </div>
          </div>`;
        }).join("") + '</div>'
      : '<div class="preset-empty">还没有' + label + '，在下面新增</div>'
    ) + `<div class="preset-add-row">
          <input id="add${key}" placeholder="新增${label}，回车确认" />
          <button class="btn sm" id="add${key}Btn" type="button">添加</button>
        </div>`;
    /* 颜色模式：编辑色值 → 色块即时预览 + 写入预设 */
    if(colorMode){
      box.querySelectorAll("[data-hexin]").forEach(inp => {
        const row = inp.closest(".preset-row");
        const sw = row.querySelector("[data-swatch]");
        inp.addEventListener("input", () => {
          const v = inp.value.trim();
          if(HEX_RE.test(v)){
            sw.style.background = v;
            S.setMatColorHex(row.querySelector(".nm").textContent.trim(), v);
          }
        });
        inp.addEventListener("blur", () => {
          const v = inp.value.trim();
          if(v && !HEX_RE.test(v)){ toast("色值格式应为 #RRGGBB，如 #1a1a1a"); inp.value = S.matColorHexOf(row.querySelector(".nm").textContent.trim()); }
        });
      });
    }
    /* 拖拽排序 */
    const list = box.querySelector('[data-list-key="' + key + '"]');
    if(list){
      list.addEventListener("dragstart", e => {
        const row = e.target.closest(".preset-row"); if(!row) return;
        row.classList.add("dragging");
        e.dataTransfer.setData("text/plain", row.getAttribute("data-i"));
        e.dataTransfer.effectAllowed = "move";
      });
      list.addEventListener("dragend", e => {
        const row = e.target.closest(".preset-row"); if(row) row.classList.remove("dragging");
        list.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
      });
      list.addEventListener("dragover", e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
      list.addEventListener("dragenter", e => {
        const row = e.target.closest(".preset-row"); if(row && !row.classList.contains("dragging")) row.classList.add("drag-over");
      });
      list.addEventListener("dragleave", e => {
        const row = e.target.closest(".preset-row");
        if(row && !row.contains(e.relatedTarget)) row.classList.remove("drag-over");
      });
      list.addEventListener("drop", e => {
        e.preventDefault();
        const from = e.dataTransfer.getData("text/plain");
        const to = e.target.closest(".preset-row");
        if(!to || from === to.getAttribute("data-i")) return;
        const fi = +from, ti = +to.getAttribute("data-i");
        if(S.moveInList(key, fi, ti)) renderPresets();
      });
    }
    /* 失焦改名 */
    box.querySelectorAll(".preset-row .nm").forEach(el => {
      const i = +el.closest(".preset-row").getAttribute("data-i");
      bindEditable(el, v => {
        if(!v){ el.textContent = arr[i]; return; }
        if(v === arr[i]) return;
        if(S.updateInList(key, arr[i], v)){
          if(colorMode) S.renameMatColorHex(arr[i], v); // 色值跟着改名走
          arr[i] = v; renderPresets();
        }
        else { el.textContent = arr[i]; toast("已存在同名项"); }
      });
    });
    /* 置顶：移到首位，耗材/打印机表单下拉自动优先显示 */
    box.querySelectorAll("[data-pin]").forEach(b => {
      b.addEventListener("click", () => {
        if(S.moveInList(key, +b.getAttribute("data-pin"), 0)){ renderPresets(); toast("已置顶，表单下拉将优先显示"); }
      });
    });
    /* 删 */
    box.querySelectorAll("[data-del]").forEach(b => {
      b.addEventListener("click", async e => {
        e.stopPropagation();
        const i = +b.getAttribute("data-del");
        if(await confirmBox("删除「" + arr[i] + "」？")){ S.removeFromList(key, arr[i]); renderPresets(); }
      });
    });
    /* 新增 */
    const ai = $("add" + key), ab = $("add" + key + "Btn");
    const doAdd = () => {
      const v = ai.value.trim(); if(!v){ toast("请填写" + label); return; }
      const ok = key === "matBrands" ? S.addMatBrand(v)
              : key === "matColors" ? S.addMatColor(v)
              : S.addPriBrand(v);
      if(ok){ ai.value = ""; renderPresets(); }
      else toast("已存在同名项");
    };
    ab.addEventListener("click", doAdd);
    ai.addEventListener("keydown", e => { if(e.key === "Enter") doAdd(); });
  }

  /* 重置当前面板 */
  $("presetResetBtn").addEventListener("click", async () => {
    const map = { matCategories:"耗材类型树", matBrands:"耗材品牌", matColors:"颜色名", priBrands:"打印机品牌" };
    if(!await confirmBox("把「" + map[activePresetPane] + "」还原为内置默认？当前自定义内容会丢失。")) return;
    S.resetPresets(activePresetPane); renderPresets();
    toast("已重置为默认");
  });

  /* 应用外观并写入本地缓存（供 index.html 首屏脚本使用，消除刷新时的主题闪烁） */
  function persistUi(){
    try{
      localStorage.setItem("pf_ui", JSON.stringify({
        theme:S.settings.theme, font:S.settings.font || "sys", fontScale:Number(S.settings.fontScale) || 1
      }));
    }catch(e){}
  }
  const VALID_THEMES = { dark:1, light:1, nord:1, matcha:1, sunset:1, rose:1, paper:1 };
  function applyTheme(){
    const t = S.settings.theme;
    // 兜底：若主题无效，强制使用 dark
    document.documentElement.dataset.theme = VALID_THEMES[t] ? t : "dark";
    if(!VALID_THEMES[t]) S.settings.theme = "dark"; // 修正脏数据
    // Bug fix: 仅在主题有效时才写入 localStorage，避免 null/undefined 覆盖缓存导致刷新跳回 dark
    if(S.settings.theme) persistUi();
  }
  function applyFont(){
    document.documentElement.dataset.font = S.settings.font || "sys";
    document.documentElement.style.zoom = Number(S.settings.fontScale) || 1;
    persistUi();
  }
  function updateMeta(){
    const bgMap = { dark:"#0e1218", light:"#f2f4f7", nord:"#2e3440", matcha:"#101712", sunset:"#1a1210", rose:"#191218", paper:"#f6f1e7" };
    document.querySelector('meta[name="theme-color"]').setAttribute("content", bgMap[S.settings.theme] || "#0e1218");
  }

  /* ---------- 成就检查 ---------- */
  function checkAch(){
    const s = S.buildAchStats(), now = new Set(), unlocked = [];
    S.ACHS.forEach(a => { if(a.goal(s) >= 1){ now.add(a.id); if(!S.achKeys.has(a.id)) unlocked.push(a.ic + " " + a.nm); } });
    S.setAchKeys(now);
    return unlocked;
  }

  /* ---------- 新手引导 ---------- */
  const OB_STEPS = [
    { ic:"🖨️", t:"欢迎使用 3D打印业务平台", b:"这是你的 3D 打印接单经营台：成本核算、订单利润、耗材库存、打印记录一站式管理。数据存在你部署的服务端，多设备打开同一地址即可共享同一份数据。" },
    { ic:"🧵", t:"第一步：建耗材与打印机", b:"在「耗材」页添加品牌、类型（PLA / 丝绸 / 碳纤维…，可自由输入）、颜色与单价；在「打印机」页添加品牌、型号、功率电价，填上购入价与使用率，机器折旧会自动摊到每小时。" },
    { ic:"🧮", t:"第二步：算成本、开订单", b:"「计算器」输入克数、打印时长和处理耗时，自动算出耗材 + 电费 + 机器折旧 + 人工的全成本与建议报价；点「去开订单」一键带入，报价取整后自动填好。" },
    { ic:"📦", t:"第三步：跟踪订单与利润", b:"订单支持定金/尾款分期收款、自动算欠款与利润率；「订单列表」可按状态与日期区间筛选；「仪表盘」支持按日 / 月 / 年查看经营情况。左下角指示灯实时显示数据同步状态。" }
  ];
  let obIdx = 0;
  function obRender(){
    const s = OB_STEPS[obIdx];
    $("obStep").textContent = (obIdx + 1) + " / " + OB_STEPS.length;
    $("obIcon").textContent = s.ic;
    $("obTitle").textContent = s.t;
    $("obBody").textContent = s.b;
    $("obPrev").style.visibility = obIdx > 0 ? "visible" : "hidden";
    $("obNext").textContent = obIdx === OB_STEPS.length - 1 ? "开始使用" : "下一步";
    $("obDots").innerHTML = OB_STEPS.map((_, i) => `<i class="${i === obIdx ? "on" : ""}"></i>`).join("");
  }
  function obShow(){ obIdx = 0; obRender(); $("onboard").hidden = false;
    fx(g => {
      g.from("#onboard", { autoAlpha:0, duration:0.2, ease:"power1.out" });
      g.from("#onboard .ob-card", { y:24, scale:0.96, autoAlpha:0, duration:0.36, ease:"power3.out", clearProps:"all" });
    });
  }
  function obClose(){ $("onboard").hidden = true; }
  $("obPrev").addEventListener("click", () => { if(obIdx > 0){ obIdx--; obRender(); } });
  $("obNext").addEventListener("click", () => {
    if(obIdx < OB_STEPS.length - 1){ obIdx++; obRender(); }
    else { obClose(); S.setSettings({ onboarded:true }); toast("开始接单吧 " + randFace()); }
  });
  $("obSkip").addEventListener("click", () => { obClose(); S.setSettings({ onboarded:true }); });
  $("showOnboard").addEventListener("click", obShow);

  /* ---------- 初始化 ---------- */
  Object.assign(RENDERERS, { dash:renderDash, calc:calc, order:()=>{}, olist:renderOrders, mats:renderMaterials, printers:renderPrinters, records:renderRecords, settings:renderSettings });

  /* 数据同步状态 LED */
  function updateSyncLed(st){
    const led = $("saveLed"), txt = $("modeText");
    if(st === "saving"){ led.style.background = "var(--accent)"; led.style.boxShadow = "0 0 6px var(--accent)"; txt.textContent = "保存中…"; }
    else if(st === "error"){ led.style.background = "var(--danger)"; led.style.boxShadow = "0 0 6px var(--danger)"; txt.textContent = "保存失败，请检查服务"; }
    else{
      const ok = "var(--ok)";
      led.style.background = ok; led.style.boxShadow = "0 0 6px " + ok;
      txt.textContent = S.mode === "server" ? "服务端存储 · 已同步" : "本地模式 · 服务未连接";
    }
  }
  S.onSync(updateSyncLed);
  // init() 在 store.js 加载时已同步执行，onSync 回调可能已错过初始 emit，这里主动更新一次
  updateSyncLed("saved");

  /* 时长下拉（闹钟样式） */
    (function fillDuration(){
    const h = $("rHoursH"), m = $("rHoursM");
    let html = "";
    for(let i = 0; i <= 48; i++) html += `<option value="${i}">${i}</option>`;
    h.innerHTML = html; h.value = "0";
    html = "";
    for(let i = 0; i < 60; i += 5) html += `<option value="${i}">${String(i).padStart(2, "0")}</option>`;
    m.innerHTML = html; m.value = "0";
    /* 总打印时间下拉：小时范围放宽到 200（覆盖 数量×单个 的批量场景） */
    const th = $("rTotHoursH"), tm = $("rTotHoursM");
    html = "";
    for(let i = 0; i <= 200; i++) html += `<option value="${i}">${i}</option>`;
    th.innerHTML = html; th.value = "0";
    tm.innerHTML = m.innerHTML; tm.value = "0";
  })();

  /* 默认处理耗时：计算器“处理耗时”为空时自动填入（打开应用 / 设置变更 / 清除表单后都会调用） */
  function applyDefaultLeadMin(){
    if(!$("rMin").value && S.settings.leadMin != null) $("rMin").value = S.settings.leadMin;
  }
  function refreshAll(){
    applyTheme(); applyFont(); updateMeta(); renderSettings(); fillSelects(); loadVersion();
    applyDefaultLeadMin(); // 默认处理耗时（计算器为空时填入）
    resetOrdForm(); calc();
    renderDash(); renderOrders(); renderMaterials(); renderPrinters(); renderRecords();
    $("headDate").textContent = S.today();
  }
  goto((location.hash.match(/^#\/(\w+)/) || [])[1] || "dash");

  /* ---------- 版本与更新 ---------- */
  let APP_VER = "";
  let remoteUpdate = null; // 检查到的新版本清单
  function cmpVer(a, b){
    const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
    for(let i = 0; i < 3; i++){
      const x = pa[i] || 0, y = pb[i] || 0;
      if(x !== y) return x > y ? 1 : -1;
    }
    return 0;
  }
  function renderChangelog(list){
    $("changelogList").innerHTML = list.map(e =>
      '<div class="chg"><div class="chg-v">v' + S.esc(e.v) + ' <span class="muted">' + S.esc(e.date || "") + '</span></div><ul>' +
      (e.items || []).map(i => "<li>" + S.esc(i) + "</li>").join("") + "</ul></div>"
    ).join("");
  }
  async function loadVersion(){
    try{
      const d = await fetch("/api/version").then(r => r.json());
      APP_VER = d.version;
      $("verCur").textContent = "v" + d.version + (d.build ? " · " + d.build : "");
      renderChangelog(d.changelog || []);
    }catch(e){ $("verCur").textContent = "未知"; }
  }
  function updShow(cls, html){
    const el = $("updResult"); el.className = "upd-result " + cls; el.innerHTML = html; el.hidden = false;
  }
  // 默认更新源（可被用户自定义 URL 覆盖）
  const DEFAULT_UPDATE_URL = "https://raw.githubusercontent.com/zzz2929/3D-Printing-Business-Platform/main/version.json";
  $("checkUpd").addEventListener("click", async () => {
    const customUrl = ($("setUpdateUrl").value || "").trim();
    const url = customUrl || DEFAULT_UPDATE_URL;
    if(customUrl) S.setSettings({ updateUrl:customUrl });
    const btn = $("checkUpd"); btn.disabled = true; const old = btn.textContent; btn.textContent = "检查中…";
    updShow("warn", "正在连接更新源…" + (customUrl ? "" : "（使用默认源）")); $("updResult").hidden = false; $("getUpd").style.display = "none";
    try{
      const m = await fetch(url, { cache:"no-store" }).then(r => { if(!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
      if(!m || !m.version) throw new Error("清单格式不正确（需要 version 字段）");
      const cmp = cmpVer(m.version, APP_VER);
      remoteUpdate = m;
      if(cmp > 0){
        updShow("warn", "发现新版本 <b>v" + S.esc(m.version) + "</b>（当前 v" + S.esc(APP_VER) + "）" +
          (m.date ? " · " + S.esc(m.date) : "") +
          (m.notes && m.notes.length ? '<ul class="um-note">' + m.notes.map(n => "<li>" + S.esc(n) + "</li>").join("") + "</ul>" : ""));
        $("getUpd").style.display = "";
      }else if(cmp === 0){
        updShow("ok", "已是最新版本 v" + S.esc(APP_VER) + "。");
      }else{
        updShow("ok", "本地版本 v" + S.esc(APP_VER) + " 比更新源（v" + S.esc(m.version) + "）还新。");
      }
    }catch(e){
      updShow("err", "检查失败：" + S.esc(e.message) + "。请确认更新源 URL 可访问，且服务端允许跨域（CORS）。");
    }finally{ btn.disabled = false; btn.textContent = old; }
  });
  $("getUpd").addEventListener("click", () => {
    const m = remoteUpdate; if(!m) return;
    $("umTitle").textContent = "获取更新 · v" + m.version;
    $("umBody").innerHTML =
      (m.notes && m.notes.length ? '<ul class="um-note">' + m.notes.map(n => "<li>" + S.esc(n) + "</li>").join("") + "</ul>" : "") +
      (m.downloadUrl ? '<a class="btn um-link" href="' + S.esc(m.downloadUrl) + '" target="_blank" rel="noopener">打开下载页 / 查看更新说明</a>' : "")
    $("updModal").hidden = false;
  });
  $("umClose").addEventListener("click", () => { $("updModal").hidden = true; });
  $("updModal").addEventListener("click", e => { if(e.target === $("updModal")) $("updModal").hidden = true; });
  $("umBody").addEventListener("click", e => {
    const c = e.target.closest(".copy"); if(!c) return;
    const t = c.getAttribute("data-cmd").replace("&#10;", "\n");
    const done = () => { c.textContent = "已复制"; setTimeout(() => c.textContent = "复制", 1200); };
    if(navigator.clipboard) navigator.clipboard.writeText(t).then(done).catch(() => toast("复制失败，请手动选择文本复制"));
    else toast("复制失败，请手动选择文本复制");
  });
  $("setUpdateUrl").addEventListener("change", () => S.setSettings({ updateUrl:$("setUpdateUrl").value.trim() }));

  mountCostPick(); // 总成本勾选面板（含恢复上次勾选）

  /* ---------- 登录门 ---------- */
  let appStarted = false;
  function appStart(){
    if(appStarted) return; appStarted = true;
    refreshAll(); applyPerms(); applyLogoutVisibility();
    loadBambu(); // 拓竹连接状态（耗材页卡片）
    restoreCalcState(); calcStateReady = true; // 恢复上次计算器选项，此后输入即持久化
    // 按当前 hash 落页（goto 内部会拦下无权限的页面）
    goto((location.hash.match(/^#\/(\w+)/) || [])[1] || currentTab || "dash");
    // 首启优先级：开放模式 + 未完成首启设置 → 向导；否则常规新手引导
    if(S.mode === "server" && S.auth.openMode && !S.settings.setupDone){
      setupShow();
    }else if(!S.settings.onboarded){
      obShow(); // 初次使用自动引导
    }
    const sp = S.settings.startPage;    // 启动页
    if(sp && PAGE_TITLES[sp] && !location.hash) goto(sp);
  }
  /* 鉴权状态变化统一回调：登出 → 弹登录门；登入 → 收起登录门并刷新 */
  let manualLogout = false;
  function handleAuthChange(){
    applyLogoutVisibility();
    const required = S.auth.required;
    const ok = S.auth.ok;
    if(required && !ok){
      // 已登出或首次登录：收起其它 overlay，弹登录门
      const w = $("setupWizard"); if(w) w.hidden = true;
      const o = $("onboard"); if(o) o.hidden = true;
      appStarted = false; // 允许后续登录后重新 appStart
      if(manualLogout){ manualLogout = false; } else { showLoginGate(); }
    }else if(required && ok){
      // 已登录：收起登录门，确保界面已启动
      const g = $("loginGate"); if(g) g.hidden = true;
      appStart();
      loadUserMgmt();
    }
  }
  S.onAuthChange(handleAuthChange);
  function loginErr(msg){
    const e = $("loginErr"); e.textContent = msg; e.hidden = !msg;
  }
  /* 密码强度验证：8位以上，包含大小写字母和数字 */
  function validatePassword(pw){
    if(!pw) return "请输入密码";
    if(pw.length < 8) return "密码至少 8 位";
    if(!/[A-Z]/.test(pw)) return "密码需包含大写字母";
    if(!/[a-z]/.test(pw)) return "密码需包含小写字母";
    if(!/\d/.test(pw)) return "密码需包含数字";
    return "";
  }
  /* 密码强度等级：0 空 / 1 仅长度 / 2 长度+任一规则 / 3 长度+两类规则 / 4 全部满足 */
  function pwStrength(pw){
    if(!pw) return 0;
    let lv = 1;
    if(pw.length >= 8) lv++;
    const types = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length;
    if(types >= 2) lv++;
    if(types >= 3 && pw.length >= 10) lv++;
    return Math.min(4, lv);
  }
  /* 内联错误显示：errEl 显示 ok / bad / hint；inputEl 加 valid / invalid 边框 */
  function setFieldState(errEl, inputEl, msg, isBad){
    if(errEl){
      errEl.textContent = msg || "";
      errEl.classList.toggle("bad", !!isBad);
      errEl.classList.toggle("ok", !!msg && !isBad);
    }
    if(inputEl){
      inputEl.classList.toggle("invalid", !!isBad);
      inputEl.classList.toggle("valid", !!msg && !isBad);
    }
  }
  /* 用户名校验：2 位以上，字母数字下划线 */
  function validateUsername(name){
    if(!name) return "请输入用户名";
    if(name.length < 2) return "用户名至少 2 个字符";
    if(!/^[a-zA-Z0-9_]+$/.test(name)) return "用户名只能包含字母、数字和下划线";
    return "";
  }
  /* 邮箱格式校验（空字符串视为合法——邮箱可选） */
  function validateEmailOptional(em){
    if(!em) return "";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return "邮箱格式不正确";
    return "";
  }
  /* 更新密码强度条 */
  function updatePwMeter(pw, meterEl, barEl, labelEl){
    if(!meterEl) return;
    if(!pw){ meterEl.hidden = true; return; }
    meterEl.hidden = false;
    const lv = pwStrength(pw);
    const labels = ["", "弱：仅长度", "一般：满足部分规则", "良好：长度+多类型", "强：长度+字符种类丰富"];
    barEl.parentElement.className = "pw-meter-bar" + (lv >= 2 ? " lv-" + lv : "");
    labelEl.textContent = labels[lv] || "";
  }
  function showLoginGate(){
    $("loginTitle").textContent = "登录";
    $("loginSub").textContent = "输入用户名和密码登录。";
    $("loginUser").value = ""; $("loginPw").value = "";
    loginErr("");
    const gate = $("loginGate");
    gate.hidden = false;
    gate.style.opacity = ""; gate.style.visibility = "";
    $("loginMain").hidden = false; $("forgotBox").hidden = true;
    fx(g => {
      g.from(gate, { autoAlpha:0, duration:0.22, ease:"power1.out", clearProps:"opacity,visibility" });
      g.from("#loginGate .ob-card", { y:26, scale:0.96, autoAlpha:0, duration:0.38, ease:"power3.out", clearProps:"all" });
    });
    $("loginUser").focus();
  }
  /* ---- 忘记密码：邮箱验证码重置 ---- */
  function fpErr(msg){ const e = $("fpErr"); e.textContent = msg; e.hidden = !msg; }
  function showForgot(show){
    $("loginMain").hidden = show;
    $("forgotBox").hidden = !show;
    $("loginTitle").textContent = show ? "找回密码" : "登录";
    $("loginSub").textContent = show ? "通过绑定邮箱验证码重置密码。" : "输入用户名和密码登录。";
    fpErr("");
  }
  $("forgotLink").addEventListener("click", () => {
    $("fpUser").value = $("loginUser").value.trim();
    $("fpCode").value = ""; $("fpNew").value = "";
    showForgot(true);
    $("fpUser").focus();
  });
  $("fpBack").addEventListener("click", () => showForgot(false));
  $("fpSend").addEventListener("click", async () => {
    const user = $("fpUser").value.trim();
    if(!user){ fpErr("请输入用户名"); return; }
    const btn = $("fpSend");
    btn.disabled = true;
    try{
      await S.forgotRequest(user);
      fpErr("");
      toast("若该账号绑定了邮箱，验证码已发送");
      let left = 60;
      btn.textContent = left + "s";
      const timer = setInterval(() => {
        btn.textContent = (--left) + "s";
        if(left < 0){ clearInterval(timer); btn.textContent = "获取验证码"; btn.disabled = false; }
      }, 1000);
    }catch(e){
      btn.disabled = false;
      fpErr(e.message || "发送失败");
    }
  });
  $("fpReset").addEventListener("click", async () => {
    const user = $("fpUser").value.trim(), code = $("fpCode").value.trim(), pw = $("fpNew").value;
    if(!user){ fpErr("请输入用户名"); return; }
    if(!code){ fpErr("请输入验证码"); return; }
    if(!pw){ fpErr("请填写新密码"); return; }
    const pwdErr = validatePassword(pw);
    if(pwdErr){ fpErr(pwdErr); return; }
    $("fpReset").disabled = true;
    try{
      await S.forgotReset(user, code, pw);
      fpErr("");
      showForgot(false);
      $("fpUser").value = ""; $("fpCode").value = ""; $("fpNew").value = "";
      toast("密码已重置，请登录");
    }catch(e){ fpErr(e.message || "重置失败"); }
    finally{ $("fpReset").disabled = false; }
  });
  async function doLogin(){
    const user = $("loginUser").value.trim();
    const pw = $("loginPw").value;
    if(!user){ loginErr("请输入用户名"); return; }
    if(!pw){ loginErr("请输入密码"); return; }
    $("loginBtn").disabled = true; loginErr("");
    try{
      await S.login(user, pw);
      $("loginGate").hidden = true;
      toast("已解锁 " + randFace());
      appStart();
      loadUserMgmt();
    }catch(e){
      loginErr(e.message || "登录失败");
      $("loginPw").value = ""; $("loginPw").focus();
    }finally{
      $("loginBtn").disabled = false;
    }
  }
  $("loginBtn").addEventListener("click", doLogin);
  $("loginUser").addEventListener("keydown", e => { if(e.key === "Enter") doLogin(); });
  $("loginPw").addEventListener("keydown", e => { if(e.key === "Enter") doLogin(); });
  /* 退出登录：顶栏唯一入口，登录态可见 */
  const logoutEl = $("logoutBtnTop");
  logoutEl.addEventListener("click", async () => { await S.logout(); location.reload(); });
  /* 顶栏兜底"登录"按钮：未登录但需要登录时显示，点击直接弹登录门 */
  const loginTopEl = $("loginBtnTop");
  if(loginTopEl){
    loginTopEl.addEventListener("click", () => showLoginGate());
  }
  function applyLogoutVisibility(){
    const needAuth = S.mode === "server" && S.auth.required && !S.auth.ok;
    const logged   = S.mode === "server" && S.auth.required && S.auth.ok;
    logoutEl.style.display  = logged  ? "" : "none";
    if(loginTopEl) loginTopEl.style.display = needAuth ? "" : "none";
  }

  /* ---------- 用户管理（账号设置已合并于此） ----------
     管理员：表格列出全部用户，可编辑（用户名/密码/角色/停用）、删除、添加；
     普通用户：只看到自己一行，可改用户名？否——仅可改自己的密码（需验证当前密码）。 */
  async function loadUserMgmt(){
    applyLogoutVisibility();
    const openCard = $("openModeCard");
    if(openCard) openCard.hidden = !(S.mode === "server" && S.auth.openMode); // 开放模式提示卡
    const card = $("userMgmtCard");
    if(!card) return;
    if(!S.auth.required || !S.auth.ok){ card.hidden = true; return; } // 未登录 / 开放模式不显示
    const isAdmin = S.auth.role === "admin";
    card.hidden = false;
    $("userMgmtScope").textContent = isAdmin ? "管理员" : "当前账号";
    $("userMgmtDesc").textContent = isAdmin
      ? "管理账号：编辑用户名、重置密码、分配角色、停用或删除。"
      : "管理自己的账号：可修改登录密码。";
    $("addUserSection").hidden = !isAdmin;
    hideEditUser();
    if(isAdmin){
      loadSmtpCard(); // 邮件服务配置（仅管理员）
      await loadSessionCard(); // 登录安全（仅管理员，供表格显示登录有效期）
    }
    try{
      let users;
      if(isAdmin){
        users = await S.apiUsers();
        if(!users || users.error || !Array.isArray(users)){
          $("userList").innerHTML = '<p class="muted">用户列表加载失败</p>';
          return;
        }
      }else{
        // 普通用户：只渲染自己这一行
        users = [{ id:S.auth.userId, username:S.auth.username, role:S.auth.role, disabled:false, email:S.auth.email || "" }];
      }
      renderUserList(users, isAdmin);
    }catch(e){ console.warn("加载用户列表失败", e); }
  }

  function renderUserList(users, isAdmin){
    const box = $("userList");
    const me = S.auth.userId || "";
    const sessionTh = isAdmin ? '<th style="white-space:nowrap">登录有效期</th>' : "";
    box.innerHTML = `<table><thead><tr><th>用户名</th><th>角色</th><th>状态</th>${sessionTh}<th style="white-space:nowrap">操作</th></tr></thead><tbody>` +
      users.map(u => {
        const isMe = u.id === me;
        const rolePill = u.role === "admin"
          ? '<span class="pill" style="background:var(--accent)">管理员</span>'
          : '<span class="pill">普通用户</span>';
        const statePill = u.disabled
          ? '<span class="pill" style="background:var(--danger)">已停用</span>'
          : '<span class="pill">已启用</span>';
        const sessionTd = isAdmin ? `<td>${sessionDaysCache === 0 ? "永久" : (sessionDaysCache != null ? sessionDaysCache + " 天" : "—")}</td>` : "";
        const delBtn = isAdmin && !isMe
          ? `<button class="btn danger ghost sm" data-delu="${u.id}" data-name="${S.esc(u.username)}">删除</button>` : "";
        return `<tr>
          <td>${S.esc(u.username)}${isMe ? ' <span class="pill">当前账号</span>' : ""}</td>
          <td>${rolePill}</td>
          <td>${statePill}</td>
          ${sessionTd}
          <td style="white-space:nowrap"><button class="btn ghost sm" data-editu="${u.id}">编辑</button> ${delBtn}</td>
        </tr>`;
      }).join("") + "</tbody></table>";
    box.querySelectorAll("[data-delu]").forEach(b => b.addEventListener("click", () => deleteUser(b.getAttribute("data-delu"), b.getAttribute("data-name"))));
    box.querySelectorAll("[data-editu]").forEach(b => b.addEventListener("click", () => {
      const u = users.find(x => x.id === b.getAttribute("data-editu"));
      if(u) showEditUser(u, isAdmin);
    }));
  }

  /* 编辑表单：参考“用户名 / 新密码 / 角色 / 停用 / 权限”；不加基本路径 */
  let editTarget = null; // { id, isAdmin, isMe, orig }
  function showEditUser(u, isAdmin){
    const isMe = u.id === S.auth.userId;
    editTarget = { id:u.id, isAdmin, isMe, orig:u };
    $("editUserTitle").textContent = "编辑 · " + u.username + (isMe ? "（当前账号）" : "");
    $("editUserName").value = u.username;
    $("editUserName").disabled = !isAdmin;      // 普通用户只能改密码
    $("editUserPw").value = "";
    const canRole = isAdmin && !isMe;
    $("editRoleBox").hidden = !canRole;
    if(canRole) $("editUserRole").value = u.role;
    $("editSelfPwBox").hidden = isAdmin;        // 普通用户改自己密码需验证当前密码
    const canDisable = isAdmin && !isMe;
    $("editDisabledBox").hidden = !canDisable;
    $("editUserDisabled").checked = !!u.disabled;
    const canPerms = isAdmin && !isMe;
    $("editPermsBox").hidden = !canPerms;
    if(canPerms) renderPermsGrid(u.perms);
    const canSession = isAdmin;
    $("editSessionBox").hidden = !canSession;
    if(canSession) $("editSessionDays").value = sessionDaysCache != null ? sessionDaysCache : 30;
    // 邮箱：自己改需验证码；管理员改他人可直接设置
    $("editUserEmail").value = u.email || "";
    $("editMailCode").value = "";
    $("editMailSend").hidden = !isMe;
    $("editMailCode").hidden = !isMe;
    $("editUserBox").hidden = false;
    $("editUserName").focus();
  }
  function renderPermsGrid(perms){
    $("editPermsGrid").innerHTML = PERM_DEFS.map(g =>
      '<div class="perm-group"><div class="perm-group-t">' + g.group + '</div><div class="perm-grid">' +
      g.items.map(([k, label]) => {
        const on = perms ? !!perms[k] : true; // 未设置过 = 全部允许
        return '<label class="perm-item"><input type="checkbox" data-perm="' + k + '"' + (on ? " checked" : "") + " />" + label + "</label>";
      }).join("") + "</div></div>"
    ).join("");
  }
  function hideEditUser(){
    editTarget = null;
    const box = $("editUserBox");
    if(box) box.hidden = true;
  }
  $("cancelEditUser").addEventListener("click", hideEditUser);
  /* 自己绑定邮箱：发送验证码（60s 冷却） */
  let mailBtnTimer = null;
  $("editMailSend").addEventListener("click", async () => {
    const email = $("editUserEmail").value.trim();
    if(!email){ toast("请先填写邮箱"); return; }
    const btn = $("editMailSend");
    btn.disabled = true;
    try{
      await S.mailCode(email);
      $("editMailCode").hidden = false;
      toast("验证码已发送至该邮箱");
      let left = 60;
      btn.textContent = left + "s";
      mailBtnTimer = setInterval(() => {
        btn.textContent = (--left) + "s";
        if(left < 0){ clearInterval(mailBtnTimer); btn.textContent = "发送验证码"; btn.disabled = false; }
      }, 1000);
    }catch(e){
      btn.disabled = false;
      toast(e.message || "发送失败");
    }
  });
  $("saveEditUser").addEventListener("click", async () => {
    if(!editTarget) return;
    const { id, isAdmin, isMe, orig } = editTarget;
    const username = $("editUserName").value.trim();
    const pw = $("editUserPw").value;
    const email = $("editUserEmail").value.trim();
    const emailChanged = email !== (orig.email || "");
    if(pw){
      const pwdErr = validatePassword(pw);
      if(pwdErr){ toast(pwdErr); return; }
    }
    if(emailChanged && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ toast("邮箱格式不正确"); return; }
    try{
      // 自己改邮箱：需要邮箱验证码（管理员与普通用户一致，防绑错/绑他人邮箱）
      if(emailChanged && isMe){
        const mcode = $("editMailCode").value.trim();
        if(!mcode){ toast("请输入邮箱验证码"); return; }
        await S.mailBind(email, mcode);
      }
      if(isAdmin){
        const updates = {};
        if(username && username !== orig.username) updates.username = username;
        if(pw) updates.password = pw;
        if(!isMe){
          if($("editUserRole").value !== orig.role) updates.role = $("editUserRole").value;
          if($("editUserDisabled").checked !== !!orig.disabled) updates.disabled = $("editUserDisabled").checked;
          if(emailChanged) updates.email = email; // 管理员可直接设置他人邮箱
          // 权限勾选（总是收集，便于把“全开”显式落库）
          const perms = {};
          let anyPage = false;
          document.querySelectorAll("#editPermsGrid input[data-perm]").forEach(i => {
            const k = i.getAttribute("data-perm");
            perms[k] = i.checked;
            if(k.startsWith("page_") && i.checked) anyPage = true;
          });
          if(!anyPage){ toast("至少需要保留一个可访问页面"); return; }
          updates.perms = perms;
        }
        // 会话有效期为全局设置，从编辑表单单独保存
        const sdRaw = $("editSessionDays").value.trim();
        const sd = Number(sdRaw);
        const sdChanged = sessionDaysCache == null ? false : sd !== sessionDaysCache;
        if(sdChanged && (!(sd >= 0 && sd <= 365))){ toast("会话有效期需为 0-365 的整数天（0 表示永久）"); return; }
        if(!Object.keys(updates).length && !sdChanged){
          if(emailChanged){ hideEditUser(); toast("邮箱已更新"); loadUserMgmt(); return; }
          toast("没有修改"); return;
        }
        if(Object.keys(updates).length) await S.apiUpdateUser(id, updates);
        if(sdChanged) await S.authCfgSave(sd);
        hideEditUser();
        if(pw && isMe){
          // 改自己的密码后旧会话已失效，回登录门
          toast("密码已更新，请重新登录");
          setTimeout(() => location.reload(), 900);
          return;
        }
        toast("已保存");
      }else{
        // 普通用户：仅自己的邮箱（验证码绑定）与密码
        if(!emailChanged && !pw){ toast("没有修改"); return; }
        if(pw){
          const cur = $("editUserCurPw").value;
          if(!cur){ toast("请输入当前密码"); return; }
          const r = await fetch("/api/change-password", {
            method:"POST", headers:{ "content-type":"application/json" },
            body: JSON.stringify({ currentPassword:cur, newPassword:pw })
          });
          const j = await r.json().catch(() => ({}));
          if(!r.ok || !j.ok) throw new Error(j.error || "修改失败");
        }
        hideEditUser();
        toast(pw ? "密码已更新，请重新登录" : "邮箱已更新");
        if(pw){ setTimeout(() => location.reload(), 900); return; }
      }
      loadUserMgmt();
    }catch(e){ toast(e.message || "保存失败"); }
  });

  async function deleteUser(id, name){
    if(!await confirmBox("确定删除用户「" + name + "」？")) return;
    try{
      await S.apiDeleteUser(id);
      toast("已删除「" + name + "」");
      loadUserMgmt();
    }catch(e){ toast("删除失败：" + e.message); }
  }

  /* ---------- 登录安全：会话有效期（仅管理员） ---------- */
  let sessionDaysCache = null; // 全局会话有效期（天），编辑表单使用
  async function loadSessionCard(){
    try{
      const cfg = await S.authCfgGet();
      sessionDaysCache = cfg.sessionDays;
    }catch(e){ sessionDaysCache = null; }
  }
  /* 会话有效期设置卡（仅管理员）：HTML 中如尚未补全则跳过绑定，避免中断后续脚本 */
  (function bindSessionCard(){
    const btn = $("sessionSave");
    if(!btn) return; // 元素缺失，不绑定（防御性）
    btn.addEventListener("click", async () => {
      const days = Number($("sessionDays").value);
      if(!(days >= 0 && days <= 365)){ $("sessionMsg").textContent = "请输入 0-365 的整数天（0 表示永久）"; $("sessionMsg").style.color = "var(--danger)"; return; }
      btn.disabled = true;
      try{
        await S.authCfgSave(days);
        $("sessionMsg").textContent = days === 0 ? "已保存：登录永久有效（对之后的新登录生效）。" : "已保存：" + days + " 天后登录过期（对之后的新登录生效）。";
        $("sessionMsg").style.color = "var(--ok)";
        toast("会话有效期已更新为 " + days + " 天");
      }catch(e){
        $("sessionMsg").textContent = e.message || "保存失败";
        $("sessionMsg").style.color = "var(--danger)";
      }finally{ btn.disabled = false; }
    });
  })();

  /* ---------- 邮件服务（SMTP）配置：仅管理员，存服务端 ---------- */
  function smtpMsg(msg, isErr){
    const el = $("smtpMsg");
    el.textContent = msg;
    el.style.color = isErr ? "var(--danger)" : "var(--ok)";
  }
  async function loadSmtpCard(){
    const card = $("smtpCard");
    if(!card) return;
    card.hidden = false;
    try{
      const cfg = await S.smtpGet();
      $("smtpHost").value = cfg.host || "";
      $("smtpPort").value = cfg.port || "";
      $("smtpSecure").checked = !!cfg.secure;
      $("smtpUser").value = cfg.user || "";
      $("smtpPass").value = "";
      $("smtpPass").placeholder = cfg.hasPass ? "已保存，留空表示不修改" : "留空表示不修改";
      $("smtpFrom").value = cfg.from || "";
      $("smtpStatus").textContent = cfg.configured
        ? (cfg.debug ? "邮件服务已启用（调试模式：验证码打印到服务端日志，不真实发信）。" : "邮件服务已启用。配置后用户可绑定邮箱并使用「忘记密码」。")
        : "邮件服务未启用。配置并保存后，用户可绑定邮箱并使用「忘记密码」。";
    }catch(e){
      card.hidden = true; // 非 2929 旧服务端等场景没有该接口
    }
  }
  function smtpFormCfg(){
    return {
      host: $("smtpHost").value.trim(),
      port: $("smtpPort").value.trim(),
      secure: $("smtpSecure").checked,
      user: $("smtpUser").value.trim(),
      pass: $("smtpPass").value,
      from: $("smtpFrom").value.trim()
    };
  }
  $("smtpSave").addEventListener("click", async () => {
    const cfg = smtpFormCfg();
    if(!cfg.host){ smtpMsg("请填写服务器地址", true); return; }
    try{
      await S.smtpSave(cfg);
      smtpMsg("已保存，邮件服务即刻生效");
      loadSmtpCard();
    }catch(e){ smtpMsg(e.message || "保存失败", true); }
  });
  $("smtpTest").addEventListener("click", async () => {
    const to = $("smtpTestTo").value.trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)){ smtpMsg("请填写测试收件邮箱", true); return; }
    const btn = $("smtpTest");
    btn.disabled = true; smtpMsg("发送中…");
    try{
      await S.smtpTest(smtpFormCfg(), to);
      smtpMsg("测试邮件已发送至 " + to + "，请查收");
    }catch(e){
      smtpMsg(e.message || "发送失败", true);
    }finally{ btn.disabled = false; }
  });
  $("addUserBtn").addEventListener("click", async () => {
    const name = $("newUserName").value.trim();
    const pw = $("newUserPw").value;
    const role = $("newUserRole").value;
    if(!name){ toast("请输入用户名"); return; }
    if(!pw){ toast("请输入密码"); return; }
    const pwdErr = validatePassword(pw);
    if(pwdErr){ toast(pwdErr); return; }
    try{
      await S.apiRegister(name, pw, role);
      toast("已添加用户「" + name + "」");
      $("newUserName").value = ""; $("newUserPw").value = "";
      loadUserMgmt();
    }catch(e){ toast(e.message || "添加失败"); }
  });

  /* ============ 首启设置向导 ============
   仅当服务端处于开放模式且用户未跳过首次设置时弹出。
   Step 1：创建管理员（必填用户名 / 密码，邮箱可选）
   Step 2：SMTP 配置（全部可选，可跳过 → 保持开放模式）
   任意步骤选「跳过」即记录 openModeSkipped 标记并关闭向导 */
  let setupIdx = 0;
  const SETUP_STEPS = [
    { ic:"👋", title:"欢迎使用 3D 打印业务平台",  sub:"先设置一个管理员账号，即可启用密码保护。也可跳过保持开放模式。" },
    { ic:"📧", title:"配置邮件服务（可选）",     sub:"启用后用户绑定邮箱，可通过验证码重置密码。" }
  ];
  function setupRender(){
    const s = SETUP_STEPS[setupIdx];
    $("setupStep").textContent = (setupIdx + 1) + " / " + SETUP_STEPS.length;
    $("setupIcon").textContent = s.ic;
    $("setupTitle").textContent = s.title;
    $("setupSub").textContent = s.sub;
    $("setupStep1").hidden = setupIdx !== 0;
    $("setupStep2").hidden = setupIdx !== 1;
    $("setupPrev").hidden = setupIdx === 0;
    $("setupNext").textContent = setupIdx === SETUP_STEPS.length - 1 ? "完成" : "下一步";
    // 进入 Step 2 时若有 SMTP 错误则清空
    if(setupIdx === 1){ setFieldState($("setupSmtpErr"), null, "", false); }
  }
  function refreshSetupStep1(){
    const name = $("setupUserName").value.trim();
    const em   = $("setupEmail").value.trim();
    const pw   = $("setupPw").value;
    const cf   = $("setupPwConfirm").value;
    const nameErr = validateUsername(name);
    const emErr   = validateEmailOptional(em);
    const pwErr   = pw ? validatePassword(pw) : "";
    const cfErr   = cf && cf !== pw ? "两次输入的密码不一致" : "";
    setFieldState($("setupUserNameErr"), $("setupUserName"), name ? (nameErr || "✓ 可用") : "", !!nameErr);
    setFieldState($("setupEmailErr"),   $("setupEmail"),     emErr ? emErr : (em ? "✓ 格式正确" : ""), !!emErr);
    setFieldState($("setupPwErr"),      $("setupPw"),        pwErr || (pw ? "✓ 符合强度要求" : ""), !!pwErr);
    setFieldState($("setupPwConfirmErr"),$("setupPwConfirm"), cfErr || (cf && !cfErr ? "✓ 一致" : ""), !!cfErr);
    updatePwMeter(pw, $("setupPwMeter"), $("setupPwMeterBar"), $("setupPwMeterLabel"));
    return { nameErr, emErr, pwErr, cfErr, name, em, pw, cf };
  }
  function setupShow(){
    setupIdx = 0; setupRender();
    // 重置表单（保留可能已输入的值）
    ["setupUserName","setupEmail","setupPw","setupPwConfirm"].forEach(id => { const el = $(id); if(el) el.value = ""; });
    ["setupUserNameErr","setupEmailErr","setupPwErr","setupPwConfirmErr"].forEach(id => setFieldState($(id), null, "", false));
    refreshSetupStep1();
    $("setupWizard").hidden = false;
    fx(g => {
      g.from("#setupWizard", { autoAlpha:0, duration:0.2, ease:"power1.out" });
      g.from("#setupWizard .ob-card", { y:24, scale:0.96, autoAlpha:0, duration:0.36, ease:"power3.out", clearProps:"all" });
    });
    $("setupUserName").focus();
  }
  function setupClose(){
    $("setupWizard").hidden = true;
    S.setSettings({ setupDone:true });
  }
  ["setupUserName","setupEmail","setupPw","setupPwConfirm"].forEach(id => {
    const el = $(id); if(!el) return;
    el.addEventListener("input", refreshSetupStep1);
    el.addEventListener("blur", refreshSetupStep1);
  });
  $("setupPrev").addEventListener("click", () => {
    if(setupIdx > 0){ setupIdx--; setupRender(); }
  });
  $("setupNext").addEventListener("click", async () => {
    if(setupIdx === 0){
      const st = refreshSetupStep1();
      // 校验顺序：用户名 → 邮箱 → 密码 → 确认密码
      if(st.nameErr){ setFieldState($("setupUserNameErr"), $("setupUserName"), st.nameErr, true); $("setupUserName").focus(); toast(st.nameErr); return; }
      if(st.emErr){ setFieldState($("setupEmailErr"), $("setupEmail"), st.emErr, true); $("setupEmail").focus(); toast(st.emErr); return; }
      if(!st.pw){ $("setupPw").focus(); toast("请输入密码"); return; }
      if(st.pwErr){ setFieldState($("setupPwErr"), $("setupPw"), st.pwErr, true); $("setupPw").focus(); toast(st.pwErr); return; }
      if(!st.cf){ $("setupPwConfirm").focus(); toast("请再次输入密码"); return; }
      if(st.cfErr){ setFieldState($("setupPwConfirmErr"), $("setupPwConfirm"), st.cfErr, true); $("setupPwConfirm").focus(); toast(st.cfErr); return; }
      const next = $("setupNext");
      const orig = next.textContent;
      next.textContent = "创建中…"; next.style.pointerEvents = "none";
      try{
        await S.createAdmin(st.name, st.pw);
        if(st.em){
          try{ await S.mailCode(st.em); toast("已发送邮箱验证码，请在「数据与账号」→ 自己的账号中绑定"); }
          catch(_){ /* SMTP 未配置可忽略 */ }
        }
        next.textContent = orig; next.style.pointerEvents = "";
        setupIdx = 1; setupRender();
      }catch(e){
        setFieldState($("setupUserNameErr"), $("setupUserName"), e.message || "创建失败", true);
        next.textContent = orig; next.style.pointerEvents = "";
        refreshSetupStep1();
        toast(e.message || "创建失败");
      }
      return;
    }
    if(setupIdx === 1){
      // SMTP 配置：可全部留空跳过；填写了任何字段就尝试保存
      const cfg = {
        host: $("setupSmtpHost").value.trim(),
        port: Number($("setupSmtpPort").value) || 465,
        user: $("setupSmtpUser").value.trim(),
        pass: $("setupSmtpPass").value,
        from: $("setupSmtpFrom").value.trim() || $("setupSmtpUser").value.trim(),
        secure: $("setupSmtpSecure").value
      };
      const hasAny = cfg.host || cfg.user || cfg.pass;
      if(hasAny){
        const next = $("setupNext");
        const orig = next.textContent;
        next.textContent = "保存中…"; next.style.pointerEvents = "none";
        try{ await S.smtpSave(cfg); toast("SMTP 已配置"); next.textContent = orig; next.style.pointerEvents = ""; }
        catch(e){
          setFieldState($("setupSmtpErr"), null, e.message || "保存失败", true);
          next.textContent = orig; next.style.pointerEvents = "";
          toast(e.message || "保存失败"); return;
        }
      }
      setupClose();
      toast("设置完成 ✓");
    }
  });
  $("setupSkip").addEventListener("click", () => {
    // Step 1 中途跳过 → 不创建任何账号，保持开放模式
    if(setupIdx === 0 && ($("setupUserName").value.trim() || $("setupPw").value)){
      showDialog("确认跳过？将不创建管理员账号，本系统保持开放模式。").then(ok => {
        if(!ok) return;
        setupClose();
        S.setSettings({ openModeSkipped:true });
        toast("已跳过，本系统继续以开放模式运行");
      });
      return;
    }
    setupClose();
    // Step 2 跳过 SMTP：此时管理员已创建，系统已转密码保护；不需 openModeSkipped 标记
    if(setupIdx === 1){
      toast("已跳过邮件服务设置，可稍后在「数据与账号」中配置");
    }
  });

/* 开放模式 → 启用密码保护：创建第一个管理员（服务端自动授予 admin 角色）
     内联校验：用户名 / 邮箱 / 密码 / 确认密码 实时校验，错误就近提示
     按钮始终可点：点击时再做最终校验并以 toast + 内联红字告知 */
  function refreshAdmFormState(){
    const name = $("admUserName").value.trim();
    const em   = $("admUserEmail").value.trim();
    const pw   = $("admUserPw").value;
    const cf   = $("admUserPwConfirm").value;
    const nameErr = validateUsername(name);
    const emErr   = validateEmailOptional(em);
    const pwErr   = pw ? validatePassword(pw) : "";
    const cfErr   = cf && cf !== pw ? "两次输入的密码不一致" : "";
    setFieldState($("admUserNameErr"), $("admUserName"), name ? (nameErr || "✓ 可用") : "", !!nameErr);
    setFieldState($("admUserEmailErr"), $("admUserEmail"), emErr ? emErr : (em ? "✓ 格式正确" : ""), !!emErr);
    setFieldState($("admUserPwErr"), $("admUserPw"), pwErr || (pw ? "✓ 符合强度要求" : ""), !!pwErr);
    setFieldState($("admUserPwConfirmErr"), $("admUserPwConfirm"), cfErr || (cf && !cfErr ? "✓ 一致" : ""), !!cfErr);
    updatePwMeter(pw, $("admPwMeter"), $("admPwMeterBar"), $("admPwMeterLabel"));
    return { nameErr, emErr, pwErr, cfErr, name, em, pw, cf };
  }
  ["admUserName","admUserEmail","admUserPw","admUserPwConfirm"].forEach(id => {
    const el = $(id); if(!el) return;
    el.addEventListener("input", refreshAdmFormState);
    el.addEventListener("blur", refreshAdmFormState);
  });
  refreshAdmFormState();

  $("createAdminBtn").addEventListener("click", async () => {
    const st = refreshAdmFormState();
    // 第一处错误就近高亮 + 聚焦 + toast 告知
    if(st.nameErr){ setFieldState($("admUserNameErr"), $("admUserName"), st.nameErr, true); $("admUserName").focus(); toast(st.nameErr); return; }
    if(st.emErr){ setFieldState($("admUserEmailErr"), $("admUserEmail"), st.emErr, true); $("admUserEmail").focus(); toast(st.emErr); return; }
    if(!st.pw){ $("admUserPw").focus(); toast("请输入密码"); return; }
    if(st.pwErr){ setFieldState($("admUserPwErr"), $("admUserPw"), st.pwErr, true); $("admUserPw").focus(); toast(st.pwErr); return; }
    if(!st.cf){ $("admUserPwConfirm").focus(); toast("请再次输入密码"); return; }
    if(st.cfErr){ setFieldState($("admUserPwConfirmErr"), $("admUserPwConfirm"), st.cfErr, true); $("admUserPwConfirm").focus(); toast(st.cfErr); return; }
    const btn = $("createAdminBtn");
    const orig = btn.textContent;
    btn.textContent = "创建中…"; btn.style.pointerEvents = "none";
    try{
      await S.createAdmin(st.name, st.pw);
      // 可选：邮箱绑定（如有）
      if(st.em){
        try{ await S.mailCode(st.em); }catch(_){ /* 邮箱绑定失败不影响创建 */ }
      }
      $("openModeCard").hidden = true;
      loadUserMgmt();
      toast("管理员已创建，本站已启用密码保护" + (st.em ? "；绑定邮箱验证码已发送" : ""));
    }catch(e){
      toast(e.message || "创建失败");
      btn.textContent = orig; btn.style.pointerEvents = "";
      // 服务端常见错误就近显示到第一个输入框下
      if(/用户名/.test(e.message || "")){ setFieldState($("admUserNameErr"), $("admUserName"), e.message, true); }
      else if(/邮箱|email/i.test(e.message || "")){ setFieldState($("admUserEmailErr"), $("admUserEmail"), e.message, true); }
      else if(/密码|password/i.test(e.message || "")){ setFieldState($("admUserPwErr"), $("admUserPw"), e.message, true); }
    }
  });

  /* 开放模式下跳过启用保护：关闭卡片、记一笔本地标记不再骚扰 */
  $("openModeSkipBtn").addEventListener("click", () => {
    $("openModeCard").hidden = true;
    S.setSettings({ openModeSkipped: true });
    toast("已跳过，本系统继续以开放模式运行");
  });

  Store.ready.then(mode => {
    if(mode === "auth"){ applyLogoutVisibility(); showLoginGate(); return; } // 服务端要求登录
    appStart();
    loadUserMgmt();
  });
  if("serviceWorker" in navigator){
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  function render(tab){ RENDERERS[tab] && RENDERERS[tab](); }
})();
