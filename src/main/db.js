"use strict"
/* ============================================================
   Local store — pure JavaScript, zero native dependencies.
   Data lives in a single JSON file inside the app's userData
   folder and is written atomically (tmp file + rename).
   The API is identical to the previous SQLite layer.
   ============================================================ */
const path = require("path")
const fs = require("fs")
const os = require("os")

let dataDir = null
let filePath = null
let mem = null // { settings, categories, entries, seq }
let writeTimer = null

const DEFAULT_SETTINGS = {
  displayName: "",
  role: "\u0633\u0627\u0639\u062a \u06a9\u0627\u0631 \u0645\u062a\u0645\u0631\u06a9\u0632",
  avatarPath: "",
  dailyGoalMinutes: "720",
  faDigits: "1",
  jalali: "1",
  cardTitle: "\u0633\u0627\u0639\u062a \u06a9\u0627\u0631 \u0645\u062a\u0645\u0631\u06a9\u0632",
  cardAspect: "16:10",
  cardBg: "black",
  cardShowAvatar: "1",
  timerCategoryId: "",
  timerStartedAt: ""
}

const DEFAULT_CATEGORIES = [
  { name: "\u06a9\u062f \u0646\u0648\u06cc\u0633\u06cc", emoji: "\ud83e\uddd1\u200d\ud83d\udcbb", color: "#5E9FE8", sort: 1 },
  { name: "\u06cc\u0627\u062f\u06af\u06cc\u0631\u06cc", emoji: "\ud83d\udcda", color: "#EAC26B", sort: 2 },
  { name: "\u0647\u0627\u0646\u062a", emoji: "\ud83e\udd77", color: "#72BC8F", sort: 3 },
  { name: "\u0634\u0637\u0631\u0646\u062c", emoji: "\u265b", color: "#BF8EDA", sort: 4 }
]

const ERR_RANGE = "\u0628\u0627\u0632\u0647\u200c\u06cc \u0632\u0645\u0627\u0646\u06cc \u0646\u0627\u0645\u0639\u062a\u0628\u0631 \u0627\u0633\u062a"
const NO_NAME = "\u0628\u062f\u0648\u0646 \u0646\u0627\u0645"

/* ---------------- persistence ---------------- */

function guessName() {
  try {
    const u = (os.userInfo().username || "").trim()
    return u ? u.charAt(0).toUpperCase() + u.slice(1) : "\u0645\u0646"
  } catch (e) {
    return "\u0645\u0646"
  }
}

function blank() {
  return {
    version: 1,
    settings: Object.assign({}, DEFAULT_SETTINGS, { displayName: guessName() }),
    categories: DEFAULT_CATEGORIES.map((c, i) =>
      Object.assign({ id: i + 1, archived: 0 }, c)
    ),
    entries: [],
    seq: { category: DEFAULT_CATEGORIES.length, entry: 0 }
  }
}

function readFileSafe(p) {
  try {
    const raw = fs.readFileSync(p, "utf8")
    if (!raw.trim()) return null
    const j = JSON.parse(raw)
    if (!j || typeof j !== "object" || !Array.isArray(j.entries)) return null
    return j
  } catch (e) {
    return null
  }
}

function init(userDataPath) {
  dataDir = userDataPath
  fs.mkdirSync(dataDir, { recursive: true })
  filePath = path.join(dataDir, "minder.json")

  let data = readFileSafe(filePath)
  if (!data) {
    // try the automatic backup before giving up
    data = readFileSafe(filePath + ".bak")
    if (data) {
      try {
        fs.copyFileSync(filePath, filePath + ".corrupt-" + Date.now())
      } catch (e) {}
    }
  }
  mem = data || blank()

  // normalize / heal
  mem.settings = Object.assign({}, DEFAULT_SETTINGS, mem.settings || {})
  if (!mem.settings.displayName) mem.settings.displayName = guessName()
  if (!Array.isArray(mem.categories) || !mem.categories.length) {
    mem.categories = DEFAULT_CATEGORIES.map((c, i) => Object.assign({ id: i + 1, archived: 0 }, c))
  }
  if (!Array.isArray(mem.entries)) mem.entries = []
  mem.seq = mem.seq || {}
  mem.seq.category = Math.max(
    mem.seq.category || 0,
    ...mem.categories.map((c) => Number(c.id) || 0)
  )
  mem.seq.entry = Math.max(mem.seq.entry || 0, ...mem.entries.map((e) => Number(e.id) || 0), 0)

  if (!data) flush()
  return mem
}

