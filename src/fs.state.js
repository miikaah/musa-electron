const fs = require("fs/promises");
const path = require("path");
const homedir = require("os").homedir();

const { NODE_ENV } = process.env;
const isDev = NODE_ENV === "local";
const stateFile = `${isDev ? ".dev" : ""}.musa.state.json`;

const setState = async (state) => {
  return fs.writeFile(path.join(homedir, stateFile), JSON.stringify(state, null, 2));
};

const getState = async () => {
  const file = await fs
    .readFile(path.join(homedir, stateFile), { encoding: "utf-8" })
    .catch((err) => {
      console.error("State file doesn't exist", err);
      return "{}";
    });

  let state;
  try {
    state = JSON.parse(file);
  } catch (e) {
    console.error("State file is not JSON", e);
    return "{}";
  }

  return state;
};

module.exports = {
  setState,
  getState,
};
