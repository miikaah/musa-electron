const fs = require("fs")
const fsPromises = require("fs").promises
const { parse, join, sep } = require("path")
const {
  negate,
  defaultTo,
  omit,
  get,
  isUndefined,
  flatten,
  endsWith
} = require("lodash")
const { getSongMetadata } = require("./metadata")
const { isSupportedFileType, isHiddenFile } = require("./util")

const Bottleneck = require("bottleneck")

const INIT = "INIT"
const UPDATE_SONGS = "UPDATE_SONGS"
const UPDATE_LIBRARY_LISTINGS = "UPDATE_LIBRARY_LISTINGS"
const DELETE_LIBRARY_LISTINGS = "DELETE_LIBRARY_LISTINGS"

const bottleneck = new Bottleneck({ maxConcurrent: 12 })

async function create(obj) {
  switch (obj.msg) {
    case INIT:
      return init(obj.payload)
    case UPDATE_LIBRARY_LISTINGS:
      return updateLibraryByPaths(
        obj.payload.libraryPath,
        new Set(obj.payload.paths)
      )
    case DELETE_LIBRARY_LISTINGS:
      return deleteLibraryListings(
        obj.payload.libraryPath,
        new Set(obj.payload.paths)
      )
    default:
      return
  }
}

async function init({ path, folderName }) {
  return scanArtistFolder(join(path, folderName), folderName)
}

// For debugging
process.on("message", async msg => {
  process.send(JSON.stringify(await create(msg)))
})

async function scanArtistFolder(path, folderName) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, { withFileTypes: true }, async (err, files) => {
      if (err) reject(err)
      const albums = await scanAlbumFolder(
        path,
        files.filter(negate(isHiddenFile)),
        folderName
      )
      const songs = files
        .filter(file => !file.isDirectory())
        .filter(negate(isHiddenFile))
        .map(file => ({
          ...file,
          path: join(path, file.name)
        }))
        .filter(song => isSupportedFileType(song.path))
      const songsWithMetadata = await getSongsWithMetadata(songs)
      const emptyAlbum = {
        date: "2525",
        genre: "",
        name: "undefined",
        songs: songsWithMetadata
      }
      resolve({
        name: folderName,
        path,
        albums:
          Array.isArray(songsWithMetadata) && songsWithMetadata.length > 0
            ? flatten(albums.concat(emptyAlbum))
            : flatten(albums)
      })
    })
  })
}

async function updateLibraryByPaths(libraryPath, pathsSet) {
  return new Promise((resolve, reject) => {
    fs.readdir(libraryPath, { withFileTypes: true }, (err, files) => {
      if (err) reject(err)
      const filesToUpdate = files.filter(file => pathsSet.has(file.name))
      resolve(
        buildLibraryListing(
          libraryPath,
          filesToUpdate.filter(negate(isHiddenFile))
        )
      )
    })
  })
}

async function deleteLibraryListings(libraryPath, pathsSet) {
  return new Promise((resolve, reject) => {
    fs.readdir(libraryPath, { withFileTypes: true }, (err, files) => {
      if (err) reject(err)
      // Find deleted folders
      const deletedFolders = []
      const filesSet = new Set(files.map(file => file.name))
      pathsSet.forEach(folderName => {
        if (!filesSet.has(folderName)) deletedFolders.push(folderName)
      })
      resolve(deletedFolders.map(folderName => join(libraryPath, folderName)))
    })
  })
}

async function buildLibraryListing(path, files) {
  return new Promise(async (resolve, reject) => {
    if (files.length < 1) return []
    const library = []
    try {
      await Promise.all(
        files.map(async file => {
          const artist = await bottleneck.schedule(async () => {
            const parent = {
              name: file.name,
              path: join(path, file.name),
              songs: []
            }
            const listing = await getDirStructureForSubDir(file, path, parent)
            if (!listing.songs) return
            listing.albums = await getAlbumsBySongs(
              listing.songs.filter(song => isSupportedFileType(song.path))
            )
            return listing
          })
          if (artist) {
            library.push(omit(artist, ["songs"]))
          }
        })
      )
      resolve(library)
    } catch (e) {
      reject(e)
    }
  })
}

async function scanAlbumFolder(path, files) {
  return new Promise(async (resolve, reject) => {
    if (files.length < 1) return []
    const allSongs = []
    try {
      await Promise.all(
        files.map(async file => {
          const songs = await bottleneck.schedule(async () => {
            // For recursion
            const parent = { songs: [] }
            const listing = await getDirStructureForSubDir(file, path, parent)
            return listing.songs
          })
          if (songs) {
            allSongs.push(...songs)
          }
        })
      )
      resolve(
        getAlbumsBySongs(
          allSongs.filter(song => isSupportedFileType(song.path)),
          path
        )
      )
    } catch (e) {
      reject(e)
    }
  })
}

async function getDirStructureForSubDir(file, path, parent) {
  const childPath = join(path, file.name)
  const song = { name: file.name, path: childPath }

  if (!file.isDirectory()) return parent.songs.push(song)

  const files = fs.readdirSync(childPath, { withFileTypes: true })
  await Promise.all(
    files
      .filter(negate(isHiddenFile))
      .map(file => getDirStructureForSubDir(file, childPath, parent))
  )
  return parent
}

