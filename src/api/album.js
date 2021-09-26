const { enrichAlbumFiles } = require("../db");

const getAlbumById = async (albumCollection, id) => {
  const album = albumCollection[id];

  if (!album) {
    return [];
  }

  const files = await enrichAlbumFiles(album);
  console.log(album);

  return {
    ...album,
    files,
  };
};

module.exports = {
  getAlbumById,
};
