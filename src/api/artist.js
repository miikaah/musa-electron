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
  const files = await Promise.all(
    artist.files.map(async (file) => {
      const dbAudio = await getAudio(file.id);
      const name = dbAudio?.metadata?.title || file.name;
      const trackNo = `${dbAudio?.metadata?.track?.no || ""}`;
      const diskNo = `${dbAudio?.metadata?.disk?.no || ""}`;
      const track = `${diskNo ? `${diskNo}.` : ""}${trackNo.padStart(2, "0")}`;

      return {
        ...file,
        name,
        track: track === "00" ? null : track,
        metadata: dbAudio?.metadata,
      };
    })
  );

  return {
    ...artist,
    albums: albums.sort((a, b) => a.year - b.year),
    files,
  };
};

module.exports = {
  getArtistById,
  getArtistAlbums,
};
