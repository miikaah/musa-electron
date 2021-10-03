const fs = require("fs/promises");
const path = require("path");
const { sep } = path;

const imageExts = [".jpg", ".jpeg", ".png"];
const audioExts = [".mp3", ".flac", ".ogg"];
const extensions = [...imageExts, ...audioExts];

const satisfiesConstraints = (filename) => {
  return (
    !filename.startsWith(".") &&
    extensions.some((e) => filename.toLowerCase().endsWith(e))
  );
};

const recursivelyBuildFileList = async (filepath, srcPath) => {
  const dir = await fs.readdir(filepath, {
    withFileTypes: true,
  });

  let files = [];
  for (const file of dir) {
    const fullFilepath = path.join(filepath, file.name);

    if (file.isDirectory()) {
      files = files.concat(
        await recursivelyBuildFileList(fullFilepath, srcPath)
      );
    } else if (satisfiesConstraints(file.name)) {
      files.push(fullFilepath.replace(path.join(srcPath, sep), ""));
    }
  }

  return files;
};

const traverseFileSystem = async (srcPath) => {
  return recursivelyBuildFileList(srcPath, srcPath);
};

module.exports = {
  imageExts,
  audioExts,
  extensions,
  traverseFileSystem,
};
