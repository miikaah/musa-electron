#!/bin/bash
FRONTEND_DIR="/Users/miika.henttonen/repos/musa"
BACKEND_DIR="/Users/miika.henttonen/repos/musa-electron"

echo "Building Musa frontend..."
cd $FRONTEND_DIR
npm run build

echo "Packaging Musa into an Electron app for Mac..."
cd $BACKEND_DIR
rm -rf build
cp -rf "${FRONTEND_DIR}/build" build/
npm run package:mac
