/* ============================================================
   Minder — renderer application
   Everything here talks to the local store through window.api (preload).
   ============================================================ */
"use strict"

window.__appLoaded = true
const bridge = window.api
const J = window.Jalali

const state = {
  settings: {},
  categories: [],
  todayEntries: [],
  dailyTotals: {}, // 'YYYY-MM-DD' -> ms
  view: "today",
  avatarData: null,
  tickHandle: null
}

/* ---------------- helpers ---------------- */

const FA = "۰۱۲۳۴۵۶۷۸۹"
function fa(v) {
  const s = String(v)
  if (state.settings.faDigits === "0") return s
  return s.replace(/[0-9]/g, (d) => FA[+d])
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]))
}
const pad2 = (n) => (n < 10 ? "0" + n : String(n))

function fmtHM(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  return fa(Math.floor(m / 60) + ":" + pad2(m % 60))
}
function fmtHMS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return fa(pad2(Math.floor(s / 3600)) + ":" + pad2(Math.floor((s % 3600) / 60)) + ":" + pad2(s % 60))
}
function fmtLong(ms) {
  const m = Math.max(0, Math.round(ms / 60000))
  const h = Math.floor(m / 60), mm = m % 60
  if (h && mm) return fa(h) + " ساعت و " + fa(mm) + " دقیقه"
  if (h) return fa(h) + " ساعت"
  return fa(mm) + " دقیقه"
}
function clockOf(ts) {
  const d = new Date(ts)
  return fa(pad2(d.getHours()) + ":" + pad2(d.getMinutes()))
}
function dayKey(d) {
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
}
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}
function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
function startOfWeek(d) {
  return addDays(startOfDay(d), -J.weekIndex(d))
}
function dateText(d, opts) {
  const withWeekday = !opts || opts.weekday !== false
  if (state.settings.jalali === "0") {
    const t = d.toLocaleDateString("fa-IR-u-ca-gregory", {
      weekday: withWeekday ? "long" : undefined, year: "numeric", month: "long", day: "numeric"
    })
    return t
  }
  const j = J.fromDate(d)
  const wd = J.WEEKDAYS[J.weekIndex(d)]
  return (withWeekday ? wd + "، " : "") + fa(j.jd) + " " + J.MONTHS[j.jm - 1] + " " + fa(j.jy)
}
function goalMs() {
  return (Number(state.settings.dailyGoalMinutes) || 0) * 60000
}
function catById(id) {
  return state.categories.find((c) => c.id === Number(id))
}
async function call(p, okMsg) {
  const res = await p
  if (!res || !res.ok) {
    toast(res && res.error ? res.error : "خطای ناشناخته")
    return null
  }
  if (okMsg) toast(okMsg)
  return res.data
}

let toastTimer = null
function toast(msg) {
  const root = document.getElementById("toastRoot")
  root.innerHTML = `<div class="toast"><div>${esc(msg)}</div></div>`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (root.innerHTML = ""), 2600)
}

/* ---------------- data loading ---------------- */

async function loadAll() {
  state.settings = (await call(bridge.settings.get())) || {}
  state.categories = (await call(bridge.categories.list({}))) || []
  state.avatarData = state.settings.avatarPath ? await call(bridge.profile.readAvatar({})) : null
  const t0 = startOfDay(new Date()).getTime()
  state.todayEntries = (await call(bridge.entries.list({ fromTs: t0, toTs: t0 + 86400000 }))) || []
  const totals = (await call(bridge.stats.daily())) || []
  state.dailyTotals = {}
  totals.forEach((r) => (state.dailyTotals[r.day] = r.ms))
}

function todayMs() {
  return state.todayEntries.reduce((a, e) => a + (e.end_ts - e.start_ts), 0)
}
function runningTimer() {
  const c = Number(state.settings.timerCategoryId)
  const s = Number(state.settings.timerStartedAt)
  return c && s ? { categoryId: c, startedAt: s } : null
}
function streakInfo() {
  const keys = Object.keys(state.dailyTotals).filter((k) => state.dailyTotals[k] > 0)
  const set = new Set(keys)
  let cur = 0
  let d = startOfDay(new Date())
  if (!set.has(dayKey(d))) d = addDays(d, -1) // today may not be started yet
  while (set.has(dayKey(d))) {
    cur++
    d = addDays(d, -1)
  }
  let best = 0, run = 0, prev = null
  keys.sort().forEach((k) => {
    const parts = k.split("-").map(Number)
    const dt = new Date(parts[0], parts[1] - 1, parts[2])
    if (prev && (dt - prev) / 86400000 === 1) run++
    else run = 1
    best = Math.max(best, run)
    prev = dt
  })
  return { current: cur, best: Math.max(best, cur) }
}

/* ============================================================
   Shell
   ============================================================ */

const TABS = [
  { id: "today", label: "امروز", icon: "◔" },
  { id: "charts", label: "نمودارها", icon: "▤" },
  { id: "card", label: "کارت روزانه", icon: "◑" },
  { id: "settings", label: "تنطیمات", icon: "⚙" }
]

