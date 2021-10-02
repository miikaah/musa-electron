const { getAlbum, enrichAlbumFiles } = require("../db");

const getAlbumById = async (albumCollection, id) => {
  const album = albumCollection[id];

  if (!album) {
    return [];
  }

  const dbAlbum = await getAlbum(id);
  const files = await enrichAlbumFiles(album);

  return {
    ...album,
    metadata: dbAlbum?.metadata,
    files,
  };
};

module.exports = {
  getAlbumById,
};
