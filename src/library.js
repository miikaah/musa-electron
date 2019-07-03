const chokidar = require("chokidar")
const hash = require("object-hash")
const {
  negate,
  isEmpty,
  pick,
  isUndefined,
  differenceBy,
  startsWith,
  flatten
} = require("lodash")
const { isWatchableFile, isHiddenFile } = require("./util")
const {
  INIT,
  UPDATE_LIBRARY_LISTINGS,
  DELETE_LIBRARY_LISTINGS
} = require("./scanner")
const { requireTaskPool } = require("electron-remote")
const fs = require("fs")
const { join, sep } = require("path")

const Scanner = requireTaskPool(require.resolve("./scanner.js"))

const WATCHER_TIMEOUT = 3000

let mainWindow
const logToRenderer = payload => {
  if (process.env.IS_DEV) mainWindow.webContents.send("log", payload)
}
const errorToRenderer = payload => {
  if (process.env.IS_DEV) mainWindow.webContents.send("error", payload)
}

function init(_window) {
  mainWindow = _window
}

let watcher
function initLibrary(
  event,
  songList = [],
  musicLibraryPaths = [],
  deletedLibraryPath
) {
  if (musicLibraryPaths.length < 1) {
    logToRenderer(
      "Music library path array is empty so library can't be initialized."
    )
    return
  }

  const isInitialScan = isEmpty(songList)
  logToRenderer("isInitialScan: " + isInitialScan)

  if (isInitialScan) runInitialScan(event)

  const dirtySongList = []
  const dirtySongSet = new Set()
  const frontendSongMap = new Map(songList)
  const localSongList = []
  let isInitialized = false

  if (watcher) watcher.close()
  watcher = chokidar.watch(musicLibraryPaths, {
    ignored: /^\./
  })

  // Initial check completed, now handle the songs
  // that have changed while the program has not been running
  watcher.on("ready", () => {
    isInitialized = true
    // s[0] is the file path
    const addedSongList = differenceBy(localSongList, songList, s => s[0])
    const removedSongList = differenceBy(songList, localSongList, s => s[0])
    const removedSongSet = new Set(removedSongList.map(s => s[0]))

    if (!isInitialScan) {
      updateLibrary(
        event,
        [
          ...addedSongList,
          ...Array.from(dirtySongSet.values()).map(path => [path])
        ],
        removedSongList,
        musicLibraryPaths,
        deletedLibraryPath
      )
    }

    event.sender.send(
      "updateSongList",
      [
        ...songList.filter(song => !dirtySongSet.has(song[0])),
        ...dirtySongList,
        ...addedSongList
      ]
        .filter(song => !removedSongSet.has(song[0]))
        .sort((a, b) => a[0].localeCompare(b[0]))
    )
  })

  // WATCHERS

  let addedSongs = []
  watcher.on("add", (path, stats) => {
    if (!isWatchableFile(path)) return
    const statsHash = getStatsHash(stats)
    localSongList.push([path, statsHash])

    // Initial dirty checking
    if (!isInitialized) {
      const frontendHash = frontendSongMap.get(path)
      if (statsHash !== frontendHash && !isUndefined(frontendHash)) {
        dirtySongList.push([path, statsHash])
        dirtySongSet.add(path)
        return
      }
    } else {
      // Add listener
      addedSongs.push([path, statsHash])
      if (addedSongs.length <= 1) {
        setTimeout(() => {
          updateLibrary(event, addedSongs, [], musicLibraryPaths)
          event.sender.send(
            "updateSongList",
            [
              ...songList.filter(
                song => !addedSongs.map(s => s[0]).includes(song[0])
              ),
              ...addedSongs
            ].sort((a, b) => a[0].localeCompare(b[0]))
          )
          addedSongs = []
        }, WATCHER_TIMEOUT)
      }
    }
  })

  // Update listener
  let updatedSongs = []
  watcher.on("change", (path, stats) => {
    if (!isInitialized || !isWatchableFile(path)) return
    updatedSongs.push([path, getStatsHash(stats)])
    if (updatedSongs.length <= 1) {
      setTimeout(() => {
        updateLibrary(event, updatedSongs, [], musicLibraryPaths)
        event.sender.send(
          "updateSongList",
          [
            ...songList.filter(
              song => !updatedSongs.map(s => s[0]).includes(song[0])
            ),
            ...updatedSongs
          ].sort((a, b) => a[0].localeCompare(b[0]))
        )
        updatedSongs = []
      }, WATCHER_TIMEOUT)
    }
  })

  // Delete listener
  let removedSongs = []
  watcher.on("unlink", path => {
    if (!isInitialized || !isWatchableFile(path)) return
    removedSongs.push([path])
    if (removedSongs.length <= 1) {
      setTimeout(() => {
        updateLibrary(event, [], removedSongs, musicLibraryPaths)
        event.sender.send(
          "updateSongList",
          songList
            .filter(song => !removedSongs.map(s => s[0]).includes(song[0]))
            .sort((a, b) => a[0].localeCompare(b[0]))
        )
        removedSongs = []
      }, WATCHER_TIMEOUT)
    }
  })
}

