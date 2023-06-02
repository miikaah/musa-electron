#!/bin/bash
echo "Building Musa backend..."
rm -rf dist
npm run build

echo ""
echo "Building Musa frontend..."
cd $FRONTEND_DIR
node build.electron.js

echo "Packaging Musa into an Electron app for Mac..."
cd $BACKEND_DIR
cp -rf "${FRONTEND_DIR}/build" dist/build/
npm run package:mac:x64
