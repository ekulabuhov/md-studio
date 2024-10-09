const { app, BrowserWindow, ipcMain } = require("electron/main");
const path = require("node:path");
const { exec } = require("child_process");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadURL("http://localhost:4401");
  win.webContents.openDevTools();
};

app.whenReady().then(() => {
  ipcMain.handle("ping", async (_, param2) => {
    return new Promise((resolve, reject) => {
      exec(
        `docker run --rm -v "$PWD":/src sgdk`,
        {
          cwd: "./public",
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout);
          }
        }
      );
    });
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
