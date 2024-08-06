import { build } from "esbuild";

const start = Date.now();

void build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  outdir: "dist",
  platform: "node",
  target: "es2022",
  format: "cjs",
  plugins: [
    {
      name: "exclude-electron",
      setup(build) {
        const dependencies = new Set();

        build.onResolve({ namespace: "file", filter: /.*/ }, (args) => {
          if (!args.path.startsWith(".")) {
            dependencies.add(args.path);
          }

          return args.path.startsWith("electron")
            ? { path: args.path, external: true }
            : null;
        });

        build.onEnd(() => {
          const deps = Array.from(dependencies.values()).sort((a, b) =>
            a.localeCompare(b),
          );
          console.log(`List of dependencies (${deps.length})`);
          console.log("--------------------");
          console.log(deps);
          console.log(`Build took ${(Date.now() - start) / 1000} seconds\n`);
        });
      },
    },
  ],
});
