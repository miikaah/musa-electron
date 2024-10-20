#!/bin/bash
echo "Building Musa backend..."
rm -rf dist
npm run build

echo ""
echo "Building Musa frontend..."
cd $FRONTEND_DIR
node scripts/buildDistributable.mjs electron

echo "Packaging Musa into an Electron app for Linux..."
cd $BACKEND_DIR
cp -rf "${FRONTEND_DIR}/build" dist/build/
npm run package:nux
