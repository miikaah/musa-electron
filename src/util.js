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
  getArtistPath: (filepath, libraryPath) => {
    return (
      libraryPath + "/" + filepath.split(`${libraryPath}/`)[1].split("/")[0]
    );
  },
  isHiddenFile: file => startsWith(file.name, ".")
};
