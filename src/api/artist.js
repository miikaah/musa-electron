const { getAudio, enrichAlbums } = require("../db");

const getArtistById = async (artistCollection, albumCollection, id) => {
  const artist = artistCollection[id];

  if (!artist) {
    return {};
  }

  const albums = await Promise.all(
    artist.albums.map(async ({ id, name, url, coverUrl, firstAlbumAudio }) => {
      let year = null;
      let albumName = null;

      if (firstAlbumAudio && firstAlbumAudio.id) {
        const audio = await getAudio(firstAlbumAudio.id);

        year = audio?.metadata?.year;
        albumName = audio?.metadata?.album;
      }

      return {
        id,
        name: albumName || name,
        url,
        coverUrl,
        year,
      };
    })
  );

  return {
    ...artist,
    albums: albums.sort((a, b) => a.year - b.year),
  };
};

const getArtistAlbums = async (artistCollection, albumCollection, id) => {
  const artist = artistCollection[id];

  if (!artist) {
    return [];
  }

  const albums = await enrichAlbums(albumCollection, artist);

  return {
    ...artist,
    albums: albums.sort((a, b) => a.year - b.year),
  };
};

module.exports = {
  getArtistById,
  getArtistAlbums,
};