function renderShell() {
  const s = state.settings
  document.getElementById("meName").textContent = s.displayName || "من"
  document.getElementById("meRole").textContent = s.role || "ساعت کار متمرکز"
  const ava = document.getElementById("meAva")
  ava.innerHTML = state.avatarData
    ? `<img src="${esc(state.avatarData)}" alt="">`
    : esc((s.displayName || "?").trim().charAt(0) || "?")

  document.getElementById("navMain").innerHTML = TABS.map(
    (t) => `<button class="nav ${state.view === t.id ? "on" : ""}" data-nav="${t.id}">
      <span class="ico">${t.icon}</span><span class="lbl">${t.label}</span>
      ${t.id === "today" ? `<span class="badge tnum">${fmtHM(todayMs())}</span>` : ""}
    </button>`
  ).join("")

  const t0 = startOfDay(new Date()).getTime()
  const perCat = {}
  state.todayEntries.forEach((e) => (perCat[e.category_id] = (perCat[e.category_id] || 0) + (e.end_ts - e.start_ts)))
  document.getElementById("catList").innerHTML = state.categories
    .map(
      (c) => `<button class="nav" data-cat="${c.id}" title="ویرایش دسته">
        <span class="ico">${esc(c.emoji)}</span>
        <span class="lbl">${esc(c.name)}</span>
        <span class="badge tnum">${perCat[c.id] ? fmtHM(perCat[c.id]) : "–"}</span>
      </button>`
    )
    .join("")

  const goal = goalMs(), done = todayMs()
  document.getElementById("sfGoal").textContent = fmtHM(done) + " / " + fmtHM(goal)
  document.getElementById("sfBar").style.width = goal ? Math.min(100, (done / goal) * 100) + "%" : "0%"
  const st = streakInfo()
  document.getElementById("sfStreak").textContent = "🔥 استریک"
  document.getElementById("sfStreakN").textContent = fa(st.current) + " روز"

  document.getElementById("tabs").innerHTML = TABS.map(
    (t) => `<button class="tab ${state.view === t.id ? "on" : ""}" data-nav="${t.id}">${t.label}</button>`
  ).join("")
  const active = TABS.find((t) => t.id === state.view)
  document.getElementById("crumb").textContent = active ? active.label : ""

  const r = runningTimer()
  const c = r && catById(r.categoryId)
  document.getElementById("tbDot").className = "tb-dot" + (r ? " live" : "")
  document.getElementById("tbText").textContent = r
    ? "Minder · " + (c ? c.name : "") + " در حال اجرا"
    : "Minder"
}

async function refresh(view) {
  if (view) state.view = view
  await loadAll()
  await loadAggregates()
  renderShell()
  renderView()
}

function renderView() {
  const el = document.getElementById("view")
  if (state.view === "today") el.innerHTML = viewToday()
  else if (state.view === "charts") el.innerHTML = viewCharts()
  else if (state.view === "card") el.innerHTML = viewCard()
  else el.innerHTML = viewSettings()
  document.getElementById("scroll").scrollTop = 0
  startTick()
}

/* ============================================================
   View: today
   ============================================================ */

function viewToday() {
  const now = new Date()
  const done = todayMs(), goal = goalMs()
  const pct = goal ? Math.min(100, (done / goal) * 100) : 0
  const diff = done - goal
  const yKey = dayKey(addDays(now, -1))
  const yMs = state.dailyTotals[yKey] || 0
  const r = runningTimer()
  const activeCat = r ? catById(r.categoryId) : null

  const rows = state.todayEntries.length
    ? state.todayEntries
        .map(
          (e) => `<div class="tr item">
        <div class="cat">
          <span class="sw" style="background:${esc(e.cat_color)}"></span>
          <span>${esc(e.cat_emoji)}</span>
          <span class="nm">${esc(e.cat_name)}${e.note ? ` <span class="hint">— ${esc(e.note)}</span>` : ""}</span>
        </div>
        <div class="tnum hint">${clockOf(e.start_ts)} – ${clockOf(e.end_ts)}</div>
        <div class="tnum">${fmtHM(e.end_ts - e.start_ts)}</div>
        <div class="rowacts">
          <button class="iconbtn" data-act="edit-entry" data-id="${e.id}" aria-label="ویرایش">✎</button>
          <button class="iconbtn" data-act="del-entry" data-id="${e.id}" aria-label="حذف">✕</button>
        </div>
      </div>`
        )
        .join("")
    : `<div class="empty">هنوز چیزی برای امروز ثبت نشده — تایمر را شروع کن یا دستی اضافه کن</div>`

  return `
  <div class="ph">${dateText(now)}</div>
  <div class="sub">${fa(state.todayEntries.length)} فعالیت ثبت شده · مجموع ${fmtLong(done)}</div>

  <div class="hero">
    <div class="card">
      <div class="kpi-lab">مجموع امروز</div>
      <div class="kpi tnum">${fmtHM(done)}</div>
      <div class="bar" style="margin:12px 0 8px"><i style="width:${pct}%"></i></div>
      <div class="mini">
        <span>هدف <span class="tnum">${fmtHM(goal)}</span></span>
        <span class="delta ${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "+" : "−"}<span class="tnum">${fmtHM(Math.abs(diff))}</span></span>
      </div>
      <div class="mini" style="margin-top:8px">
        <span>دیروز</span><span class="tnum">${fmtHM(yMs)}</span>
      </div>
    </div>

    <div class="card">
      <div class="timer">
        <div>
          <div class="kpi-lab">${r ? "در حال اجرا — " + esc(activeCat ? activeCat.name : "") : "تایمر"}</div>
          <div class="live tnum ${r ? "" : "idle"}" id="liveClock">${r ? fmtHMS(Date.now() - r.startedAt) : fa("00:00:00")}</div>
        </div>
        <div class="acts">
          ${
            r
              ? `<button class="btn pri" data-act="commit-timer">ثبت و پایان</button>
                 <button class="btn" data-act="cancel-timer">لغو</button>`
              : `<button class="btn" data-act="manual-add">افزودن دستی</button>`
          }
        </div>
      </div>
      <div class="chips">
        ${state.categories
          .map(
            (c) => `<button class="chip ${r && r.categoryId === c.id ? "on" : ""}" data-act="start-timer" data-id="${c.id}">
              ${esc(c.emoji)} ${esc(c.name)}</button>`
          )
          .join("")}
      </div>
      ${r ? `<div class="hint" style="margin-top:8px">شروع از <span class="tnum">${clockOf(r.startedAt)}</span> · با انتخاب دسته‌ی دیگر، این بازه ثبت و تایمر جدید شروع می‌شود</div>` : ""}
    </div>
  </div>

  <div class="sec">
    <div class="h2">فعالیت‌های امروز</div>
    <div class="tbl">
      <div class="tr head"><div>دسته</div><div>بازه</div><div>مدت</div><div></div></div>
      ${rows}
      <div class="addrow"><button data-act="manual-add">+ افزودن دستی</button></div>
    </div>
  </div>`
}

