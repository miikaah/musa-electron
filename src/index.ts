import { app, BrowserWindow, Menu, protocol, ipcMain as ipc, dialog, screen } from "electron";
import path from "path";
import {
  traverseFileSystem,
  createMediaCollection,
  ArtistCollection,
  AlbumCollection,
  FileCollection,
} from "musa-core";
import { getState, setState } from "./fs.state";
import { createApi } from "./api";
import { initDb } from "./db";

const { NODE_ENV } = process.env;
const isDev = NODE_ENV === "local";

const logOpStart = (title: string) => {
  console.log(title);
  console.log("----------------------");
};

const logOpReport = (start: number, collection: unknown[], name: string) => {
  console.log(`Took: ${(Date.now() - start) / 1000} seconds`);
  console.log(`Found: ${collection.length} ${name}`);
  console.log("----------------------\n");
};

let files;
let artistCollection: ArtistCollection;
let albumCollection: AlbumCollection;
let audioCollection: FileCollection;
let imageCollection: FileCollection;

type ArtistObject = {
  [label: string]: { id: string; name: string; url: string }[];
};
let artistObject: ArtistObject;

ipc.on("musa:settings:request:get", async (event) => {
  const settings = await getState();

  event.sender.send("musa:settings:response:get", settings);
});

ipc.on("musa:settings:request:insert", async (event, settings) => {
  await setState(settings);

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
  await setState({ musicLibraryPath: newPath });
  await init(event);
});

// This is very convoluted
// * let musa:ready event control how scan gets launched via frontend
//
// *** Danger of launching multiple scans at the same time
//
// TODO: Perhaps a heuristic like 5 min interval of doing full update during startup?
//
const init = async (event: Electron.IpcMainEvent) => {
  const state = await getState();
  const { musicLibraryPath } = state;
  console.log("state", state, "\n");

  if (!musicLibraryPath) {
    const warning =
      "No music library path specified. Go to settings and add it to start scanning.\n";
    console.log(warning);

    return;
  }

  const totalStart = Date.now();

  logOpStart("Traversing file system");
  let start = Date.now();
  files = await traverseFileSystem(musicLibraryPath);
  logOpReport(start, files, "files");

  logOpStart("Creating media collection");
  start = Date.now();
  const { artistsCol, albumsCol, audioCol, imagesCol } = createMediaCollection({
    files,
    baseUrl: musicLibraryPath,
    isElectron: true,
  });
  artistCollection = artistsCol;
  albumCollection = albumsCol;
  audioCollection = audioCol;
  imageCollection = imagesCol;

  artistObject = Object.entries(artistCollection)
    .map(([id, { name, url }]) => ({ id, name, url }))
    .reduce((acc: ArtistObject, artist) => {
      const { name } = artist;
      const label = name.charAt(0);

      return {
        ...acc,
        [label]: [...(acc[label] || []), artist],
      };
    }, {});

  console.log(`Took: ${(Date.now() - start) / 1000} seconds`);
  console.log(`Found: ${Object.keys(artistCollection).length} artists`);
  console.log(`Found: ${Object.keys(albumCollection).length} albums`);
  console.log(`Found: ${Object.keys(audioCollection).length} songs`);
  console.log(`Found: ${Object.keys(imageCollection).length} images`);
  console.log("----------------------\n");

  logOpStart("Startup Report");
  console.log(`Took: ${(Date.now() - totalStart) / 1000} seconds total`);
  console.log("----------------------\n");

  initDb(musicLibraryPath);

  createApi({
    artistObject,
    artistCollection,
    albumCollection,
    audioCollection,
    files,
  });

  event.sender.send("musa:ready");
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
    height: 1000,
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
