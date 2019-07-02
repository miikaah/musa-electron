// Modules to control application life and create native browser window
"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const { init, initLibrary, runInitialScan } = require("./library");

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
  const getWebPreferences = () => {
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
    webPreferences: getWebPreferences()
  });

  const getURL = () => {
    return process.env.IS_DEV
      ? "http://localhost:3000"
      : `file://${path.join(__dirname, "../build/index.html")}`;
  };
  // and load the index.html of the app.
  mainWindow.loadURL(getURL());

  if (process.env.IS_DEV) mainWindow.webContents.openDevTools();

  // Emitted when the window is closed.
  mainWindow.on("closed", function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });

  const getDevEnvAccelerators = () => {
    if (!process.env.IS_DEV) return [];
    return [
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
      }
    ];
  };

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
        ...getDevEnvAccelerators(),
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

ipcMain.on("initLibrary", initLibrary);
ipcMain.on("runInitialScan", runInitialScan);
