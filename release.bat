@echo off
setlocal

:: Read version from tauri.conf.json
for /f "tokens=2 delims=:," %%a in ('findstr /C:"\"version\"" src-tauri\tauri.conf.json') do (
    set "VERSION=%%~a"
    goto :found
)
:found
set "VERSION=%VERSION: =%"
set "TAG=v%VERSION%"

echo.
echo   Companion Release
echo   Version: %VERSION%
echo   Tag:     %TAG%
echo.

:: Check if tag already exists
git rev-parse %TAG% >nul 2>&1
if %errorlevel%==0 (
    echo   Tag %TAG% already exists!
    echo   Bump version in src-tauri/tauri.conf.json and src-tauri/Cargo.toml first.
    exit /b 1
)

:: Confirm
set /p CONFIRM="   Push tag %TAG% and trigger desktop build? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo   Cancelled.
    exit /b 0
)

echo.
echo   Creating tag %TAG%...
git tag %TAG%

echo   Pushing tag...
git push origin %TAG%

echo   Triggering desktop build on companion-release (public, free)...
gh workflow run tauri-build.yml --repo nhadaututtheky/companion-release --field tag=%TAG%

echo.
echo   Done!
echo   Track: https://github.com/nhadaututtheky/companion-release/actions
echo.
