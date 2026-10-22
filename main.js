const KEY = "mashana_erp_v6_2";
const USERS_KEY = "mshana_users";
const CURRENT_USER_KEY = "mshana_current";
const THEME_KEY = "mshana_theme";

const ROLES = { iron:"🔥 مكوة", machine:"⚙️ مكن", floor:"🏠 أرضية", overlock:"🧵 أوفر" };
const DAY_NAMES = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];

// ============================================================
// ============ إدارة التاريخ (توقيت القاهرة) ============
// ============================================================
function dateToLocalStr(d){
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;
  return `${y}-${m}-${day}`;
}

function today(){ return dateToLocalStr(new Date()); }

function cairoMidnight(dateStr){
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

function daysDiff(ds){ 
  if (!ds) return null;
  const date1 = cairoMidnight(ds);
  const date2 = cairoMidnight(today());
  return Math.round((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================
// ============ أدوات مساعدة ============
// ============================================================
let data = {
  users:[], products:[], orders:[], suppliers:[], cuts:[],
  pieceWork:[], advances:[], payments:[], supPayments:[],
  attendance:[], weeklyPay:[],
  nextId:{user:1,prod:1,ord:1,sup:1,cut:1,work:1,adv:1,pay:1,spay:1,wp:1}
};

let dashChart = null;
let confirmCb = null;
let currentWeekStart = null;
let editContext = { type: null, id: null };
let customSaveHandler = null;

function save(){ localStorage.setItem(KEY, JSON.stringify(data)); }
function load(){ const s = localStorage.getItem(KEY); if(s){ try{ data = JSON.parse(s); }catch(e){} } }
function fmt(n){ n = Number(n)||0; return Math.round(n).toLocaleString("en-US"); }

function toast(msg, type="success"){ 
  const t = document.getElementById("toast"); 
  if (!t) return;
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  t.innerHTML = `<span style="font-size:18px">${icons[type] || ""}</span><span>${msg}</span>`;
  t.className = "toast " + type + " show"; 
  setTimeout(()=>t.classList.remove("show"), 2800); 
}

// ============================================================
// ============ تسجيل الدخول (بدون مستخدمين متعددين) ============
// ============================================================
function loadUsers(){
  const s = localStorage.getItem(USERS_KEY);
  if (s) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.length) return arr;
    } catch(e){}
  }
  return [{
    id: 1, username: "admin", fullName: "المدير العام",
    password: "mshana2711#", role: "admin", active: true
  }];
}

function currentUser(){
  return { id: 1, username: "admin", fullName: "المدير العام", role: "admin", active: true };
}

function doLogin(){
  const username = (document.getElementById("loginUsername").value || "").trim().toLowerCase();
  const pass = document.getElementById("pwInput").value;
  const errBox = document.getElementById("loginErr");
  
  const users = loadUsers();
  const user = users.find(u => u.username.toLowerCase() === username);
  
  if (!user || user.password !== pass) {
    errBox.textContent = "❌ بيانات الدخول غير صحيحة";
    errBox.style.display = "block";
    document.getElementById("pwInput").value = "";
    return;
  }
  
  errBox.style.display = "none";
  sessionStorage.setItem(CURRENT_USER_KEY, "1");
  document.getElementById("login").style.display = "none";
  document.getElementById("app").style.display = "block";
  load();
  renderAll();
  updateUserBadge();
  toast(`أهلاً ${user.fullName || user.username} 👋`);
}

function logout(){ 
  if (!confirm("هل تريد الخروج من النظام؟")) return;
  sessionStorage.removeItem(CURRENT_USER_KEY);
  window.location.replace(window.location.pathname + "?logout=" + Date.now());
}

(function checkLogoutParam() {
  if (window.location.search.includes("logout=")) {
    sessionStorage.removeItem(CURRENT_USER_KEY);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
})();

// ============================================================
// ============ الصلاحيات (دائماً Admin) ============
// ============================================================
function hasPermission(){ return true; }

function updateUserBadge(){
  const u = currentUser();
  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const avatarEl = document.getElementById("userAvatar");
  if (nameEl) nameEl.textContent = u.fullName || u.username;
  if (roleEl) roleEl.textContent = "👑 مدير";
  if (avatarEl) avatarEl.textContent = ((u.fullName || u.username) || "A").trim().charAt(0).toUpperCase();
}

// ============================================================
// ============ الثيم ============
// ============================================================
function toggleTheme(){
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
  if (dashChart) drawDashChart();
}
(function(){ 
  const t = localStorage.getItem(THEME_KEY) || "light"; 
  document.documentElement.setAttribute("data-theme", t); 
})();

function toggleSidebar(){ document.getElementById("sidebar").classList.toggle("open"); }

// ============================================================
// ============ محرك التعديل ============
// ============================================================
function openEditModal(title, html, type, id) {
  editContext = { type, id };
  document.getElementById("editModalTitle").textContent = "✏️ " + title;
  document.getElementById("editModalBody").innerHTML = html;
  document.getElementById("editModalBg").classList.add("show");
}
function closeEditModal() {
  document.getElementById("editModalBg").classList.remove("show");
  editContext = { type: null, id: null };
  customSaveHandler = null;
}

function saveEdit() {
  if (typeof customSaveHandler === "function") {
    const fn = customSaveHandler;
    customSaveHandler = null;
    fn();
    return;
  }
  
  const { type, id } = editContext;
  if (!type) return;
  
  try {
    if (type === "user") {
      const u = data.users.find(x => x.id === id);
      u.name = document.getElementById("edit-user-name").value.trim();
      u.role = document.getElementById("edit-user-role").value;
      if (u.role === "floor" || u.role === "overlock") {
        u.weekly_rate = Number(document.getElementById("edit-user-rate").value) || 0;
      } else {
        delete u.weekly_rate;
      }
    } else if (type === "product") {
      const p = data.products.find(x => x.id === id);
      p.name = document.getElementById("edit-prod-name").value.trim();
      p.price_iron = Number(document.getElementById("edit-prod-iron").value) || 0;
      p.price_machine = Number(document.getElementById("edit-prod-machine").value) || 0;
    } else if (type === "supplier") {
      const s = data.suppliers.find(x => x.id === id);
      s.name = document.getElementById("edit-sup-name").value.trim();
      s.phone = document.getElementById("edit-sup-phone").value.trim();
      s.note = document.getElementById("edit-sup-note").value.trim();
    } else if (type === "order") {
      const o = data.orders.find(x => x.id === id);
      o.supplier_id = Number(document.getElementById("edit-ord-supplier").value);
      o.product_id = Number(document.getElementById("edit-ord-product").value);
      o.qty = Number(document.getElementById("edit-ord-qty").value) || o.qty;
      o.price = Number(document.getElementById("edit-ord-price").value) || o.price;
      o.date = document.getElementById("edit-ord-date").value;
      o.delivered = Number(document.getElementById("edit-ord-delivered").value) || 0;
      o.status = o.delivered >= o.qty ? "done" : "pending";
    } else if (type === "cut") {
      const c = data.cuts.find(x => x.id === id);
      c.name = document.getElementById("edit-cut-name").value.trim();
      c.product_id = Number(document.getElementById("edit-cut-product").value);
      c.qty = Number(document.getElementById("edit-cut-qty").value) || c.qty;
      c.date = document.getElementById("edit-cut-date").value;
      c.note = document.getElementById("edit-cut-note").value;
    } else if (type === "work") {
      const w = data.pieceWork.find(x => x.id === id);
      w.qty = Number(document.getElementById("edit-work-qty").value) || w.qty;
      w.color = document.getElementById("edit-work-color").value || null;
      w.price = Number(document.getElementById("edit-work-price").value) || w.price;
      w.total = w.qty * w.price;
    } else if (type === "advance") {
      const a = data.advances.find(x => x.id === id);
      a.amount = Number(document.getElementById("edit-adv-amount").value) || a.amount;
      a.note = document.getElementById("edit-adv-note").value;
    } else if (type === "payment") {
      const p = data.payments.find(x => x.id === id);
      p.amount = Number(document.getElementById("edit-pay-amount").value) || p.amount;
      p.note = document.getElementById("edit-pay-note").value;
    } else if (type === "supPay") {
      const sp = data.supPayments.find(x => x.id === id);
      sp.amount = Number(document.getElementById("edit-spay-amount").value) || sp.amount;
      sp.note = document.getElementById("edit-spay-note").value;
    }
    
    save(); renderAll(); closeEditModal();
    toast("تم حفظ التعديل ✅");
  } catch (err) {
    console.error(err);
    toast("حدث خطأ في التعديل", "error");
  }
}

// ============================================================
// ============ دوال تعديل ============
// ============================================================
function editUser(id) {
  const u = data.users.find(x => x.id === id);
  const html = `
    <label>الاسم</label>
    <input id="edit-user-name" value="${u.name}">
    <label>الدور</label>
    <select id="edit-user-role" onchange="document.getElementById('edit-user-rate-wrap').style.display=(this.value==='floor'||this.value==='overlock')?'block':'none'">
      <option value="iron" ${u.role==='iron'?'selected':''}>🔥 مكوة</option>
      <option value="machine" ${u.role==='machine'?'selected':''}>⚙️ مكن</option>
      <option value="floor" ${u.role==='floor'?'selected':''}>🏠 أرضية</option>
      <option value="overlock" ${u.role==='overlock'?'selected':''}>🧵 أوفر</option>
    </select>
    <div id="edit-user-rate-wrap" style="display:${u.role==='floor'||u.role==='overlock'?'block':'none'}">
      <label>الأجر الأسبوعي</label>
      <input type="number" id="edit-user-rate" value="${u.weekly_rate || 0}">
    </div>
  `;
  openEditModal("تعديل عضو الفريق", html, "user", id);
}
function editProduct(id) {
  const p = data.products.find(x => x.id === id);
  const html = `
    <label>اسم الصنف</label>
    <input id="edit-prod-name" value="${p.name}">
    <label>سعر المكوة</label>
    <input type="number" id="edit-prod-iron" value="${p.price_iron}">
    <label>سعر المكن</label>
    <input type="number" id="edit-prod-machine" value="${p.price_machine}">
  `;
  openEditModal("تعديل الصنف", html, "product", id);
}
function editSupplier(id) {
  const s = data.suppliers.find(x => x.id === id);
  const html = `
    <label>اسم المستورد</label>
    <input id="edit-sup-name" value="${s.name}">
    <label>التليفون</label>
    <input id="edit-sup-phone" value="${s.phone || ''}">
    <label>ملاحظات</label>
    <input id="edit-sup-note" value="${s.note || ''}">
  `;
  openEditModal("تعديل مستورد", html, "supplier", id);
}
function editOrder(id) {
  const o = data.orders.find(x => x.id === id);
  const supOpts = data.suppliers.map(s => `<option value="${s.id}" ${s.id===o.supplier_id?'selected':''}>${s.name}</option>`).join('');
  const prodOpts = data.products.map(p => `<option value="${p.id}" ${p.id===o.product_id?'selected':''}>${p.name}</option>`).join('');
  const html = `
    <label>المستورد</label>
    <select id="edit-ord-supplier">${supOpts}</select>
    <label>الصنف</label>
    <select id="edit-ord-product">${prodOpts}</select>
    <label>الكمية</label>
    <input type="number" id="edit-ord-qty" value="${o.qty}">
    <label>الكمية المسلمة</label>
    <input type="number" id="edit-ord-delivered" value="${o.delivered}">
    <label>السعر</label>
    <input type="number" id="edit-ord-price" value="${o.price}">
    <label>التاريخ</label>
    <input type="date" id="edit-ord-date" value="${o.date || ''}">
  `;
  openEditModal("تعديل الطلب", html, "order", id);
}
function editCut(id) {
  const c = data.cuts.find(x => x.id === id);
  const prodOpts = data.products.map(p => `<option value="${p.id}" ${p.id===c.product_id?'selected':''}>${p.name}</option>`).join('');
  const html = `
    <label>اسم القصة</label>
    <input id="edit-cut-name" value="${c.name}">
    <label>الصنف</label>
    <select id="edit-cut-product">${prodOpts}</select>
    <label>العدد</label>
    <input type="number" id="edit-cut-qty" value="${c.qty}">
    <label>التاريخ</label>
    <input type="date" id="edit-cut-date" value="${c.date || ''}">
    <label>ملاحظات</label>
    <input id="edit-cut-note" value="${c.note || ''}">
  `;
  openEditModal("تعديل القصة", html, "cut", id);
}
function editWork(id) {
  const w = data.pieceWork.find(x => x.id === id);
  const html = `
    <label>العدد</label>
    <input type="number" id="edit-work-qty" value="${w.qty}">
    <label>اللون</label>
    <input id="edit-work-color" value="${w.color || ''}">
    <label>السعر</label>
    <input type="number" id="edit-work-price" value="${w.price}">
  `;
  openEditModal("تعديل الإنتاج", html, "work", id);
}
function editAdvance(id) {
  const a = data.advances.find(x => x.id === id);
  const html = `
    <label>المبلغ</label>
    <input type="number" id="edit-adv-amount" value="${a.amount}">
    <label>ملاحظة</label>
    <input id="edit-adv-note" value="${a.note || ''}">
  `;
  openEditModal("تعديل المصروف", html, "advance", id);
}
function editPayment(id) {
  const p = data.payments.find(x => x.id === id);
  const html = `
    <label>المبلغ</label>
    <input type="number" id="edit-pay-amount" value="${p.amount}">
    <label>ملاحظة</label>
    <input id="edit-pay-note" value="${p.note || ''}">
  `;
  openEditModal("تعديل الصرف", html, "payment", id);
}
function editSupPay(id) {
  const sp = data.supPayments.find(x => x.id === id);
  const html = `
    <label>المبلغ</label>
    <input type="number" id="edit-spay-amount" value="${sp.amount}">
    <label>ملاحظة</label>
    <input id="edit-spay-note" value="${sp.note || ''}">
  `;
  openEditModal("تعديل دفعة المستورد", html, "supPay", id);
}

// ============================================================
// ============ PDF & Share ============
// ============================================================
function downloadPDF(elementId, filename) {
  const element = document.getElementById(elementId);
  if(!element) return toast("لا يوجد تقرير للتحميل", "error");
  const btns = element.querySelectorAll('.btn, .no-print');
  btns.forEach(b => b.style.display = 'none');
  const opt = {
    margin: 10, filename: `${filename}_${today()}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  toast("جاري تحضير الملف...", "info");
  html2pdf().set(opt).from(element).save().then(()=>{
    btns.forEach(b => b.style.display = '');
    toast("تم التحميل بنجاح ✅");
  });
}

function shareReport(){
  const wid = Number(document.getElementById("repWorker").value);
  if (!wid) return toast("اختار عامل الأول", "error");
  const u = data.users.find(x => x.id === wid);
  const from = document.getElementById("repFrom").value;
  const to = document.getElementById("repTo").value;
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  
  let txt = `🌸 MS HANA — تقرير ${ROLES[u.role]}\n`;
  txt += `👤 ${u.name}\n`;
  txt += `📅 ${from || 'البداية'} → ${to || 'اليوم'}\n`;
  txt += `━━━━━━━━━━━━━━━━━━\n`;
  
  if (u.role === "iron" || u.role === "machine") {
    // جلب كل عمليات الإنتاج في الفترة
    const works = data.pieceWork.filter(w => w.worker_id === wid && inRange(w.date));
    
    // تجميع حسب القصة واللون والسعر
    const groups = {};
    works.forEach(w => {
      const c = data.cuts.find(x => x.id === w.cut_id);
      const cutName = c ? c.name : (w.pname || 'بدون قصة');
      const colorName = w.color || '';
      const key = `${cutName}__${w.price}__${colorName}`;
      if (!groups[key]) {
        groups[key] = {
          cutName,
          colorName,
          price: w.price,
          qty: 0,
          total: 0
        };
      }
      groups[key].qty += w.qty;
      groups[key].total += w.total;
    });
    
    // عرض كل مجموعة
    const groupArr = Object.values(groups);
    let grandTotalQty = 0;
    let grandTotalValue = 0;
    
    if (!groupArr.length) {
      txt += `📭 لا يوجد إنتاج في هذه الفترة\n`;
    } else {
      groupArr.forEach((g, idx) => {
        const title = g.colorName ? `${g.cutName} — ${g.colorName}` : g.cutName;
        txt += `📦 ${title}\n`;
        txt += `🔢 ${fmt(g.qty)} × ${fmt(g.price)} ج\n`;
        txt += `💰 ${fmt(g.total)} ج\n`;
        if (idx < groupArr.length - 1) txt += `────────────────\n`;
        grandTotalQty += g.qty;
        grandTotalValue += g.total;
      });
      
      txt += `━━━━━━━━━━━━━━━━━━\n`;
      txt += `📊 الإجمالي الكلي:\n`;
      txt += `📦 عدد القطع: ${fmt(grandTotalQty)}\n`;
      txt += `💰 إجمالي الإنتاج: ${fmt(grandTotalValue)} ج\n`;
      
      // إضافة الخصومات
      const advTotal = totalAdv(wid);
      const paidTotal = totalPaid(wid);
      if (advTotal > 0 || paidTotal > 0) {
        txt += `━━━━━━━━━━━━━━━━━━\n`;
        if (advTotal > 0) txt += `💸 المصاريف: ${fmt(advTotal)} ج\n`;
        if (paidTotal > 0) txt += `💵 المدفوع: ${fmt(paidTotal)} ج\n`;
        const net = grandTotalValue - advTotal - paidTotal;
        txt += `✅ الصافي: ${fmt(net)} ج\n`;
      }
    }
    
  } else {
    // أرضية/أوفر
    const att = data.attendance.filter(a => a.worker_id === wid && inRange(a.date));
    const present = att.filter(a => a.present).length;
    const totalEarn = att.filter(a => a.present).reduce((s,a) => s + (Number(a.pay)||0), 0);
    const weeklyPaid = data.weeklyPay.filter(wp => wp.worker_id===wid && inRange(wp.date)).reduce((s,wp) => s+wp.amount, 0);
    const advTotal = totalAdv(wid);
    const net = totalEarn - advTotal - weeklyPaid;
    
    txt += `📅 أيام الحضور: ${present}\n`;
    txt += `💰 إجمالي المستحقات: ${fmt(totalEarn)} ج\n`;
    if (advTotal > 0) txt += `💸 المصاريف: ${fmt(advTotal)} ج\n`;
    if (weeklyPaid > 0) txt += `💵 القبض الأسبوعي: ${fmt(weeklyPaid)} ج\n`;
    txt += `━━━━━━━━━━━━━━━━━━\n`;
    txt += `✅ الصافي: ${fmt(net)} ج\n`;
  }
  
  txt += `━━━━━━━━━━━━━━━━━━\n`;
  txt += `📅 ${today()}`;
  
  if (navigator.share) {
    navigator.share({ title: "تقرير عامل", text: txt })
      .then(()=>toast("تمت المشاركة ✅"))
      .catch(()=>copyToClipboard(txt));
  } else {
    copyToClipboard(txt);
  }
}

// ============================================================
// ============ الحسابات ============
// ============================================================
function totalWork(wid){ return data.pieceWork.filter(w=>w.worker_id===wid).reduce((s,w)=>s+w.total,0); }
function totalPieces(wid){ return data.pieceWork.filter(w=>w.worker_id===wid).reduce((s,w)=>s+w.qty,0); }
function totalAdv(wid){ return data.advances.filter(a=>a.worker_id===wid).reduce((s,a)=>s+a.amount,0); }
function totalPaid(wid){ return data.payments.filter(p=>p.worker_id===wid).reduce((s,p)=>s+p.amount,0); }
function totalWeeklyPaid(wid){ return data.weeklyPay.filter(p=>p.worker_id===wid).reduce((s,p)=>s+p.amount,0); }

// الصافي = الإنتاج - المصاريف - المدفوع
function netForWorker(wid) {
  const u = data.users.find(x => x.id === wid);
  if (!u) return 0;
  if (u.role === "iron" || u.role === "machine") {
    return totalWork(wid) - totalAdv(wid) - totalPaid(wid);
  } else {
    const earn = data.attendance.filter(a => a.worker_id===wid && a.present).reduce((s,a) => s + (Number(a.pay)||0), 0);
    return earn - totalAdv(wid) - totalPaid(wid) - totalWeeklyPaid(wid);
  }
}

// ============================================================
// ============ الأسبوع ============
// ============================================================
function weekStartOf(dateStr){
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = (day + 1) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

function weekDays(startDate){
  const days = [];
  for (let i = 0; i < 7; i++){
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push({
      date: dateToLocalStr(d),
      name: DAY_NAMES[d.getDay()],
      isFriday: d.getDay() === 5
    });
  }
  return days;
}

function dailyRateOf(u){ if (!u || !u.weekly_rate) return 0; return Number(u.weekly_rate) / 6; }
function getWeeklyRate(u){ if (!u) return 0; if (u.weekly_rate) return Number(u.weekly_rate); if (u.daily_rate) return Number(u.daily_rate) * 6; return 0; }

function getAttendance(wid, date){ return data.attendance.find(a=>a.worker_id===wid && a.date===date); }
function setAttendance(wid, date, present, pay){
  let a = data.attendance.find(x=>x.worker_id===wid && x.date===date);
  if (a){ a.present = present; a.pay = pay; }
  else { data.attendance.push({ worker_id:wid, date, present, pay }); }
  save();
}

// ============================================================
// ============ الموردين ============
// ============================================================
function supplierOrders(sid){ return data.orders.filter(o=>o.supplier_id===sid); }
function supplierTotalOrdered(sid){ return supplierOrders(sid).reduce((s,o)=>s+(o.qty*o.price),0); }
function supplierTotalDelivered(sid){ return supplierOrders(sid).reduce((s,o)=>s+(o.delivered*o.price),0); }
function supplierTotalPaid(sid){ return data.supPayments.filter(p=>p.supplier_id===sid).reduce((s,p)=>s+p.amount,0); }
function supplierRemaining(sid){ return supplierTotalDelivered(sid) - supplierTotalPaid(sid); }
function supplierDue(sid){ return supplierTotalOrdered(sid) - supplierTotalDelivered(sid); }

function orderStatus(o){
  if (o.status==="cancelled") return "cancelled";
  if (o.delivered>=o.qty) return "done";
  const d = daysDiff(o.date);
  if (d!==null && d<0) return "late";
  return "pending";
}
function orderRemaining(o){ return o.qty - o.delivered; }
function orderProgress(o){ if (o.qty===0) return 0; return Math.min(100, Math.round((o.delivered/o.qty)*100)); }

// ============================================================
// ============ القصات ============
// ============================================================
function cutStatus(c){
  if (c.status==="closed") return "closed";
  const distM = cutDistributed(c.id, "machine");
  const distI = cutDistributed(c.id, "iron");
  if (distM >= c.qty && distI >= c.qty) return "done";
  return "open";
}
function cutDistributed(id, type = null){
  return data.pieceWork.filter(w => {
    if (w.cut_id !== id) return false;
    if (!type) return true;
    const worker = data.users.find(u => u.id === w.worker_id);
    return worker && worker.role === type;
  }).reduce((s,w) => s + w.qty, 0);
}
function cutColorDistributed(id, color, type = null){
  return data.pieceWork.filter(w => {
    if (w.cut_id !== id || w.color !== color) return false;
    if (!type) return true;
    const worker = data.users.find(u => u.id === w.worker_id);
    return worker && worker.role === type;
  }).reduce((s,w) => s + w.qty, 0);
}

// ============================================================
// ============ Dashboard ============
// ============================================================
function renderDashboard(){
  let machineDues = 0, makwaDues = 0, floorDues = 0;
  
  data.users.filter(u => u.role==="iron" || u.role==="machine").forEach(u => {
    const n = netForWorker(u.id);
    if (u.role === "iron") makwaDues += n;
    if (u.role === "machine") machineDues += n;
  });

  let dailyDues = 0;
  data.users.filter(u => u.role==="floor" || u.role==="overlock").forEach(u => {
    const n = netForWorker(u.id);
    if (u.role === "floor") floorDues += n;
    dailyDues += n;
  });

  const totalDues = machineDues + makwaDues + dailyDues;
  const totalCutPieces = data.cuts.reduce((s,c) => s+c.qty, 0);
  const totalDistMachine = data.cuts.reduce((s,c) => s + cutDistributed(c.id, "machine"), 0);
  const totalDistIron = data.cuts.reduce((s,c) => s + cutDistributed(c.id, "iron"), 0);
  const lateOrders = data.orders.filter(o => orderStatus(o)==="late").length;
  const pendingOrders = data.orders.filter(o => orderStatus(o)==="pending").length;
  const totalSupDue = data.suppliers.reduce((s,x) => s + supplierRemaining(x.id), 0);

  const el = document.getElementById("dashKpis");
  if (!el) return;
  el.innerHTML = `
    <div class="kpi green"><div class="kpi-label">💰 مستحقات صنايعية (مكن)</div><div class="kpi-value ${machineDues>=0?'pos':'neg'}">${fmt(machineDues)} ج</div></div>
    <div class="kpi purple"><div class="kpi-label">💰 مستحقات مكوة</div><div class="kpi-value ${makwaDues>=0?'pos':'neg'}">${fmt(makwaDues)} ج</div></div>
    <div class="kpi blue"><div class="kpi-label">💰 مستحقات أرضية</div><div class="kpi-value ${floorDues>=0?'pos':'neg'}">${fmt(floorDues)} ج</div></div>
    <div class="kpi orange"><div class="kpi-label">📊 إجمالي المستحقات</div><div class="kpi-value ${totalDues>=0?'pos':'neg'}">${fmt(totalDues)} ج</div></div>
    <div class="kpi purple"><div class="kpi-label">✂️ موزع مكن</div><div class="kpi-value">${fmt(totalDistMachine)} / ${fmt(totalCutPieces)}</div></div>
    <div class="kpi red"><div class="kpi-label">🔥 موزع مكوة</div><div class="kpi-value">${fmt(totalDistIron)} / ${fmt(totalCutPieces)}</div></div>
    <div class="kpi orange"><div class="kpi-label">📋 طلبات قيد التنفيذ</div><div class="kpi-value">${pendingOrders}</div></div>
    <div class="kpi red"><div class="kpi-label">⚠️ طلبات متأخرة</div><div class="kpi-value">${lateOrders}</div></div>
    <div class="kpi orange"><div class="kpi-label">🏭 متبقي عند المستوردين</div><div class="kpi-value">${fmt(totalSupDue)} ج</div></div>
  `;

  const alerts = [];
  data.orders.forEach(o => {
    const st = orderStatus(o);
    const sup = data.suppliers.find(s => s.id===o.supplier_id);
    const prd = data.products.find(p => p.id===o.product_id);
    const d = daysDiff(o.date);
    if (st==="late") alerts.push(`<div class="order-card" style="border-right:4px solid var(--danger)"><div class="order-title">⚠️ متأخر ${Math.abs(d)} يوم: ${sup?sup.name:'?'} — ${prd?prd.name:'?'}</div></div>`);
    else if (st==="pending" && d!==null && d<=3) alerts.push(`<div class="order-card" style="border-right:4px solid var(--warning)"><div class="order-title">⏰ باقي ${d} يوم: ${sup?sup.name:'?'} — ${prd?prd.name:'?'}</div></div>`);
  });
  if (!alerts.length) alerts.push(`<div class="empty"><div class="icon">✨</div><p>لا يوجد تنبيهات</p></div>`);
  document.getElementById("dashAlerts").innerHTML = alerts.join("");
  drawDashChart();
}

function drawDashChart(){
  const ctx = document.getElementById("dashChart");
  if (!ctx) return;
  if (dashChart) dashChart.destroy();
  const workers = data.users.filter(u => u.role==="iron" || u.role==="machine");
  const labels = workers.map(u => u.name);
  const pieces = workers.map(u => totalPieces(u.id));
  const isDark = document.documentElement.getAttribute("data-theme")==="dark";
  const tc = isDark ? "#f1f5f9" : "#0f172a";
  const gc = isDark ? "#334155" : "#e2e8f0";
  dashChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "عدد القطع", data: pieces, backgroundColor: "#8b5cf6", borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: tc }}, tooltip: { rtl: true, callbacks: { label: c => `${fmt(c.parsed.y)} قطعة` }}},
      scales: { x: { ticks: { color: tc }, grid: { display: false }}, y: { ticks: { color: tc }, grid: { color: gc }}}
    }
  });
}

// ============================================================
// ============ Inventory ============
// ============================================================
function renderInventory(){
  const dateEl = document.getElementById("invDate");
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" });
  
  let totalRev = 0, totalCost = 0;
  data.orders.forEach(o => totalRev += (o.delivered * o.price));
  data.users.forEach(u => {
    if (u.role === "machine" || u.role === "iron") totalCost += totalWork(u.id);
    else if (u.role === "floor" || u.role === "overlock") totalCost += data.attendance.filter(a => a.worker_id===u.id && a.present).reduce((s,a) => s + (Number(a.pay)||0), 0);
  });

  const totalExpenses = data.advances.reduce((s,a) => s+a.amount, 0);
  const totalPaidOut = data.payments.reduce((s,p) => s+p.amount, 0) + data.weeklyPay.reduce((s,p) => s+p.amount, 0);
  
  const kpisEl = document.getElementById("invKpis");
  if (!kpisEl) return;
  kpisEl.innerHTML = `
    <div class="kpi green"><div class="kpi-label">💵 إجمالي أرباح الطلبات</div><div class="kpi-value">${fmt(totalRev)} ج</div></div>
    <div class="kpi red"><div class="kpi-label">💸 تكلفة العمال</div><div class="kpi-value">${fmt(totalCost)} ج</div></div>
    <div class="kpi purple"><div class="kpi-label">📈 صافي ربح متوقع</div><div class="kpi-value ${totalRev-totalCost>=0?'pos':'neg'}">${fmt(totalRev-totalCost)} ج</div></div>
    <div class="kpi orange"><div class="kpi-label">💸 مصاريف</div><div class="kpi-value">${fmt(totalExpenses)} ج</div></div>
    <div class="kpi purple"><div class="kpi-label">💰 المدفوع للعمال</div><div class="kpi-value">${fmt(totalPaidOut)} ج</div></div>
  `;

  const teamBody = document.getElementById("invTeamBody");
  if (teamBody) teamBody.innerHTML = data.users.map((u, index) => {
    let detail;
    if (u.role==="iron" || u.role==="machine") {
      const p = totalPieces(u.id), v = totalWork(u.id);
      detail = `${fmt(p)} قطعة - إنتاج ${fmt(v)} ج`;
    } else {
      const a = data.attendance.filter(x => x.worker_id===u.id && x.present).length;
      const earn = data.attendance.filter(x => x.worker_id===u.id && x.present).reduce((s,x) => s + (Number(x.pay)||0), 0);
      detail = `${a} يوم حضور - مستحقات ${fmt(earn)} ج`;
    }
    const net = netForWorker(u.id);
    return `<tr><td>${index+1}</td><td><b>${u.name}</b></td><td><span class="badge ${u.role}">${ROLES[u.role]}</span></td><td>${detail}</td><td class="${net>=0?'pos':'neg'}">${fmt(net)} ج</td></tr>`;
  }).join("");

  const supBody = document.getElementById("invSuppliersBody");
  if (supBody) supBody.innerHTML = data.suppliers.map(s => `
    <tr><td><b>${s.name}</b></td><td>${fmt(supplierTotalOrdered(s.id))} ج</td><td>${fmt(supplierTotalDelivered(s.id))} ج</td><td class="pos">${fmt(supplierTotalPaid(s.id))} ج</td><td class="${supplierRemaining(s.id)>=0?'neg':'pos'}">${fmt(supplierRemaining(s.id))} ج</td></tr>
  `).join("");

  const cutsBody = document.getElementById("invCutsBody");
  if (cutsBody) cutsBody.innerHTML = data.cuts.map(c => {
    const p = data.products.find(x => x.id===c.product_id);
    const distM = cutDistributed(c.id, "machine");
    const distI = cutDistributed(c.id, "iron");
    return `<tr><td><b>${c.name}</b></td><td>${p?p.name:'?'}</td><td>${fmt(c.qty)}</td><td class="pos">${fmt(distM)} مكن • ${fmt(distI)} مكوة</td><td class="${(c.qty-distM)>0?'neg':'pos'}">${fmt(c.qty-distM)} مكن • ${fmt(c.qty-distI)} مكوة</td></tr>`;
  }).join("");
}

// ============================================================
// ============ Team ============
// ============================================================
document.addEventListener("change", (e) => {
  if (e.target.id === "teamRole") {
    const role = e.target.value;
    document.getElementById("dailyRateWrap").style.display = (role==="floor"||role==="overlock") ? "block" : "none";
  }
});

function renderTeam(){
  const body = document.getElementById("teamBody");
  if (!body) return;
  if (!data.users.length) { body.innerHTML = emptyState("لا يوجد أعضاء", "أضف أول عضو"); return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>#</th><th>الاسم</th><th>الدور</th><th>الأجر الأسبوعي</th><th>الصافي</th><th></th></tr>
    ${data.users.map((u, index) => {
      const net = netForWorker(u.id);
      const rateTxt = (u.role==="floor"||u.role==="overlock") ? (getWeeklyRate(u) ? fmt(getWeeklyRate(u)) + ' ج' : '-') : '-';
      return `<tr><td>${index+1}</td><td><b>${u.name}</b></td><td><span class="badge ${u.role}">${ROLES[u.role]}</span></td><td>${rateTxt}</td><td class="${net>=0?'pos':'neg'}">${fmt(net)} ج</td><td><button class="btn info sm" onclick="viewWorker(${u.id})">👁️</button> <button class="btn warning sm" onclick="editUser(${u.id})">✏️</button> <button class="btn danger sm" onclick="delUser(${u.id})">🗑️</button></td></tr>`;
    }).join("")}
  </table></div>`;
}

function addTeam(){
  const name = document.getElementById("teamName").value.trim();
  const role = document.getElementById("teamRole").value;
  const rate = Number(document.getElementById("teamDailyRate").value) || 0;
  if (name.length < 2) return toast("الاسم قصير", "error");
  const user = { id: data.nextId.user++, name, role };
  if (role==="floor"||role==="overlock") user.weekly_rate = rate;
  data.users.push(user);
  save(); renderAll();
  document.getElementById("teamName").value = "";
  document.getElementById("teamDailyRate").value = 0;
  document.getElementById("dailyRateWrap").style.display = "none";
  toast(`تم إضافة ${name} ✅`);
}
function delUser(id){
  const u = data.users.find(x => x.id===id);
  openModal("حذف عضو", `سيتم حذف "${u.name}" وكل عملياته. متابعة؟`, () => {
    data.users = data.users.filter(x => x.id!==id);
    data.pieceWork = data.pieceWork.filter(x => x.worker_id!==id);
    data.advances = data.advances.filter(x => x.worker_id!==id);
    data.payments = data.payments.filter(x => x.worker_id!==id);
    data.attendance = data.attendance.filter(x => x.worker_id!==id);
    data.weeklyPay = data.weeklyPay.filter(x => x.worker_id!==id);
    save(); renderAll(); toast("تم الحذف");
  });
}
function viewWorker(id){
  const u = data.users.find(x => x.id===id);
  let html = `<div><h3>${u.name} — ${ROLES[u.role]}</h3>`;
  if (u.role==="iron" || u.role==="machine") {
    const works = data.pieceWork.filter(w => w.worker_id===id);
    html += `<p style="color:var(--text-muted);margin:10px 0">📦 إنتاج: ${fmt(totalPieces(id))} قطعة • 💰 ${fmt(totalWork(id))} ج</p>`;
    html += `<table><tr><th>القصة</th><th>اللون</th><th>العدد</th><th>الإجمالي</th></tr>`;
    works.forEach(w => {
      const c = data.cuts.find(x => x.id===w.cut_id);
      html += `<tr><td>${c?c.name:'?'}</td><td>${w.color||'-'}</td><td>${fmt(w.qty)}</td><td>${fmt(w.total)} ج</td></tr>`;
    });
    html += `</table>`;
  } else {
    const att = data.attendance.filter(a => a.worker_id===id);
    const present = att.filter(a => a.present).length;
    const totalEarn = att.filter(a => a.present).reduce((s,a) => s + (Number(a.pay)||0), 0);
    html += `<p style="color:var(--text-muted);margin:10px 0">📅 حضور: ${present} يوم • 💰 مستحقات: ${fmt(totalEarn)} ج • 💵 أجر أسبوعي: ${fmt(getWeeklyRate(u))} ج</p>`;
    html += `<table><tr><th>التاريخ</th><th>الحضور</th><th>الأجر</th></tr>`;
    att.slice().sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,20).forEach(a => {
      html += `<tr><td>${a.date}</td><td>${a.present?'✅ حاضر':'❌ غايب'}</td><td>${fmt(a.pay)} ج</td></tr>`;
    });
    html += `</table>`;
  }
  html += `<div style="margin-top:14px">
    <p>💸 مصاريف: ${fmt(totalAdv(id))} ج • 💵 مدفوع: ${fmt(totalPaid(id))} ج • الصافي: ${fmt(netForWorker(id))} ج</p>
  </div></div>`;
  openInfoModal("كشف حساب العامل", html);
}

// ============================================================
// ============ Products ============
// ============================================================
function renderProducts(){
  const body = document.getElementById("prodBody");
  if (!body) return;
  if (!data.products.length) { body.innerHTML = emptyState("لا يوجد أصناف", "أضف أول صنف"); return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>#</th><th>الصنف</th><th>🔥 مكوة</th><th>⚙️ مكن</th><th></th></tr>
    ${data.products.map((p, index) => `<tr><td>${index+1}</td><td><b>${p.name}</b></td><td>${fmt(p.price_iron)} ج</td><td>${fmt(p.price_machine)} ج</td><td><button class="btn warning sm" onclick="editProduct(${p.id})">✏️</button> <button class="btn danger sm" onclick="delProduct(${p.id})">🗑️</button></td></tr>`).join("")}
  </table></div>`;
}
function addProduct(){
  const name = document.getElementById("prodName").value.trim();
  const pi = Number(document.getElementById("prodIron").value) || 0;
  const pm = Number(document.getElementById("prodMachine").value) || 0;
  if (name.length < 2) return toast("اسم قصير", "error");
  if (pi <= 0 && pm <= 0) return toast("لازم سعر واحد على الأقل", "error");
  data.products.push({ id: data.nextId.prod++, name, price_iron: pi, price_machine: pm });
  save(); renderAll();
  document.getElementById("prodName").value = "";
  document.getElementById("prodIron").value = 0;
  document.getElementById("prodMachine").value = 0;
  toast(`تم إضافة ${name} ✅`);
}
function delProduct(id){
  const p = data.products.find(x => x.id===id);
  openModal("حذف صنف", `حذف "${p.name}" وكل عملياته؟`, () => {
    data.products = data.products.filter(x => x.id!==id);
    data.pieceWork = data.pieceWork.filter(x => x.product_id!==id);
    data.orders = data.orders.filter(x => x.product_id!==id);
    data.cuts = data.cuts.filter(x => x.product_id!==id);
    save(); renderAll(); toast("تم الحذف");
  });
}

// ============================================================
// ============ Cuts (بدون مستورد) ============
// ============================================================
function renderCuts(){
  const pSel = document.getElementById("cutProduct");
  if (!pSel) return;
  const pv = pSel.value;
  pSel.innerHTML = `<option value="">— اختار —</option>` + data.products.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  pSel.value = pv;
  if (!document.getElementById("cutColorsList").children.length) addColorRow();
  
  const filter = document.getElementById("cutFilter").value;
  const search = (document.getElementById("cutSearch").value||"").toLowerCase();
  let cuts = data.cuts.slice().reverse();
  if (filter) cuts = cuts.filter(c => cutStatus(c)===filter);
  if (search) cuts = cuts.filter(c => {
    const p = data.products.find(x => x.id===c.product_id);
    return c.name.toLowerCase().includes(search) || (p && p.name.toLowerCase().includes(search));
  });
  
  const body = document.getElementById("cutsBody");
  if (!cuts.length) { body.innerHTML = emptyState("لا يوجد قصّات", "سجّل أول قصّة"); return; }
  
  body.innerHTML = cuts.map(c => {
    const p = data.products.find(x => x.id===c.product_id);
    const distM = cutDistributed(c.id, "machine");
    const distI = cutDistributed(c.id, "iron");
    const remM = c.qty - distM;
    const remI = c.qty - distI;
    const st = cutStatus(c);
    const labels = { open:"🔓 مفتوحة", done:"✅ مكتملة", closed:"🔒 مغلقة" };
    const progM = c.qty>0 ? Math.round((distM/c.qty)*100) : 0;
    const progI = c.qty>0 ? Math.round((distI/c.qty)*100) : 0;
    const colorsHtml = (c.colors||[]).map(col => {
      const cdM = cutColorDistributed(c.id, col.name, "machine");
      const cdI = cutColorDistributed(c.id, col.name, "iron");
      return `<div style="padding:6px 8px;background:var(--card);border-radius:6px;margin-bottom:4px;font-size:11px">
        <div style="font-weight:700">🎨 ${col.name} — إجمالي: ${col.qty}</div>
        <div style="color:var(--text-muted)">⚙️ مكن: ${cdM} • باقي <b class="${(col.qty-cdM)>0?'neg':'pos'}">${col.qty-cdM}</b></div>
        <div style="color:var(--text-muted)">🔥 مكوة: ${cdI} • باقي <b class="${(col.qty-cdI)>0?'neg':'pos'}">${col.qty-cdI}</b></div>
      </div>`;
    }).join("");
    return `<div class="order-card">
      <div class="order-header">
        <div><div class="order-title">✂️ ${c.name}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">📦 ${p?p.name:'?'} • 📅 ${c.date||'-'}</div></div>
        <span class="badge ${st==='done'?'done':st==='closed'?'cancelled':'pending'}">${labels[st]}</span>
      </div>
      <div class="order-stats">
        <div class="order-stat"><div class="label">إجمالي</div><div class="val">${fmt(c.qty)}</div></div>
        <div class="order-stat"><div class="label">⚙️ مكن</div><div class="val pos">${fmt(distM)}</div></div>
        <div class="order-stat"><div class="label">⚙️ باقي مكن</div><div class="val ${remM>0?'neg':'pos'}">${fmt(remM)}</div></div>
        <div class="order-stat"><div class="label">🔥 مكوة</div><div class="val pos">${fmt(distI)}</div></div>
        <div class="order-stat"><div class="label">🔥 باقي مكوة</div><div class="val ${remI>0?'neg':'pos'}">${fmt(remI)}</div></div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px">⚙️ تقدم المكن</div>
      <div class="progress"><div class="progress-bar ${remM<=0?'done':''}" style="width:${progM}%"></div></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:8px">🔥 تقدم المكوة</div>
      <div class="progress"><div class="progress-bar ${remI<=0?'done':''}" style="width:${progI}%"></div></div>
      <div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:6px">🎨 الألوان:</div>${colorsHtml||'<div style="font-size:11px;color:var(--text-muted)">بدون ألوان</div>'}</div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        <button class="btn info sm" onclick="viewCut(${c.id})">👁️</button>
        <button class="btn warning sm" onclick="editCut(${c.id})">✏️</button>
        <button class="btn danger sm" onclick="delCut(${c.id})">🗑️</button>
      </div>
    </div>`;
  }).join("");
}
function addColorRow(){
  const list = document.getElementById("cutColorsList");
  const div = document.createElement("div");
  div.style.cssText = "display:grid;grid-template-columns:2fr 1fr auto;gap:8px;margin-bottom:6px";
  div.innerHTML = `<input placeholder="اسم اللون" class="color-name" oninput="updateColorsTotal()"><input type="number" placeholder="العدد" class="color-qty" min="0" oninput="updateColorsTotal()"><button class="btn danger sm" onclick="this.parentElement.remove();updateColorsTotal()">❌</button>`;
  list.appendChild(div);
}
function updateColorsTotal(){
  let total = 0;
  document.querySelectorAll("#cutColorsList .color-qty").forEach(i => { total += Number(i.value) || 0; });
  document.getElementById("cutColorsTotal").textContent = total;
}
function addCut(){
  const name = document.getElementById("cutName").value.trim();
  const pid = Number(document.getElementById("cutProduct").value);
  const qty = Number(document.getElementById("cutQty").value);
  const date = document.getElementById("cutDate").value;
  const note = document.getElementById("cutNote").value;
  if (name.length < 2) return toast("اسم قصير", "error");
  if (!pid) return toast("اختار الصنف", "error");
  if (!qty || qty <= 0) return toast("عدد غير صحيح", "error");
  const colors = []; let ct = 0;
  document.querySelectorAll("#cutColorsList > div").forEach(row => {
    const cname = row.querySelector(".color-name").value.trim();
    const cqty = Number(row.querySelector(".color-qty").value) || 0;
    if (cname && cqty > 0) { colors.push({ name: cname, qty: cqty }); ct += cqty; }
  });
  if (ct > qty) return toast(`إجمالي الألوان (${ct}) أكبر من العدد (${qty})`, "error");
  data.cuts.push({ id: data.nextId.cut++, name, product_id: pid, qty, date, note, colors, status: "open", created: today() });
  save(); renderAll();
  document.getElementById("cutName").value = "";
  document.getElementById("cutQty").value = "";
  document.getElementById("cutNote").value = "";
  document.getElementById("cutColorsList").innerHTML = "";
  document.getElementById("cutColorsTotal").textContent = "0";
  toast(`تم تسجيل القصّة ✅`);
}
function delCut(id){
  const c = data.cuts.find(x => x.id===id);
  const distM = cutDistributed(id, "machine");
  const distI = cutDistributed(id, "iron");
  if (distM > 0 || distI > 0) return toast(`لا يمكن الحذف — تم التوزيع`, "error");
  openModal("حذف قصّة", `حذف "${c.name}"؟`, () => { data.cuts = data.cuts.filter(x => x.id!==id); save(); renderAll(); toast("تم الحذف"); });
}
function viewCut(id){
  const c = data.cuts.find(x => x.id===id);
  const p = data.products.find(x => x.id===c.product_id);
  const distM = cutDistributed(id, "machine");
  const distI = cutDistributed(id, "iron");
  const colorsRows = (c.colors||[]).map(col => {
    const cdM = cutColorDistributed(id, col.name, "machine");
    const cdI = cutColorDistributed(id, col.name, "iron");
    return `<tr><td>🎨 ${col.name}</td><td>${fmt(col.qty)}</td><td class="pos">${fmt(cdM)}</td><td class="${col.qty-cdM>0?'neg':'pos'}">${fmt(col.qty-cdM)}</td><td class="pos">${fmt(cdI)}</td><td class="${col.qty-cdI>0?'neg':'pos'}">${fmt(col.qty-cdI)}</td></tr>`;
  }).join("") || `<tr><td colspan="6">بدون ألوان</td></tr>`;
  const dists = data.pieceWork.filter(w => w.cut_id===id);
  const distRows = dists.map(w => {
    const u = data.users.find(x => x.id===w.worker_id);
    return `<tr><td>${u?u.name:'?'}</td><td><span class="badge ${u?u.role:''}">${u?ROLES[u.role]:''}</span></td><td>${w.color||'-'}</td><td>${fmt(w.qty)}</td><td>${w.date}</td></tr>`;
  }).join("") || `<tr><td colspan="5">لا يوجد توزيع</td></tr>`;
  const html = `<div><h3>✂️ ${c.name}</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">📦 ${p?p.name:'?'}</p>
    <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
      <div class="kpi"><div class="kpi-label">إجمالي</div><div class="kpi-value">${fmt(c.qty)}</div></div>
      <div class="kpi green"><div class="kpi-label">⚙️ مكن</div><div class="kpi-value">${fmt(distM)}</div></div>
      <div class="kpi red"><div class="kpi-label">⚙️ باقي</div><div class="kpi-value">${fmt(c.qty-distM)}</div></div>
      <div class="kpi green"><div class="kpi-label">🔥 مكوة</div><div class="kpi-value">${fmt(distI)}</div></div>
      <div class="kpi red"><div class="kpi-label">🔥 باقي</div><div class="kpi-value">${fmt(c.qty-distI)}</div></div>
    </div>
    <h4 style="margin:14px 0 8px">🎨 الألوان</h4>
    <table><tr><th>اللون</th><th>إجمالي</th><th>مكن</th><th>مكن باقي</th><th>مكوة</th><th>مكوة باقي</th></tr>${colorsRows}</table>
    <h4 style="margin:14px 0 8px">🧵 التوزيع (${dists.length})</h4>
    <table><tr><th>الصنايعي</th><th>القسم</th><th>اللون</th><th>العدد</th><th>التاريخ</th></tr>${distRows}</table>
  </div>`;
  openInfoModal("تفاصيل القصّة", html);
}
function exportCuts(){
  let csv = "القصّة,الصنف,العدد,موزع مكن,باقي مكن,موزع مكوة,باقي مكوة,التاريخ\n";
  data.cuts.forEach(c => {
    const p = data.products.find(x => x.id===c.product_id);
    const distM = cutDistributed(c.id, "machine");
    const distI = cutDistributed(c.id, "iron");
    csv += `${c.name},${p?p.name:""},${c.qty},${distM},${c.qty-distM},${distI},${c.qty-distI},${c.date||""}\n`;
  });
  downloadCSV(csv, `cuts_${today()}.csv`);
}

// ============================================================
// ============ Orders ============
// ============================================================
function renderOrders(){
  const sSel = document.getElementById("ordSupplier");
  if (!sSel) return;
  const sv = sSel.value;
  sSel.innerHTML = `<option value="">— اختار —</option>` + data.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  sSel.value = sv;
  const pSel = document.getElementById("ordProduct");
  const pv = pSel.value;
  pSel.innerHTML = `<option value="">— اختار —</option>` + data.products.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  pSel.value = pv;
  
  const filter = document.getElementById("ordFilter").value;
  const search = (document.getElementById("ordSearch").value||"").toLowerCase();
  let orders = data.orders.slice().reverse();
  if (filter) orders = orders.filter(o => orderStatus(o)===filter);
  if (search) orders = orders.filter(o => {
    const s = data.suppliers.find(x => x.id===o.supplier_id);
    const p = data.products.find(x => x.id===o.product_id);
    return (s && s.name.toLowerCase().includes(search)) || (p && p.name.toLowerCase().includes(search));
  });
  
  const body = document.getElementById("ordersBody");
  if (!orders.length) { body.innerHTML = emptyState("لا يوجد طلبات", "أضف أول طلب"); return; }
  
  body.innerHTML = orders.map(o => {
    const s = data.suppliers.find(x => x.id===o.supplier_id);
    const p = data.products.find(x => x.id===o.product_id);
    const st = orderStatus(o);
    const labels = { pending:"⏳ قيد التنفيذ", done:"✅ مسلَّم", late:"⚠️ متأخر", cancelled:"❌ ملغي" };
    const prog = orderProgress(o);
    const d = daysDiff(o.date);
    let dateInfo = "";
    if (o.date) {
      if (st==="done") dateInfo = "✅ تم التسليم";
      else if (st==="cancelled") dateInfo = "❌ ملغي";
      else if (d<0) dateInfo = `⚠️ متأخر ${Math.abs(d)} يوم`;
      else if (d===0) dateInfo = "⏰ اليوم آخر يوم!";
      else dateInfo = `⏰ باقي ${d} يوم`;
    }
    return `<div class="order-card">
      <div class="order-header">
        <div><div class="order-title">🏭 ${s?s.name:'?'} — 📦 ${p?p.name:'?'}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${o.date||'-'} • ${dateInfo}</div></div>
        <span class="badge ${st}">${labels[st]}</span>
      </div>
      <div class="order-stats">
        <div class="order-stat"><div class="label">مطلوب</div><div class="val">${fmt(o.qty)}</div></div>
        <div class="order-stat"><div class="label">تسليم</div><div class="val">${fmt(o.delivered)}</div></div>
        <div class="order-stat"><div class="label">الباقي</div><div class="val ${orderRemaining(o)>0?'neg':'pos'}">${fmt(orderRemaining(o))}</div></div>
        <div class="order-stat"><div class="label">السعر</div><div class="val">${fmt(o.price)}</div></div>
        <div class="order-stat"><div class="label">الإجمالي</div><div class="val">${fmt(o.qty*o.price)} ج</div></div>
      </div>
      <div class="progress"><div class="progress-bar ${st==='done'?'done':st==='late'?'late':''}" style="width:${prog}%"></div></div>
      <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
        ${o.delivered<o.qty && st!=="cancelled" ? `<button class="btn success sm" onclick="deliverOrder(${o.id})">📦 تسليم دفعة</button>` : ""}
        <button class="btn warning sm" onclick="editOrder(${o.id})">✏️</button>
        <button class="btn danger sm" onclick="delOrder(${o.id})">🗑️</button>
      </div>
    </div>`;
  }).join("");
}
function addOrder(){
  const sid = Number(document.getElementById("ordSupplier").value);
  const pid = Number(document.getElementById("ordProduct").value);
  const qty = Number(document.getElementById("ordQty").value);
  const price = Number(document.getElementById("ordPrice").value);
  const date = document.getElementById("ordDate").value;
  const note = document.getElementById("ordNote").value;
  if (!sid) return toast("اختار المستورد", "error");
  if (!pid) return toast("اختار الصنف", "error");
  if (!qty || qty <= 0) return toast("كمية غير صحيحة", "error");
  if (!price || price <= 0) return toast("سعر غير صحيح", "error");
  data.orders.push({ id: data.nextId.ord++, supplier_id: sid, product_id: pid, qty, delivered: 0, price, date, note, status: "pending", created: today() });
  save(); renderAll();
  document.getElementById("ordQty").value = "";
  document.getElementById("ordPrice").value = "";
  document.getElementById("ordNote").value = "";
  toast("تم حفظ الطلب ✅");
}
function deliverOrder(id){
  const o = data.orders.find(x => x.id===id);
  const rem = orderRemaining(o);
  const qty = prompt(`تسليم دفعة\n\nالباقي: ${rem} قطعة\n\nاكتب الكمية:`);
  if (qty === null) return;
  const n = Number(qty);
  if (!n || n <= 0) return toast("كمية غير صحيحة", "error");
  if (n > rem) return toast(`الحد الأقصى ${rem}`, "error");
  o.delivered += n;
  if (o.delivered >= o.qty) o.status = "done";
  save(); renderAll();
  toast(`تم تسليم ${n} قطعة ✅`);
}
function delOrder(id){
  openModal("حذف طلب", "سيتم الحذف.", () => { data.orders = data.orders.filter(x => x.id!==id); save(); renderAll(); toast("تم الحذف"); });
}
function exportOrders(){
  let csv = "المستورد,الصنف,مطلوب,مسلَّم,الباقي,سعر,تاريخ,الحالة\n";
  data.orders.forEach(o => {
    const s = data.suppliers.find(x => x.id===o.supplier_id);
    const p = data.products.find(x => x.id===o.product_id);
    const st = { pending:"قيد التنفيذ", done:"مسلَّم", late:"متأخر", cancelled:"ملغي" }[orderStatus(o)];
    csv += `${s?s.name:""},${p?p.name:""},${o.qty},${o.delivered},${orderRemaining(o)},${o.price},${o.date||""},${st}\n`;
  });
  downloadCSV(csv, `orders_${today()}.csv`);
}

// ============================================================
// ============ Work Machine (بدون طلب وصنف) ============
// ============================================================
function renderWorkMachine(){
  const wSel = document.getElementById("workWorkerMachine");
  if (!wSel) return;
  const wv = wSel.value;
  const workers = data.users.filter(u => u.role==="machine");
  wSel.innerHTML = `<option value="">— اختار —</option>` + workers.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
  wSel.value = wv;
  
  const cSel = document.getElementById("workCutMachine");
  const cv = cSel.value;
  cSel.innerHTML = `<option value="">— بدون —</option>` + data.cuts.filter(c => cutStatus(c)==="open").map(c => {
    const p = data.products.find(x => x.id===c.product_id);
    const rem = c.qty - cutDistributed(c.id, "machine");
    return `<option value="${c.id}">${c.name} — ${p?p.name:'?'} (باقي للمكن: ${rem})</option>`;
  }).join("");
  cSel.value = cv;
  updateCutRemainingMachine();
  updateWorkColorsMachine();
  
  const logs = data.pieceWork.filter(l => data.users.find(u => u.id===l.worker_id)?.role === 'machine').slice().reverse().slice(0,30);
  const body = document.getElementById("workLogsMachine");
  if (!logs.length) { body.innerHTML = emptyState("لا يوجد إنتاج مسجل للمكن", "سجل أول إنتاج"); return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>الصنايعي</th><th>القصة</th><th>اللون</th><th>العدد</th><th>السعر</th><th>الإجمالي</th><th></th></tr>
    ${logs.map(l => {
      const u = data.users.find(x => x.id===l.worker_id);
      const c = data.cuts.find(x => x.id===l.cut_id);
      return `<tr><td>${u?u.name:'?'}</td><td>${c?c.name:'?'}</td><td>${l.color||'-'}</td><td>${fmt(l.qty)}</td><td>${fmt(l.price)} ج</td><td><b>${fmt(l.total)} ج</b></td><td><button class="btn warning sm" onclick="editWork(${l.id})">✏️</button> <button class="btn danger sm" onclick="delWork(${l.id})">🗑️</button></td></tr>`;
    }).join("")}
  </table></div>`;
}
function updateCutRemainingMachine(){
  const cid = Number(document.getElementById("workCutMachine").value);
  const info = document.getElementById("cutRemainingInfoMachine");
  if (!cid) { info.style.display = "none"; return; }
  const c = data.cuts.find(x => x.id===cid);
  const dist = cutDistributed(cid, "machine");
  const rem = c.qty - dist;
  info.style.display = "block";
  info.innerHTML = `✂️ باقي للمكن: <b>${fmt(rem)}</b> قطعة من أصل ${fmt(c.qty)}`;
  updateWorkColorsMachine();
}
function updateWorkColorsMachine(){
  const cid = Number(document.getElementById("workCutMachine").value);
  const colorSel = document.getElementById("workColorMachine");
  if (!cid) { colorSel.innerHTML = `<option value="">— بدون —</option>`; return; }
  const c = data.cuts.find(x => x.id===cid);
  const avail = (c.colors||[]).map(col => {
    const cd = cutColorDistributed(cid, col.name, "machine");
    return { name: col.name, remaining: col.qty - cd };
  }).filter(x => x.remaining > 0);
  colorSel.innerHTML = `<option value="">— بدون —</option>` + avail.map(x => `<option value="${x.name}">${x.name} (باقي: ${x.remaining})</option>`).join("");
}
function addWorkMachine(){
  const wid = Number(document.getElementById("workWorkerMachine").value);
  const qty = Number(document.getElementById("workQtyMachine").value);
  const cid = Number(document.getElementById("workCutMachine").value) || 0;
  const color = document.getElementById("workColorMachine").value || null;
  if (!wid) return toast("اختار الصنايعي", "error");
  if (!qty || qty <= 0) return toast("عدد غير صحيح", "error");
  if (!cid) return toast("اختار القصة", "error");
  
  const c = data.cuts.find(x => x.id===cid);
  if (!c) return toast("القصة غير موجودة", "error");
  const rem = c.qty - cutDistributed(cid, "machine");
  if (qty > rem) return toast(`الباقي للمكن ${rem} فقط`, "error");
  if (color) {
    const col = (c.colors||[]).find(x => x.name===color);
    if (col) {
      const cd = cutColorDistributed(cid, color, "machine");
      const cr = col.qty - cd;
      if (qty > cr) return toast(`الباقي من اللون ${color} للمكن = ${cr} فقط`, "error");
    }
  }
  const p = data.products.find(x => x.id===c.product_id);
  const price = p ? p.price_machine : 0;
  const total = qty * price;
  data.pieceWork.push({ id: data.nextId.work++, worker_id: wid, product_id: c.product_id, qty, price, total, cut_id: cid, color, date: today() });
  save(); renderAll();
  document.getElementById("workQtyMachine").value = "";
  toast(`تم تسجيل ${qty} = ${fmt(total)} ج للمكن ✅`);
}

// ============================================================
// ============ Work Iron (بدون طلب وصنف) ============
// ============================================================
function renderWorkIron(){
  const wSel = document.getElementById("workWorkerIron");
  if (!wSel) return;
  const wv = wSel.value;
  const workers = data.users.filter(u => u.role==="iron");
  wSel.innerHTML = `<option value="">— اختار —</option>` + workers.map(u => `<option value="${u.id}">${u.name}</option>`).join("");
  wSel.value = wv;
  
  const cSel = document.getElementById("workCutIron");
  const cv = cSel.value;
  cSel.innerHTML = `<option value="">— بدون —</option>` + data.cuts.filter(c => cutStatus(c)==="open").map(c => {
    const p = data.products.find(x => x.id===c.product_id);
    const rem = c.qty - cutDistributed(c.id, "iron");
    return `<option value="${c.id}">${c.name} — ${p?p.name:'?'} (باقي للمكوة: ${rem})</option>`;
  }).join("");
  cSel.value = cv;
  updateCutRemainingIron();
  updateWorkColorsIron();
  
  const logs = data.pieceWork.filter(l => data.users.find(u => u.id===l.worker_id)?.role === 'iron').slice().reverse().slice(0,30);
  const body = document.getElementById("workLogsIron");
  if (!logs.length) { body.innerHTML = emptyState("لا يوجد إنتاج مسجل للمكوة", "سجل أول إنتاج"); return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>المكوة</th><th>القصة</th><th>اللون</th><th>العدد</th><th>السعر</th><th>الإجمالي</th><th></th></tr>
    ${logs.map(l => {
      const u = data.users.find(x => x.id===l.worker_id);
      const c = data.cuts.find(x => x.id===l.cut_id);
      return `<tr><td>${u?u.name:'?'}</td><td>${c?c.name:'?'}</td><td>${l.color||'-'}</td><td>${fmt(l.qty)}</td><td>${fmt(l.price)} ج</td><td><b>${fmt(l.total)} ج</b></td><td><button class="btn warning sm" onclick="editWork(${l.id})">✏️</button> <button class="btn danger sm" onclick="delWork(${l.id})">🗑️</button></td></tr>`;
    }).join("")}
  </table></div>`;
}
function updateCutRemainingIron(){
  const cid = Number(document.getElementById("workCutIron").value);
  const info = document.getElementById("cutRemainingInfoIron");
  if (!cid) { info.style.display = "none"; return; }
  const c = data.cuts.find(x => x.id===cid);
  const dist = cutDistributed(cid, "iron");
  const rem = c.qty - dist;
  info.style.display = "block";
  info.innerHTML = `✂️ باقي للمكوة: <b>${fmt(rem)}</b> قطعة من أصل ${fmt(c.qty)}`;
  updateWorkColorsIron();
}
function updateWorkColorsIron(){
  const cid = Number(document.getElementById("workCutIron").value);
  const colorSel = document.getElementById("workColorIron");
  if (!cid) { colorSel.innerHTML = `<option value="">— بدون —</option>`; return; }
  const c = data.cuts.find(x => x.id===cid);
  const avail = (c.colors||[]).map(col => {
    const cd = cutColorDistributed(cid, col.name, "iron");
    return { name: col.name, remaining: col.qty - cd };
  }).filter(x => x.remaining > 0);
  colorSel.innerHTML = `<option value="">— بدون —</option>` + avail.map(x => `<option value="${x.name}">${x.name} (باقي: ${x.remaining})</option>`).join("");
}
function addWorkIron(){
  const wid = Number(document.getElementById("workWorkerIron").value);
  const qty = Number(document.getElementById("workQtyIron").value);
  const cid = Number(document.getElementById("workCutIron").value) || 0;
  const color = document.getElementById("workColorIron").value || null;
  if (!wid) return toast("اختار المكوة", "error");
  if (!qty || qty <= 0) return toast("عدد غير صحيح", "error");
  if (!cid) return toast("اختار القصة", "error");
  
  const c = data.cuts.find(x => x.id===cid);
  if (!c) return toast("القصة غير موجودة", "error");
  const rem = c.qty - cutDistributed(cid, "iron");
  if (qty > rem) return toast(`الباقي للمكوة ${rem} فقط`, "error");
  if (color) {
    const col = (c.colors||[]).find(x => x.name===color);
    if (col) {
      const cd = cutColorDistributed(cid, color, "iron");
      const cr = col.qty - cd;
      if (qty > cr) return toast(`الباقي من اللون ${color} للمكوة = ${cr} فقط`, "error");
    }
  }
  const p = data.products.find(x => x.id===c.product_id);
  const price = p ? p.price_iron : 0;
  const total = qty * price;
  data.pieceWork.push({ id: data.nextId.work++, worker_id: wid, product_id: c.product_id, qty, price, total, cut_id: cid, color, date: today() });
  save(); renderAll();
  document.getElementById("workQtyIron").value = "";
  toast(`تم تسجيل ${qty} = ${fmt(total)} ج للمكوة ✅`);
}
function delWork(id){
  openModal("حذف عملية", "سيتم الحذف.", () => { data.pieceWork = data.pieceWork.filter(x => x.id!==id); save(); renderAll(); toast("تم الحذف"); });
}

// ============================================================
// ============ Attendance ============
// ============================================================
function renderAttendance(){
  const wSel = document.getElementById("attWorker");
  if (!wSel) return;
  const wv = wSel.value;
  const workers = data.users.filter(u => u.role==="floor" || u.role==="overlock");
  wSel.innerHTML = `<option value="">— اختار —</option>` + workers.map(u => `<option value="${u.id}">${ROLES[u.role]} ${u.name}</option>`).join("");
  wSel.value = wv;

  if (!currentWeekStart) currentWeekStart = weekStartOf(today());
  const days = weekDays(currentWeekStart);
  document.getElementById("attWeekLabel").textContent = `الأسبوع: ${days[0].date} → ${days[6].date}`;

  const wid = Number(wSel.value);
  const grid = document.getElementById("attGrid");
  const summary = document.getElementById("attSummary");

  if (!wid) {
    grid.innerHTML = `<div class="empty"><div class="icon">📅</div><p>اختار العامل لعرض الحضور</p></div>`;
    summary.innerHTML = "";
    return;
  }
  const u = data.users.find(x => x.id===wid);
  const dayRate = dailyRateOf({ weekly_rate: getWeeklyRate(u) });

  let totalEarn = 0, presentCount = 0, absentCount = 0;

  grid.innerHTML = days.map(d => {
    const a = getAttendance(wid, d.date);
    const present = a ? a.present : false;
    const pay = d.isFriday ? (a ? (Number(a.pay) || dayRate) : dayRate) : dayRate;
    if (present) { totalEarn += pay; presentCount++; }
    else if (a) { absentCount++; }

    const payInput = d.isFriday
      ? `<input type="number" class="day-pay" value="${pay}" onchange="setAttPay(${wid},'${d.date}',this.value)" placeholder="أجر الجمعة">`
      : `<div class="day-pay" style="background:var(--bg);color:var(--text-muted);cursor:not-allowed;display:flex;align-items:center;justify-content:center;font-weight:700">${present ? fmt(pay)+' ج' : '—'}</div>`;

    return `<div class="att-day ${d.isFriday?'friday':''}">
      <div class="day-name">${d.name}</div>
      <div class="day-date">${d.date.slice(5)}</div>
      <div class="day-buttons">
        <button class="btn-present ${present?'active':''}" onclick="setAtt(${wid},'${d.date}',true)">✓ حاضر</button>
        <button class="btn-absent ${!present&&a?'active':''}" onclick="setAtt(${wid},'${d.date}',false)">✗ غايب</button>
      </div>
      ${payInput}
      ${d.isFriday ? '<div class="friday-label">⭐ جمعة (بكامل الأجر)</div>' : ''}
    </div>`;
  }).join("");

  const weeklyPaid = data.weeklyPay.filter(wp => wp.worker_id===wid && wp.week_start===days[0].date).reduce((s,wp) => s+wp.amount, 0);
  const advRem = totalAdv(wid);
  const net = totalEarn - advRem - weeklyPaid;
  const weeklyRate = getWeeklyRate(u);

  summary.innerHTML = `<div class="kpis">
    <div class="kpi green"><div class="kpi-label">📅 أيام الحضور</div><div class="kpi-value">${presentCount} / 7</div></div>
    <div class="kpi red"><div class="kpi-label">❌ أيام الغياب</div><div class="kpi-value">${absentCount}</div></div>
    <div class="kpi blue"><div class="kpi-label">💰 مستحقات الأسبوع</div><div class="kpi-value">${fmt(totalEarn)} ج</div></div>
    <div class="kpi purple"><div class="kpi-label">📊 الأجر الأسبوعي الثابت</div><div class="kpi-value">${fmt(weeklyRate)} ج</div></div>
    <div class="kpi orange"><div class="kpi-label">💸 مصاريف</div><div class="kpi-value">${fmt(advRem)} ج</div></div>
    <div class="kpi red"><div class="kpi-label">💵 مقبوض هذا الأسبوع</div><div class="kpi-value">${fmt(weeklyPaid)} ج</div></div>
    <div class="kpi ${net>=0?'green':'red'}"><div class="kpi-label">✅ صافي الأسبوع</div><div class="kpi-value ${net>=0?'pos':'neg'}">${fmt(net)} ج</div></div>
  </div>`;
}
function setAtt(wid, date, present){
  const u = data.users.find(x => x.id===wid);
  const existing = getAttendance(wid, date);
  const dayRate = dailyRateOf({ weekly_rate: getWeeklyRate(u) });
  const isFriday = new Date(date+"T00:00:00").getDay() === 5;
  let pay = isFriday ? (existing ? (Number(existing.pay) || dayRate) : dayRate) : dayRate;
  setAttendance(wid, date, present, pay);
  renderAttendance();
}
function setAttPay(wid, date, val){
  const isFriday = new Date(date+"T00:00:00").getDay() === 5;
  if (!isFriday) return toast("تعديل الأجر متاح للجمعة فقط", "warning");
  const a = getAttendance(wid, date);
  const present = a ? a.present : false;
  setAttendance(wid, date, present, Number(val) || 0);
  renderAttendance();
}
function moveWeek(delta){
  const d = new Date(currentWeekStart);
  d.setDate(d.getDate() + delta*7);
  currentWeekStart = d;
  renderAttendance();
}

// ============================================================
// ============ Weekly Pay ============
// ============================================================
function renderWeeklyPay(){
  const wSel = document.getElementById("wpWorker");
  if (!wSel) return;
  const wv = wSel.value;
  const workers = data.users.filter(u => u.role==="floor" || u.role==="overlock");
  wSel.innerHTML = `<option value="">— اختار —</option>` + workers.map(u => `<option value="${u.id}">${ROLES[u.role]} ${u.name}</option>`).join("");
  wSel.value = wv;

  const logs = data.weeklyPay.slice().reverse().slice(0,30);
  const body = document.getElementById("wpLogs");
  if (!logs.length) { body.innerHTML = emptyState("لا يوجد قبض أسبوعي", "سجل أول قبض"); return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>العامل</th><th>أسبوع</th><th>المبلغ</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr>
    ${logs.map(l => {
      const u = data.users.find(x => x.id===l.worker_id);
      return `<tr><td>${u?u.name:'?'}</td><td>${l.week_start}</td><td><b class="pos">${fmt(l.amount)} ج</b></td><td>${l.note||'-'}</td><td>${l.date}</td><td><button class="btn danger sm" onclick="delWeeklyPay(${l.id})">🗑️</button></td></tr>`;
    }).join("")}
  </table></div>`;
}
function addWeeklyPay(){
  const wid = Number(document.getElementById("wpWorker").value);
  const date = document.getElementById("wpDate").value || today();
  const amt = Number(document.getElementById("wpAmount").value);
  const note = document.getElementById("wpNote").value;
  if (!wid) return toast("اختار العامل", "error");
  if (!amt || amt <= 0) return toast("مبلغ غير صحيح", "error");
  const ws = weekStartOf(date);
  const wsStr = dateToLocalStr(ws);
  data.weeklyPay.push({ id: data.nextId.wp++, worker_id: wid, amount: amt, note, date: today(), week_start: wsStr });
  save(); renderAll();
  document.getElementById("wpAmount").value = "";
  document.getElementById("wpNote").value = "";
  toast(`تم تسجيل قبض ${fmt(amt)} ج ✅`);
}
function delWeeklyPay(id){
  openModal("حذف قبض", "سيتم الحذف.", () => { data.weeklyPay = data.weeklyPay.filter(x => x.id!==id); save(); renderAll(); toast("تم الحذف"); });
}

// ============================================================
// ============ Suppliers ============
// ============================================================
function renderSuppliers(){
  const body = document.getElementById("suppliersBody");
  if (!body) return;
  if (!data.suppliers.length) { body.innerHTML = emptyState("لا يوجد مستوردين", "أضف أول مستورد"); return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>#</th><th>المستورد</th><th>التليفون</th><th>إجمالي الطلبات</th><th>الباقي عليه</th><th>مدفوع</th><th>متبقي</th><th></th></tr>
    ${data.suppliers.map((s, index) => {
      const tot = supplierTotalOrdered(s.id);
      const due = supplierDue(s.id);
      const paid = supplierTotalPaid(s.id);
      const rem = supplierRemaining(s.id);
      return `<tr><td>${index+1}</td><td><b>${s.name}</b></td><td>${s.phone||"-"}</td><td>${fmt(tot)} ج</td><td class="neg">${fmt(due)} ج</td><td class="pos">${fmt(paid)} ج</td><td class="${rem>=0?'pos':'neg'}">${fmt(rem)} ج</td><td><button class="btn info sm" onclick="viewSupplier(${s.id})">👁️</button> <button class="btn warning sm" onclick="editSupplier(${s.id})">✏️</button> <button class="btn danger sm" onclick="delSupplier(${s.id})">🗑️</button></td></tr>`;
    }).join("")}
  </table></div>`;
}
function addSupplier(){
  const name = document.getElementById("supName").value.trim();
  const phone = document.getElementById("supPhone").value.trim();
  const note = document.getElementById("supNote").value.trim();
  if (name.length < 2) return toast("اسم قصير", "error");
  data.suppliers.push({ id: data.nextId.sup++, name, phone, note });
  save(); renderAll();
  document.getElementById("supName").value = "";
  document.getElementById("supPhone").value = "";
  document.getElementById("supNote").value = "";
  toast(`تم إضافة ${name} ✅`);
}
function delSupplier(id){
  const s = data.suppliers.find(x => x.id===id);
  openModal("حذف مستورد", `حذف "${s.name}"؟`, () => {
    data.suppliers = data.suppliers.filter(x => x.id!==id);
    data.orders = data.orders.filter(x => x.supplier_id!==id);
    data.supPayments = data.supPayments.filter(x => x.supplier_id!==id);
    save(); renderAll(); toast("تم الحذف");
  });
}
function viewSupplier(id){
  const s = data.suppliers.find(x => x.id===id);
  const orders = supplierOrders(id);
  const paid = data.supPayments.filter(p => p.supplier_id===id);
  const ordersRows = orders.map(o => {
    const p = data.products.find(x => x.id===o.product_id);
    const st = orderStatus(o);
    const labels = { pending:"⏳", done:"✅", late:"⚠️", cancelled:"❌" };
    return `<tr><td>${p?p.name:'?'}</td><td>${o.qty}</td><td>${o.delivered}</td><td>${orderRemaining(o)}</td><td>${labels[st]}</td></tr>`;
  }).join("") || "<tr><td colspan=5>لا يوجد</td></tr>";
  const paidRows = paid.map(p => `<tr><td>${fmt(p.amount)} ج</td><td>${p.date}</td><td>${p.note||"-"}</td></tr>`).join("") || "<tr><td colspan=3>لا يوجد</td></tr>";
  const html = `<div>
    <h3>🏭 ${s.name}</h3>
    <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px">📞 ${s.phone||"-"}</p>
    <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
      <div class="kpi"><div class="kpi-label">إجمالي الطلبات</div><div class="kpi-value">${fmt(supplierTotalOrdered(id))} ج</div></div>
      <div class="kpi green"><div class="kpi-label">مسلَّم</div><div class="kpi-value">${fmt(supplierTotalDelivered(id))} ج</div></div>
      <div class="kpi orange"><div class="kpi-label">مدفوع</div><div class="kpi-value">${fmt(supplierTotalPaid(id))} ج</div></div>
      <div class="kpi red"><div class="kpi-label">المتبقي</div><div class="kpi-value">${fmt(supplierRemaining(id))} ج</div></div>
    </div>
    <h4 style="margin:14px 0 8px">📋 الطلبات (${orders.length})</h4>
    <table><tr><th>الصنف</th><th>مطلوب</th><th>مسلَّم</th><th>الباقي</th><th>الحالة</th></tr>${ordersRows}</table>
    <h4 style="margin:14px 0 8px">💳 المدفوعات (${paid.length})</h4>
    <table><tr><th>المبلغ</th><th>التاريخ</th><th>ملاحظة</th></tr>${paidRows}</table>
  </div>`;
  openInfoModal("كشف حساب المستورد", html);
}

// ============================================================
// ============ Sup Pay ============
// ============================================================
function renderSupPay(){
  fillSelects();
  const logs = data.supPayments.slice().reverse().slice(0,30);
  const body = document.getElementById("supPayLogs");
  if (!body) return;
  if (!logs.length) { body.innerHTML = emptyState("لا يوجد مدفوعات", "سجل أول دفعة"); return; }
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>المستورد</th><th>المبلغ</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr>
    ${logs.map(l => { const s = data.suppliers.find(x => x.id===l.supplier_id); return `<tr><td>${s?s.name:'?'}</td><td><b class="pos">${fmt(l.amount)} ج</b></td><td>${l.note||"-"}</td><td>${l.date}</td><td><button class="btn warning sm" onclick="editSupPay(${l.id})">✏️</button> <button class="btn danger sm" onclick="delSupPay(${l.id})">🗑️</button></td></tr>`; }).join("")}
  </table></div>`;
}
function addSupplierPayment(){
  const sid = Number(document.getElementById("supPayWorker").value);
  const amt = Number(document.getElementById("supPayAmount").value);
  const note = document.getElementById("supPayNote").value;
  if (!sid) return toast("اختار المستورد", "error");
  if (!amt || amt <= 0) return toast("مبلغ غير صحيح", "error");
  data.supPayments.push({ id: data.nextId.spay++, supplier_id: sid, amount: amt, note, date: today() });
  save(); renderAll();
  document.getElementById("supPayAmount").value = "";
  document.getElementById("supPayNote").value = "";
  toast(`تم تسجيل ${fmt(amt)} ج ✅`);
}
function delSupPay(id){
  openModal("حذف دفعة", "سيتم الحذف.", () => { data.supPayments = data.supPayments.filter(x => x.id!==id); save(); renderAll(); toast("تم الحذف"); });
}

// ============================================================
// ============ Finance ============
// ============================================================
function fillSelects(){
  const advWorkerSel = document.getElementById("advWorker");
  if (advWorkerSel) {
    const val = advWorkerSel.value;
    advWorkerSel.innerHTML = `<option value="">— اختار —</option>` + 
      data.users.map(u => `<option value="${u.id}">${u.name} (${ROLES[u.role]})</option>`).join("");
    advWorkerSel.value = val;
  }
  
  const payWorkerSel = document.getElementById("payWorker");
  if (payWorkerSel) {
    const val = payWorkerSel.value;
    payWorkerSel.innerHTML = `<option value="">— اختار —</option>` + 
      data.users.map(u => `<option value="${u.id}">${u.name} (${ROLES[u.role]})</option>`).join("");
    payWorkerSel.value = val;
  }
  
  const sp = document.getElementById("supPayWorker");
  if (sp) {
    const v = sp.value;
    sp.innerHTML = `<option value="">— اختار —</option>` + data.suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
    sp.value = v;
  }
}

function renderAdvances(){
  fillSelects();
  
  const logs = data.advances.slice().reverse().slice(0,50);
  
  const body = document.getElementById("advLogs");
  if (!body) return;
  if (!logs.length) { 
    body.innerHTML = emptyState("لا يوجد مصاريف", "سجل أول مصروف"); 
    return; 
  }
  
  body.innerHTML = `<div class="table-wrap"><table>
    <tr><th>العضو</th><th>المبلغ</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr>
    ${logs.map(l => {
      const u = data.users.find(x => x.id === l.worker_id);
      return `<tr>
        <td>${u?u.name:'?'}</td>
        <td><b class="neg">${fmt(l.amount)} ج</b></td>
        <td>${l.note||"-"}</td>
        <td>${l.date}</td>
        <td>
          <button class="btn warning sm" onclick="editAdvance(${l.id})">✏️</button>
          <button class="btn danger sm" onclick="delAdv(${l.id})">🗑️</button>
        </td>
      </tr>`;
    }).join("")}
  </table></div>`;
}

function addAdvance(){
  const wid = Number(document.getElementById("advWorker").value);
  const amt = Number(document.getElementById("advAmount").value);
  const note = document.getElementById("advNote").value;
  if (!wid) return toast("اختار العضو", "error");
  if (!amt || amt <= 0) return toast("مبلغ غير صحيح", "error");
  data.advances.push({ id: data.nextId.adv++, worker_id: wid, amount: amt, note, date: today() });
  save(); renderAll();
  document.getElementById("advAmount").value = "";
  document.getElementById("advNote").value = "";
  toast(`تم تسجيل مصروف ${fmt(amt)} ج ✅`);
}
function delAdv(id){
  openModal("حذف مصروف", "سيتم الحذف.", () => { data.advances = data.advances.filter(x => x.id!==id); save(); renderAll(); toast("تم الحذف"); });
}

function renderPayments(){
  fillSelects();
  const logs = data.payments.slice().reverse().slice(0,30);
  const body = document.getElementById("payLogs");
  if (!body) return;
  if (!logs.length) { body.innerHTML = emptyState("لا يوجد مدفوعات", "سجل أول صرف"); return; }
  body.innerHTML = `<div class="table-wrap"><table><tr><th>العضو</th><th>المبلغ</th><th>ملاحظة</th><th>التاريخ</th><th></th></tr>
    ${logs.map(l => { const u = data.users.find(x => x.id===l.worker_id); return `<tr><td>${u?u.name:'?'}</td><td><b class="neg">${fmt(l.amount)} ج</b></td><td>${l.note||"-"}</td><td>${l.date}</td><td><button class="btn warning sm" onclick="editPayment(${l.id})">✏️</button> <button class="btn danger sm" onclick="delPay(${l.id})">🗑️</button></td></tr>`; }).join("")}
  </table></div>`;
}
function addPayment(){
  const wid = Number(document.getElementById("payWorker").value);
  const amt = Number(document.getElementById("payAmount").value);
  const note = document.getElementById("payNote").value;
  if (!wid) return toast("اختار العضو", "error");
  if (!amt || amt <= 0) return toast("مبلغ غير صحيح", "error");
  data.payments.push({ id: data.nextId.pay++, worker_id: wid, amount: amt, note, date: today() });
  save(); renderAll();
  document.getElementById("payAmount").value = "";
  document.getElementById("payNote").value = "";
  toast(`تم صرف ${fmt(amt)} ج ✅`);
}
function delPay(id){
  openModal("حذف صرف", "سيتم الحذف.", () => { data.payments = data.payments.filter(x => x.id!==id); save(); renderAll(); toast("تم الحذف"); });
}

// ============================================================
// ============ Reports ============
// ============================================================
function renderWorkerReport(){
  const wSel = document.getElementById("repWorker");
  if (!wSel) return;
  const wv = wSel.value;
  wSel.innerHTML = `<option value="">— اختار —</option>` + data.users.map(u => `<option value="${u.id}">${ROLES[u.role]} ${u.name}</option>`).join("");
  wSel.value = wv;
  const wid = Number(wSel.value);
  const body = document.getElementById("reportBody");
  if (!wid) { body.innerHTML = emptyState("اختار عامل", "اختار من القائمة لعرض تقريره"); return; }
  const u = data.users.find(x => x.id===wid);
  const from = document.getElementById("repFrom").value;
  const to = document.getElementById("repTo").value;
  const inRange = (d) => (!from || d >= from) && (!to || d <= to);

  let html = `<div class="report-header">
    <h2>${ROLES[u.role]} ${u.name}</h2>
    <p>تقرير مفصل ${from||to ? `(${from||'البداية'} → ${to||'اليوم'})` : '(كل الفترة)'}</p>
  </div>`;

  if (u.role==="iron" || u.role==="machine") {
    const works = data.pieceWork.filter(w => w.worker_id===wid && inRange(w.date));
    const totalP = works.reduce((s,w) => s+w.qty, 0);
    const totalV = works.reduce((s,w) => s+w.total, 0);
    const advTotal = totalAdv(wid);
    const paid = totalPaid(wid);
    const net = totalV - advTotal - paid;
    html += `<div class="kpis">
      <div class="kpi green"><div class="kpi-label">📦 عدد القطع</div><div class="kpi-value">${fmt(totalP)}</div></div>
      <div class="kpi purple"><div class="kpi-label">💰 إجمالي الإنتاج</div><div class="kpi-value">${fmt(totalV)} ج</div></div>
      <div class="kpi orange"><div class="kpi-label">💸 مصاريف</div><div class="kpi-value">${fmt(advTotal)} ج</div></div>
      <div class="kpi red"><div class="kpi-label">💵 مصروف</div><div class="kpi-value">${fmt(paid)} ج</div></div>
      <div class="kpi ${net>=0?'green':'red'}"><div class="kpi-label">✅ الصافي</div><div class="kpi-value ${net>=0?'pos':'neg'}">${fmt(net)} ج</div></div>
    </div>`;
    html += `<div class="card"><div class="card-header"><div class="card-title">✂️ سجل الإنتاج (${works.length})</div></div>
      <div class="table-wrap"><table>
      <tr><th>التاريخ</th><th>القصة</th><th>اللون</th><th>العدد</th><th>السعر</th><th>الإجمالي</th></tr>
      ${works.slice().sort((a,b) => new Date(b.date)-new Date(a.date)).map(w => {
        const c = data.cuts.find(x => x.id===w.cut_id);
        return `<tr><td>${w.date}</td><td>${c?c.name:'?'}</td><td>${w.color||'-'}</td><td>${fmt(w.qty)}</td><td>${fmt(w.price)} ج</td><td>${fmt(w.total)} ج</td></tr>`;
      }).join("")}
      </table></div>
    </div>`;
  } else {
    const att = data.attendance.filter(a => a.worker_id===wid && inRange(a.date));
    const present = att.filter(a => a.present).length;
    const totalEarn = att.filter(a => a.present).reduce((s,a) => s + (Number(a.pay)||0), 0);
    const weeklyPaid = data.weeklyPay.filter(wp => wp.worker_id===wid && inRange(wp.date)).reduce((s,wp) => s+wp.amount, 0);
    const advTotal = totalAdv(wid);
    const net = totalEarn - advTotal - weeklyPaid;
    html += `<div class="kpis">
      <div class="kpi green"><div class="kpi-label">📅 أيام الحضور</div><div class="kpi-value">${present}</div></div>
      <div class="kpi purple"><div class="kpi-label">💰 إجمالي المستحقات</div><div class="kpi-value">${fmt(totalEarn)} ج</div></div>
      <div class="kpi orange"><div class="kpi-label">💸 مصاريف</div><div class="kpi-value">${fmt(advTotal)} ج</div></div>
      <div class="kpi red"><div class="kpi-label">💵 قبض أسبوعي</div><div class="kpi-value">${fmt(weeklyPaid)} ج</div></div>
      <div class="kpi ${net>=0?'green':'red'}"><div class="kpi-label">✅ الصافي</div><div class="kpi-value ${net>=0?'pos':'neg'}">${fmt(net)} ج</div></div>
    </div>`;
    html += `<div class="card"><div class="card-header"><div class="card-title">📅 سجل الحضور (${att.length})</div></div>
      <div class="table-wrap"><table>
      <tr><th>التاريخ</th><th>اليوم</th><th>الحالة</th><th>الأجر</th></tr>
      ${att.slice().sort((a,b) => new Date(b.date)-new Date(a.date)).map(a => {
        const day = DAY_NAMES[new Date(a.date+"T00:00:00").getDay()];
        const isFriday = new Date(a.date+"T00:00:00").getDay()===5;
        return `<tr><td>${a.date}</td><td>${day}${isFriday?' ⭐':''}</td><td><span class="badge ${a.present?'present':'absent'}">${a.present?'✅ حاضر':'❌ غايب'}</span></td><td>${fmt(a.pay)} ج</td></tr>`;
      }).join("")}
      </table></div>
    </div>`;
  }
  body.innerHTML = html;
}

// ============================================================
// ============ Modals ============
// ============================================================
function openModal(title, body, cb){
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").textContent = body;
  document.getElementById("modalBg").classList.add("show");
  confirmCb = cb;
}
function openInfoModal(title, html){
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = html;
  document.getElementById("modalBody").style.color = "var(--text)";
  document.getElementById("modalBg").classList.add("show");
  confirmCb = null;
  const btn = document.querySelector("#modalBg .modal-actions .btn.danger");
  if (btn) btn.style.display = "none";
}
function modalClose(){
  document.getElementById("modalBg").classList.remove("show");
  document.getElementById("modalBody").style.color = "";
  const btn = document.querySelector("#modalBg .modal-actions .btn.danger");
  if (btn) btn.style.display = "";
  confirmCb = null;
}
function modalConfirm(){
  if (confirmCb) confirmCb();
  modalClose();
}

// ============================================================
// ============ Backup ============
// ============================================================
function backupData(){
  const blob = new Blob([JSON.stringify(data,null,2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `workshop_backup_${today()}.json`; a.click();
  toast("تم التحميل ✅");
}
function restoreData(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target.result);
      if (!d.users) throw "ملف غير صالح";
      openModal("استرجاع", "سيتم استبدال كل البيانات. متابعة؟", () => { data = d; save(); renderAll(); toast("تم الاسترجاع ✅"); });
    } catch(err) { toast("ملف غير صالح", "error"); }
  };
  reader.readAsText(file);
}
function wipeAll(){
  openModal("حذف كل البيانات", "⚠️ لا يمكن التراجع!", () => {
    data = { users: [], products: [], orders: [], suppliers: [], cuts: [], pieceWork: [], advances: [], payments: [], supPayments: [], attendance: [], weeklyPay: [], nextId: { user:1, prod:1, ord:1, sup:1, cut:1, work:1, adv:1, pay:1, spay:1, wp:1 } };
    save(); renderAll(); toast("تم الحذف");
  });
}

function downloadCSV(csv, filename){
  const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  toast("تم التصدير ✅");
}

function emptyState(title, sub){
  return `<div class="empty"><div class="icon">📭</div><p><b>${title}</b></p><p style="font-size:11px;margin-top:4px">${sub}</p></div>`;
}

function go(page, ev){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  const target = document.getElementById("page-"+page);
  if (!target) return;
  target.classList.add("active");
  if (ev && ev.target) {
    const navItem = ev.target.closest(".nav-item");
    if (navItem) navItem.classList.add("active");
  }
  document.getElementById("sidebar").classList.remove("open");
}

function renderAll(){
  renderDashboard();
  renderInventory();
  renderTeam();
  renderProducts();
  renderCuts();
  renderOrders();
  renderWorkMachine();
  renderWorkIron();
  renderAttendance();
  renderWeeklyPay();
  renderSuppliers();
  renderSupPay();
  renderAdvances();
  renderPayments();
  renderWorkerReport();
  renderMyAccount();
}

function renderMyAccount(){
  const u = currentUser();
  const body = document.getElementById("myAccountInfo");
  if (!u || !body) return;
  body.innerHTML = `
    <div style="padding:14px;background:var(--bg);border-radius:12px;margin-bottom:10px">
      <div style="margin-bottom:6px"><b>اسم المستخدم:</b> <code style="background:var(--card);padding:2px 8px;border-radius:4px">${u.username}</code></div>
      <div style="margin-bottom:6px"><b>الاسم الكامل:</b> ${u.fullName}</div>
      <div><b>النوع:</b> 👑 مدير</div>
    </div>
  `;
}

function changeMyPassword(){
  const cur = document.getElementById("curPw").value;
  const nw = document.getElementById("newPw").value;
  const conf = document.getElementById("newPwConfirm").value;
  
  const users = loadUsers();
  const admin = users[0];
  
  if (cur !== admin.password) return toast("كلمة السر الحالية غير صحيحة", "error");
  if (!nw || nw.length < 4) return toast("كلمة السر الجديدة قصيرة", "error");
  if (nw !== conf) return toast("تأكيد كلمة السر غير مطابق", "error");
  
  admin.password = nw;
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  document.getElementById("curPw").value = "";
  document.getElementById("newPw").value = "";
  document.getElementById("newPwConfirm").value = "";
  toast("تم تغيير كلمة السر ✅");
}

// ============================================================
// ============ Boot ============
// ============================================================
window.addEventListener("DOMContentLoaded", () => {
  const totalDuration = 3000;
  const bar = document.getElementById("loaderProgressBar");
  const loader = document.getElementById("loader");
  const startTime = Date.now();
  
  function updateProgress() {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, (elapsed / totalDuration) * 100);
    if (bar) bar.style.width = pct + "%";
    
    if (elapsed < totalDuration) {
      requestAnimationFrame(updateProgress);
    } else {
      if (loader) {
        loader.classList.add("hidden");
        setTimeout(() => { if (loader) loader.style.display = "none"; }, 600);
      }
    }
  }
  updateProgress();
  
  load();
  data.users.forEach(u => {
    if ((u.role==="floor"||u.role==="overlock") && u.daily_rate && !u.weekly_rate) {
      u.weekly_rate = Number(u.daily_rate) * 6;
      delete u.daily_rate;
    }
  });
  
  const id = sessionStorage.getItem(CURRENT_USER_KEY);
  if (id) {
    setTimeout(() => {
      document.getElementById("login").style.display = "none";
      document.getElementById("app").style.display = "block";
      renderAll();
      updateUserBadge();
    }, totalDuration + 100);
  } else {
    setTimeout(() => {
      const lu = document.getElementById("loginUsername");
      if (lu) lu.focus();
    }, totalDuration + 100);
  }
});