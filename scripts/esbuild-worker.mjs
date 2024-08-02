import { build } from "esbuild";

build({
  entryPoints: ["node_modules/@miikaah/musa-core/lib/worker.js"],
  // entryPoints: ["../musa-core/src/worker.ts"],
  bundle: true,
  outdir: "dist",
  platform: "node",
  target: "es2022",
  format: "cjs",
});