function flush() {
  if (!filePath) return
  const tmp = filePath + ".tmp"
  const json = JSON.stringify(mem)
  fs.writeFileSync(tmp, json, "utf8")
  try {
    if (fs.existsSync(filePath)) fs.copyFileSync(filePath, filePath + ".bak")
  } catch (e) {}
  fs.renameSync(tmp, filePath)
}

/* debounced save for hot paths, plus an immediate save on demand */
function save(immediate) {
  if (immediate) {
    if (writeTimer) {
      clearTimeout(writeTimer)
      writeTimer = null
    }
    flush()
    return
  }
  if (writeTimer) return
  writeTimer = setTimeout(() => {
    writeTimer = null
    try {
      flush()
    } catch (e) {}
  }, 300)
}

function flushNow() {
  try {
    save(true)
  } catch (e) {}
  return true
}

/* ---------------- settings ---------------- */

function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, mem.settings)
}

function setSettings(patch) {
  for (const [k, v] of Object.entries(patch || {})) {
    mem.settings[k] = v === null || v === undefined ? "" : String(v)
  }
  save(true)
  return getSettings()
}

/* ---------------- categories ---------------- */

function bySort(a, b) {
  return (a.sort || 0) - (b.sort || 0) || a.id - b.id
}

function listCategories(includeArchived) {
  const rows = mem.categories.filter((c) => (includeArchived ? true : !c.archived))
  return rows
    .slice()
    .sort((a, b) => (includeArchived ? (a.archived || 0) - (b.archived || 0) : 0) || bySort(a, b))
    .map((c) => Object.assign({}, c))
}

function findCategory(id) {
  return mem.categories.find((c) => c.id === Number(id))
}

function createCategory({ name, emoji, color }) {
  const maxSort = mem.categories.reduce((m, c) => Math.max(m, c.sort || 0), 0)
  const row = {
    id: ++mem.seq.category,
    name: String(name || NO_NAME).trim() || NO_NAME,
    emoji: emoji || "\u23f1",
    color: color || "#5E9FE8",
    sort: maxSort + 1,
    archived: 0
  }
  mem.categories.push(row)
  save(true)
  return Object.assign({}, row)
}

function updateCategory({ id, name, emoji, color, archived }) {
  const cur = findCategory(id)
  if (!cur) throw new Error("category not found")
  if (name !== undefined) cur.name = String(name).trim() || NO_NAME
  if (emoji !== undefined) cur.emoji = emoji
  if (color !== undefined) cur.color = color
  if (archived !== undefined) cur.archived = archived ? 1 : 0
  save(true)
  return Object.assign({}, cur)
}

function deleteCategory(id) {
  const n = Number(id)
  mem.entries = mem.entries.filter((e) => e.category_id !== n)
  mem.categories = mem.categories.filter((c) => c.id !== n)
  if (String(mem.settings.timerCategoryId) === String(n)) {
    mem.settings.timerCategoryId = ""
    mem.settings.timerStartedAt = ""
  }
  save(true)
  return true
}

function reorderCategories(ids) {
  ;(ids || []).forEach((id, i) => {
    const c = findCategory(id)
    if (c) c.sort = i + 1
  })
  save(true)
  return listCategories()
}

/* ---------------- entries ---------------- */

function deco(e) {
  const c = findCategory(e.category_id)
  return Object.assign({}, e, {
    cat_name: c ? c.name : NO_NAME,
    cat_emoji: c ? c.emoji : "\u23f1",
    cat_color: c ? c.color : "#5E9FE8"
  })
}

function createEntry({ categoryId, startTs, endTs, note }) {
  const s = Math.round(Number(startTs))
  const e = Math.round(Number(endTs))
  if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s)) throw new Error(ERR_RANGE)
  if (!findCategory(categoryId)) throw new Error("category not found")
  const row = {
    id: ++mem.seq.entry,
    category_id: Number(categoryId),
    start_ts: s,
    end_ts: e,
    note: note || "",
    created_at: Date.now()
  }
  mem.entries.push(row)
  save(true)
  return deco(row)
}

