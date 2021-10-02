const fuzzysort = require("fuzzysort");
const { getArtistAlbums } = require("./artist");
const { getAlbumById } = require("./album");
const { getAudioById } = require("./audio");

const options = { limit: 10, key: "name", threshold: -50 };

const find = async ({
  artistsForFind,
  albumsForFind,
  artistCollection,
  albumCollection,
  audioCollection,
  query,
}) => {
  const foundArtists = fuzzysort.go(query, artistsForFind, options);
  const artists = await Promise.all(
    foundArtists
      .map((a) => a.obj)
      .map(async (a) => getArtistAlbums(artistCollection, albumCollection, a.id))
  );
  const foundAlbums = fuzzysort.go(query, albumsForFind, options);
  const albums = await Promise.all(
    foundAlbums.map((a) => a.obj).map(async (a) => getAlbumById(albumCollection, a.id))
  );
  const foundAudios = fuzzysort.go(query, Object.values(audioCollection), options);
  const audios = await Promise.all(
    foundAudios
      .map((a) => a.obj)
      .map(async (a) => getAudioById(audioCollection, albumCollection, a.id))
  );

  return {
    artists,
    albums,
    audios,
  };
};

module.exports = {
  find,
};
