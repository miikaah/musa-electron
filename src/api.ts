import { ipcMain as ipc } from "electron";
import { ArtistCollection, AlbumCollection, FileCollection } from "musa-core";
import { getArtistById, getArtistAlbums } from "./api/artist";
import { getAlbumById } from "./api/album";
import { getAudioById } from "./api/audio";
import { find } from "./api/find";
import { getAllThemes, getTheme, insertTheme, removeTheme } from "./db";
import { startScan } from "./scanner";

type ArtistObject = {
  [label: string]: { id: string; name: string; url: string }[];
};

type Params = {
  artistObject: ArtistObject;
  artistCollection: ArtistCollection;
  albumCollection: AlbumCollection;
  audioCollection: FileCollection;
  files: string[];
};

export const createApi = ({
  artistObject,
  artistCollection,
  albumCollection,
  audioCollection,
  files,
}: Params): void => {
  const artistsForFind = Object.entries(artistCollection).map(([id, a]) => ({ ...a, id }));
  const albumsForFind = Object.entries(albumCollection).map(([id, a]) => ({ ...a, id }));

  ipc.on("musa:artists:request", (event) => {
    event.sender.send("musa:artists:response", artistObject);
  });

  ipc.on("musa:artist:request", async (event, id) => {
    const artist = await getArtistById(artistCollection, id);

    event.sender.send("musa:artist:response", artist);
  });

  ipc.on("musa:artistAlbums:request", async (event, id) => {
    const artist = await getArtistAlbums(artistCollection, albumCollection, id);

    event.sender.send("musa:artistAlbums:response", artist);
  });

  ipc.on("musa:album:request", async (event, id) => {
    const album = await getAlbumById(albumCollection, id);

    event.sender.send("musa:album:response", album);
  });

  ipc.on("musa:album:request:AppMain", async (event, id) => {
    const album = await getAlbumById(albumCollection, id);

    event.sender.send("musa:album:response:AppMain", album);
  });

  ipc.on("musa:audio:request", async (event, id) => {
    const audio = await getAudioById(audioCollection, albumCollection, id);

    event.sender.send("musa:audio:response", audio);
  });

  ipc.on("musa:themes:request:getAll", async (event) => {
    const themes = await getAllThemes();

    event.sender.send(
      "musa:themes:response:getAll",
      themes.map(({ colors, path_id }) => ({
        id: path_id,
        colors,
      }))
    );
  });

  ipc.on("musa:themes:request:get", async (event, id) => {
    const theme = await getTheme(id);

    if (!theme) {
      event.sender.send("musa:themes:response:get");
      return;
    }

    const { colors, path_id } = theme;

    event.sender.send("musa:themes:response:get", { id: path_id, colors });
  });

  ipc.on("musa:themes:request:insert", async (event, id, colors) => {
    const newTheme = await insertTheme(id, colors);

    event.sender.send("musa:themes:response:insert", newTheme);
  });

  ipc.on("musa:themes:request:remove", async (event, id) => {
    await removeTheme(id);

    event.sender.send("musa:themes:response:remove");
  });

  ipc.on("musa:find:request", async (event, query) => {
    const result = await find({
      artistsForFind,
      albumsForFind,
      artistCollection,
      albumCollection,
      audioCollection,
      query,
    });

    event.sender.send("musa:find:response", result);
  });

  ipc.on("musa:scan", async (event) => {
    await startScan({ event, files, albumCollection });
  });
};
