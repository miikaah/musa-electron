const { getAudio } = require("../db");

const getAudioById = async (audioCollection, albumCollection, id) => {
  const audio = audioCollection[id];

  if (!audio) {
    return {};
  }

  const album = albumCollection[audio.albumId];
  const dbAudio = await getAudio(id);
  const name = dbAudio?.metadata?.title || audio.name;
  const trackNo = `${dbAudio?.metadata?.track?.no || ""}`;
  const diskNo = `${dbAudio?.metadata?.disk?.no || ""}`;
  const track = `${diskNo ? `${diskNo}.` : ""}${trackNo.padStart(2, "0")}`;

  return {
    ...audio,
    name,
    track,
    fileUrl: audio.url,
    coverUrl: album?.coverUrl,
    metadata: dbAudio?.metadata,
  };
};

module.exports = {
  getAudioById,
};
