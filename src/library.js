const chokidar = require("chokidar");
const hash = require("object-hash");
const {
  negate,
  isEmpty,
  pick,
  isUndefined,
  differenceBy,
  defaultTo,
  uniq,
} = require("lodash");
const fs = require("fs");
const { join, sep } = require("path");
const { isWatchableFile, isHiddenFile } = require("./util");
const { INIT, UPDATE_LIBRARY_LISTINGS } = require("./scanner/scanner");
const { createThread } = require("./thread/thread");

const WATCHER_TIMEOUT = 3000;

let mainWindow;
const logToRenderer = (payload) => {
  mainWindow.webContents.send("log", payload);
};
const errorToRenderer = (payload) => {
  mainWindow.webContents.send("error", payload);
};

function init(_window) {
  mainWindow = _window;
}

let watcher;
function initLibrary(
  event,
  songList = [],
  musicLibraryPaths = [],
  deletedLibraryPath
) {
  if (musicLibraryPaths.length < 1 && isEmpty(deletedLibraryPath)) {
    logToRenderer(
      "Music library path array is empty so library can't be initialized."
    );
    return;
  }

  const isInitialScan = isEmpty(songList);
  logToRenderer("isInitialScan: " + isInitialScan);

  if (isInitialScan) runInitialScan(event, musicLibraryPaths);

  const dirtySongList = [];
  const dirtySongSet = new Set();
  const frontendSongMap = new Map(songList);
  const localSongList = [];
  let isInitialized = false;

  if (watcher) watcher.close();
  watcher = chokidar.watch(musicLibraryPaths, {
    ignored: /^\./,
  });

  const updateAfterReady = () => {
    isInitialized = true;
    // s[0] is the file path
    const addedSongList = differenceBy(localSongList, songList, (s) => s[0]);
    const removedSongList = differenceBy(songList, localSongList, (s) => s[0]);
    const removedSongSet = new Set(removedSongList.map((s) => s[0]));

    if (!isInitialScan) {
      updateLibrary(
        event,
        [
          ...addedSongList,
          ...Array.from(dirtySongSet.values()).map((path) => [path]),
        ],
        removedSongList,
        musicLibraryPaths,
        deletedLibraryPath
      );
    }

    event.sender.send(
      "updateSongList",
      [
        ...defaultTo(songList, []).filter((song) => !dirtySongSet.has(song[0])),
        ...dirtySongList,
        ...addedSongList,
      ]
        .filter((song) => !removedSongSet.has(song[0]))
        .sort((a, b) => a[0].localeCompare(b[0]))
    );
  };

  // Updates library when last library folder is removed in UI,
  // because "ready" event is NOT fired by chokidar if it's
  // given an empty array to watch
  if (isEmpty(musicLibraryPaths)) updateAfterReady();

  // Initial check completed, now handle the songs
  // that have changed while the program has not been running
  watcher.on("ready", updateAfterReady);

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
              ...defaultTo(songList, []).filter(
                (song) => !addedSongs.map((s) => s[0]).includes(song[0])
              ),
              ...addedSongs,
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
            ...defaultTo(songList, []).filter(
              (song) => !updatedSongs.map((s) => s[0]).includes(song[0])
            ),
            ...updatedSongs,
          ].sort((a, b) => a[0].localeCompare(b[0]))
        );
        updatedSongs = [];
      }, WATCHER_TIMEOUT);
    }
  });

  // Delete listener
  let removedSongs = [];
  watcher.on("unlink", (path) => {
    if (!isInitialized || !isWatchableFile(path)) return;
    removedSongs.push([path]);
    if (removedSongs.length <= 1) {
      setTimeout(() => {
        updateLibrary(event, [], removedSongs, musicLibraryPaths);
        event.sender.send(
          "updateSongList",
          songList
            .filter((song) => !removedSongs.map((s) => s[0]).includes(song[0]))
            .sort((a, b) => a[0].localeCompare(b[0]))
        );
        removedSongs = [];
      }, WATCHER_TIMEOUT);
    }
  });
}

