import { build } from "esbuild";

build({
  // MacOS needs the worker to be built separately from the typescript sources
  // or otherwise killing child processes takes 2 seconds per process.
  entryPoints: ["../musa-core/src/worker.ts"],
  bundle: true,
  outdir: "dist",
  platform: "node",
  target: "es2022",
  format: "cjs",
});
