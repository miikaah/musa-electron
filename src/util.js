const path = require("path");
const { startsWith } = require("lodash");

const SUPPORTED_AUDIO_TYPES = new Set([".mp3", ".flac", ".ogg"]);
const SUPPORTED_IMAGE_TYPES = new Set([".jpeg", ".jpg", ".png"]);

module.exports = {
  isSupportedFileType: filepath => {
    return SUPPORTED_AUDIO_TYPES.has(path.extname(filepath));
  },
  isWatchableFile: filepath => {
    return (
      SUPPORTED_AUDIO_TYPES.has(path.extname(filepath)) ||
      SUPPORTED_IMAGE_TYPES.has(path.extname(filepath))
    );
  },
  isHiddenFile: file => startsWith(file.name, "."),
  mapKeysToCaseShallow: (obj, casing) => {
    return Object.keys(obj).reduce((acc, key) => {
      acc[casing(key)] = obj[key];
      return acc;
    }, {});
  },
  getUrl: () => {
    return process.env.IS_DEV
      ? "http://localhost:3666"
      : `file://${path.join(__dirname, "../build/index.html")}`;
  }
};
