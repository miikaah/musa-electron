// Modules to control application life and create native browser window
"use strict";

const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const { init, initLibrary, runInitialScan } = require("./library");
const { isUndefined } = require("lodash");
const { getUrl } = require("./util");
const {
  fetchTokens,
  play,
  pause,
  search,
  getAlbumsTracks
} = require("./spotify");
const promiseIpc = require("electron-promise-ipc");

const SPOTIFY_SCOPES =
  "" +
  "user-modify-playback-state " +
  "user-read-playback-state " +
  "user-read-currently-playing " +
  "user-top-read " +
  "user-read-recently-played " +
  // + 'user-library-modify '
  "user-library-read " +
  // + 'user-follow-modify '
  // + 'user-follow-read '
  "playlist-read-private " +
  // + 'playlist-modify-public '
  // + 'playlist-modify-private '
  "playlist-read-collaborative " +
  "user-read-private";
const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
const SPOTIFY_AUTHORIZE_URL = `https://accounts.spotify.com/authorize?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${getUrl()}&scope=${SPOTIFY_SCOPES}`;
const hasSpotifyCredentials =
  !isUndefined(SPOTIFY_CLIENT_ID) && !isUndefined(SPOTIFY_CLIENT_SECRET);

let mainWindow;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.

function createWindow() {
  const { screen } = require("electron");
  const allDisplays = screen.getAllDisplays();
  let biggestDisplay = allDisplays[0];
  if (process.env.IS_DEV && allDisplays.length > 1) {
    allDisplays.forEach(
      display =>
        (biggestDisplay =
          display.size.width > biggestDisplay.size.width
            ? display
            : biggestDisplay)
    );
  }
  const getWebPreferencesByEnv = () => {
    return process.env.IS_DEV
      ? {
          nodeIntegration: true,
          webSecurity: false
        }
      : {
          nodeIntegration: true,
          webSecurity: true
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
      ...getWebPreferencesByEnv()
    }
  });
  // and load the index.html of the app.
  mainWindow.loadURL(hasSpotifyCredentials ? SPOTIFY_AUTHORIZE_URL : getUrl());

  if (process.env.IS_DEV) mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on("closed", function() {
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
          selector: "orderFrontStandardAboutPanel:"
        },
        { type: "separator" },
        {
          label: "Refresh",
          accelerator: "CmdOrCtrl+R",
          click() {
            mainWindow.reload();
          }
        },
        {
          label: "Toggle Developer Tools",
          accelerator:
            process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: function(item, focusedWindow) {
            if (focusedWindow) focusedWindow.toggleDevTools();
          }
        },
        {
          label: "Quit",
          accelerator: "Command+Q",
          click: function() {
            app.quit();
          }
        }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        {
          label: "Select All",
          accelerator: "CmdOrCtrl+A",
          selector: "selectAll:"
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  init(mainWindow);
}

// Enables overlay scrollbar in Windows
app.commandLine.appendSwitch("--enable-features", "OverlayScrollbar");

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

// IPC for library actions

ipcMain.on("initLibrary", initLibrary);
ipcMain.on("runInitialScan", runInitialScan);

ipcMain.on("addMusicLibraryPath", (event, songList, libPaths = []) => {
  dialog.showOpenDialog({ properties: ["openDirectory"] }, paths => {
    if (isUndefined(paths)) return;
    const newPath = paths[0];
    event.sender.send("addMusicLibraryPath", newPath);
    initLibrary(event, songList, [...libPaths, newPath]);
  });
});

ipcMain.on("removeMusicLibraryPath", (event, songList, paths, deletedPath) => {
  initLibrary(event, songList, paths, deletedPath);
});

// IPC for Spotify

ipcMain.on("SpotifyFetchTokens", fetchTokens);

promiseIpc.on("SpotifyPlay", play);
promiseIpc.on("SpotifyPause", pause);
promiseIpc.on("SpotifySearch", search);
promiseIpc.on("SpotifyGetAlbumsTracks", getAlbumsTracks);
