const fs = require("fs/promises");
const path = require("path");
const homedir = require("os").homedir();

const setState = async (state) => {
  return fs.writeFile(path.join(homedir, ".musa.state.json"), JSON.stringify(state, null, 2));
};

const getState = async () => {
  const file = await fs
    .readFile(path.join(homedir, ".musa.state.json"), { encoding: "utf-8" })
    .catch((err) => {
      setState({});
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
