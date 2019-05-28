const fs = require("fs");
const fsPromises = require("fs").promises;
const homedir = require("os").homedir();
const { basename, parse } = require("path");
const {
  negate,
  defaultTo,
  omit,
  get,
  isUndefined,
  flatten
} = require("lodash");
const { getSongMetadata } = require("./metadata");
const { isSupportedFileType, getArtistPath, isHiddenFile } = require("./util");

const Bottleneck = require("bottleneck");

const LIBRARY_PATH = `${homedir}/Documents/musat`;
const INIT = "INIT";
const UPDATE_SONGS = "UPDATE_SONGS";
const UPDATE_LIBRARY_LISTINGS = "UPDATE_LIBRARY_LISTINGS";
const DELETE_LIBRARY_LISTINGS = "DELETE_LIBRARY_LISTINGS";

const bottleneck = new Bottleneck({ maxConcurrent: 12 });

async function create(obj) {
  switch (obj.msg) {
    case INIT:
      return init(obj.payload);
    case UPDATE_SONGS:
      return updateSongsByPaths(obj.payload);
    case UPDATE_LIBRARY_LISTINGS:
      return updateLibraryByPaths(new Set(obj.payload));
    case DELETE_LIBRARY_LISTINGS:
      return deleteLibraryListings(new Set(obj.payload));
    default:
      return;
  }
}

async function init(folderName) {
  return scanArtistFolder(`${LIBRARY_PATH}/${folderName}`, folderName);
}

// For debugging
process.on("message", create);

async function scanArtistFolder(path, folderName) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, { withFileTypes: true }, async (err, files) => {
      if (err) reject(err);
      const albums = await scanAlbumFolder(
        path,
        files.filter(negate(isHiddenFile)),
        folderName
      );
      const songs = files
        .filter(file => !file.isDirectory())
        .filter(negate(isHiddenFile))
        .map(file => ({
          ...file,
          path: `${path}/${file.name}`
        }))
        .filter(song => isSupportedFileType(song.path));
      const songsWithMetadata = await getSongsWithMetadata(songs);
      const emptyAlbum = {
        date: "2525",
        genre: "",
        name: "undefined",
        songs: songsWithMetadata
      };
      resolve({
        name: folderName,
        path,
        albums:
          Array.isArray(songsWithMetadata) && songsWithMetadata.length > 0
            ? flatten(albums.concat(emptyAlbum))
            : flatten(albums)
      });
    });
  });
}

async function updateSongsByPaths(paths) {
  return new Promise((resolve, reject) => {
    try {
      paths.forEach(async path => {
        const metadata = await bottleneck.schedule(async () =>
          getSongMetadata(path)
        );
        resolve({
          path,
          name: basename(path),
          metadata,
          artistPath: getArtistPath(path, LIBRARY_PATH)
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function updateLibraryByPaths(pathsSet) {
  return new Promise((resolve, reject) => {
    fs.readdir(LIBRARY_PATH, { withFileTypes: true }, (err, files) => {
      if (err) reject(err);
      const filesToUpdate = files.filter(file => pathsSet.has(file.name));
      resolve(
        buildLibraryListing(
          LIBRARY_PATH,
          filesToUpdate.filter(negate(isHiddenFile))
        )
      );
    });
  });
}

async function deleteLibraryListings(pathsSet) {
  return new Promise((resolve, reject) => {
    fs.readdir(LIBRARY_PATH, { withFileTypes: true }, (err, files) => {
      if (err) reject(err);
      // Find deleted folders
      const deletedFolders = [];
      const filesSet = new Set(files.map(file => file.name));
      pathsSet.forEach(folderName => {
        if (!filesSet.has(folderName)) deletedFolders.push(folderName);
      });
      resolve(
        deletedFolders.map(folderName => `${LIBRARY_PATH}/${folderName}`)
      );
    });
  });
}

async function buildLibraryListing(path, files) {
  return new Promise(async (resolve, reject) => {
    if (files.length < 1) return [];
    const library = [];
    try {
      await Promise.all(
        files.map(async file => {
          const artist = await bottleneck.schedule(async () => {
            const parent = {
              name: file.name,
              path: `${path}/${file.name}`,
              songs: []
            };
            const listing = await getDirStructureForSubDir(file, path, parent);
            if (!listing.songs) return;
            listing.albums = await getAlbumsBySongs(
              listing.songs.filter(song => isSupportedFileType(song.path))
            );
            return listing;
          });
          if (artist) {
            library.push(omit(artist, ["songs"]));
          }
        })
      );
      resolve(library);
    } catch (e) {
      reject(e);
    }
  });
}

async function scanAlbumFolder(path, files) {
  return new Promise(async (resolve, reject) => {
    if (files.length < 1) return [];
    const allSongs = [];
    try {
      await Promise.all(
        files.map(async file => {
          const songs = await bottleneck.schedule(async () => {
            const parent = { songs: [] };
            const listing = await getDirStructureForSubDir(file, path, parent);
            return listing.songs;
          });
          if (songs) {
            allSongs.push(...songs);
          }
        })
      );
      resolve(
        getAlbumsBySongs(
          allSongs.filter(song => isSupportedFileType(song.path))
        )
      );
    } catch (e) {
      reject(e);
    }
  });
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

async function getSongsWithMetadata(songs) {
  return Promise.all(
    songs.map(async song => {
      let metadata = {};
      try {
        metadata = await getSongMetadata(song.path);
      } catch (e) {
        console.error(e);
      }
      return {
        ...song,
        metadata
      };
    })
  );
}

async function getAlbumsBySongs(songs) {
  const songsWithMetadata = await getSongsWithMetadata(songs);
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
  const pics = dir.filter(p => /(.png|.jpg|.jpeg)$/.test(p));
  if (!pics.length) return;
  const albumNamePic = pics.find(s => {
    const parsedName = parse(s);
    const name = parsedName.base
      .replace(parsedName.ext, "")
      .replace(/[/?<>;*|"]/g, "")
      .toLowerCase();
    const aName = `${albumName}`.replace(/[/?<>;*|"]/g, "").toLowerCase();
    return name === aName;
  });
  if (albumNamePic) return path + albumNamePic;
  const defaultNamePic = pics.find(pic => {
    const s = pic.toLowerCase();
    return (
      s.includes("front") ||
      s.includes("cover") ||
      s.includes("_large") ||
      s.includes("folder")
    );
  });
  if (defaultNamePic) return path + defaultNamePic;
  return path + pics[0];
}

module.exports = {
  INIT,
  UPDATE_SONGS,
  UPDATE_LIBRARY_LISTINGS,
  DELETE_LIBRARY_LISTINGS,
  create,
  init
};
