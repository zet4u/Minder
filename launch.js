"use strict"
/* Launches Minder using the Electron binary bundled in node_modules/electron/dist.
   Works without `npm install` and without the electron npm wrapper. */
const path = require("path")
const fs = require("fs")
const { spawn } = require("child_process")

const candidates = [
  path.join(__dirname, "node_modules", "electron", "dist", "electron.exe"),
  path.join(__dirname, "electron", "electron.exe"),
  path.join(__dirname, "node_modules", "electron", "electron.exe")
]

const exe = candidates.find((p) => fs.existsSync(p))

if (!exe) {
  console.error(
    "\nElectron binary not found.\n" +
      "Expected: node_modules\\electron\\dist\\electron.exe\n" +
      "Run setup.ps1 (see README.md) to unpack it, then try again.\n"
  )
  process.exit(1)
}

const child = spawn(exe, [__dirname, ...process.argv.slice(2)], { stdio: "inherit" })
child.on("exit", (code) => process.exit(code == null ? 0 : code))
