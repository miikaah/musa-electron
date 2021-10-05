const path = require("path");
const fs = require("fs/promises");
const Datastore = require("nedb");
const { getMetadata, UrlSafeBase64 } = require("musa-core");

const { NODE_ENV } = process.env;
const isDev = NODE_ENV === "local";

let audioDb;
let albumDb;
let themeDb;
let libPath;
const initDb = (libraryPath) => {
  libPath = libraryPath;

  const audioDbFile = `${isDev ? ".dev" : ""}.musa.audio.db`;
  audioDb = new Datastore({
    filename: path.join(libraryPath, audioDbFile),
  });
  audioDb.loadDatabase();

  const albumDbFile = `${isDev ? ".dev" : ""}.musa.album.db`;
  albumDb = new Datastore({
    filename: path.join(libraryPath, albumDbFile),
  });
  albumDb.loadDatabase();

  const themeDbFile = `${isDev ? ".dev" : ""}.musa.theme.db`;
  themeDb = new Datastore({
    filename: path.join(libraryPath, themeDbFile),
  });
  themeDb.loadDatabase();
};

const insertAudio = async (file) => {
  if (!file) {
    return;
  }
  const { id, filename } = file;
  const metadata = await getMetadata(libPath, { id, quiet: true });

  audioDb.insert({
    path_id: id,
    modified_at: new Date().toISOString(),
    filename,
    metadata,
  });
};

const upsertAudio = async (file) => {
  const { id, filename, quiet = false } = file;

  if (!id || !filename) {
    return;
  }

  const filepath = path.join(libPath, UrlSafeBase64.decode(id));
  const stats = await fs.stat(filepath);
  const modifiedAt = new Date(stats.mtimeMs);
  const dbAudio = await getAudio(id);

  if (!dbAudio) {
    const metadata = await getMetadata(libPath, { id, quiet });

    console.log("Inserting audio", id);
    audioDb.insert({
      path_id: id,
      modified_at: new Date().toISOString(),
      filename,
      metadata,
    });
  } else if (modifiedAt.getTime() > new Date(dbAudio.modified_at).getTime()) {
    const metadata = await getMetadata(libPath, { id, quiet });

    console.log("Updating audio", filename, "because it was modified at", modifiedAt);
    audioDb.update(
      { path_id: id },
      {
        $set: {
          modified_at: modifiedAt.toISOString(),
          filename,
          metadata,
        },
      }
    );
  }
};

const upsertAlbum = async (file) => {
  if (!file) {
    return;
  }
  const { id, album } = file;
  const albumAudioIds = album.files.map(({ id }) => id);
  const dbAlbum = await getAlbum(id);
  const dbAlbumAudios = await getAudiosByIds(albumAudioIds);
  const modifiedAts = dbAlbumAudios.map(({ modified_at }) => new Date(modified_at).getTime());
  const lastModificationTime = Math.max(...modifiedAts);
  const dbAlbumAudio = dbAlbumAudios[0];

  if (!dbAlbumAudio) {
    return;
  }

  const metadata = buildAlbumMetadata(dbAlbumAudio.metadata);
  if (!dbAlbum) {
    albumDb.insert({
      path_id: id,
      modified_at: new Date().toISOString(),
      filename: album.name,
      metadata,
    });
  } else if (new Date(dbAlbum.modified_at).getTime() < lastModificationTime) {
    console.log(
      "Updating album",
      album.name,
      "because it was modified at",
      new Date(lastModificationTime).toISOString()
    );
    albumDb.update(
      { path_id: id },
      {
        modified_at: new Date().toISOString(),
        filename: album.name,
        metadata,
      }
    );
  }
};

const buildAlbumMetadata = (metadata) => {
  const { year, album, artists, artist, albumArtist, genre, dynamicRangeAlbum } = metadata;
  return {
    year,
    album,
    artists,
    artist,
    albumArtist,
    genre,
    dynamicRangeAlbum,
  };
};

