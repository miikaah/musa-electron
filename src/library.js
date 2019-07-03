const chokidar = require("chokidar");
const hash = require("object-hash");
const { negate, isEmpty, pick, isUndefined, differenceBy } = require("lodash");
const { isWatchableFile, getArtistPath, isHiddenFile } = require("./util");
const {
  INIT,
  UPDATE_SONGS,
  UPDATE_LIBRARY_LISTINGS,
  DELETE_LIBRARY_LISTINGS
} = require("./scanner");
const { requireTaskPool } = require("electron-remote");
const fs = require("fs");

const Scanner = requireTaskPool(require.resolve("./scanner.js"));

const WATCHER_TIMEOUT = 3000;

let mainWindow;
const logToRenderer = payload => {
  if (process.env.IS_DEV) mainWindow.webContents.send("log", payload);
};
const errorToRenderer = payload => {
  if (process.env.IS_DEV) mainWindow.webContents.send("error", payload);
};

function init(_window) {
  mainWindow = _window;
}

let watcher;
function initLibrary(event, songList = [], musicLibraryPaths = []) {
  console.log("musicLibraryPaths", musicLibraryPaths);
  if (musicLibraryPaths.length < 1) {
    logToRenderer(
      "Music library path array is empty so library can't be initialized."
    );
    return;
  }

  const isInitialScan = isEmpty(songList);
  logToRenderer("isInitialScan: " + isInitialScan);

  if (isInitialScan) runInitialScan(event);

  const dirtySongList = [];
  const dirtySongSet = new Set();
  const frontendSongMap = new Map(songList);
  const localSongList = [];
  let isInitialized = false;

  if (watcher) watcher.close();
  watcher = chokidar.watch(musicLibraryPaths, {
    ignored: /^\./
  });

  // Initial check completed, now do
  watcher.on("ready", () => {
    isInitialized = true;
    // s[0] is the file path
    const addedSongList = differenceBy(localSongList, songList, s => s[0]);
    const removedSongList = differenceBy(songList, localSongList, s => s[0]);
    const removedSongSet = new Set(removedSongList.map(s => s[0]));

    if (!isInitialScan) {
      updateDirtySongs(event, Array.from(dirtySongSet.values()));
      updateLibrary(event, addedSongList, removedSongList, musicLibraryPaths);
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
    );
  });

  // WATCHERS

  let addedSongs = [];
  watcher.on("add", (path, stats) => {
    if (!isWatchableFile(path)) return;
    const statsHash = getStatsHash(stats);
    localSongList.push([path, statsHash]);

    // Initial dirty checking
    if (!isInitialized) {
      const frontendHash = frontendSongMap.get(path);
      if (statsHash !== frontendHash && !isUndefined(frontendHash)) {
        dirtySongList.push([path, statsHash]);
        dirtySongSet.add(path);
        return;
      }
    } else {
      // Add listener
      addedSongs.push([path, statsHash]);
      if (addedSongs.length <= 1) {
        setTimeout(() => {
          updateLibrary(event, addedSongs, [], musicLibraryPaths);
          event.sender.send(
            "updateSongList",
            [
              ...songList.filter(
                song => !addedSongs.map(s => s[0]).includes(song[0])
              ),
              ...addedSongs
            ].sort((a, b) => a[0].localeCompare(b[0]))
          );
          addedSongs = [];
        }, WATCHER_TIMEOUT);
      }
    }
  });

  // Update listener
  let updatedSongs = [];
  watcher.on("change", (path, stats) => {
    if (!isInitialized || !isWatchableFile(path)) return;
    updatedSongs.push([path, getStatsHash(stats)]);
    if (updatedSongs.length <= 1) {
      setTimeout(() => {
        updateLibrary(event, updatedSongs, [], musicLibraryPaths);
        event.sender.send(
          "updateSongList",
          [
            ...songList.filter(
              song => !updatedSongs.map(s => s[0]).includes(song[0])
            ),
            ...updatedSongs
          ].sort((a, b) => a[0].localeCompare(b[0]))
        );
        updatedSongs = [];
      }, WATCHER_TIMEOUT);
    }
  });

  // Delete listener
  let removedSongs = [];
  watcher.on("unlink", path => {
    if (!isInitialized || !isWatchableFile(path)) return;
    removedSongs.push([path]);
    if (removedSongs.length <= 1) {
      setTimeout(() => {
        updateLibrary(event, [], removedSongs, musicLibraryPaths);
        event.sender.send(
          "updateSongList",
          songList
            .filter(song => !removedSongs.map(s => s[0]).includes(song[0]))
            .sort((a, b) => a[0].localeCompare(b[0]))
        );
        removedSongs = [];
      }, WATCHER_TIMEOUT);
    }
  });
}

