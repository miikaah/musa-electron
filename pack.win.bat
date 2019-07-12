@echo off
echo "Building Musa frontend..."
cd %FRONTEND_DIR%
call npm run build

echo "Packaging Musa into an Electron app for Windows..."
cd %BACKEND_DIR%
rmdir /q /s build
xcopy "%FRONTEND_DIR%\build" build\ /s /e
call npm run package:win
