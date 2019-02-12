const { isEmpty, camelCase, mapKeys } = require("lodash");
const { isFileTypeSupported } = require("./util");
const { ffprobe } = require("./ffprobe");
const ffprobeStatic = require("ffprobe-static");

async function getSongMetadata(path) {
  return new Promise((resolve, reject) => {
    if (isEmpty(path) || !isFileTypeSupported(path)) return resolve();
    ffprobe(
      path,
      ["-v", "error", "-print_format", "json", "-show_entries", "format"],
      ffprobeStatic.path,
      (err, tags) => {
        if (err) return reject(err);
        resolve(
          getSafeTagFieldNames({
            ...tags.format.tags,
            duration: formatDuration(tags.format.duration)
          })
        );
      }
    );
  });
}

function formatDuration(duration) {
  let output = "";
  if (duration >= 3600) {
    output += prefixNumber(Math.floor(duration / 3600)) + ":";
  }
  if (Math.floor(duration) % 3600 === 0) output += "00:";
  else
    output +=
      prefixNumber(Math.floor((Math.floor(duration) % 3600) / 60)) + ":";
  output += prefixNumber(Math.floor(duration % 60));
  return output;
}

function prefixNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function getSafeTagFieldNames(tags) {
  return mapKeys(tags, (v, key) => camelCase(key.replace(" ", "_")));
}

module.exports = {
  getSongMetadata,
  formatDuration
};
