const homedir = require("os").homedir();
const chokidar = require("chokidar");
const hash = require("object-hash");
const { isEmpty, pick, isUndefined, differenceBy } = require("lodash");
const { isFileTypeSupported, getArtistPath } = require("./util");
const {
  INIT,
  UPDATE_SONGS,
  UPDATE_LIBRARY_LISTINGS,
  DELETE_LIBRARY_LISTINGS
} = require("./scanner");
const { fork } = require("child_process");

const LIBRARY_PATH = `${homedir}/Documents/musat`;

const WATCHER_TIMEOUT = 3000;

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

  // Initial check completed, now do
  watcher.on("ready", () => {
    isInitialized = true;
    // s[0] is the file path
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

  // WATCHERS

  let addedSongs = [];
  watcher.on("add", (path, stats) => {
    if (!isFileTypeSupported(path)) return;
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
          updateLibrary(event, addedSongs, []);
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
    if (!isInitialized || !isFileTypeSupported(path)) return;
    updatedSongs.push([path, getStatsHash(stats)]);
    if (updatedSongs.length <= 1) {
      setTimeout(() => {
        updateLibrary(event, updatedSongs);
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
    if (!isInitialized || !isFileTypeSupported(path)) return;
    removedSongs.push([path]);
    if (removedSongs.length <= 1) {
      setTimeout(() => {
        updateLibrary(event, [], removedSongs);
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

function runInitialScan(event) {
  forkScanner(event, "libraryListing", INIT);
}

function updateDirtySongs(event, dirtySongPaths) {
  if (isEmpty(dirtySongPaths)) return;
  forkScanner(event, "updateSongMetadata", UPDATE_SONGS, dirtySongPaths);
}

function updateLibrary(event, updatedSongList = [], removedSongList = []) {
  const hasUpdatedSongs = !isEmpty(updatedSongList);
  const hasDeletedSongs = !isEmpty(removedSongList);
  if (!hasUpdatedSongs && !hasDeletedSongs) return;

  const paths = [
    ...updatedSongList
      .map(s => getArtistPath(s[0], LIBRARY_PATH))
      .map(p => p.split("/").pop()),
    ...removedSongList
      .map(s => getArtistPath(s[0], LIBRARY_PATH))
      .map(p => p.split("/").pop())
  ];

  if (hasUpdatedSongs || hasDeletedSongs)
    forkScanner(event, "libraryListing", UPDATE_LIBRARY_LISTINGS, paths);
  // Deletes complete artist folders if necessary
  if (hasDeletedSongs)
    forkScanner(event, "deleteLibraryListings", DELETE_LIBRARY_LISTINGS, paths);
}

function forkScanner(event, eventName, msg, payload) {
  const scanner = fork("./src/scanner.js");
  const endEventName = eventName + "End";
  scanner.send({ msg, payload });
  scanner.on("message", obj => {
    if (obj.msg !== eventName && obj.msg !== endEventName) return;
    if (isUndefined(obj.payload)) {
      scanner.kill();
    } else {
      event.sender.send(eventName, obj.payload);
    }
  });
}

function getStatsHash(stats) {
  return hash(pick(stats, ["mtime", "ctime", "birthtime"]));
}

module.exports = {
  initLibrary
};
