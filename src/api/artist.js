const { getAudio, enrichAlbumFiles } = require("../db");

const getArtistById = async (artistCollection, id) => {
  const artist = artistCollection[id];

  if (!artist) {
    return {};
  }

  return artist;
};

const getArtistAlbums = async (artistCollection, albumCollection, id) => {
  const artist = artistCollection[id];

  if (!artist) {
    return [];
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

      const files = await enrichAlbumFiles(albumCollection[id]);

      return {
        id,
        name: albumName || name,
        url,
        coverUrl,
        year,
        files,
      };
    })
  );

  return {
    ...artist,
    albums: albums.sort((a, b) => a.year - b.year),
  };
};

module.exports = {
  getArtistById,
  getArtistAlbums,
};
