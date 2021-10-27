import { ipcMain as ipc } from "electron";
import {
  Api,
  Scanner,
  ArtistCollection,
  AlbumCollection,
  FileCollection,
  ArtistObject,
} from "musa-core";
import { getState } from "./fs.state";

export const scanColor = {
  INSERT: "#f00",
  UPDATE: "#ff0",
  ALBUM_UPDATE: "#0f0",
};

export const createApi = ({
  artistObject,
  artistCollection,
  albumCollection,
  audioCollection,
  files,
}: {
  artistObject: ArtistObject;
  artistCollection: ArtistCollection;
  albumCollection: AlbumCollection;
  audioCollection: FileCollection;
  files: string[];
}): void => {
  const artistsForFind = Object.entries(artistCollection).map(([id, a]) => ({ ...a, id }));
  const albumsForFind = Object.entries(albumCollection).map(([id, a]) => ({ ...a, id }));
  const audiosForFind = Object.entries(audioCollection).map(([id, a]) => ({ ...a, id }));

  ipc.on("musa:artists:request", (event) => {
    event.sender.send("musa:artists:response", artistObject);
  });

  ipc.on("musa:artist:request", async (event, id) => {
    const artist = await Api.getArtistById(artistCollection, id);

    event.sender.send("musa:artist:response", artist);
  });

  ipc.on("musa:artistAlbums:request", async (event, id) => {
    const artist = await Api.getArtistAlbums(artistCollection, albumCollection, id);

    event.sender.send("musa:artistAlbums:response", artist);
  });

  ipc.on("musa:album:request", async (event, id) => {
    const album = await Api.getAlbumById(albumCollection, id);

    event.sender.send("musa:album:response", album);
  });

  ipc.on("musa:album:request:AppMain", async (event, id) => {
    const album = await Api.getAlbumById(albumCollection, id);

    event.sender.send("musa:album:response:AppMain", album);
  });

  ipc.on("musa:audio:request", async (event, id) => {
    const audio = await Api.getAudioById({ audioCollection, albumCollection, id });

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
    const theme = await Api.getTheme(id);

    if (!theme) {
      event.sender.send("musa:themes:response:get");
      return;
    }

    const { colors, path_id } = theme;

    event.sender.send("musa:themes:response:get", { id: path_id, colors });
  });

  ipc.on("musa:themes:request:insert", async (event, id, colors) => {
    const newTheme = await Api.insertTheme(id, colors);

    const { path_id } = newTheme;

    event.sender.send("musa:themes:response:insert", { id: path_id, colors });
  });

  ipc.on("musa:themes:request:remove", async (event, id) => {
    await Api.removeTheme(id);

    event.sender.send("musa:themes:response:remove");
  });

  ipc.on("musa:find:request", async (event, query) => {
    const result = await Api.find({
      artistsForFind,
      albumsForFind,
      artistCollection,
      albumCollection,
      audioCollection,
      query,
    });

    event.sender.send("musa:find:response", result);
  });

  ipc.on("musa:find:request:random", async (event) => {
    const result = await Api.findRandom({
      artistsForFind,
      albumsForFind,
      artistCollection,
      albumCollection,
      audioCollection,
      audiosForFind,
    });

    event.sender.send("musa:find:response:random", result);
  });

  let isScanning = false;
  ipc.on("musa:scan", async (event) => {
    const { musicLibraryPath = "" } = await getState();

    if (!musicLibraryPath || isScanning) {
      return;
    }

    isScanning = true;

    await Scanner.refresh({ musicLibraryPath, event, scanColor, files, albumCollection });

    isScanning = false;
  });
};