async function runInitialScan(event, musicLibraryPaths) {
  if (musicLibraryPaths.length < 1) {
    logToRenderer(
      "Music library path array is empty so initial scan can't be run."
    )
    return
  }

  const msg = INIT
  const allFiles = await Promise.all(musicLibraryPaths.map(getArtistFolders))
  const allFilesLength = allFiles.reduce((sum, files) => sum + files.length, 0)

  let counter = 0
  event.sender.send("startInitialScan", allFilesLength)
  await Promise.all(
    musicLibraryPaths.map(async (path, i) => {
      await Promise.all(
        allFiles[i].map(async file => {
          try {
            // For debugging
            // require("child_process").fork("./src/scanner.js").send({ msg, payload: file.name });
            const listing = await Scanner.create({
              msg,
              payload: { path, folderName: file.name }
            })
            counter++
            event.sender.send("updateInitialScan", counter)
            event.sender.send("libraryListing", listing)
          } catch (e) {
            console.error(e)
            errorToRenderer(e.message)
          }
        })
      )
    })
  )
  event.sender.send("endInitialScan")
}

async function getArtistFolders(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, { withFileTypes: true }, (err, files) => {
      if (err) reject(err)
      resolve(files.filter(negate(isHiddenFile)))
    })
  })
}

function updateLibrary(
  event,
  updatedSongList = [],
  removedSongList = [],
  musicLibraryPaths,
  deletedLibraryPath
) {
  const hasUpdatedSongs = !isEmpty(updatedSongList)
  const hasDeletedSongs = !isEmpty(removedSongList)
  if (!hasUpdatedSongs && !hasDeletedSongs) return

  // TODO: cross-platform this and make it better
  const paths = [...updatedSongList, ...removedSongList].map(p => p[0])

  const pathsByLibrary = getArtistFolderNamesByLibrary(paths, musicLibraryPaths)

  // A complete library has been removed in UI
  if (isEmpty(pathsByLibrary) && !isEmpty(deletedLibraryPath)) {
    const artistPaths = getArtistPaths(paths, deletedLibraryPath)
    artistPaths.forEach(path =>
      event.sender.send("deleteLibraryListings", path)
    )
    return
  }

  if (hasUpdatedSongs || hasDeletedSongs) {
    pathsByLibrary.forEach(obj => {
      const payload = { libraryPath: obj.libraryPath, paths: obj.paths }
      runInBackgroud(event, "libraryListing", UPDATE_LIBRARY_LISTINGS, payload)
    })
  }
  // Deletes complete artist folders if necessary
  if (hasDeletedSongs) {
    pathsByLibrary.forEach(obj => {
      const payload = { libraryPath: obj.libraryPath, paths: obj.paths }
      runInBackgroud(
        event,
        "deleteLibraryListings",
        DELETE_LIBRARY_LISTINGS,
        payload
      )
    })
  }
}

function getArtistPaths(paths, libraryPath) {
  const libPath = join(libraryPath, sep)
  return Array.from(
    new Set(
      paths
        .filter(p => startsWith(p, libraryPath))
        .map(p => join(libPath, p.split(libPath)[1].split(sep)[0]))
    )
  )
}

function getArtistFolderNamesByLibrary(paths, musicLibraryPaths) {
  const pathsByLibrary = musicLibraryPaths
    .map(p => join(p, sep))
    .map(libraryPath => ({
      libraryPath,
      paths: paths
        .filter(p => startsWith(p, libraryPath))
        .map(p => p.split(libraryPath)[1].split(sep)[0])
    }))
    .filter(obj => !isEmpty(obj.paths))
  return flatten(pathsByLibrary)
}

function runInBackgroud(event, eventName, msg, payload) {
  // For debugging
  // if (process.env.IS_DEV) {
  //   require("child_process").fork("./src/scanner.js").send({ msg, payload });
  //   return;
  // }
  runInHiddenBrowserWindow(event, eventName, msg, payload)
}

async function runInHiddenBrowserWindow(event, eventName, msg, payload) {
  try {
    const results = await Scanner.create({ msg, payload })

    if (!Array.isArray(results)) {
      console.error("Scanner returned incorrect data ", results)
      errorToRenderer(
        "Scanner returned incorrect data " + JSON.stringify(results)
      )
      return
    }

    logToRenderer("Scanner result length: " + results.length)
    results.forEach(result => event.sender.send(eventName, result))
  } catch (e) {
    console.error(e)
    errorToRenderer(e)
  }
}

function getStatsHash(stats) {
  return hash(pick(stats, ["mtime", "ctime", "birthtime"]))
}

module.exports = {
  init,
  initLibrary,
  runInitialScan
}
