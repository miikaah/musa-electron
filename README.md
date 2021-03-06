# Musa-electron

Electron backend for Musa.

## Getting started

Run `npm run setup` to install packages and to rebuild fsevents.

This is needed because this package uses Chokidar and without rebuilding fsevents,
it reverts back to polling on Mac which causes huge performance issues by hogging a lot of CPU.

## Packaging the app

Clone `https://github.com/miikaah/musa` to its own directory.

Create an `.env` file as per the `.env.example`.

Mainly, the `FRONTEND_DIR` and `BACKEND_DIR` environment variables need to be set to the _absolute_ file URLs of the repositories. The format depends on the platform.

Then you just `npm run pack:<mac|win>` depending on which platform you are on.

On Mac the scripts are known to work in bash and on Windows on the command line.
