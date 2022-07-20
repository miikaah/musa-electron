import { ipcMain as ipc } from "electron";
import { Api, Scanner, UrlSafeBase64 } from "@miikaah/musa-core";

export const scanColor = {
  INSERT: "#f00",
  UPDATE: "#ff0",
  ALBUM_UPDATE: "#0f0",
};

let isInit = false;

export const createApi = async (musicLibraryPath: string): Promise<void> => {
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
    return Api.getAlbumById(id);
  });

  ipc.handle("getAudioById", async (_, id) => {
    return Api.getAudioById({ id });
  });

  ipc.handle("getAllThemes", async () => {
    return Api.getAllThemes();
  });

  ipc.handle("getThemeById", async (_, id) => {
    try {
      const theme = await Api.getTheme(getThemeId(id, musicLibraryPath));

      return theme;
    } catch (error) {
      console.error(error);
    }
  });

  ipc.handle("insertTheme", async (_, id, colors) => {
    return Api.insertTheme(getThemeId(id, musicLibraryPath), colors);
  });

  ipc.handle("removeThemeById", async (_, id) => {
    return Api.removeTheme(id);
  });

  ipc.handle("find", async (_, query) => {
    return Api.find({ query, limit: 32 });
  });

  ipc.handle("findRandom", async () => {
    return Api.findRandom({ limit: 8 });
  });

  let isScanning = false;
  ipc.handle("scan", async (event) => {
    if (!musicLibraryPath || isScanning) {
      return;
    }

    isScanning = true;

    await Scanner.refresh({ musicLibraryPath, isElectron: true, event, scanColor });

    isScanning = false;
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
