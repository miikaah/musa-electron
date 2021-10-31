import { ipcMain as ipc } from "electron";
import { Api, Scanner, UrlSafeBase64, DbTheme } from "musa-core";
import { getState } from "./fs.state";

export const scanColor = {
  INSERT: "#f00",
  UPDATE: "#ff0",
  ALBUM_UPDATE: "#0f0",
};

export const createApi = (musicLibraryPath: string): void => {
  ipc.on("musa:artists:request", async (event) => {
    const artistObject = await Api.getArtists();

    event.sender.send("musa:artists:response", artistObject);
  });

  ipc.on("musa:artist:request", async (event, id) => {
    const artist = await Api.getArtistById(id);

    event.sender.send("musa:artist:response", artist);
  });

  ipc.on("musa:artistAlbums:request", async (event, id) => {
    const artist = await Api.getArtistAlbums(id);

    event.sender.send("musa:artistAlbums:response", artist);
  });

  ipc.on("musa:album:request", async (event, id) => {
    const album = await Api.getAlbumById(id);

    event.sender.send("musa:album:response", album);
  });

  ipc.on("musa:audio:request", async (event, id) => {
    const audio = await Api.getAudioById({ id });

    event.sender.send("musa:audio:response", audio);
  });

  ipc.on("musa:themes:request:getAll", async (event) => {
    const themes = await Api.getAllThemes();

    event.sender.send("musa:themes:response:getAll", themes.map(toApiTheme));
  });

  ipc.on("musa:themes:request:get", async (event, id) => {
    const theme = await Api.getTheme(getThemeId(id, musicLibraryPath));

    if (!theme) {
      event.sender.send("musa:themes:response:get");
      return;
    }

    event.sender.send("musa:themes:response:get", toApiTheme(theme));
  });

  ipc.on("musa:themes:request:insert", async (event, id, colors) => {
    const newTheme = await Api.insertTheme(getThemeId(id, musicLibraryPath), colors);

    event.sender.send("musa:themes:response:insert", toApiTheme(newTheme));
  });

  ipc.on("musa:themes:request:remove", async (event, id) => {
    await Api.removeTheme(id);

    event.sender.send("musa:themes:response:remove");
  });

  ipc.on("musa:find:request", async (event, query) => {
    const result = await Api.find({ query });

    event.sender.send("musa:find:response", result);
  });

  ipc.on("musa:find:request:random", async (event) => {
    const result = await Api.findRandom();

    event.sender.send("musa:find:response:random", result);
  });

  let isScanning = false;
  ipc.on("musa:scan", async (event) => {
    const { musicLibraryPath = "" } = await getState();

    if (!musicLibraryPath || isScanning) {
      return;
    }

    isScanning = true;

    await Scanner.refresh({ musicLibraryPath, event, scanColor });

    isScanning = false;
  });
};

function getThemeId(id: string, musicLibraryPath: string) {
  return UrlSafeBase64.encode(decodeURI(id).replace(`file://${musicLibraryPath}/`, ""));
}

function toApiTheme({ path_id, filename, colors }: DbTheme) {
  return { id: path_id, filename, colors };
}
