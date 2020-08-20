const { isEmpty, camelCase, mapKeys, defaultTo, get } = require("lodash");
const ffprobeStatic = require("ffprobe-static");
const { isSupportedFileType } = require("../util");
const { ffprobe } = require("./ffprobe");

async function getSongMetadata(path) {
  return new Promise((resolve, reject) => {
    if (isEmpty(path) || !isSupportedFileType(path)) return resolve();
    ffprobe(
      path,
      ["-v", "error", "-print_format", "json", "-show_entries", "format"],
      ffprobeStatic.path,
      (err, tags) => {
        if (err) {
          return reject(err);
        }
        const format = getSafeTagFieldNames(get(tags, "format", {}));
        const formatTags = getSafeTagFieldNames(get(format, "tags", {}));
        const { track, totalTracks } = getTrackAndTotalTracks(formatTags);

        resolve({
          ...formatTags,
          duration: formatDuration(get(format, "duration", 0)),
          bitRate: `${parseInt(get(format, "bitRate", 0) / 1000, 10)} kbps`,
          date: `${defaultTo(parseInt(formatTags.date, 10), "")}`,
          track,
          totalTracks,
        });
      }
    );
  });
}

function formatDuration(duration) {
  if (duration < 1) return "0:00";
  let output = "";
  if (duration >= 3600) {
    output += prefixNumber(Math.floor(duration / 3600)) + ":";
    output +=
      prefixNumber(Math.floor((Math.floor(duration) % 3600) / 60)) + ":";
  } else output += Math.floor((Math.floor(duration) % 3600) / 60) + ":";
  output += prefixNumber(Math.floor(duration % 60));
  return output;
}

function prefixNumber(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function getTrackAndTotalTracks(tags) {
  if (isEmpty(tags)) return { track: undefined, totalTracks: undefined };
  const { track, disc } = tags;
  if (!track) return { track: undefined, totalTracks: undefined };
  const trackParts = `${track}`.split("/");
  if (disc) {
    const discParts = `${disc}`.split("/");
    return {
      track: `${discParts[0]}.${prefixNumber(parseInt(trackParts[0], 10))}`,
      totalTracks: trackParts[1],
    };
  }
  return {
    track: prefixNumber(parseInt(trackParts[0], 10)),
    totalTracks: trackParts[1],
  };
}

function getSafeTagFieldNames(tags) {
  return mapKeys(tags, (v, key) => camelCase(key.replace(" ", "_")));
}

module.exports = {
  getSongMetadata,
  formatDuration,
  getTrackAndTotalTracks,
};
