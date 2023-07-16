@echo off
echo Building Musa backend...
rmdir /q /s dist
call npm run build

echo Building Musa frontend...
cd %FRONTEND_DIR%
node scripts/buildElectron.mjs

echo Packaging Musa into an Electron app for Windows...
cd %BACKEND_DIR%
xcopy "%FRONTEND_DIR%\build" dist\build\ /s /e
call npm run package:win
