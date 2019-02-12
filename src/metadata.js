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
        const { track, totalTracks } = getTrackAndTotalTracks(tags.format.tags);
        resolve(
          getSafeTagFieldNames({
            ...tags.format.tags,
            duration: formatDuration(tags.format.duration),
            track,
            totalTracks
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

function getTrackAndTotalTracks(tags) {
  if (isEmpty(tags)) return { track: undefined, totalTracks: undefined };
  const { track, disc } = tags;
  if (!track) return { track: undefined, totalTracks: undefined };
  const trackParts = `${track}`.split("/");
  if (disc) {
    const discParts = `${disc}`.split("/");
    return {
      track: `${discParts[0]}.${prefixNumber(parseInt(trackParts[0], 10))}`,
      totalTracks: trackParts[1]
    };
  }
  return {
    track: prefixNumber(parseInt(trackParts[0], 10)),
    totalTracks: trackParts[1]
  };
}

function getSafeTagFieldNames(tags) {
  return mapKeys(tags, (v, key) => camelCase(key.replace(" ", "_")));
}

module.exports = {
  getSongMetadata,
  formatDuration,
  getTrackAndTotalTracks
};
