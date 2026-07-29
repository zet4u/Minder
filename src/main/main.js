"use strict"
const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage, shell, Menu } = require("electron")
const path = require("path")
const fs = require("fs")
const db = require("./db")

/* ---- fixed window size: the app is not resizable ---- */
const WIN_W = 1160
const WIN_H = 740

let win = null

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

function assetsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "assets")
    : path.join(__dirname, "..", "..", "assets")
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    minWidth: WIN_W,
    minHeight: WIN_H,
    maxWidth: WIN_W,
    maxHeight: WIN_H,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    show: false,
    backgroundColor: "#1A1A1A",
    icon: path.join(assetsDir(), "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  Menu.setApplicationMenu(null)
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"))

  /* --- diagnostics: everything the renderer complains about lands in a log --- */
  const logPath = path.join(app.getPath("userData"), "renderer.log")
  const log = (line) => {
    try {
      fs.appendFileSync(logPath, new Date().toISOString() + "  " + line + "\n")
    } catch (e) {}
  }
  log("--- window created ---")
  win.webContents.on("console-message", (_e, level, message, line, sourceId) =>
    log("console[" + level + "] " + message + "  (" + sourceId + ":" + line + ")")
  )
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    log("did-fail-load " + code + " " + desc + " " + url)
  )
  win.webContents.on("preload-error", (_e, p, err) => log("preload-error " + p + " " + err))
  win.webContents.on("render-process-gone", (_e, d) => log("render-process-gone " + JSON.stringify(d)))
  if (process.argv.includes("--mdebug")) win.webContents.openDevTools({ mode: "detach" })
  win.once("ready-to-show", () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: "deny" }
  })
}

app.whenReady().then(() => {
  try {
    db.init(app.getPath("userData"))
  } catch (err) {
    dialog.showErrorBox("Minder", "\u062e\u0637\u0627 \u062f\u0631 \u0628\u0627\u0632 \u06a9\u0631\u062f\u0646 \u0641\u0627\u06cc\u0644 \u062f\u0627\u062f\u0647\u200c\u0647\u0627:\n" + String(err && err.message ? err.message : err))
  }
  createWindow()
})

app.on("window-all-closed", () => app.quit())

/* =========================================================
   IPC
   ========================================================= */

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, payload) => {
    try {
      return { ok: true, data: await fn(payload || {}) }
    } catch (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) }
    }
  })
}

/* window controls (frameless chrome) */
ipcMain.on("win:minimize", () => win && win.minimize())
ipcMain.on("win:close", () => win && win.close())

/* ---- settings & profile ---- */
handle("settings:get", () => db.getSettings())
handle("settings:set", (patch) => db.setSettings(patch))

