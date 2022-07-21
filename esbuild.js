const { build } = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

const main = async () => {
  build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    outdir: "dist",
    platform: "node",
    target: "es2020",
    format: "cjs",
    plugins: [nodeExternalsPlugin()],
  });
};

main();