/* ============================================================
   View: charts
   ============================================================ */

function weekData() {
  const now = new Date()
  const ws = startOfWeek(now)
  const todayK = dayKey(now)
  const days = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i)
    const ms = state.dailyTotals[dayKey(d)] || 0
    days.push({
      label: J.WEEKDAYS[i],
      hours: ms / 3600000,
      ms,
      isToday: dayKey(d) === todayK,
      valueText: fmtHM(ms)
    })
  }
  return { days, total: days.reduce((a, b) => a + b.ms, 0), start: ws }
}

function monthData() {
  const now = new Date()
  const jn = J.fromDate(now)
  const months = []
  for (let k = 11; k >= 0; k--) {
    let jy = jn.jy, jm = jn.jm - k
    while (jm <= 0) {
      jm += 12
      jy -= 1
    }
    months.push({ jy, jm, label: J.MONTHS[jm - 1], ms: 0 })
  }
  const index = {}
  months.forEach((m, i) => (index[m.jy + "-" + m.jm] = i))
  Object.keys(state.dailyTotals).forEach((k) => {
    const p = k.split("-").map(Number)
    const j = J.fromDate(new Date(p[0], p[1] - 1, p[2]))
    const i = index[j.jy + "-" + j.jm]
    if (i !== undefined) months[i].ms += state.dailyTotals[k]
  })
  return months.reverse().map((m) => ({ label: m.label, hours: m.ms / 3600000, ms: m.ms })).reverse()
}

function heatData() {
  const now = new Date()
  const ws = startOfWeek(now)
  const start = addDays(ws, -7 * 11)
  const goal = goalMs() || 4 * 3600000
  const cells = []
  for (let w = 0; w < 12; w++) {
    for (let dd = 0; dd < 7; dd++) {
      const d = addDays(start, w * 7 + dd)
      const ms = state.dailyTotals[dayKey(d)] || 0
      const ratio = ms / goal
      const level = ms <= 0 ? 0 : ratio < 0.35 ? 1 : ratio < 0.7 ? 2 : ratio < 1 ? 3 : 4
      cells.push({ level, title: dateText(d, { weekday: false }) + " — " + fmtHM(ms) })
    }
  }
  return cells
}

