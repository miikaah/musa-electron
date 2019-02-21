const fs = require("fs");
const fsPromises = require("fs").promises;
const homedir = require("os").homedir();
const { basename } = require("path");
const {
  negate,
  startsWith,
  defaultTo,
  omit,
  get,
  isUndefined
} = require("lodash");
const { getSongMetadata } = require("./metadata");
const { isFileTypeSupported, getArtistPath } = require("./util");
const Bottleneck = require("bottleneck");

const LIBRARY_PATH = `${homedir}/Documents/musat`;
const INIT = "INIT";
const UPDATE_SONGS = "UPDATE_SONGS";
const UPDATE_LIBRARY_LISTINGS = "UPDATE_LIBRARY_LISTINGS";
const DELETE_LIBRARY_LISTINGS = "DELETE_LIBRARY_LISTINGS";

const bottleneck = new Bottleneck({ maxConcurrent: 12 });

process.on("message", obj => {
  switch (obj.msg) {
    case INIT:
      getLibraryListing();
      return;
    case UPDATE_SONGS:
      updateSongsByPaths(obj.payload);
      return;
    case UPDATE_LIBRARY_LISTINGS:
      updateLibraryByPaths(new Set(obj.payload));
      return;
    case DELETE_LIBRARY_LISTINGS:
      deleteLibraryListings(new Set(obj.payload));
      return;
    default:
      return;
  }
});

function getLibraryListing() {
  fs.readdir(LIBRARY_PATH, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return [];
    }
    buildLibraryListing(LIBRARY_PATH, files.filter(negate(isHiddenFile)));
  });
}

function updateSongsByPaths(paths) {
  paths.forEach(async (path, index) => {
    const metadata = await bottleneck.schedule(async () =>
      getFileMetadata(path)
    );
    if (metadata) {
      process.send({
        msg: "updateSongMetadata",
        payload: {
          path,
          name: basename(path),
          metadata,
          artistPath: getArtistPath(path, LIBRARY_PATH)
        }
      });
    }
    if (index === paths.length - 1) {
      process.send({ msg: "updateSongMetadataEnd" });
    }
  });
}

function updateLibraryByPaths(pathsSet) {
  fs.readdir(LIBRARY_PATH, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return [];
    }
    const filesToUpdate = files.filter(file => pathsSet.has(file.name));
    buildLibraryListing(
      LIBRARY_PATH,
      filesToUpdate.filter(negate(isHiddenFile))
    );
  });
}

function deleteLibraryListings(pathsSet) {
  fs.readdir(LIBRARY_PATH, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return [];
    }
    // Find deleted folders
    const deletedFolders = [];
    const filesSet = new Set(files.map(file => file.name));
    pathsSet.forEach(folderName => {
      if (!filesSet.has(folderName)) deletedFolders.push(folderName);
    });
    process.send({
      msg: "deleteLibraryListings",
      payload: deletedFolders.map(folderName => `${LIBRARY_PATH}/${folderName}`)
    });
    // Kill this fork
    process.send({ msg: "deleteLibraryListingsEnd" });
  });
}

const isHiddenFile = file => startsWith(file.name, ".");

function buildLibraryListing(path, files) {
  if (files.length < 1) return [];
  try {
    files.forEach(async (file, index) => {
      const listing = await bottleneck.schedule(async () => {
        const parent = {
          name: file.name,
          path: `${path}/${file.name}`,
          songs: []
        };
        const listing = await getDirStructureForSubDir(file, path, parent);
        listing.albums = await getAlbumsBySongs(
          listing.songs.filter(song => isFileTypeSupported(song.path))
        );
        return listing;
      });
      if (listing) {
        process.send({
          msg: "libraryListing",
          payload: omit(listing, ["songs"])
        });
      }
      if (index === files.length - 1) {
        process.send({ msg: "libraryListingEnd" });
      }
    });
  } catch (e) {
    console.error(e);
  }
}

async function getDirStructureForSubDir(file, path, parent) {
  const childPath = `${path}/${file.name}`;
  const song = { name: file.name, path: childPath };

  if (!file.isDirectory()) return parent.songs.push(song);

  const files = fs.readdirSync(childPath, { withFileTypes: true });
  await Promise.all(
    files
      .filter(negate(isHiddenFile))
      .map(file => getDirStructureForSubDir(file, childPath, parent))
  );
  return parent;
}

async function getAlbumsBySongs(songs) {
  const songsWithMetadata = await Promise.all(
    songs.map(async song => ({
      ...song,
      metadata: await getFileMetadata(song.path)
    }))
  );
  const albums = reduceSongsToAlbums(songsWithMetadata);
  const albumsAsArray = (await Promise.all(
    Object.keys(albums).map(async name => ({
      name,
      songs: albums[name].songs.sort(
        (a, b) =>
          get(a, "metadata.track", a.name) - get(b, "metadata.track", b.name)
      ),
      date: mostFrequentStringInArray(
        albums[name].songs.map(s => get(s, "metadata.date", "0"))
      ),
      genre: mostFrequentStringInArray(
        albums[name].songs.map(s => get(s, "metadata.genre", ""))
      ),
      cover: await getCoverPath(albums[name].path, name)
    }))
  )).map(a => {
    // Make sure songs without an album are last in the array
    // Atleast till this day :D
    // Zager & Evans FTW
    if (a.name === "undefined") return { ...a, date: "2525", genre: "" };
    return a;
  });
  return albumsAsArray.sort((a, b) => a.date.localeCompare(b.date));
}

async function getFileMetadata(path) {
  try {
    return getSongMetadata(path);
  } catch (e) {
    console.error(e);
  }
}

function reduceSongsToAlbums(songs) {
  return songs.reduce((albums, song) => {
    const album = defaultTo(albums[song.metadata.album], { songs: [] });
    album.songs = [...album.songs, song];
    album.path = song.path.replace(song.name, "");
    return { ...albums, [song.metadata.album]: album };
  }, {});
}

function mostFrequentStringInArray(array) {
  const counts = {};
  let comparison = 0;
  let mostFrequent;

  for (let i = 0; i < array.length; i++) {
    const word = array[i];

    if (isUndefined(counts[word])) counts[word] = 1;
    else counts[word] += 1;

    if (counts[word] > comparison) {
      comparison = counts[word];
      mostFrequent = array[i];
    }
  }
  return mostFrequent;
}

async function getCoverPath(path, albumName) {
  const dir = await fsPromises.readdir(path);
  const pics = dir.filter(p => /(.png|.jpg)$/.test(p));
  if (!pics.length) return;
  const albumNamePic = pics.find(
    s =>
      get(s.split("."), "0", "").toLowerCase() === `${albumName}`.toLowerCase()
  );
  if (albumNamePic) return path + albumNamePic;
  const defaultNamePic = pics.find(s =>
    /^(((C|c)over)|((f|F)(ront|older)))(.png|.jpg)$/.test(s.toLowerCase())
  );
  if (defaultNamePic) return path + defaultNamePic;
  return path + pics[0];
}

module.exports = {
  INIT,
  UPDATE_SONGS,
  UPDATE_LIBRARY_LISTINGS,
  DELETE_LIBRARY_LISTINGS
};
