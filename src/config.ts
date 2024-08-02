import os from "node:os";
import path from "node:path";

const musadir = path.join(os.homedir(), ".musa");

export default {
  musadir,
};
