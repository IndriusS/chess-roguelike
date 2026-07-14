const { app, BrowserWindow } = require("electron");
const path = require("path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
  });

  win.loadFile("dist/index.html");
}

app.whenReady().then(createWindow);