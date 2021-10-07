import fs from "fs/promises";
import path from "path";
import os from "os";

const { NODE_ENV } = process.env;
const isDev = NODE_ENV === "local";
const stateFile = `${isDev ? ".dev" : ""}.musa.state.json`;
const homedir = os.homedir();

export const setState = async (state: unknown): Promise<void> => {
  return fs.writeFile(path.join(homedir, stateFile), JSON.stringify(state, null, 2));
};

export const getState = async (): Promise<{ musicLibraryPath: string }> => {
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
    return { musicLibraryPath: "" };
  }

  return state;
};