import { app, BrowserWindow, protocol, ipcMain as ipc, dialog, screen } from "electron";
import path from "path";
import { Api, Db, Scanner, Fs } from "@miikaah/musa-core";
export * from "@miikaah/musa-core";

import { createApi, scanColor } from "./api";

const { NODE_ENV } = process.env;
const isDev = NODE_ENV === "local";
const stateFile = `${isDev ? ".dev" : ""}.musa-electron.state.v1.json`;

// Note: This method can only be used before the ready event of the app module gets emitted
// and can be called only once.
protocol.registerSchemesAsPrivileged([{ scheme: "media", privileges: { bypassCSP: true } }]);

// This API has to exist so that init works
ipc.handle("getSettings", async () => {
  return Fs.getState(stateFile);
});

ipc.handle("insertSettings", async (_, settings) => {
  return Fs.setState(stateFile, settings);
});

ipc.handle("addMusicLibraryPath", async (event) => {
  const paths = dialog.showOpenDialogSync({ properties: ["openDirectory"] });

  if (!Array.isArray(paths) || paths.length < 1) {
    return;
  }

  const newPath = paths[0];
  console.log(`New music library path added: ${newPath}\n`);

  await Fs.setState(stateFile, { musicLibraryPath: newPath });
  await init(event);

  return newPath;
});

ipc.handle("getArtists", async () => {
  return Api.getArtists();
});

let musicLibraryPath = "";

const init = async (event: Electron.IpcMainInvokeEvent) => {
  const state = await Fs.getState(stateFile);
  const electronFileProtocol = "media://";
  musicLibraryPath = state?.musicLibraryPath || "";
  console.log("state", state, "\n");

  if (!musicLibraryPath) {
    const warning =
      "No music library path specified. Go to settings and add it to start scanning.\n";
    console.log(warning);

    return;
  }

  await createApi(musicLibraryPath, electronFileProtocol);
  Db.init(musicLibraryPath);
  await Scanner.init({ musicLibraryPath, isElectron: true, electronFileProtocol });
  event.sender.send("musa:ready");

  Scanner.update({ musicLibraryPath, event, scanColor });
};
ipc.handle("onInit", init);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow;

function createWindow() {
  const allDisplays = screen.getAllDisplays();

  let biggestDisplay = allDisplays[0];
  if (isDev && allDisplays.length > 1) {
    allDisplays.forEach(
      (display) =>
        (biggestDisplay = display.size.width > biggestDisplay.size.width ? display : biggestDisplay)
    );
  }
  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: biggestDisplay.bounds.x,
    y: biggestDisplay.bounds.y,
    width: 1600,
    height: 980,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  const getURL = () => {
    return isDev
      ? "http://localhost:3666"
      : `file://${path.join(app.getAppPath(), "/build/index.html")}`;
  };
  // and load the index.html of the app.
  mainWindow.loadURL(getURL());

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  protocol.registerFileProtocol("media", (request, callback) => {
    const pathname = decodeURIComponent(request.url.replace("media:/", "").replace("media:\\", ""));
    const isExternal = pathname.startsWith("/") || new RegExp(/^[A-Z]:\\\w/).test(pathname);

    if (isExternal) {
      return callback(pathname);
    }

    const filepath = path.join(musicLibraryPath, pathname);

    callback(filepath);
  });

  // Prevent visual flash of empty frame
  mainWindow.once("ready-to-show", () => {
    Scanner.setScanProgressListener((ratio, mode) => {
      if (!ratio) {
        return;
      }

      mainWindow.setProgressBar(ratio, { mode: mode || "none" });
    });
    mainWindow.show();
  });

  mainWindow.on("closed", function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    // @ts-expect-error typecheck doesn't add any value here
    mainWindow = null;
  });
}

// Enable sandbox for all renderers
app.enableSandbox();

app.whenReady().then(async () => {
  createWindow();

  app.on("activate", () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Api for window min max close
ipc.handle("minimizeWindow", async () => {
  mainWindow.minimize();
});

ipc.handle("maximizeWindow", async () => {
  mainWindow.maximize();
});

ipc.handle("unmaximizeWindow", async () => {
  mainWindow.unmaximize();
});

ipc.handle("isWindowMaximized", async () => {
  return mainWindow.isMaximized();
});

ipc.handle("closeWindow", async () => {
  mainWindow.close();
});

ipc.handle("getPlatform", async () => {
  return process.platform;
});