function viewCharts() {
  const wk = weekData()
  const months = monthData()
  const goalH = goalMs() / 3600000

  const catRows = state.weekCats || []
  const catTotal = catRows.reduce((a, b) => a + b.ms, 0)
  const best = catRows[0]
  const st = streakInfo()

  const activeDays = Object.keys(state.dailyTotals).filter((k) => state.dailyTotals[k] > 0)
  const avg = activeDays.length
    ? activeDays.reduce((a, k) => a + state.dailyTotals[k], 0) / activeDays.length
    : 0

  return `
  <div class="ph">نمودارها</div>
  <div class="sub">مرور هفتگی، ماهانه و روند بلندمدت</div>

  <div class="kpis" style="margin-top:20px">
    <div class="card">
      <div class="kpi-lab">این هفته</div>
      <div class="kpi tnum">${fmtHM(wk.total)}</div>
      <div class="hint">از ${fa(7)} روز هفته</div>
    </div>
    <div class="card">
      <div class="kpi-lab">میانگین روزانه</div>
      <div class="kpi tnum">${fmtHM(avg)}</div>
      <div class="hint">روزهای فعال: ${fa(activeDays.length)}</div>
    </div>
    <div class="card">
      <div class="kpi-lab">استریک</div>
      <div class="kpi">${fa(st.current)} روز</div>
      <div class="hint">رکورد ${fa(st.best)} روز</div>
    </div>
    <div class="card">
      <div class="kpi-lab">بیشترین دسته</div>
      <div class="kpi" style="font-size:20px">${best ? esc(best.emoji + " " + best.name) : "–"}</div>
      <div class="hint">${best && catTotal ? fa(Math.round((best.ms / catTotal) * 100)) + "٪ از کل" : "داده‌ای نیست"}</div>
    </div>
  </div>

  <div class="sec split">
    <div class="card">
      <div class="h2">هفته‌ی جاری — ساعت به تفکیک روز</div>
      ${window.Charts.weekly(wk.days, goalH, (n) => fa(n))}
    </div>
    <div class="card">
      <div class="h2">سهم دسته‌ها در این هفته</div>
      ${window.Charts.donut(
        catRows.map((c) => ({ ms: c.ms, color: c.color })),
        fmtHM(catTotal),
        "این هفته"
      )}
      <div style="margin-top:16px">
        ${
          catRows.length
            ? catRows
                .map(
                  (c) => `<div class="cb">
                    <span class="n">${esc(c.emoji)} ${esc(c.name)}</span>
                    <span class="t"><i style="width:${catTotal ? (c.ms / catTotal) * 100 : 0}%;background:${esc(c.color)}"></i></span>
                    <span class="v tnum">${fmtHM(c.ms)}</span>
                  </div>`
                )
                .join("")
            : `<div class="hint">در این هفته زمانی ثبت نشده</div>`
        }
      </div>
    </div>
  </div>

  <div class="sec card">
    <div class="h2">روند ماهانه — مجموع ساعت‌های هر ماه</div>
    ${window.Charts.monthly(months, (n) => fa(n))}
  </div>

  <div class="sec card">
    <div class="h2">۱۲ هفته‌ی گذشته</div>
    ${window.Charts.heat(heatData())}
  </div>`
}

/* ============================================================
   View: daily card
   ============================================================ */

function cardData() {
  const s = state.settings
  const now = new Date()
  const done = todayMs(), goal = goalMs()
  const perCat = {}
  state.todayEntries.forEach((e) => {
    if (!perCat[e.category_id])
      perCat[e.category_id] = { emoji: e.cat_emoji, name: e.cat_name, ms: 0 }
    perCat[e.category_id].ms += e.end_ts - e.start_ts
  })
  const list = Object.values(perCat).sort((a, b) => b.ms - a.ms)
  const maxMs = list.length ? list[0].ms : 1
  const st = streakInfo()
  const ratio = { "16:10": "16/10", "1:1": "1/1", "9:16": "9/16" }[s.cardAspect] || "16/10"

  return {
    name: s.displayName || "من",
    dateText: dateText(now),
    totalText: fmtHM(done),
    title: s.cardTitle || "ساعت کار متمرکز",
    goalText: goal ? "از هدف " + fmtHM(goal) : "",
    goalPct: goal ? Math.min(100, (done / goal) * 100) : 0,
    goalLeftText: goal
      ? done >= goal
        ? "هدف روزانه کامل شد"
        : fmtHM(goal - done) + " تا هدف"
      : "",
    goalRightText: goal ? fa(Math.round((done / goal) * 100)) + "٪" : "",
    rows: list.map((c) => ({
      emoji: c.emoji,
      name: c.name,
      valueText: fmtLong(c.ms),
      pctText: done ? fa(Math.round((c.ms / done) * 100)) + "٪" : "",
      pct: (c.ms / maxMs) * 100
    })),
    streakText: "🔥 استریک " + fa(st.current) + " روزه",
    avatar: state.avatarData,
    showAvatar: s.cardShowAvatar !== "0",
    bg: s.cardBg || "black",
    aspect: s.cardAspect || "16:10",
    ratio
  }
}

