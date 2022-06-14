import { app, BrowserWindow, protocol, ipcMain as ipc, dialog, screen } from "electron";
import path from "path";
import { Db, Scanner, Fs } from "musa-core";
import { createApi, scanColor } from "./api";

const { NODE_ENV } = process.env;
const isDev = NODE_ENV === "local";
const stateFile = `${isDev ? ".dev" : ""}.musa-electron.state.v1.json`;

// This API has to exist so that init works
ipc.on("musa:settings:request:get", async (event) => {
  const settings = await Fs.getState(stateFile);

  event.sender.send("musa:settings:response:get", settings);
});

ipc.on("musa:settings:request:insert", async (event, settings) => {
  await Fs.setState(stateFile, settings);

  event.sender.send("musa:settings:response:insert");
});

ipc.on("musa:addMusicLibraryPath:request", async (event) => {
  const paths = dialog.showOpenDialogSync({ properties: ["openDirectory"] });

  if (!Array.isArray(paths) || paths.length < 1) {
    return;
  }

  const newPath = paths[0];
  console.log(`New music library path added: ${newPath}\n`);

  event.sender.send("musa:addMusicLibraryPath:response", newPath);
  await Fs.setState(stateFile, { musicLibraryPath: newPath });
  await init(event);
});

const init = async (event: Electron.IpcMainEvent) => {
  const state = await Fs.getState(stateFile);
  const musicLibraryPath = state?.musicLibraryPath;
  console.log("state", state, "\n");

  if (!musicLibraryPath) {
    const warning =
      "No music library path specified. Go to settings and add it to start scanning.\n";
    console.log(warning);

    return;
  }

  Db.init(musicLibraryPath);
  await Scanner.init({ musicLibraryPath, isElectron: true });
  createApi(musicLibraryPath);
  event.sender.send("musa:ready");

  Scanner.update({ musicLibraryPath, event, scanColor });
};
ipc.once("musa:onInit", init);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow | null;

function createWindow() {
  const allDisplays = screen.getAllDisplays();

  let biggestDisplay = allDisplays[0];
  if (isDev && allDisplays.length > 1) {
    allDisplays.forEach(
      (display) =>
        (biggestDisplay = display.size.width > biggestDisplay.size.width ? display : biggestDisplay)
    );
  }

  const getWebPreferencesByEnv = () => {
    return isDev
      ? {
          nodeIntegration: true,
          nodeIntegrationInSubFrames: true,
          nodeIntegrationInWorker: true,
          contextIsolation: false,
          webSecurity: false,
        }
      : {
          nodeIntegration: true,
          nodeIntegrationInSubFrames: true,
          nodeIntegrationInWorker: true,
          contextIsolation: false,
          webSecurity: true,
        };
  };
  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: biggestDisplay.bounds.x,
    y: biggestDisplay.bounds.y,
    width: 1600,
    height: 980,
    frame: false,
    webPreferences: {
      ...getWebPreferencesByEnv(),
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
    protocol.registerFileProtocol("file", (request, callback) => {
      const pathname = decodeURI(request.url.replace("file://", ""));
      callback(pathname);
    });
  }

  // Emitted when the window is closed.
  mainWindow.on("closed", function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

app.on("activate", function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
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
ipc.on("musa:window:minimize", async () => {
  (mainWindow as BrowserWindow).minimize();
});

ipc.on("musa:window:maximize", async () => {
  (mainWindow as BrowserWindow).maximize();
});

ipc.on("musa:window:unmaximize", async () => {
  (mainWindow as BrowserWindow).unmaximize();
});

ipc.on("musa:window:isMaximized:request", async (event) => {
  event.sender.send(
    "musa:window:isMaximized:response",
    (mainWindow as BrowserWindow).isMaximized()
  );
});

ipc.on("musa:window:close", async () => {
  (mainWindow as BrowserWindow).close();
});

ipc.on("musa:window:platform:request", async (event) => {
  event.sender.send("musa:window:platform:response", process.platform);
});
