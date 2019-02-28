# Musa-electron

Electron backend for Musa.

## Getting started

Run `npm run setup` to install packages and to rebuild fsevents.

This is needed because this package uses Chokidar and without rebuilding fsevents,
it reverts back to polling on Mac which causes huge performance issues
by hogging a lot of CPU.
