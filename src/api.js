const { ipcMain: ipc } = require("electron");
const { getArtistById, getArtistAlbums } = require("./api/artist");
const { getAlbumById } = require("./api/album");
const { getAudioById } = require("./api/audio");
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

  ipc.on("musa:onInit", async (event) => {
    await startScan({ event, files, albumCollection });
  });
};

module.exports = {
  createApi,
};
