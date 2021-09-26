const { ipcMain: ipc } = require("electron");
const { getArtistById, getArtistAlbums } = require("./api/artist");
const { getAlbumById } = require("./api/album");

const createApi = async ({
  artistObject,
  artistCollection,
  albumCollection,
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

  ipc.on("musa:onInit", async (event) => {
    event.sender.send("musa:startScan", files.length);

    setTimeout(
      () => event.sender.send("musa:updateScan", files.length / 4),
      1000
    );
    setTimeout(
      () => event.sender.send("musa:updateScan", files.length / 2),
      2000
    );
    setTimeout(
      () => event.sender.send("musa:updateScan", files.length - 1),
      2900
    );
    setTimeout(() => event.sender.send("musa:endScan"), 3000);
  });
};

module.exports = {
  createApi,
};
