const { ipcMain: ipc } = require("electron");
const { getArtistById, getArtistAlbums } = require("./api/artist");
const { getAlbumById } = require("./api/album");
const { getAudioById } = require("./api/audio");
const { getAllThemes, getTheme, insertTheme } = require("./db");
const { startScan } = require("./scanner");

const createApi = async ({
  artistObject,
  artistCollection,
  albumCollection,
  audioCollection,
  files,
}) => {
  ipc.on("musa:artists:request", (event) => {
    event.sender.send("musa:artists:response", artistObject);
  });

  ipc.on("musa:artist:request", async (event, id) => {
    const artist = await getArtistById(artistCollection, albumCollection, id);

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

  ipc.on("musa:onInit", async (event) => {
    await startScan({ event, files, albumCollection });
  });
};

module.exports = {
  createApi,
};
