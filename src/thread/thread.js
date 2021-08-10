const { BrowserWindow } = require("electron");
const path = require("path");

const options = {
  show: false,
  webPreferences: {
    preload: require.resolve("./renderer.worker"),
    nodeIntegration: true,
    nodeIntegrationInWorker: true,
    nodeIntegrationInSubFrames: true,
    contextIsolation: false,
    devTools: true,
    webSecurity: false,
  },
};

const ThreadEvent = {
  Params: "musa-thread:params",
  Success: "musa-thread:success",
  Error: "musa-thread:error",
};

const createThread = async (params) => {
  return new Promise(async (resolve, reject) => {
    let window = new BrowserWindow(options);
    window.loadFile(path.join(__dirname, "/thread.html"));

    window.webContents.on("ipc-message-sync", (event, channel) => {
      if (channel === ThreadEvent.Params) {
        event.returnValue = params;
      }
    });

    const rejectError = (error) => {
      if (window) {
        window.close();
        window = null;
      }
      reject(error);
    };

    window.webContents.on("ipc-message", (event, channel, payload) => {
      if (channel === ThreadEvent.Success) {
        window.close();
        window = null;
        resolve(payload);
      } else if (channel === ThreadEvent.Error) {
        rejectError(payload);
      }
    });

    window.webContents.on("did-fail-load", rejectError);
    window.webContents.on("render-process-gone", rejectError);
    window.webContents.on("unresponsive", rejectError);
    window.webContents.on("destroyed", rejectError);
    window.webContents.on("preload-error", rejectError);
  });
};

module.exports = {
  createThread,
  ThreadEvent,
};
