@echo off
setlocal enabledelayedexpansion

:: ── Pre-flight checks ────────────────────────────────────────────────────────

where gh >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: gh CLI not found. Install from https://cli.github.com
    exit /b 1
)

gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: Not authenticated with gh. Run: gh auth login
    exit /b 1
)

where git >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERROR: git not found.
    exit /b 1
)

:: ── Read version (use PowerShell for reliable JSON parsing) ──────────────────

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content src-tauri\tauri.conf.json | ConvertFrom-Json).version"`) do set "VERSION=%%v"

if "%VERSION%"=="" (
    echo   ERROR: Could not read version from src-tauri\tauri.conf.json
    exit /b 1
)

set "TAG=v%VERSION%"

echo.
echo   Companion Release
echo   Version: %VERSION%
echo   Tag:     %TAG%
echo.

:: ── Validate versions match ──────────────────────────────────────────────────

for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "(Get-Content src-tauri\Cargo.toml -Raw) -match 'version = \"(.+?)\"' | Out-Null; $Matches[1]"`) do set "CARGO_VER=%%v"

if not "%VERSION%"=="%CARGO_VER%" (
    echo   ERROR: Version mismatch!
    echo   tauri.conf.json: %VERSION%
    echo   Cargo.toml:      %CARGO_VER%
    exit /b 1
)

:: ── Check uncommitted changes ────────────────────────────────────────────────

for /f %%i in ('git status --porcelain 2^>nul ^| find /c /v ""') do set "DIRTY=%%i"
if %DIRTY% gtr 0 (
    echo   WARNING: You have uncommitted changes.
    set /p CONTINUE="   Continue anyway? (y/N): "
    if /i not "!CONTINUE!"=="y" exit /b 0
)

:: ── Check tag doesn't exist ──────────────────────────────────────────────────

git rev-parse %TAG% >nul 2>&1
if %errorlevel%==0 (
    echo   ERROR: Tag %TAG% already exists!
    echo   Bump version in src-tauri/tauri.conf.json and src-tauri/Cargo.toml first.
    exit /b 1
)

:: ── Confirm ──────────────────────────────────────────────────────────────────

set /p CONFIRM="   Push tag %TAG% and trigger desktop build? (y/N): "
if /i not "%CONFIRM%"=="y" (
    echo   Cancelled.
    exit /b 0
)

echo.

:: ── Create and push tag ──────────────────────────────────────────────────────

echo   Creating tag %TAG%...
git tag %TAG%
if %errorlevel% neq 0 (
    echo   ERROR: Failed to create tag.
    exit /b 1
)

echo   Pushing tag...
git push origin %TAG%
if %errorlevel% neq 0 (
    echo   ERROR: Failed to push tag. Deleting local tag...
    git tag -d %TAG% >nul 2>&1
    exit /b 1
)

:: ── Trigger build ────────────────────────────────────────────────────────────

echo   Triggering desktop build...
gh workflow run tauri-build.yml --repo nhadaututtheky/companion-release --field tag=%TAG%
if %errorlevel% neq 0 (
    echo   ERROR: Failed to trigger build workflow.
    echo   Try manually: gh workflow run tauri-build.yml --repo nhadaututtheky/companion-release --field tag=%TAG%
    exit /b 1
)

echo.
echo   Success! Build triggered for %TAG%.
echo   Track: https://github.com/nhadaututtheky/companion-release/actions
echo.
