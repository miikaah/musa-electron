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
  console.log(artist);
  const albumIds = artist.albums.map(({ id }) => id);
  const albums = Object.entries(albumCollection)
    .filter(([id]) => albumIds.includes(id))
    .map(([, album]) => album);

  if (!albums.every(Boolean)) {
    return [];
  }
  console.log(albums);

  return albums;
};

module.exports = {
  getArtistById,
  getArtistAlbums,
};
