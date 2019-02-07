// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { negate, startsWith } = require('lodash')
const dataUrl = require('dataurl')

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

function createWindow () {
  const { screen } = require('electron')
  const allDisplays = screen.getAllDisplays()
  let biggestDisplay = allDisplays[0]
  if (allDisplays.length > 1) {
    allDisplays
      .forEach(display =>
        biggestDisplay = display.size.width > biggestDisplay.size.width
          ? display
          : biggestDisplay
      )
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
  })

  // and load the index.html of the app.
  mainWindow.loadURL(process.env.IS_DEV
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`
  )

  mainWindow.webContents.openDevTools()

  // Open the DevTools.
  // mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

ipcMain.on('getLibraryListing', (event) => {
  const path = '/Users/miika.henttonen/Documents/musat'
  fs.readdir(path, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err)
      return []
    }
    const result = files.filter(negate(isHiddenFile))
    const listing = buildLibraryListing(path, result)
    event.sender.send('libraryListing', listing)
  })
})

const isHiddenFile = f => startsWith(f.name, '.')

function buildLibraryListing(path, files) {
  if (files.length < 1) return []
  const listing = []
  files.forEach(f => doFolderRecursion(f, listing, path))
  return listing
}

function doFolderRecursion(f, listing, path) {
  const childPath = `${path}/${f.name}`
  const fileOrFolder = { name: f.name, path: childPath }
  if (f.isDirectory()) {
    const files = fs.readdirSync(childPath, { withFileTypes: true })
    fileOrFolder.children = buildLibraryListing(
      childPath,
      files.filter(negate(isHiddenFile))
    )
  }
  listing.push(fileOrFolder)
}

ipcMain.on('getSongAsDataUrl', (event, path = '') => {
  if (path.length < 1) return
  fs.readFile(path, (err, data) => {
    if (err) {
      console.error(err)
      return ''
    }
    event.sender.send('songAsDataUrl', dataUrl.convert( { data, mimetype: 'audio/mp3' }))
  })
})
