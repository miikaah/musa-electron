import { app, ipcMain as ipc, utilityProcess } from "electron";
import path from "node:path";
import config from "./config";
import {
  Api,
  Normalization,
  NormalizationUnit,
  Scanner,
  Tags,
  Thread,
  UrlSafeBase64,
} from "./musa-core-import";

export const createThreadPoolIfNotExists = () => {
  if (!Thread.hasThreadPool()) {
    Thread.createThreadPool(
      utilityProcess.fork.bind(null),
      config.isDevOrTest
        ? path.join(__dirname, "../../musa-core/lib/worker.js")
        : path.join(app.getAppPath(), "/worker.js"),
    );
  }
};

export const scanColor = {
  INSERT: "#f00",
  UPDATE: "#ff0",
  ALBUM_UPDATE: "#0f0",
};

let isInit = false;

export const createApi = (
  musicLibraryPath: string,
  electronFileProtocol: string,
): void => {
  if (isInit) {
    return;
  }

  ipc.handle("getArtistById", async (_, id) => {
    return Api.getArtistById(id);
  });

  ipc.handle("getArtistAlbums", async (_, id) => {
    return Api.getArtistAlbums(id);
  });

  ipc.handle("getAlbumById", async (_, id) => {
    return Api.findAlbumById(id);
  });

  ipc.handle("getAudioById", async (_, id: string) => {
    return Api.findAudioById({ id });
  });

  ipc.handle("getAudiosByFilepaths", async (_, paths: string[]) => {
    return Api.getAudiosByFilepaths(
      paths,
      musicLibraryPath,
      electronFileProtocol,
    );
  });

  ipc.handle("getAllThemes", async () => {
    return Api.getAllThemes();
  });

  ipc.handle("getThemeById", async (_, id) => {
    try {
      const theme = await Api.getTheme(getThemeId(id, musicLibraryPath));

      return theme;
    } catch (error: unknown) {
      if (!(error as Error).message.includes("Theme Not Found")) {
        console.error(error);
      }
    }
  });

  ipc.handle("insertTheme", async (_, id, colors) => {
    return Api.insertTheme(getThemeId(id, musicLibraryPath), colors);
  });

  ipc.handle("updateTheme", async (_, id, colors) => {
    return Api.updateTheme(getThemeId(id, musicLibraryPath), colors);
  });

  ipc.handle("removeThemeById", async (_, id) => {
    return Api.removeTheme(id);
  });

  ipc.handle("getAllGenres", async () => {
    return Api.getAllGenres();
  });

  ipc.handle("find", async (_, query: string) => {
    return Api.find({ query, limit: 16 });
  });

  ipc.handle("findRandom", async () => {
    return Api.findRandom({ limit: 8 });
  });

  ipc.handle(
    "findRandomWithLockedSearchTerm",
    async (_, lockedSearchTerm: string) => {
      return Api.findRandom({ limit: 8, lockedSearchTerm });
    },
  );

  ipc.handle("writeTags", async (_, id, tags) => {
    try {
      await Api.writeTags(musicLibraryPath, id, tags);
    } catch (error) {
      const message = (error as Error)?.message ?? "";
      console.error(message);
      return new Error(message);
    }
  });

  ipc.handle(
    "writeTagsMany",
    async (_, files: { fid: string; tags: Partial<Tags> }[]) => {
      try {
        createThreadPoolIfNotExists();
        await Api.writeTagsMany(musicLibraryPath, files);
      } catch (error) {
        const message = (error as Error)?.message ?? "";
        console.error(message);
        return new Error(message);
      } finally {
        Thread.destroyThreadPool();
      }
    },
  );

  let isScanning = false;
  ipc.handle("scan", async (event) => {
    if (!musicLibraryPath || isScanning) {
      return;
    }

    isScanning = true;

    await Scanner.refresh({
      musicLibraryPath,
      isElectron: true,
      event,
      scanColor,
    });

    isScanning = false;
  });

  ipc.handle("normalizeMany", async (_, units: NormalizationUnit[]) => {
    createThreadPoolIfNotExists();
    const results = await Normalization.normalizeMany(
      units.map((unit) => ({
        ...unit,
        files: unit.files.map(
          (file) =>
            `${musicLibraryPath}${decodeURIComponent(new URL(file).pathname)}`,
        ),
      })),
    );
    Thread.destroyThreadPool();

    return Object.entries(results).reduce(
      (acc, [id, result]) => ({
        ...acc,
        [id]: {
          ...result,
          files: result.files.map((file) => ({
            ...file,
            filepath: path.join(
              electronFileProtocol,
              file.filepath.replace(musicLibraryPath, ""),
            ),
          })),
        },
      }),
      {},
    );
  });

  isInit = true;
};

function getThemeId(id: string, musicLibraryPath: string) {
  let libPath = "";

  if (process.platform === "win32") {
    libPath = `file:///${musicLibraryPath.replace(/\\/g, "/")}/`;
  } else {
    libPath = `file://${musicLibraryPath}/`;
  }

  return UrlSafeBase64.encode(decodeURI(id).replace(libPath, ""));
}
