// Modules to control application life and create native browser window
"use strict";

const path = require("path");
const { app, BrowserWindow, Menu, protocol } = require("electron");
const { traverseFileSystem } = require("./fs");
const { createMediaCollection } = require("./media-separator");
const { createApi } = require("./api");

const { MUSA_SRC_PATH } = process.env;

const logOpStart = (title) => {
  console.log(title);
  console.log("----------------------");
};

const logOpReport = (start, collection, name) => {
  console.log(`Took: ${(Date.now() - start) / 1000} seconds`);
  console.log(`Found: ${collection.length} ${name}`);
  console.log("----------------------\n");
};

let files;
let artistCollection;
let albumCollection;
let audioCollection;
let imageCollection;
let artistObject;

const main = async () => {
  const totalStart = Date.now();

  logOpStart("Traversing file system");
  let start = Date.now();
  files = await traverseFileSystem(MUSA_SRC_PATH);
  logOpReport(start, files, "files");

  logOpStart("Creating media collection");
  start = Date.now();
  const { artistsCol, albumsCol, audioCol, imagesCol } = createMediaCollection(
    files,
    MUSA_SRC_PATH,
    true
  );
  artistCollection = artistsCol;
  albumCollection = albumsCol;
  audioCollection = audioCol;
  imageCollection = imagesCol;

  artistObject = Object.entries(artistCollection)
    .map(([id, { name, url }]) => ({ id, name, url }))
    .reduce((acc, artist) => {
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

  createApi({
    artistObject,
    artistCollection,
    albumCollection,
    audioCollection,
    files,
  });
};

main();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
  const { screen } = require("electron");
  const allDisplays = screen.getAllDisplays();
  let biggestDisplay = allDisplays[0];
  if (process.env.IS_DEV && allDisplays.length > 1) {
    allDisplays.forEach(
      (display) =>
        (biggestDisplay = display.size.width > biggestDisplay.size.width ? display : biggestDisplay)
    );
  }
  const getWebPreferencesByEnv = () => {
    return process.env.IS_DEV
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
    webPreferences: {
      backgroundColor: "#21252b",
      ...getWebPreferencesByEnv(),
    },
  });

  const getURL = () => {
    return process.env.IS_DEV
      ? "http://localhost:3666"
      : `file://${path.join(__dirname, "../build/index.html")}`;
  };
  // and load the index.html of the app.
  mainWindow.loadURL(getURL());

  if (process.env.IS_DEV) {
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

  // Create the Application's main menu
  var template = [
    {
      label: "App",
      submenu: [
        {
          label: "About Application",
          selector: "orderFrontStandardAboutPanel:",
        },
        { type: "separator" },
        {
          label: "Refresh",
          accelerator: "CmdOrCtrl+R",
          click() {
            mainWindow.reload();
          },
        },
        {
          label: "Toggle Developer Tools",
          accelerator: process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: function (item, focusedWindow) {
            if (focusedWindow) focusedWindow.toggleDevTools();
          },
        },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: function () {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        {
          label: "Redo",
          accelerator: "Shift+CmdOrCtrl+Z",
          selector: "redo:",
        },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          selector: "selectAll:",
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});
