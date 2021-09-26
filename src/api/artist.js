const { getAudio, getAudiosByIds } = require("../db");

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

      const album = albumCollection[id];
      const audioIds = album.files.map(({ id }) => id);
      const files = await getAudiosByIds(audioIds);
      const trackNumbers = files.map((file) => file?.metadata?.track?.no);
      const maxTrackNo = Math.max(...trackNumbers);
      const pad = `${maxTrackNo}`.length;
      const padLen = pad < 2 ? 2 : pad;

      const mergedFiles = await Promise.all(
        album.files.map(async ({ id, name: filename, url, fileUrl }) => {
          const file = files.find((f) => f.path_id === id);
          const name = file?.metadata?.title || filename;
          const trackNo = `${file?.metadata?.track?.no || ""}`;
          const diskNo = `${file?.metadata?.disk?.no || ""}`;
          console.log("pad", pad, padLen, trackNo);
          const track = `${diskNo ? `${diskNo}.` : ""}${trackNo.padStart(
            padLen,
            "0"
          )}`;

          return {
            ...file,
            name,
            track,
            url,
            fileUrl,
            metadata: file?.metadata,
          };
        })
      );

      return {
        id,
        name: albumName || name,
        url,
        coverUrl,
        year,
        files: mergedFiles,
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
