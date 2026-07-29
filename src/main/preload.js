"use strict"
const { contextBridge, ipcRenderer } = require("electron")

const TIMEOUT_MS = 8000

/* Every call is wrapped so a missing/hanging handler surfaces as a real error
   instead of leaving the UI stuck on an unresolved promise forever. */
function call(channel) {
  return (payload) =>
    new Promise((resolve, reject) => {
      let done = false
      const t = setTimeout(() => {
        if (done) return
        done = true
        reject(new Error("IPC timeout: " + channel))
      }, TIMEOUT_MS)
      ipcRenderer.invoke(channel, payload || {}).then(
        (v) => {
          if (done) return
          done = true
          clearTimeout(t)
          resolve(v)
        },
        (e) => {
          if (done) return
          done = true
          clearTimeout(t)
          reject(new Error("IPC failed on " + channel + ": " + (e && e.message ? e.message : String(e))))
        }
      )
    })
}

contextBridge.exposeInMainWorld("api", {
  ping: () => "ok",
  win: {
    minimize: () => ipcRenderer.send("win:minimize"),
    close: () => ipcRenderer.send("win:close")
  },
  settings: {
    get: call("settings:get"),
    set: call("settings:set")
  },
  profile: {
    pickAvatar: call("profile:pickAvatar"),
    clearAvatar: call("profile:clearAvatar"),
    readAvatar: call("profile:readAvatar")
  },
  categories: {
    list: call("cat:list"),
    create: call("cat:create"),
    update: call("cat:update"),
    remove: call("cat:delete"),
    reorder: call("cat:reorder")
  },
  entries: {
    create: call("entry:create"),
    update: call("entry:update"),
    remove: call("entry:delete"),
    list: call("entry:list")
  },
  stats: {
    daily: call("stats:daily"),
    dailyRange: call("stats:dailyRange"),
    byCategory: call("stats:byCategory"),
    summary: call("stats:summary")
  },
  timer: {
    start: call("timer:start"),
    cancel: call("timer:cancel"),
    commit: call("timer:commit")
  },
  card: {
    save: call("card:save"),
    copy: call("card:copy")
  },
  data: {
    export: call("data:export"),
    folder: call("data:folder")
  }
})
