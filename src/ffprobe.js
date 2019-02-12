"use strict";

const shell = require("any-shell-escape");
const { exec } = require("child_process");

module.exports = {
  ffprobe: (filePath, params, ffprobePath, cb) => {
    const cmd = shell([ffprobePath, ...params, filePath]);
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        err.message = stderr.trim();
        return cb(err);
      }

      try {
        const tags = JSON.parse(stdout);
        if (!tags) {
          return cb(new Error(`ffprobe returned invalid data: ${stdout}`));
        }
        cb(null, tags);
      } catch (err) {
        cb(new Error(`ffprobe returned invalid JSON: ${err} : ${stdout}`));
      }
    });
  }
};
