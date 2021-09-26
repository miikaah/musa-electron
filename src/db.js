const path = require("path");
const fs = require("fs/promises");
const Datastore = require("nedb");
const { getMetadata } = require("./metadata");
const UrlSafeBase64 = require("./urlsafe-base64");

const { MUSA_SRC_PATH } = process.env;
const audioDb = new Datastore({
  filename: path.join(MUSA_SRC_PATH, ".musa.audio.db"),
});
audioDb.loadDatabase();

const albumDb = new Datastore({
  filename: path.join(MUSA_SRC_PATH, ".musa.album.db"),
});
albumDb.loadDatabase();

const insertAudio = async (file) => {
  if (!file) {
    return;
  }
  const { id, filename } = file;
  const metadata = await getMetadata({ id, quiet: true });

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

  const filepath = path.join(MUSA_SRC_PATH, UrlSafeBase64.decode(id));
  const stats = await fs.stat(filepath);
  const modifiedAt = new Date(stats.mtimeMs);
  const dbAudio = await getAudio(id);

  if (!dbAudio) {
    const metadata = await getMetadata({ id, quiet });

    console.log("Inserting audio", id);
    audioDb.insert({
      path_id: id,
      modified_at: new Date().toISOString(),
      filename,
      metadata,
    });
  } else if (modifiedAt.getTime() > new Date(dbAudio.modified_at).getTime()) {
    const metadata = await getMetadata({ id, quiet });

    console.log(
      "Updating audio",
      filename,
      "because it was modified at",
      modifiedAt
    );
    dbAudio.update(
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
  const modifiedAts = dbAlbumAudios.map(({ modified_at }) =>
    new Date(modified_at).getTime()
  );
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
  const {
    year,
    album,
    artists,
    artist,
    albumArtist,
    genre,
    dynamicRangeAlbum,
  } = metadata;
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

const enrichAlbumFiles = async (album) => {
  const audioIds = album.files.map(({ id }) => id);
  const files = await getAudiosByIds(audioIds);
  const trackNumbers = files.map((file) => file?.metadata?.track?.no);
  const maxTrackNo = Math.max(...trackNumbers);
  const pad = `${maxTrackNo}`.length;
  const padLen = pad < 2 ? 2 : pad;

  return Promise.all(
    album.files.map(async ({ id, name: filename, url, fileUrl }) => {
      const file = files.find((f) => f.path_id === id);
      const name = file?.metadata?.title || filename;
      const trackNo = `${file?.metadata?.track?.no || ""}`;
      const diskNo = `${file?.metadata?.disk?.no || ""}`;
      const track = `${diskNo ? `${diskNo}.` : ""}${trackNo.padStart(
        padLen,
        "0"
      )}`;

      return {
        ...file,
        name,
        track,
        url,
        fileUrl,
        metadata: file?.metadata,
      };
    })
  );
};

module.exports = {
  insertAudio,
  getAllAudios,
  upsertAudio,
  upsertAlbum,
  getAudio,
  getAudiosByIds,
  enrichAlbumFiles,
};
