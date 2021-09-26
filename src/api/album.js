const getAlbumById = async (albumCollection, id) => {
  const artist = albumCollection[id];

  if (!artist) {
    return [];
  }

  return artist;
};

module.exports = {
  getAlbumById,
};