async function runInitialScan(event, musicLibraryPaths = []) {
  console.log("Initial scan: ", musicLibraryPaths);
  if (musicLibraryPaths.length < 1) {
    logToRenderer(
      "Music library path array is empty so initial scan can't be run."
    );
    return;
  }

  const msg = INIT;
  const allFiles = await Promise.all(musicLibraryPaths.map(getArtistFolders));
  const allFilesLength = allFiles.reduce((sum, files) => sum + files.length, 0);
  console.log("Folders and files:", allFilesLength);

  let counter = 0;
  event.sender.send("startInitialScan", allFilesLength);
  await Promise.all(
    musicLibraryPaths.map(async (path, i) => {
      await Promise.all(
        allFiles[i].map(async (file) => {
          try {
            const listing = await createThread({
              msg,
              payload: { path: join(path, file.name), folderName: file.name },
            });
            counter++;
            event.sender.send("libraryListing", listing);
            event.sender.send("updateInitialScan", counter);
          } catch (e) {
            console.error("(Scan Error)", e);
            errorToRenderer(e.message);
          }
        })
      );
    })
  );
  console.log("endInitialScan:", allFilesLength);
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

async function updateLibrary(
  event,
  updatedSongList = [],
  removedSongList = [],
  musicLibraryPaths,
  deletedLibraryPath
) {
  const hasUpdatedSongs = !isEmpty(updatedSongList);
  const hasDeletedSongs = !isEmpty(removedSongList);
  if (!hasUpdatedSongs && !hasDeletedSongs) return;

  const paths = uniq([...updatedSongList, ...removedSongList].map((p) => p[0]));

  // A complete library has been removed in UI
  if (!isEmpty(deletedLibraryPath)) {
    const artistPaths = getUniqArtistPaths(paths, [deletedLibraryPath]);
    artistPaths.forEach((path) =>
      event.sender.send("deleteLibraryListing", path)
    );
    return;
  }

  // The following block updates and deletes library listings.
  // Because WINDOWS handles files differently, it's done like so:
  //
  // *  Updates & deletions to files inside ROOT folders
  //    is done as a simple update. The whole ROOT folder is always scanned
  //    so changes are easy to detect.
  //.
  // *  Runtime deletion is detected as Scanner returning
  //    an empty result.albums Array [].
  //    Deletion message is dispatched to frontend.
  //    WINDOWS (for some reason) doesn't delete the ROOT folder
  //    if the executable is running.
  //
  // *  Deletion of a ROOT folder when the executable is not running
  //    is detected by the Scanner returning an ENOENT code in an Error.
  //    As scanning is based on ROOT folders this is assumed to mean
  //    that a ROOT folder has been deleted and a deletion message
  //    is dispatched to the frontend.
  //

  const artistPaths = getUniqArtistPaths(paths, musicLibraryPaths);

  await Promise.all(
    artistPaths.map((path) => {
      const libraryPath = getLibraryPathFromPath(path, musicLibraryPaths);
      return runInBackgroud(event, "libraryListing", UPDATE_LIBRARY_LISTINGS, {
        path,
        folderName: path.replace(libraryPath, "").split(sep)[1],
      });
    })
  );
}

function getUniqArtistPaths(paths, musicLibraryPaths) {
  return Array.from(
    new Set(
      paths.map((path) => {
        const libraryPath = getLibraryPathFromPath(path, musicLibraryPaths);
        return join(libraryPath, path.replace(libraryPath, "").split(sep)[1]);
      })
    )
  );
}

function getLibraryPathFromPath(path, musicLibraryPaths) {
  return musicLibraryPaths.find((p) => path.includes(join(p, sep)));
}

async function runInBackgroud(event, eventName, msg, payload) {
  return runInHiddenBrowserWindow(event, eventName, msg, payload);
}

async function runInHiddenBrowserWindow(event, eventName, msg, payload) {
  return new Promise(async (resolve, reject) => {
    try {
      const result = await createThread({ msg, payload });

      if (isNonExistantArtist(result) || isRuntimeArtistDeletion(result)) {
        event.sender.send("deleteLibraryListing", payload.path);
        return resolve(result);
      }

      event.sender.send(eventName, result);
      return resolve(result);
    } catch (e) {
      console.error(e);
      errorToRenderer(e);
      reject(e);
    }
  });
}

function getStatsHash(stats) {
  return hash(pick(stats, ["mtime", "ctime", "birthtime"]));
}

function isNonExistantArtist(result) {
  return result && !isEmpty(result.code) && result.code === "ENOENT";
}

function isRuntimeArtistDeletion(result) {
  return result && isEmpty(result.albums);
}

module.exports = {
  init,
  initLibrary,
  runInitialScan,
};
