// Modules to control application life and create native browser window
"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { negate, startsWith, isEmpty } = require("lodash");
const dataUrl = require("dataurl");
const { getSongMetadata } = require("./metadata");
const { isFileTypeSupported } = require("./util");
const Bottleneck = require("bottleneck");
const Datastore = require("nedb");

const LIBRARY_PATH = "/Users/miika.henttonen/Documents/musat";
const DB_FILENAME = "musa_db";

const db = new Datastore({
  filename: LIBRARY_PATH + "/" + DB_FILENAME,
  autoload: true
});

const bottleneck = new Bottleneck({ maxConcurrent: 12 });

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
  const { screen } = require("electron");
  const allDisplays = screen.getAllDisplays();
  let biggestDisplay = allDisplays[0];
  if (allDisplays.length > 1) {
    allDisplays.forEach(
      display =>
        (biggestDisplay =
          display.size.width > biggestDisplay.size.width
            ? display
            : biggestDisplay)
    );
  }
  // Create the browser window.
  mainWindow = new BrowserWindow({
    x: biggestDisplay.bounds.x + biggestDisplay.size.width * 0.125,
    y: biggestDisplay.bounds.y,
    width: biggestDisplay.size.width,
    height: 1000,
    webPreferences: {
      nodeIntegration: true
    }
  });

  // and load the index.html of the app.
  mainWindow.loadURL(
    process.env.IS_DEV
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "/build/index.html")}`
  );

  if (process.env.IS_DEV) mainWindow.webContents.openDevTools();

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on("closed", function() {
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

// Quit when all windows are closed.
app.on("window-all-closed", function() {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function() {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.on("getLibraryListing", event => {
  fs.readdir(LIBRARY_PATH, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return [];
    }
    const result = files.filter(negate(isHiddenFile));
    buildLibraryListing(LIBRARY_PATH, result, event);
  });
});

const isHiddenFile = file => startsWith(file.name, ".");

function buildLibraryListing(path, files, event) {
  if (files.length < 1) return [];
  files.splice(0, 1).forEach(async file => {
    // const doc = await dbFindOne(file);
    // if (doc) {
    //   event.sender.send("libraryListing", doc);
    //   return;
    // }
    const listing = await bottleneck.schedule(() =>
      getDirStructureForSubDir(file, path)
    );
    if (listing) {
      db.insert(listing);
      event.sender.send("libraryListing", listing);
    }
  });
}

// async function dbFindOne(file) {
//   return new Promise((resolve, reject) => {
//     db.findOne({ name: file.name }, (err, doc) => {
//       if (err) return reject(err);
//       resolve(doc);
//     });
//   });
// }

async function getDirStructureForSubDir(f, path) {
  const childPath = `${path}/${f.name}`;
  const fileOrFolder = { name: f.name, path: childPath };

  if (f.isDirectory()) {
    const files = fs.readdirSync(childPath, { withFileTypes: true });
    const children = await Promise.all(
      files.filter(negate(isHiddenFile)).map(file => {
        return getDirStructureForSubDir(file, childPath, fileOrFolder);
      })
    );
    fileOrFolder.children = children.filter(negate(isEmpty));
  } else {
    if (!isFileTypeSupported(childPath)) return;
    fileOrFolder.metadata = await getSongMetadata(childPath);
  }
  return fileOrFolder;
}

ipcMain.on("getSongAsDataUrl", (event, path = "") => {
  if (path.length < 1) return;
  fs.readFile(path, (err, data) => {
    if (err) {
      console.error(err);
      return "";
    }
    event.sender.send(
      "songAsDataUrl",
      dataUrl.convert({ data, mimetype: "audio/mp3" })
    );
  });
});