function updateEntry({ id, categoryId, startTs, endTs, note }) {
  const cur = mem.entries.find((x) => x.id === Number(id))
  if (!cur) throw new Error("entry not found")
  const s = startTs === undefined ? cur.start_ts : Math.round(Number(startTs))
  const e = endTs === undefined ? cur.end_ts : Math.round(Number(endTs))
  if (!Number.isFinite(s) || !Number.isFinite(e) || !(e > s)) throw new Error(ERR_RANGE)
  if (categoryId !== undefined) {
    if (!findCategory(categoryId)) throw new Error("category not found")
    cur.category_id = Number(categoryId)
  }
  cur.start_ts = s
  cur.end_ts = e
  if (note !== undefined) cur.note = note
  save(true)
  return deco(cur)
}

function deleteEntry(id) {
  mem.entries = mem.entries.filter((e) => e.id !== Number(id))
  save(true)
  return true
}

function getEntry(id) {
  const e = mem.entries.find((x) => x.id === Number(id))
  return e ? deco(e) : undefined
}

function listEntries(fromTs, toTs) {
  const a = Math.round(Number(fromTs))
  const b = Math.round(Number(toTs))
  return mem.entries
    .filter((e) => e.start_ts >= a && e.start_ts < b)
    .sort((x, y) => x.start_ts - y.start_ts)
    .map(deco)
}

/* ---------------- aggregates ---------------- */

/* local calendar day key, e.g. 2026-07-27 */
function dayKey(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, "0")
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate())
}

function groupDaily(rows) {
  const map = new Map()
  rows.forEach((e) => {
    const k = dayKey(e.start_ts)
    map.set(k, (map.get(k) || 0) + (e.end_ts - e.start_ts))
  })
  return Array.from(map, ([day, ms]) => ({ day, ms })).sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0
  )
}

function allDailyTotals() {
  return groupDaily(mem.entries)
}

function dailyTotalsInRange(fromTs, toTs) {
  const a = Math.round(Number(fromTs))
  const b = Math.round(Number(toTs))
  return groupDaily(mem.entries.filter((e) => e.start_ts >= a && e.start_ts < b))
}

function totalsByCategory(fromTs, toTs) {
  const a = Math.round(Number(fromTs))
  const b = Math.round(Number(toTs))
  const map = new Map()
  mem.entries
    .filter((e) => e.start_ts >= a && e.start_ts < b)
    .forEach((e) =>
      map.set(e.category_id, (map.get(e.category_id) || 0) + (e.end_ts - e.start_ts))
    )
  return Array.from(map, ([id, ms]) => {
    const c = findCategory(id)
    return {
      id: Number(id),
      name: c ? c.name : NO_NAME,
      emoji: c ? c.emoji : "\u23f1",
      color: c ? c.color : "#5E9FE8",
      ms
    }
  }).sort((x, y) => y.ms - x.ms)
}

function stats() {
  let totalMs = 0
  let firstEntryTs = null
  mem.entries.forEach((e) => {
    totalMs += e.end_ts - e.start_ts
    if (firstEntryTs === null || e.start_ts < firstEntryTs) firstEntryTs = e.start_ts
  })
  return { firstEntryTs, totalMs, entryCount: mem.entries.length }
}

/* ---------------- backup ---------------- */

function exportAll() {
  return {
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    categories: listCategories(true),
    entries: mem.entries.slice().sort((a, b) => a.start_ts - b.start_ts)
  }
}

function wipeEntries() {
  mem.entries = []
  mem.seq.entry = 0
  save(true)
  return true
}

module.exports = {
  init,
  getSettings,
  setSettings,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  createEntry,
  updateEntry,
  deleteEntry,
  getEntry,
  listEntries,
  allDailyTotals,
  dailyTotalsInRange,
  totalsByCategory,
  stats,
  exportAll,
  wipeEntries,
  flushNow,
  get dataDir() {
    return dataDir
  },
  get filePath() {
    return filePath
  }
}