handle("profile:pickAvatar", async () => {
  const res = await dialog.showOpenDialog(win, {
    title: "انتخاب تصویر پروفایل",
    buttonLabel: "انتخاب",
    filters: [{ name: "تصویر", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    properties: ["openFile"]
  })
  if (res.canceled || !res.filePaths[0]) return db.getSettings()
  const src = res.filePaths[0]
  const ext = path.extname(src).toLowerCase() || ".png"
  const destDir = path.join(db.dataDir, "profile")
  fs.mkdirSync(destDir, { recursive: true })
  const dest = path.join(destDir, "avatar-" + Date.now() + ext)
  fs.copyFileSync(src, dest)
  // clean older avatars
  for (const f of fs.readdirSync(destDir)) {
    const p = path.join(destDir, f)
    if (p !== dest) {
      try {
        fs.unlinkSync(p)
      } catch (e) {}
    }
  }
  return db.setSettings({ avatarPath: dest })
})

handle("profile:clearAvatar", () => db.setSettings({ avatarPath: "" }))

handle("profile:readAvatar", (p) => {
  const target = p && p.filePath ? p.filePath : db.getSettings().avatarPath
  if (!target || !fs.existsSync(target)) return null
  const buf = fs.readFileSync(target)
  const ext = path.extname(target).toLowerCase().replace(".", "") || "png"
  const mime = ext === "jpg" ? "jpeg" : ext
  return "data:image/" + mime + ";base64," + buf.toString("base64")
})

/* ---- categories ---- */
handle("cat:list", (p) => db.listCategories(!!p.includeArchived))
handle("cat:create", (p) => db.createCategory(p))
handle("cat:update", (p) => db.updateCategory(p))
handle("cat:delete", (p) => db.deleteCategory(p.id))
handle("cat:reorder", (p) => db.reorderCategories(p.ids))

/* ---- entries ---- */
handle("entry:create", (p) => db.createEntry(p))
handle("entry:update", (p) => db.updateEntry(p))
handle("entry:delete", (p) => db.deleteEntry(p.id))
handle("entry:list", (p) => db.listEntries(p.fromTs, p.toTs))

/* ---- aggregates ---- */
handle("stats:daily", () => db.allDailyTotals())
handle("stats:dailyRange", (p) => db.dailyTotalsInRange(p.fromTs, p.toTs))
handle("stats:byCategory", (p) => db.totalsByCategory(p.fromTs, p.toTs))
handle("stats:summary", () => db.stats())

/* ---- timer (persisted so a crash or restart never loses time) ---- */
handle("timer:start", (p) =>
  db.setSettings({ timerCategoryId: String(p.categoryId), timerStartedAt: String(Date.now()) })
)
handle("timer:cancel", () => db.setSettings({ timerCategoryId: "", timerStartedAt: "" }))
handle("timer:commit", () => {
  const s = db.getSettings()
  const startedAt = Number(s.timerStartedAt)
  const catId = Number(s.timerCategoryId)
  if (!startedAt || !catId) throw new Error("تایمری در حال اجرا نیست")
  const now = Date.now()
  if (now - startedAt < 1000) {
    db.setSettings({ timerCategoryId: "", timerStartedAt: "" })
    throw new Error("مدت ثبت‌شده کمتر از یک ثانیه بود")
  }
  const entry = db.createEntry({ categoryId: catId, startTs: startedAt, endTs: now })
  db.setSettings({ timerCategoryId: "", timerStartedAt: "" })
  return entry
})

/* ---- daily card: real PNG rendered offscreen at full resolution ---- */
async function renderCardPng(payload) {
  const { width, height, html } = payload
  const off = new BrowserWindow({
    width: Math.round(width),
    height: Math.round(height),
    show: false,
    frame: false,
    transparent: false,
    webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false }
  })
  const tmp = path.join(app.getPath("temp"), "minder-card-" + Date.now() + ".html")
  fs.writeFileSync(tmp, html, "utf8")
  await off.loadFile(tmp)
  await new Promise((r) => setTimeout(r, 350))
  const img = await off.webContents.capturePage()
  off.destroy()
  try {
    fs.unlinkSync(tmp)
  } catch (e) {}
  return img
}

handle("card:save", async (p) => {
  const img = await renderCardPng(p)
  const res = await dialog.showSaveDialog(win, {
    title: "ذخیره‌ی کارت روزانه",
    defaultPath: path.join(app.getPath("pictures"), (p.fileName || "minder-card") + ".png"),
    filters: [{ name: "PNG", extensions: ["png"] }]
  })
  if (res.canceled || !res.filePath) return { saved: false }
  fs.writeFileSync(res.filePath, img.toPNG())
  return { saved: true, filePath: res.filePath }
})

handle("card:copy", async (p) => {
  const img = await renderCardPng(p)
  clipboard.writeImage(nativeImage.createFromBuffer(img.toPNG()))
  return { copied: true }
})

/* ---- backup ---- */
handle("data:export", async () => {
  const res = await dialog.showSaveDialog(win, {
    title: "پشتیبان‌گیری از داده‌ها",
    defaultPath: path.join(app.getPath("documents"), "minder-backup.json"),
    filters: [{ name: "JSON", extensions: ["json"] }]
  })
  if (res.canceled || !res.filePath) return { saved: false }
  fs.writeFileSync(res.filePath, JSON.stringify(db.exportAll(), null, 2), "utf8")
  return { saved: true, filePath: res.filePath }
})

handle("data:folder", () => {
  shell.openPath(db.dataDir)
  return { opened: true, dir: db.dataDir }
})
