import {
  app,
  BrowserWindow,
  dialog,
  ipcMain as ipc,
  protocol,
  screen,
} from "electron";
import fs from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { createApi, scanColor } from "./api";
import config from "./config";
import { initLogger } from "./logger";
import { Api, Db, Fs, Scanner, State } from "./musa-core-import";

initLogger();

const stateFile = `${config.isDevOrTest ? ".dev" : ""}.musa-electron.state.v1.json`;

// Note: This method can only be used before the ready event of the app module gets emitted
// and can be called only once.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: { bypassCSP: true },
  },
]);

// This API has to exist so that init works
ipc.handle("getSettings", async () => {
  await Fs.checkMusadirExists();
  return Fs.getState(stateFile);
});

ipc.handle("insertSettings", async (_, settings: State) => {
  return Fs.setState(stateFile, settings);
});

ipc.handle("addMusicLibraryPath", async (event) => {
  const paths = dialog.showOpenDialogSync({ properties: ["openDirectory"] });

  if (!Array.isArray(paths) || paths.length < 1) {
    return;
  }

  const newPath = paths[0];
  console.log(`New music library path added: ${newPath}\n`);

  await Fs.setState(stateFile, { musicLibraryPath: newPath });
  await init(event);

  return newPath;
});

ipc.handle("getArtists", async () => {
  return Api.getArtists();
});

let musicLibraryPath = "";

const init = async (event: Electron.IpcMainInvokeEvent) => {
  try {
    const state = await Fs.getState(stateFile);
    const electronFileProtocol = "media://";
    musicLibraryPath = state?.musicLibraryPath || "";
    console.log("state", state, "\n");

    if (!musicLibraryPath) {
      const warning =
        "No music library path specified. Go to settings and add it to start scanning.\n";
      console.warn(warning);

      return;
    }

    createApi(musicLibraryPath, electronFileProtocol);

    await Db.init(musicLibraryPath);

    await Scanner.init({
      musicLibraryPath,
      isElectron: true,
      electronFileProtocol,
    });

    event.sender.send("musa:ready");

    await Scanner.update({ musicLibraryPath, event, scanColor });
  } catch (error) {
    console.error("Crashed during startup", (error as Error)?.message);
  }
};
ipc.handle("onInit", init);

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: BrowserWindow;

function createWindow() {
  const allDisplays = screen.getAllDisplays();

  let biggestDisplay = allDisplays[0];
  if (config.isDev && allDisplays.length > 1) {
    allDisplays.forEach(
      (display) =>
        (biggestDisplay =
          display.size.width > biggestDisplay.size.width
            ? display
            : biggestDisplay),
    );
  }
  // Create the browser window
  mainWindow = new BrowserWindow({
    x: biggestDisplay.bounds.x,
    y: biggestDisplay.bounds.y,
    width: 1600,
    height: 1050,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      spellcheck: false,
    },
  });

  const getURL = () => {
    return config.isDevOrTest
      ? "http://localhost:3666"
      : `file://${path.join(app.getAppPath(), "/build/index.html")}`;
  };
  // and load the index.html of the app.
  void mainWindow.loadURL(getURL()); // Needs to be void Promise or the window won't open for whatever reason

  if (config.isDev) {
    mainWindow.webContents.openDevTools({ mode: "right" });
  }

  protocol.handle("media", async (req) => {
    const pathname = decodeURIComponent(new URL(req.url).pathname);
    console.log("pathname", pathname);
    const isExternal =
      pathname.startsWith("//") ||
      // pathname.startsWith("/") ||
      new RegExp(/^\\[A-Z]:\\\w/).test(pathname);
    const filepath = isExternal
      ? process.platform === "linux"
        ? pathname
        : pathname.substring(1)
      : path.join(musicLibraryPath, pathname);
    const size = (await stat(filepath)).size;
    const ext = path.extname(filepath).replace(".", "");

    const headers = new Headers();
    if (["jpg", "jpeg", "png", "webp"].includes(ext.toLocaleLowerCase())) {
      headers.set("Content-Type", `image/${ext.replace("jpg", "jpeg")}`);
      headers.set("Content-Length", `${size}`);

      return new Response(new Blob([fs.readFileSync(filepath)]), {
        headers,
        status: 200,
      });
    } else if (["mp3", "flac", "ogg"].includes(ext.toLocaleLowerCase())) {
      headers.set("Content-Type", `audio/${ext.replace("mp3", "mpeg")}`);
    }

    // NOTE: Instructions how to stream https://github.com/electron/electron/issues/38749
    const rangeText = req.headers.get("range");
    if (!rangeText) {
      return new Response(null, { status: 204 });
    }

    let parsedRangeRequest;
    try {
      // There is a non-deterministic bug here where parsedRangeRequest becomes non-iterable
      parsedRangeRequest = parseRangeRequests(rangeText, size)[0];
      const [start, end] = parsedRangeRequest;
      const stream = fs.createReadStream(filepath, { start, end });

      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", `${end - start + 1}`);
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);

      // Seems that you can just pass a ReadStream as ReadableStream
      return new Response(stream as unknown as ReadableStream, {
        headers,
        status: 206,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "No message";
      const message = `Failed during Partial Content range request ${msg}`;
      console.error(message);
      console.log("parsedRangeRequest", parsedRangeRequest);
      return new Response(JSON.stringify({ message }), {
        headers,
        status: 500,
      });
    }
  });

  function parseRangeRequests(text: string, size: number) {
    const token = text.split("=");
    if (token.length !== 2 || token[0] !== "bytes") {
      return [];
    }

    return token[1]
      .split(",")
      .map((v) => parseRange(v, size))
      .filter(([start, end]) => !isNaN(start) && !isNaN(end) && start <= end);
  }

  const NAN_ARRAY = [NaN, NaN];

  function parseRange(text: string, size: number) {
    const token = text.split("-");
    if (token.length !== 2) {
      return NAN_ARRAY;
    }

    const startText = token[0].trim();
    const endText = token[1].trim();

    if (startText === "") {
      if (endText === "") {
        return NAN_ARRAY;
      } else {
        let start = size - Number(endText);
        if (start < 0) {
          start = 0;
        }

        return [start, size - 1];
      }
    } else {
      if (endText === "") {
        return [Number(startText), size - 1];
      } else {
        let end = Number(endText);
        if (end >= size) {
          end = size - 1;
        }

        return [Number(startText), end];
      }
    }
  }

  // Prevent visual flash of empty frame
  mainWindow.once("ready-to-show", () => {
    Scanner.setScanProgressListener((ratio, mode) => {
      if (!ratio) {
        return;
      }

      mainWindow.setProgressBar(ratio, { mode: mode || "none" });
    });
    mainWindow.show();
  });

  mainWindow.on("closed", function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    // @ts-expect-error typecheck doesn't add any value here
    mainWindow = null;
  });
}

// Enable sandbox for all renderers
app.enableSandbox();

app
  .whenReady()
  .then(createWindow)
  .catch((error) => {
    console.error("Failed in whenReady", error);
    process.exit(1);
  });

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Quit when all windows are closed.
app.on("window-all-closed", function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Api for window min max close
ipc.handle("minimizeWindow", () => {
  mainWindow.minimize();
});

ipc.handle("maximizeWindow", () => {
  mainWindow.maximize();
});

ipc.handle("unmaximizeWindow", () => {
  mainWindow.unmaximize();
});

ipc.handle("isWindowMaximized", () => {
  return mainWindow.isMaximized();
});

ipc.handle("closeWindow", () => {
  mainWindow.close();
});

ipc.handle("getPlatform", () => {
  return process.platform;
});
