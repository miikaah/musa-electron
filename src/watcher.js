const chokidar = require("chokidar");
const hash = require("object-hash");
const homedir = require("os").homedir();
const { isFileTypeSupported } = require("./util");

const LIBRARY_PATH = `${homedir}/Documents/musat`;

process.on("message", songList => {
  watch(songList);
});

function watch(songList = []) {
  const dirtySongList = [];
  const frontendSongMap = new Map(songList);
  let isInitialized = false;

  const watcher = chokidar.watch(LIBRARY_PATH, {
    ignored: /^\./
  });
  watcher.on("add", (path, stats) => {
    if (isFileTypeSupported(path)) {
      const statsHash = hash(stats);
      if (!isInitialized && statsHash !== frontendSongMap.get(path)) {
        dirtySongList.push([path, statsHash]);
        return;
      }
    }
  });
  watcher.on("ready", () => {
    isInitialized = true;
    console.log(dirtySongList.length, frontendSongMap.size);
    process.send(dirtySongList);
  });
  // watcher.on("change", path => console.log("change", path));
  // watcher.on("unlink", path => console.log("unlink", path));
}
