import os from "node:os";
import path from "node:path";

const { NODE_ENV } = process.env;
const isTest = NODE_ENV === "test";
const isDev = NODE_ENV === "local";
const isDevOrTest = isDev || isTest;

const musadir = path.join(os.homedir(), ".musa");

export default {
  musadir,
  isDev,
  isDevOrTest,
};
