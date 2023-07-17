const { contextBridge, ipcRenderer: ipc } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  onInit: () => ipc.invoke("onInit"),
  getSettings: () => ipc.invoke("getSettings"),
  insertSettings: (settings) => ipc.invoke("insertSettings", settings),
  addMusicLibraryPath: () => ipc.invoke("addMusicLibraryPath"),
  minimizeWindow: () => ipc.invoke("minimizeWindow"),
  maximizeWindow: () => ipc.invoke("maximizeWindow"),
  unmaximizeWindow: () => ipc.invoke("unmaximizeWindow"),
  isWindowMaximized: () => ipc.invoke("isWindowMaximized"),
  closeWindow: () => ipc.invoke("closeWindow"),
  getPlatform: () => ipc.invoke("getPlatform"),
  scan: () => ipc.invoke("scan"),
  addScanStartListener: (callback) => {
    ipc.on("musa:scan:start", (event, scanLength, scanColor) => {
      callback({ scanLength, scanColor });
    });
  },
  addScanUpdateListener: (callback) => {
    ipc.on("musa:scan:update", (event, scannedLength) => {
      callback({ scannedLength });
    });
  },
  addScanEndListener: (callback) => {
    ipc.on("musa:scan:end", () => {
      callback();
    });
  },
  addScanCompleteListener: (callback) => {
    ipc.on("musa:scan:complete", () => {
      callback();
    });
  },
  getArtists: () => ipc.invoke("getArtists"),
  getArtistById: (id) => ipc.invoke("getArtistById", id),
  getArtistAlbums: (id) => ipc.invoke("getArtistAlbums", id),
  getAlbumById: (id) => ipc.invoke("getAlbumById", id),
  getAudioById: (id) => ipc.invoke("getAudioById", id),
  getAudiosByFilepaths: (paths) => ipc.invoke("getAudiosByFilepaths", paths),
  getAllThemes: () => ipc.invoke("getAllThemes"),
  getThemeById: (id) => ipc.invoke("getThemeById", id),
  insertTheme: (id, colors) => ipc.invoke("insertTheme", id, colors),
  updateTheme: (id, colors) => ipc.invoke("updateTheme", id, colors),
  removeThemeById: (id) => ipc.invoke("removeThemeById", id),
  getAllGenres: () => ipc.invoke("getAllGenres"),
  find: (query) => ipc.invoke("find", query),
  findRandom: () => ipc.invoke("findRandom"),
  findRandomWithLockedSearchTerm: (term) =>
    ipc.invoke("findRandomWithLockedSearchTerm", term),
  writeTags: (id, tags) => ipc.invoke("writeTags", id, tags),
});
