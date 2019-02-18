const homedir = require("os").homedir();
const chokidar = require("chokidar");
const hash = require("object-hash");
const { isEmpty, pick, isUndefined, differenceBy } = require("lodash");
const { isFileTypeSupported, getArtistPath } = require("./util");
const { fork } = require("child_process");

const LIBRARY_PATH = `${homedir}/Documents/musat`;

function initLibrary(event, songList = []) {
  const isInitialScan = isEmpty(songList);
  if (isInitialScan) runInitialScan(event);
  const dirtySongList = [];
  const dirtySongSet = new Set();
  const frontendSongMap = new Map(songList);
  const localSongList = [];
  let isInitialized = false;

  const watcher = chokidar.watch(LIBRARY_PATH, {
    ignored: /^\./
  });
  watcher.on("add", (path, stats) => {
    if (!isFileTypeSupported(path)) return;
    const statsHash = hash(pick(stats, ["mtime", "ctime", "birthtime"]));
    localSongList.push([path, statsHash]);
    if (!isInitialized) {
      const frontendHash = frontendSongMap.get(path);
      if (statsHash !== frontendHash && !isUndefined(frontendHash)) {
        dirtySongList.push([path, statsHash]);
        dirtySongSet.add(path);
        return;
      }
    }
  });
  watcher.on("ready", () => {
    isInitialized = true;
    const addedSongList = differenceBy(localSongList, songList, s => s[0]);
    const removedSongList = differenceBy(songList, localSongList, s => s[0]);
    const removedSongSet = new Set(removedSongList.map(s => s[0]));
    if (!isInitialScan) {
      updateDirtySongs(event, Array.from(dirtySongSet.values()));
      updateLibrary(event, addedSongList, removedSongList);
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
  // watcher.on("change", path => console.log("change", path));
  // watcher.on("unlink", path => console.log("unlink", path));
}

function runInitialScan(event) {
  forkScanner(event, "libraryListing", "INIT");
}

function updateDirtySongs(event, dirtySongPaths) {
  if (isEmpty(dirtySongPaths)) return;
  forkScanner(event, "updateSongMetadata", "UPDATE_SONGS", dirtySongPaths);
}

function updateLibrary(event, addedSongList, removedSongList) {
  const hasAddedSongs = !isEmpty(addedSongList);
  const hasDeletedSongs = !isEmpty(removedSongList);
  if (!hasAddedSongs && !hasDeletedSongs) return;
  const paths = [
    ...addedSongList
      .map(s => getArtistPath(s[0], LIBRARY_PATH))
      .map(p => p.split("/").pop()),
    ...removedSongList
      .map(s => getArtistPath(s[0], LIBRARY_PATH))
      .map(p => p.split("/").pop())
  ];
  if (hasAddedSongs)
    forkScanner(event, "libraryListing", "UPDATE_LIBRARY", paths);
  if (hasDeletedSongs)
    forkScanner(
      event,
      "deleteLibraryListings",
      "DELETE_LIBRARY_LISTINGS",
      paths
    );
}

function forkScanner(event, eventName, msg, payload) {
  const scanner = fork("./src/scanner.js");
  scanner.send({ msg, payload });
  scanner.on("message", obj => {
    if (obj.msg !== eventName) return;
    if (isUndefined(obj.payload)) {
      scanner.kill();
    } else {
      event.sender.send(eventName, obj.payload);
    }
  });
}

module.exports = {
  initLibrary
};
