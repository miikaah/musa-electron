#!/bin/bash
echo "Building Musa frontend..."
cd $FRONTEND_DIR
npm run build:electron

echo "Packaging Musa into an Electron app for Mac..."
cd $BACKEND_DIR
rm -rf build
cp -rf "${FRONTEND_DIR}/build" build/
npm run package:mac