function viewCard() {
  const s = state.settings
  const d = cardData()
  const A = window.Card.ASPECTS[d.aspect] || window.Card.ASPECTS["16:10"]
  return `
  <style id="cardCss">${window.Card.css(d.bg)}</style>
  <div class="ph">کارت روزانه</div>
  <div class="sub">هر چیزی که می‌بینی از داده‌ی واقعی امروز ساخته می‌شود</div>

  <div class="cardview">
    <div class="shotwrap">${window.Card.markup(d)}</div>

    <div class="card">
      <div class="h2">تنطیمات کارت</div>
      <div class="field" style="margin-bottom:12px">
        <label for="cardTitle">عنوان</label>
        <input id="cardTitle" type="text" value="${esc(s.cardTitle)}" data-set="cardTitle">
      </div>
      <div class="opt"><b>نمایش آواتار</b>
        <button class="tg ${s.cardShowAvatar !== "0" ? "on" : ""}" data-toggle="cardShowAvatar" aria-label="نمایش آواتار"></button></div>
      <div class="opt"><b>اعداد فارسی</b>
        <button class="tg ${s.faDigits !== "0" ? "on" : ""}" data-toggle="faDigits" aria-label="اعداد فارسی"></button></div>
      <div class="opt"><b>تاریخ شمسی</b>
        <button class="tg ${s.jalali !== "0" ? "on" : ""}" data-toggle="jalali" aria-label="تاریخ شمسی"></button></div>
      <div class="opt"><b>نسبت تصویر</b>
        <div class="seg">
          ${Object.keys(window.Card.ASPECTS)
            .map(
              (k) =>
                `<button class="${s.cardAspect === k ? "on" : ""}" data-pick="cardAspect" data-val="${k}">${window.Card.ASPECTS[k].label}</button>`
            )
            .join("")}
        </div>
      </div>
      <div class="opt"><b>پس‌زمینه</b>
        <div class="seg">
          <button class="${(s.cardBg || "black") === "black" ? "on" : ""}" data-pick="cardBg" data-val="black">مشکی</button>
          <button class="${s.cardBg === "gray" ? "on" : ""}" data-pick="cardBg" data-val="gray">خاکستری</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="btn pri" data-act="save-card">ذخیره‌ی PNG</button>
        <button class="btn" data-act="copy-card">کپی به کلیپ‌بورد</button>
      </div>
      <div class="hint" style="margin-top:10px">خروجی: <span class="tnum">${fa(A.w)}×${fa(A.h)}</span> پیکسل</div>
    </div>
  </div>`
}

function fontDirUrl() {
  return new URL("../../assets/fonts/", location.href).href
}

async function exportCard(mode) {
  const d = cardData()
  const A = window.Card.ASPECTS[d.aspect] || window.Card.ASPECTS["16:10"]
  const html = window.Card.document(d, fontDirUrl())
  const j = J.fromDate(new Date())
  const fileName = "minder-" + j.jy + "-" + pad2(j.jm) + "-" + pad2(j.jd)
  const payload = { width: A.w, height: A.h, html, fileName }
  if (mode === "copy") {
    const r = await call(bridge.card.copy(payload))
    if (r) toast("تصویر کارت در کلیپ‌بورد کپی شد")
  } else {
    const r = await call(bridge.card.save(payload))
    if (r && r.saved) toast("ذخیره شد")
  }
}

/* ============================================================
   View: settings
   ============================================================ */

function viewSettings() {
  const s = state.settings
  const goalH = Math.floor((Number(s.dailyGoalMinutes) || 0) / 60)
  const goalM = (Number(s.dailyGoalMinutes) || 0) % 60
  return `
  <div class="ph">تنطیمات</div>
  <div class="sub">پروفایل، هدف روزانه، دسته‌ها و پشتیبان‌گیری</div>

  <div class="sec card">
    <div class="h2">پروفایل</div>
    <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
      <div style="text-align:center">
        <div style="width:84px;height:84px;border-radius:50%;overflow:hidden;background:var(--raised);
          display:grid;place-items:center;font-size:30px;color:var(--text3)">
          ${state.avatarData ? `<img src="${esc(state.avatarData)}" alt="" style="width:100%;height:100%;object-fit:cover">` : esc((s.displayName || "?").trim().charAt(0) || "?")}
        </div>
        <div style="display:flex;gap:6px;margin-top:10px">
          <button class="btn sm" data-act="pick-avatar">تغییر</button>
          ${state.avatarData ? `<button class="btn sm gh" data-act="clear-avatar">حذف</button>` : ""}
        </div>
      </div>
      <div style="flex:1;min-width:240px;display:grid;gap:12px">
        <div class="field">
          <label for="setName">نام نمایشی</label>
          <input id="setName" type="text" value="${esc(s.displayName)}" data-set="displayName" placeholder="مانند: اشکان">
        </div>
        <div class="field">
          <label for="setRole">زیرعنوان</label>
          <input id="setRole" type="text" value="${esc(s.role)}" data-set="role" placeholder="مانند: ساعت کار متمرکز">
        </div>
        <div class="hint">نام و تصویر هم در نوار کناری و هم روی کارت روزانه دیده می‌شوند.</div>
      </div>
    </div>
  </div>

  <div class="sec card">
    <div class="h2">هدف و نمایش</div>
    <div class="opt"><b>هدف روزانه</b>
      <div style="display:flex;align-items:center;gap:6px">
        <input id="goalH" type="number" min="0" max="24" value="${goalH}" style="width:64px"> <span class="hint">ساعت</span>
        <input id="goalM" type="number" min="0" max="59" step="5" value="${goalM}" style="width:64px"> <span class="hint">دقیقه</span>
        <button class="btn sm" data-act="save-goal">ذخیره</button>
      </div>
    </div>
    <div class="opt"><b>اعداد فارسی</b>
      <button class="tg ${s.faDigits !== "0" ? "on" : ""}" data-toggle="faDigits" aria-label="اعداد فارسی"></button></div>
    <div class="opt"><b>تاریخ شمسی</b>
      <button class="tg ${s.jalali !== "0" ? "on" : ""}" data-toggle="jalali" aria-label="تاریخ شمسی"></button></div>
  </div>

  <div class="sec card">
    <div class="h2">دسته‌ها</div>
    <div class="tbl" style="background:transparent">
      ${state.categories
        .map(
          (c) => `<div class="tr item" style="grid-template-columns:minmax(0,1fr) 120px 74px">
            <div class="cat"><span class="sw" style="background:${esc(c.color)}"></span>
              <span>${esc(c.emoji)}</span><span class="nm">${esc(c.name)}</span></div>
            <div class="hint tnum">${fmtHM(msForCategoryAllTime(c.id))} در کل</div>
            <div class="rowacts">
              <button class="iconbtn" data-act="edit-cat" data-id="${c.id}" aria-label="ویرایش">✎</button>
              <button class="iconbtn" data-act="del-cat" data-id="${c.id}" aria-label="حذف">✕</button>
            </div>
          </div>`
        )
        .join("")}
      <div class="addrow"><button data-act="new-cat">+ دسته‌ی جدید</button></div>
    </div>
    <div class="hint" style="margin-top:10px">حذف دسته، تمام رکوردهای ثبت‌شده‌ی اون را هم پاک می‌کند.</div>
  </div>

  <div class="sec card">
    <div class="h2">داده‌ها</div>
    <div class="opt"><b>پشتیبان‌گیری JSON</b><button class="btn sm" data-act="export-data">خروجی</button></div>
    <div class="opt"><b>پوشه‌ی دیتابیس</b><button class="btn sm" data-act="open-folder">باز کردن</button></div>
    <div class="hint" style="margin-top:8px">همه‌ی داده‌ها فقط روی این دستگاه در یک فایل SQLite ذخیره می‌شوند — بدون اینترنت و بدون حساب کاربری.</div>
  </div>`
}

