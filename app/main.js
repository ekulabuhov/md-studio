const { app, BrowserWindow, net, ipcMain, protocol } = require("electron/main");
const path = require("node:path");
const { exec } = require("child_process");
const { readdirSync, writeFileSync, unlinkSync, readFileSync } = require("node:fs");

// Handle requests to app://project/** when used inside <img> tags
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

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

// TODO: make dynamic when project explorer is implemented
const projectRoot = '/Users/eugene/Documents/MDStudio';

app.whenReady().then(() => {
  ipcMain.handle("ping", async (_, param2) => {
    return new Promise((resolve, reject) => {
      exec(
        `time docker run --rm -v "$PWD":/src sgdk debug`,
        {
          cwd: projectRoot,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(error);
          } else {
            resolve(stdout + '\n' + stderr);
          }
        }
      );
    });
  });

  ipcMain.handle("getFileList", (_, directory) => {
    if (directory[0] === '/') {
      directory = directory.slice(1);
    }

    const entries = readdirSync(projectRoot + '/' + directory, { withFileTypes: true });
    const fileList = entries.filter(entry => !entry.name.startsWith('.')).map(entry => ({
      name: entry.name,
      kind: entry.isDirectory() ? 'directory' : 'file',
      url: entry.isDirectory() ? '' : `app://project/${directory}/${entry.name}`
    }));
    return fileList;
  });

  ipcMain.handle("writeFile", (_, filePath, content) => {
    writeFileSync(projectRoot + '/' + filePath, content);
  });

  ipcMain.handle("deleteFile", (_, filePath) => {
    unlinkSync(projectRoot + '/' + filePath);
  });

  ipcMain.handle("readFile", (_, filePath) => {
    return readFileSync(projectRoot + '/' + filePath, "utf-8");
  });

  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);

    const pathToServe = projectRoot + pathname;
    
    // Only handle absolute paths to avoid escaping the project root
    if (!path.isAbsolute(pathname)) {
      return new Response("bad", {
        status: 400,
        headers: { "content-type": "text/html" },
      });
    }

    return net.fetch(new URL(pathToServe, 'file:').toString());
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
