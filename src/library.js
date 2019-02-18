const homedir = require("os").homedir();
const chokidar = require("chokidar");
const hash = require("object-hash");
const { isEmpty, pick, isUndefined } = require("lodash");
const { isFileTypeSupported } = require("./util");
const { fork } = require("child_process");

const LIBRARY_PATH = `${homedir}/Documents/musat`;

function initLibrary(event, songList = []) {
  if (isEmpty(songList)) runInitialScan(event);
  const dirtySongList = [];
  const dirtySongSet = new Set();
  const frontendSongMap = new Map(songList);
  let isInitialized = false;

  const watcher = chokidar.watch(LIBRARY_PATH, {
    ignored: /^\./
  });
  watcher.on("add", (path, stats) => {
    if (!isFileTypeSupported(path)) return;
    const statsHash = hash(pick(stats, ["mtime", "ctime", "birthtime"]));
    if (!isInitialized) {
      const frontendHash = frontendSongMap.get(path);
      if (statsHash !== frontendHash) {
        console.log(path);
        console.log(statsHash, frontendSongMap.get(path));
        console.log(pick(stats, ["mtime", "ctime", "birthtime"]));
        dirtySongList.push([path, statsHash]);
        dirtySongSet.add(path);
        return;
      }
      if (isUndefined(frontendHash)) {
        console.log("New file found ", path);
      }
    }
  });
  watcher.on("ready", () => {
    isInitialized = true;
    console.log(dirtySongList.length, frontendSongMap.size);
    updateDirtySongs(event, Array.from(dirtySongSet.values()));
    event.sender.send(
      "updateSongList",
      [
        ...songList.filter(song => !dirtySongSet.has(song[0])),
        ...dirtySongList
      ].sort((a, b) => a[0].localeCompare(b[0]))
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

module.exports = {
  initLibrary
};