async function runInitialScan(event, musicLibraryPaths) {
  if (musicLibraryPaths.length < 1) {
    logToRenderer(
      "Music library path array is empty so initial scan can't be run."
    );
    return;
  }

  const msg = INIT;
  const allFiles = await Promise.all(musicLibraryPaths.map(getArtistFolders));
  const allFilesLength = allFiles.reduce((sum, files) => sum + files.length, 0);

  let counter = 0;
  event.sender.send("startInitialScan", allFilesLength);
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
            });
            counter++;
            event.sender.send("updateInitialScan", counter);
            event.sender.send("libraryListing", listing);
          } catch (e) {
            console.error(e);
            errorToRenderer(e.message);
          }
        })
      );
    })
  );
  event.sender.send("endInitialScan");
}

async function getArtistFolders(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, { withFileTypes: true }, (err, files) => {
      if (err) reject(err);
      resolve(files.filter(negate(isHiddenFile)));
    });
  });
}

function updateDirtySongs(event, dirtySongPaths) {
  if (isEmpty(dirtySongPaths)) return;
  runInBackgroud(event, "updateSongMetadata", UPDATE_SONGS, dirtySongPaths);
}

function updateLibrary(
  event,
  updatedSongList = [],
  removedSongList = [],
  musicLibraryPaths
) {
  const hasUpdatedSongs = !isEmpty(updatedSongList);
  const hasDeletedSongs = !isEmpty(removedSongList);
  if (!hasUpdatedSongs && !hasDeletedSongs) return;

  // TODO: cross-platform this and make it better
  const paths = [
    ...updatedSongList
      .map(s =>
        getArtistPath(s[0], musicLibraryPaths.find(path => path.includes(s[0])))
      )
      .map(p => p.split("/").pop()),
    ...removedSongList
      .map(s =>
        getArtistPath(s[0], musicLibraryPaths.find(path => path.includes(s[0])))
      )
      .map(p => p.split("/").pop())
  ];

  if (hasUpdatedSongs || hasDeletedSongs)
    runInBackgroud(event, "libraryListing", UPDATE_LIBRARY_LISTINGS, paths);
  // Deletes complete artist folders if necessary
  if (hasDeletedSongs)
    runInBackgroud(
      event,
      "deleteLibraryListings",
      DELETE_LIBRARY_LISTINGS,
      paths
    );
}

function runInBackgroud(event, eventName, msg, payload) {
  // For debugging
  // if (process.env.IS_DEV) {
  //   require("child_process").fork("./src/scanner.js").send({ msg, payload });
  //   return;
  // }
  runInHiddenBrowserWindow(event, eventName, msg, payload);
}

async function runInHiddenBrowserWindow(event, eventName, msg, payload) {
  try {
    const results = await Scanner.create({ msg, payload });
    if (!Array.isArray(results)) return;
    logToRenderer("Scanner result length: " + results.length);
    results.forEach(result => event.sender.send(eventName, result));
  } catch (e) {
    console.error(e);
    errorToRenderer(e);
  }
}

function getStatsHash(stats) {
  return hash(pick(stats, ["mtime", "ctime", "birthtime"]));
}

module.exports = {
  init,
  initLibrary,
  runInitialScan
};