const getAudio = async (id) => {
  return new Promise((resolve, reject) => {
    audioDb.findOne({ path_id: id }, (err, audio) => {
      if (err) {
        reject(err);
      } else {
        resolve(audio);
      }
    });
  });
};

const getAllAudios = async () => {
  return new Promise((resolve, reject) => {
    audioDb.find({}, (err, audios) => {
      if (err) {
        reject(err);
      } else {
        resolve(audios);
      }
    });
  });
};

const getAudiosByIds = async (ids) => {
  return new Promise((resolve, reject) => {
    audioDb.find({ path_id: { $in: ids } }, (err, audios) => {
      if (err) {
        reject(err);
      } else {
        resolve(audios);
      }
    });
  });
};

const getAlbum = async (id) => {
  return new Promise((resolve, reject) => {
    albumDb.findOne({ path_id: id }, (err, album) => {
      if (err) {
        reject(err);
      } else {
        resolve(album);
      }
    });
  });
};

const enrichAlbums = async (albumCollection, artist) => {
  return Promise.all(
    artist.albums.map(async ({ id, name, url, coverUrl, firstAlbumAudio }) => {
      let year = null;
      let albumName = null;

      if (firstAlbumAudio && firstAlbumAudio.id) {
        const audio = await getAudio(firstAlbumAudio.id);

        year = audio?.metadata?.year;
        albumName = audio?.metadata?.album;
      }

      const files = await enrichAlbumFiles(albumCollection[id]);

      return {
        id,
        name: albumName || name,
        url,
        coverUrl,
        year,
        files,
      };
    })
  );
};

const enrichAlbumFiles = async (album) => {
  const audioIds = album.files.map(({ id }) => id);
  const files = await getAudiosByIds(audioIds);
  const trackNumbers = files.map((file) => file?.metadata?.track?.no);
  const maxTrackNo = Math.max(...trackNumbers);
  const pad = `${maxTrackNo}`.length;
  const padLen = pad < 2 ? 2 : pad;

  const mergedFiles = await Promise.all(
    album.files.map(async ({ id, name: filename, fileUrl }) => {
      const file = files.find((f) => f.path_id === id);
      const name = file?.metadata?.title || filename;
      const trackNo = `${file?.metadata?.track?.no || ""}`;
      const diskNo = `${file?.metadata?.disk?.no || ""}`;
      const track = `${diskNo ? `${diskNo}.` : ""}${trackNo.padStart(padLen, "0")}`;

      return {
        id: file.path_id,
        name,
        track,
        fileUrl,
        metadata: file?.metadata,
      };
    })
  );

  mergedFiles.sort((a, b) => a.track.localeCompare(b.track));

  return mergedFiles;
};

const getAllThemes = async () => {
  return new Promise((resolve, reject) => {
    themeDb.find({}, (err, themes) => {
      if (err) {
        reject(err);
      } else {
        resolve(themes);
      }
    });
  });
};

const getTheme = async (id) => {
  return new Promise((resolve, reject) => {
    themeDb.findOne({ path_id: id }, (err, theme) => {
      if (err) {
        reject(err);
      } else {
        resolve(theme);
      }
    });
  });
};

const insertTheme = async (id, colors) => {
  return new Promise((resolve, reject) => {
    themeDb.insert(
      {
        _id: id,
        path_id: id,
        modified_at: new Date().toISOString(),
        colors,
      },
      (err, newTheme) => {
        if (err) {
          reject(err);
        } else {
          resolve(newTheme);
        }
      }
    );
  });
};

module.exports = {
  insertAudio,
  getAllAudios,
  upsertAudio,
  getAlbum,
  upsertAlbum,
  getAudio,
  getAudiosByIds,
  enrichAlbums,
  enrichAlbumFiles,
  getAllThemes,
  insertTheme,
  getTheme,
  initDb,
};
