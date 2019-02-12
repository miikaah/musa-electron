const path = require("path");

const SUPPORTED_FILE_TYPES = new Set([".mp3", ".flac", ".ogg"]);

module.exports = {
  isFileTypeSupported: filepath => {
    return SUPPORTED_FILE_TYPES.has(path.extname(filepath));
  }
};
