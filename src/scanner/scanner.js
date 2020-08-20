const fs = require("fs");
const fsPromises = require("fs").promises;
const { parse, join, sep } = require("path");
const {
  negate,
  defaultTo,
  get,
  isUndefined,
  flatten,
  endsWith,
} = require("lodash");
const { getSongMetadata } = require("./metadata");
const { isSupportedFileType, isHiddenFile } = require("../util");

const Bottleneck = require("bottleneck");

const INIT = "INIT";
const UPDATE_LIBRARY_LISTINGS = "UPDATE_LIBRARY_LISTINGS";

const cpus = require("os").cpus().length;

// The thread pool is running at concurrency of 4 so this is
// actually 4 * 3 = 12 simultaneous processes at maximum.
//
// On Windows this is 3 * 12 since Windows spawns
// two helper processes  for ffprobe.
const bottleneck = new Bottleneck({
  maxConcurrent: cpus < 3 ? cpus : 3,
});

async function create(obj) {
  switch (obj.msg) {
    case INIT:
    case UPDATE_LIBRARY_LISTINGS:
      return init(obj.payload);
    default:
      return;
  }
}

async function init({ path, folderName }) {
  return scanArtistFolder(path, folderName);
}

async function scanArtistFolder(path, folderName) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, { withFileTypes: true }, async (err, files) => {
      if (err) return reject(err);

      const albums = await scanAlbumFolder(
        path,
        files.filter(negate(isHiddenFile))
      );

      const songs = files
        .filter((file) => !file.isDirectory())
        .filter(negate(isHiddenFile))
        .map((file) => ({
          ...file,
          path: join(path, file.name),
        }))
        .filter((song) => isSupportedFileType(song.path));

      const songsWithMetadata = await getSongsWithMetadata(songs);
      const emptyAlbum = {
        date: "2525",
        genre: "",
        name: "undefined",
        songs: songsWithMetadata,
      };

      resolve({
        name: folderName,
        path,
        albums:
          Array.isArray(songsWithMetadata) && songsWithMetadata.length > 0
            ? flatten(albums.concat(emptyAlbum))
            : flatten(albums),
      });
    });
  });
}