function msForCategoryAllTime(id) {
  return (state.catTotals && state.catTotals[id]) || 0
}

/* ============================================================
   Modals
   ============================================================ */

function closeModal() {
  document.getElementById("modalRoot").innerHTML = ""
}

function entryModal(entry) {
  const now = new Date()
  const base = entry ? new Date(entry.start_ts) : now
  const j = state.settings.jalali === "0" ? null : J.fromDate(base)
  const startD = entry ? new Date(entry.start_ts) : new Date(now.getTime() - 3600000)
  const endD = entry ? new Date(entry.end_ts) : now
  const catId = entry ? entry.category_id : state.categories[0] && state.categories[0].id

  document.getElementById("modalRoot").innerHTML = `
  <div class="scrim" data-close="1">
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${entry ? "ویرایش رکورد" : "افزودن دستی"}</h3>
      <div class="field" style="margin-bottom:12px">
        <label for="mCat">دسته</label>
        <select id="mCat">
          ${state.categories.map((c) => `<option value="${c.id}" ${c.id === catId ? "selected" : ""}>${esc(c.emoji + " " + c.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field" style="margin-bottom:12px">
        <label>تاریخ ${j ? "(شمسی)" : "(میلادی)"}</label>
        <div class="grid3">
          <input id="mY" type="number" value="${j ? j.jy : base.getFullYear()}" aria-label="سال">
          <input id="mM" type="number" min="1" max="12" value="${j ? j.jm : base.getMonth() + 1}" aria-label="ماه">
          <input id="mD" type="number" min="1" max="31" value="${j ? j.jd : base.getDate()}" aria-label="روز">
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="mStart">شروع</label>
          <input id="mStart" type="text" value="${pad2(startD.getHours())}:${pad2(startD.getMinutes())}" placeholder="09:00">
        </div>
        <div class="field">
          <label for="mEnd">پایان</label>
          <input id="mEnd" type="text" value="${pad2(endD.getHours())}:${pad2(endD.getMinutes())}" placeholder="10:30">
        </div>
      </div>
      <div class="field" style="margin-top:12px">
        <label for="mNote">یادداشت (اختیاری)</label>
        <input id="mNote" type="text" value="${entry ? esc(entry.note) : ""}">
      </div>
      <div class="err" id="mErr"></div>
      <div class="modalfoot">
        <button class="btn gh" data-close="1">انصراف</button>
        <button class="btn pri" id="mSave">${entry ? "ذخیره" : "افزودن"}</button>
      </div>
    </div>
  </div>`

  document.getElementById("mSave").onclick = async () => {
    const err = document.getElementById("mErr")
    const y = +document.getElementById("mY").value
    const mo = +document.getElementById("mM").value
    const da = +document.getElementById("mD").value
    const st = parseHM(document.getElementById("mStart").value)
    const en = parseHM(document.getElementById("mEnd").value)
    if (!st || !en) return (err.textContent = "ساعت را مانند 09:30 وارد کن")
    let sDate, eDate
    try {
      sDate = j ? J.toDate(y, mo, da, st.h, st.m) : new Date(y, mo - 1, da, st.h, st.m)
      eDate = j ? J.toDate(y, mo, da, en.h, en.m) : new Date(y, mo - 1, da, en.h, en.m)
    } catch (e) {
      return (err.textContent = "تاریخ نامعتبر است")
    }
    if (eDate <= sDate) eDate = new Date(eDate.getTime() + 86400000) // crossed midnight
    const payload = {
      categoryId: +document.getElementById("mCat").value,
      startTs: sDate.getTime(),
      endTs: eDate.getTime(),
      note: document.getElementById("mNote").value.trim()
    }
    const res = entry
      ? await call(bridge.entries.update(Object.assign({ id: entry.id }, payload)))
      : await call(bridge.entries.create(payload))
    if (res) {
      closeModal()
      await refresh()
      toast(entry ? "ویرایش شد" : "ثبت شد")
    }
  }
}

function parseHM(v) {
  const s = String(v).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).trim()
  const m = s.match(/^(\d{1,2})[:.\s]?(\d{2})$/)
  if (!m) return null
  const h = +m[1], mi = +m[2]
  if (h > 23 || mi > 59) return null
  return { h, m: mi }
}

function categoryModal(cat) {
  document.getElementById("modalRoot").innerHTML = `
  <div class="scrim" data-close="1">
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${cat ? "ویرایش دسته" : "دسته‌ی جدید"}</h3>
      <div class="field" style="margin-bottom:12px">
        <label for="cName">نام</label>
        <input id="cName" type="text" value="${cat ? esc(cat.name) : ""}" placeholder="مانند: کد نویسی">
      </div>
      <div class="grid2">
        <div class="field">
          <label for="cEmoji">ایموجی</label>
          <input id="cEmoji" type="text" value="${cat ? esc(cat.emoji) : "⏱"}" maxlength="4">
        </div>
        <div class="field">
          <label for="cColor">رنگ</label>
          <input id="cColor" type="color" value="${cat ? esc(cat.color) : "#5E9FE8"}">
        </div>
      </div>
      <div class="err" id="cErr"></div>
      <div class="modalfoot">
        <button class="btn gh" data-close="1">انصراف</button>
        <button class="btn pri" id="cSave">${cat ? "ذخیره" : "افزودن"}</button>
      </div>
    </div>
  </div>`
  document.getElementById("cSave").onclick = async () => {
    const name = document.getElementById("cName").value.trim()
    if (!name) return (document.getElementById("cErr").textContent = "نام دسته را وارد کن")
    const payload = {
      name,
      emoji: document.getElementById("cEmoji").value.trim() || "⏱",
      color: document.getElementById("cColor").value
    }
    const res = cat
      ? await call(bridge.categories.update(Object.assign({ id: cat.id }, payload)))
      : await call(bridge.categories.create(payload))
    if (res) {
      closeModal()
      await refresh()
      toast(cat ? "ویرایش شد" : "دسته ساخته شد")
    }
  }
}

function confirmModal(text, onYes) {
  document.getElementById("modalRoot").innerHTML = `
  <div class="scrim" data-close="1">
    <div class="modal" role="dialog" aria-modal="true">
      <h3>مطمئنی؟</h3>
      <div style="color:var(--text2);font-size:14px">${esc(text)}</div>
      <div class="modalfoot">
        <button class="btn gh" data-close="1">انصراف</button>
        <button class="btn danger" id="yesBtn">بله، حذف کن</button>
      </div>
    </div>
  </div>`
  document.getElementById("yesBtn").onclick = async () => {
    closeModal()
    await onYes()
  }
}

/* ============================================================
   Events
   ============================================================ */

document.getElementById("winMin").onclick = () => bridge.win.minimize()
document.getElementById("winClose").onclick = () => bridge.win.close()
document.getElementById("meBtn").onclick = () => refresh("settings")
document.getElementById("newCatBtn").onclick = () => categoryModal(null)

document.body.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-nav],[data-act],[data-toggle],[data-pick],[data-cat],[data-close]")
  if (!t) return

  if (t.dataset.close) {
    if (ev.target === t || t.tagName === "BUTTON") closeModal()
    return
  }
  if (t.dataset.nav) return void refresh(t.dataset.nav)
  if (t.dataset.cat) return categoryModal(catById(t.dataset.cat))

  if (t.dataset.toggle) {
    const key = t.dataset.toggle
    const next = state.settings[key] === "0" ? "1" : "0"
    state.settings = (await call(bridge.settings.set({ [key]: next }))) || state.settings
    renderShell()
    renderView()
    return
  }
  if (t.dataset.pick) {
    state.settings = (await call(bridge.settings.set({ [t.dataset.pick]: t.dataset.val }))) || state.settings
    renderView()
    return
  }

  const act = t.dataset.act
  const id = t.dataset.id ? Number(t.dataset.id) : null

  if (act === "start-timer") {
    const r = runningTimer()
    if (r && r.categoryId === id) return
    if (r) await call(bridge.timer.commit())
    await call(bridge.timer.start({ categoryId: id }))
    await refresh()
    return
  }
  if (act === "commit-timer") {
    const e = await call(bridge.timer.commit())
    await refresh()
    if (e) toast("ثبت شد: " + fmtHM(e.end_ts - e.start_ts))
    return
  }
  if (act === "cancel-timer") {
    await call(bridge.timer.cancel())
    await refresh()
    toast("تایمر لغو شد")
    return
  }
  if (act === "manual-add") return entryModal(null)
  if (act === "edit-entry") return entryModal(state.todayEntries.find((e) => e.id === id))
  if (act === "del-entry")
    return confirmModal("این رکورد حذف می‌شود.", async () => {
      await call(bridge.entries.remove({ id }))
      await refresh()
      toast("حذف شد")
    })

  if (act === "new-cat") return categoryModal(null)
  if (act === "edit-cat") return categoryModal(catById(id))
  if (act === "del-cat")
    return confirmModal("دسته و همه‌ی رکوردهای آن حذف می‌شوند.", async () => {
      await call(bridge.categories.remove({ id }))
      await refresh()
      toast("حذف شد")
    })

  if (act === "pick-avatar") {
    const s = await call(bridge.profile.pickAvatar())
    if (s) {
      state.settings = s
      await refresh()
      toast("تصویر پروفایل عوض شد")
    }
    return
  }
  if (act === "clear-avatar") {
    await call(bridge.profile.clearAvatar())
    await refresh()
    return
  }
  if (act === "save-goal") {
    const h = Math.max(0, Math.min(24, +document.getElementById("goalH").value || 0))
    const m = Math.max(0, Math.min(59, +document.getElementById("goalM").value || 0))
    state.settings = (await call(bridge.settings.set({ dailyGoalMinutes: h * 60 + m }))) || state.settings
    renderShell()
    renderView()
    toast("هدف روزانه ذخیره شد")
    return
  }
  if (act === "save-card") return exportCard("save")
  if (act === "copy-card") return exportCard("copy")
  if (act === "export-data") {
    const r = await call(bridge.data.export())
    if (r && r.saved) toast("پشتیبان ذخیره شد")
    return
  }
  if (act === "open-folder") return void call(bridge.data.folder())
})

/* live-save text inputs */
document.body.addEventListener("change", async (ev) => {
  const el = ev.target
  if (!el.dataset || !el.dataset.set) return
  const key = el.dataset.set
  state.settings = (await call(bridge.settings.set({ [key]: el.value }))) || state.settings
  renderShell()
  if (state.view === "card") renderView()
})

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") closeModal()
})

/* ---------------- timer tick ---------------- */

function startTick() {
  clearInterval(state.tickHandle)
  const r = runningTimer()
  if (!r) return
  state.tickHandle = setInterval(() => {
    const el = document.getElementById("liveClock")
    if (el) el.textContent = fmtHMS(Date.now() - r.startedAt)
  }, 1000)
}

/* ---------------- extra aggregates ---------------- */

async function loadAggregates() {
  const now = new Date()
  const ws = startOfWeek(now).getTime()
  const weekCats = (await call(bridge.stats.byCategory({ fromTs: ws, toTs: ws + 7 * 86400000 }))) || []
  state.weekCats = weekCats
  const all = (await call(bridge.stats.byCategory({ fromTs: 0, toTs: Date.now() + 86400000 }))) || []
  state.catTotals = {}
  all.forEach((c) => (state.catTotals[c.id] = c.ms))
}

/* ---------------- boot ---------------- */

function fatal(msg) {
  const box = document.createElement("div")
  box.setAttribute("style",
    "position:fixed;inset:auto 16px 16px 16px;z-index:9999;background:#3A1E1E;" +
    "border:1px solid rgba(233,115,102,.55);border-radius:10px;padding:12px 14px;" +
    "font:400 13px/1.7 var(--ui,sans-serif);color:#FFD8D3;white-space:pre-wrap;direction:rtl")
  box.textContent = "\u062e\u0637\u0627 \u062f\u0631 \u0627\u062c\u0631\u0627: " + msg
  document.body.appendChild(box)
}
window.addEventListener("error", (e) => fatal(String((e && e.message) || e)))
window.addEventListener("unhandledrejection", (e) =>
  fatal(String((e && e.reason && e.reason.message) || (e && e.reason) || e))
)

;(async function boot() {
  const step = (s) => (window.__stage = s)
  try {
    step("api")
    if (!bridge) throw new Error("window.api \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0646\u06cc\u0633\u062a (preload)")
    step("loadAll")
    await loadAll()
    step("loadAggregates")
    await loadAggregates()
    step("renderShell")
    renderShell()
    step("renderView")
    renderView()
    window.__booted = true
    step("ready")
  } catch (err) {
    fatal(String((err && err.message) || err) + " [stage: " + window.__stage + "]")
    return
  }
  // keep aggregates and "today" fresh across midnight / long sessions
  setInterval(async () => {
    try {
      await loadAll()
      await loadAggregates()
      renderShell()
      if (state.view !== "today" || !runningTimer()) renderView()
    } catch (e) {}
  }, 120000)
})()
