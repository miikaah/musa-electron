const fs = require("fs");
const homedir = require("os").homedir();
// const chokidar = require("chokidar");
const {
  negate,
  startsWith,
  defaultTo,
  omit,
  get,
  isUndefined
} = require("lodash");
const { getSongMetadata } = require("./metadata");
const { isFileTypeSupported } = require("./util");
const Bottleneck = require("bottleneck");

const LIBRARY_PATH = `${homedir}/Documents/musat`;

const bottleneck = new Bottleneck({ maxConcurrent: 12 });

function initLibrary(mainWindow) {
  // const watcher = chokidar.watch(LIBRARY_PATH, {
  //   ignored: /^\./,
  //   ignoreInitial: true
  // });
  // watcher.on("add", path => {
  //   console.log("add", path);
  //   updateLibraryListing(mainWindow, path);
  // });
  // watcher.on("change", path => console.log("change", path));
  // watcher.on("unlink", path => console.log("unlink", path));
}

function getLibraryListing(event) {
  fs.readdir(LIBRARY_PATH, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.error(err);
      return [];
    }
    buildLibraryListing(
      LIBRARY_PATH,
      files.filter(negate(isHiddenFile)),
      event.sender
    );
  });
}

// function updateLibraryListing(mainWindow, path) {
//   mainWindow.webContents.send("libraryListing", []);
//   fs.readdir(path, { withFileTypes: true }, (err, files) => {
//     if (err) {
//       console.error(err);
//       return [];
//     }
//     buildLibraryListing(path, files.filter(negate(isHiddenFile)), {
//       send: mainWindow.webContents.send
//     });
//   });
// }

const isHiddenFile = file => startsWith(file.name, ".");

function buildLibraryListing(path, files, sender) {
  if (files.length < 1) return [];
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
      sender.send("libraryListing", omit(listing, ["songs"]));
    }
    if (index === files.length - 1) {
      sender.send("libraryListingEnd");
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

async function getAlbumsBySongs(songs) {
  const songsWithMetadata = await Promise.all(
    songs.map(async song => ({
      ...song,
      metadata: await getFileMetadata(song.path)
    }))
  );
  const albums = reduceSongsToAlbums(songsWithMetadata);
  const albumsAsArray = Object.keys(albums)
    .map(name => ({
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
      )
    }))
    .map(a => {
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

module.exports = {
  initLibrary,
  getLibraryListing
};