async function scanAlbumFolder(path, files) {
  return new Promise(async (resolve, reject) => {
    if (files.length < 1) return resolve([]);
    const allSongs = [];
    try {
      await Promise.all(
        files.map(async (file) => {
          const songs = await bottleneck.schedule(async () => {
            // For recursion
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
          allSongs.filter((song) => isSupportedFileType(song.path)),
          path
        )
      );
    } catch (e) {
      console.error("(scanAlbumFolder)", e);
      reject(e);
    }
  });
}

async function getDirStructureForSubDir(file, path, parent) {
  const childPath = join(path, file.name);
  const song = { name: file.name, path: childPath };

  if (!file.isDirectory()) return parent.songs.push(song);

  const files = fs.readdirSync(childPath, { withFileTypes: true });
  await Promise.all(
    files
      .filter(negate(isHiddenFile))
      .map((file) => getDirStructureForSubDir(file, childPath, parent))
  );
  return parent;
}

async function getSongsWithMetadata(songs) {
  return Promise.all(
    songs.map(async (song) => {
      let metadata = {};
      try {
        metadata = await getSongMetadata(song.path);
      } catch (e) {
        console.error(e);
      }
      return {
        ...song,
        metadata,
      };
    })
  );
}

// The albums are first reduced to filesystem folders
// and then those folders are combined together to form
// singular albums from multiple directories.
//
// *  if dir A is a double album that has 2 discs
//    it's assumed those discs might be in their own directories.
//
// *  It also works with a single album that has a subdirectory.
//
// *  The album covers are looked for first in the album ROOT dir
//    and afterwards greedily from any subdirectories.
//
async function getAlbumsBySongs(songs, path) {
  const songsWithMetadata = await getSongsWithMetadata(songs);
  const albums = reduceSongsToAlbumsByPath(songsWithMetadata);
  const reducedAlbums = reduceAlbumsByPath(Object.values(albums), path);
  const albumsAsArray = (
    await Promise.all(
      Object.keys(reducedAlbums).map(async (folderPath) => {
        const album = reducedAlbums[folderPath];
        return {
          ...album,
          songs: album.songs.sort(byTrackOrName),
          date: mostFrequentStringInArray(
            album.songs.map((s) => get(s, "metadata.date", ""))
          ),
          genre: mostFrequentStringInArray(
            album.songs.map((s) => get(s, "metadata.genre", ""))
          ),
          cover: await getCoverPath(album),
        };
      })
    )
  ).map((a) => {
    // Make sure songs without an album are last in the array
    // Atleast till this day :D
    // Zager & Evans FTW
    if (a.name === "undefined") return { ...a, date: "2525", genre: "" };
    return a;
  });
  return albumsAsArray.sort((a, b) => a.date.localeCompare(b.date));
}

function reduceSongsToAlbumsByPath(songs) {
  return songs.reduce((albums, song) => {
    const path = song.path.replace(`${sep}${song.name}`, "");
    const album = defaultTo(albums[path], { songs: [] });

    album.songs = [...album.songs, song];
    album.path = path;
    album.name = song.metadata.album;

    return { ...albums, [album.path]: album };
  }, {});
}

function reduceAlbumsByPath(albums, path) {
  return albums.reduce((albums, album) => {
    const albumFolderName = album.path.replace(path, "").split(sep)[1];
    const albumFolderPath = join(path, albumFolderName);
    const songs = get(albums, [albumFolderPath, "songs"], []);
    const searchPaths = get(albums, [albumFolderPath, "searchPaths"], []);

    album.songs = [...songs, ...album.songs];

    return {
      ...albums,
      [albumFolderPath]: {
        ...album,
        path: albumFolderPath,
        searchPaths: [...searchPaths, album.path],
      },
    };
  }, {});
}

function byTrackOrName(a, b) {
  return get(a, "metadata.track", a.name).localeCompare(
    get(b, "metadata.track", b.name)
  );
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

async function getCoverPath(album) {
  let { dirPath, pics } = await getPicsByPath(album.path);

  // Could not find cover in album root path.
  // Make a greedy lookup to other directories in this folder.
  if (!pics.length) {
    for (const searchPath of album.searchPaths) {
      ({ dirPath, pics } = await getPicsByPath(searchPath));
      if (pics) break;
    }
  }

  if (!pics.length) return;

  const albumNamePic = pics.find((s) => {
    const parsedName = parse(s);
    const name = parsedName.base
      .replace(parsedName.ext, "")
      .replace(/[/?<>;*|"]/g, "")
      .toLowerCase();
    const aName = `${album.name}`.replace(/[/?<>;*|"]/g, "").toLowerCase();
    return name === aName;
  });

  if (albumNamePic) return join(dirPath, albumNamePic);

  const defaultNamePic = pics.find((pic) => {
    const s = pic.toLowerCase();
    return (
      s.includes("front") ||
      s.includes("cover") ||
      s.includes("_large") ||
      s.includes("folder")
    );
  });

  if (defaultNamePic) return join(dirPath, defaultNamePic);

  // Default to any picture
  return join(dirPath, pics[0]);
}

async function getPicsByPath(path) {
  const dirPath = getPathThatEndsWithSep(path);
  const dir = await fsPromises.readdir(dirPath);
  return {
    dirPath,
    pics: dir
      .map((p) => p.toLowerCase())
      .filter((p) => /(.png|.jpg|.jpeg)$/.test(p)),
  };
}

function getPathThatEndsWithSep(path) {
  if (endsWith(path, sep)) return path;
  return `${path}${sep}`;
}

module.exports = {
  INIT,
  UPDATE_LIBRARY_LISTINGS,
  create,
  init,
};
