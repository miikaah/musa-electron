import { ipcMain as ipc } from "electron";
import path from "path";
import { Api, Scanner } from "musa-core";
import { getState } from "./fs.state";

export const scanColor = {
  INSERT: "#f00",
  UPDATE: "#ff0",
  ALBUM_UPDATE: "#0f0",
};

export const createApi = ({ musicLibraryPath }: { musicLibraryPath: string }): void => {
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

  ipc.on("musa:album:request:AppMain", async (event, id) => {
    const album = await Api.getAlbumById(id);

    event.sender.send("musa:album:response:AppMain", album);
  });

  ipc.on("musa:audio:request", async (event, id) => {
    const audio = await Api.getAudioById({ id });

    event.sender.send("musa:audio:response", audio);
  });

  ipc.on("musa:themes:request:getAll", async (event) => {
    const themes = await Api.getAllThemes();

    event.sender.send(
      "musa:themes:response:getAll",
      themes.map(({ colors, path_id }) => ({
        id: path_id,
        colors,
      }))
    );
  });

  ipc.on("musa:themes:request:get", async (event, id) => {
    const theme = await Api.getTheme(getThemeId(id, musicLibraryPath));

    if (!theme) {
      event.sender.send("musa:themes:response:get");
      return;
    }

    const { colors, path_id } = theme;

    event.sender.send("musa:themes:response:get", { id: path_id, colors });
  });

  ipc.on("musa:themes:request:insert", async (event, id, colors) => {
    const newTheme = await Api.insertTheme(getThemeId(id, musicLibraryPath), colors);

    const { path_id } = newTheme;

    event.sender.send("musa:themes:response:insert", { id: path_id, colors });
  });

  ipc.on("musa:themes:request:remove", async (event, id) => {
    await Api.removeTheme(getThemeId(id, musicLibraryPath));

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
  return id.replace(path.join(`file://${musicLibraryPath}`, musicLibraryPath), "");
}
