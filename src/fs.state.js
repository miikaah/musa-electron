const fs = require("fs/promises");
const path = require("path");

const { MUSA_SRC_PATH } = process.env;
const filename = path.join(MUSA_SRC_PATH, ".musa.state.json");

const setState = async (state) => {
  return fs.writeFile(filename, JSON.stringify(state, null, 2));
};

const getState = async () => {
  const file = await fs.readFile(filename, { encoding: "utf-8" }).catch((err) => {
    console.error(err);
    return "{}";
  });
  const state = JSON.parse(file);

  return state;
};

module.exports = {
  setState,
  getState,
};