async function getSongsWithMetadata(songs) {
  return Promise.all(
    songs.map(async song => {
      let metadata = {}
      try {
        metadata = await getSongMetadata(song.path)
      } catch (e) {
        console.error(e)
      }
      return {
        ...song,
        metadata
      }
    })
  )
}

// The albums are first reduced to filesystem folders
// and then those folders are combined together to form
// singular albums from multiple directories.
//
// E.g. if dir A is a double album that has 2 discs
// it's assumed those discs are in their own directories.
//
// It also works with A single album that has a subdirectory.
//
// The album covers are looked for first in the album ROOT dir
// and afterwards greedily from any subdirectories.
async function getAlbumsBySongs(songs, path) {
  const songsWithMetadata = await getSongsWithMetadata(songs)
  const albums = reduceSongsToAlbumsByPath(songsWithMetadata)
  const reducedAlbums = reduceAlbumsByPath(Object.values(albums), path)
  const albumsAsArray = (await Promise.all(
    Object.keys(reducedAlbums).map(async folderPath => {
      const album = reducedAlbums[folderPath]
      return {
        ...album,
        songs: album.songs.sort(byTrackOrName),
        date: mostFrequentStringInArray(
          album.songs.map(s => get(s, "metadata.date", "0"))
        ),
        genre: mostFrequentStringInArray(
          album.songs.map(s => get(s, "metadata.genre", ""))
        ),
        cover: await getCoverPath(album)
      }
    })
  )).map(a => {
    // Make sure songs without an album are last in the array
    // Atleast till this day :D
    // Zager & Evans FTW
    if (a.name === "undefined") return { ...a, date: "2525", genre: "" }
    return a
  })
  return albumsAsArray.sort((a, b) => a.date.localeCompare(b.date))
}

function reduceSongsToAlbumsByPath(songs) {
  return songs.reduce((albums, song) => {
    const path = song.path.replace(`${sep}${song.name}`, "")
    const album = defaultTo(albums[path], { songs: [] })

    album.songs = [...album.songs, song]
    album.path = path
    album.name = song.metadata.album

    return { ...albums, [album.path]: album }
  }, {})
}

function reduceAlbumsByPath(albums, path) {
  return albums.reduce((albums, album) => {
    const albumFolderName = album.path.replace(path, "").split(sep)[1]
    const albumFolderPath = join(path, albumFolderName)
    const songs = get(albums, [albumFolderPath, "songs"], [])
    const searchPaths = get(albums, [albumFolderPath, "searchPaths"], [])

    album.songs = [...songs, ...album.songs]

    return {
      ...albums,
      [albumFolderPath]: {
        ...album,
        path: albumFolderPath,
        searchPaths: [...searchPaths, album.path]
      }
    }
  }, {})
}

function byTrackOrName(a, b) {
  return get(a, "metadata.track", a.name).localeCompare(
    get(b, "metadata.track", b.name)
  )
}

function mostFrequentStringInArray(array) {
  const counts = {}
  let comparison = 0
  let mostFrequent

  for (let i = 0; i < array.length; i++) {
    const word = array[i]

    if (isUndefined(counts[word])) counts[word] = 1
    else counts[word] += 1

    if (counts[word] > comparison) {
      comparison = counts[word]
      mostFrequent = array[i]
    }
  }
  return mostFrequent
}

async function getCoverPath(album) {
  let { dirPath, pics } = await getPicsByPath(album.path)

  // Could not find cover in album root path.
  // Make a greedy lookup to other directories in this folder.
  if (!pics.length) {
    for (const searchPath of album.searchPaths) {
      ;({ dirPath, pics } = await getPicsByPath(searchPath))
      if (pics) break
    }
  }

  if (!pics.length) return

  const albumNamePic = pics.find(s => {
    const parsedName = parse(s)
    const name = parsedName.base
      .replace(parsedName.ext, "")
      .replace(/[/?<>;*|"]/g, "")
      .toLowerCase()
    const aName = `${album.name}`.replace(/[/?<>;*|"]/g, "").toLowerCase()
    return name === aName
  })

  if (albumNamePic) return join(dirPath, albumNamePic)

  const defaultNamePic = pics.find(pic => {
    const s = pic.toLowerCase()
    return (
      s.includes("front") ||
      s.includes("cover") ||
      s.includes("_large") ||
      s.includes("folder")
    )
  })

  if (defaultNamePic) return join(dirPath, defaultNamePic)

  // Default to any picture
  return join(dirPath, pics[0])
}

async function getPicsByPath(path) {
  const dirPath = getPathThatEndsWithSep(path)
  const dir = await fsPromises.readdir(dirPath)
  return {
    dirPath,
    pics: dir
      .map(p => p.toLowerCase())
      .filter(p => /(.png|.jpg|.jpeg)$/.test(p))
  }
}

function getPathThatEndsWithSep(path) {
  if (endsWith(path, sep)) return path
  return `${path}${sep}`
}

module.exports = {
  INIT,
  UPDATE_SONGS,
  UPDATE_LIBRARY_LISTINGS,
  DELETE_LIBRARY_LISTINGS,
  create,
  init
}
