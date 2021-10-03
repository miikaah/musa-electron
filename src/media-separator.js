const path = require("path");
const { sep } = path;
const { imageExts } = require("./fs");
const UrlSafeBase64 = require("./urlsafe-base64");

const createMediaCollection = (files, baseUrl, isElectron) => {
  const artistsCol = {};
  const albumsCol = {};
  const audioCol = {};
  const imagesCol = {};

  const albumSet = new Set();

  for (const file of files) {
    const [artistName, ...rest] = file.split(sep);
    const artistId = UrlSafeBase64.encode(artistName);
    const fileId = UrlSafeBase64.encode(file);
    const artistUrl = isElectron ? "" : getUrl(baseUrl, "artist", artistId);
    const audioUrl = isElectron ? "" : getUrl(baseUrl, "audio", fileId);
    const imageUrl = isElectron ? "" : getUrl(baseUrl, "image", fileId);
    const url = isElectron
      ? getElectronUrl(baseUrl, file)
      : getUrl(baseUrl, "file", fileId);

    if (!artistsCol[artistId]) {
      artistsCol[artistId] = {
        url: artistUrl,
        name: artistName,
        albums: [],
        files: [],
        images: [],
      };
    }

    // First pass
    if (rest.length === 1) {
      // This file is in the artist folder
      rest.forEach((name) => {
        const fileWithInfo = {
          id: fileId,
          name,
          artistName,
          artistUrl,
          url,
          fileUrl: url,
        };

        if (isImage(name)) {
          artistsCol[artistId].images.push({
            id: fileId,
            name,
            url: imageUrl,
            fileUrl: url,
          });
          imagesCol[fileId] = fileWithInfo;
        } else {
          artistsCol[artistId].files.push({
            id: fileId,
            name,
            url: audioUrl,
            fileUrl: url,
          });
          audioCol[fileId] = fileWithInfo;
        }
      });
    } else {
      // This file is in an album folder
      const [albumName, ...albumRest] = rest;
      const albumId = UrlSafeBase64.encode(path.join(artistName, albumName));
      const albumUrl = isElectron ? "" : getUrl(baseUrl, "album", albumId);
      const fileName = albumRest[albumRest.length - 1];

      if (!albumsCol[albumId]) {
        albumsCol[albumId] = {
          name: albumName,
          artistName,
          artistUrl,
          files: [],
          images: [],
        };
      }

      if (!albumSet.has(albumId)) {
        albumSet.add(albumId);
        artistsCol[artistId].albums.push({
          id: albumId,
          name: albumName,
          url: albumUrl,
        });
      }

      const fileWithInfo = {
        id: fileId,
        name: fileName,
        artistName,
        artistUrl,
        albumId,
        albumName,
        albumUrl,
        url,
      };

      if (isImage(fileName)) {
        albumsCol[albumId].images.push({
          id: fileId,
          name: fileName,
          url: imageUrl,
          fileUrl: url,
        });
        imagesCol[fileId] = fileWithInfo;

        const parsedFile = path.parse(fileName);
        if (isAlbumCoverImage(albumName, parsedFile)) {
          albumsCol[albumId].coverUrl = url;

          const albumIndex = artistsCol[artistId].albums.findIndex(
            (a) => a.name === albumName
          );
          if (albumIndex > -1) {
            const album = artistsCol[artistId].albums[albumIndex];
            album.coverUrl = url;
          }
        }
      } else {
        albumsCol[albumId].files.push({
          id: fileId,
          name: fileName,
          url: audioUrl,
          fileUrl: url,
        });
        audioCol[fileId] = fileWithInfo;
      }
    }
  }

  // Second pass for enriching artist album lists with missing album covers
  // and first album audios needed for artist metadata creation
  Object.keys(artistsCol).forEach((key) => {
    artistsCol[key].albums.forEach((a) => {
      const id = a.id;
      const files = albumsCol[id].files;

      // This code has to be here before early return
      if (!a.firstAlbumAudio && typeof files[0] === "object") {
        const { id, name } = files[0];
        a.firstAlbumAudio = { id, name };
      }

      if (a.coverUrl) {
        return;
      }

      const images = albumsCol[id].images;

      // Find an image with a default name
      for (const img of images) {
        if (isDefaultNameImage(img.name)) {
          const { fileUrl } = img;

          a.coverUrl = fileUrl;
          albumsCol[id].coverUrl = fileUrl;
          break;
        }
      }

      // Take the first image
      if (!a.coverUrl && images.length) {
        const { fileUrl } = images[0];

        a.coverUrl = fileUrl;
        albumsCol[id].coverUrl = fileUrl;
      }
    });
  });

  return { artistsCol, albumsCol, audioCol, imagesCol };
};

const getUrl = (baseUrl, path, id) => {
  return `${baseUrl}/${path}/${id}`;
};

const getElectronUrl = (baseUrl, filepath) => {
  return path.join("file://", baseUrl, filepath);
};

const isImage = (filename) => {
  return imageExts.some((e) => filename.toLowerCase().endsWith(e));
};

const isAlbumCoverImage = (albumName, img) => {
  return albumName.toLowerCase().includes(img.name.toLowerCase());
};

const isDefaultNameImage = (pic) => {
  const s = pic.toLowerCase();
  return (
    s.includes("front") ||
    s.includes("cover") ||
    s.includes("_large") ||
    s.includes("folder")
  );
};

module.exports = {
  createMediaCollection,
};
