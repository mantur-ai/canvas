@echo off
setlocal enabledelayedexpansion
title Mantur Canvas Deploy

echo.
echo =====================================================
echo   Mantur Canvas Deploy Script
echo =====================================================
echo.
echo   IMPORTANT: This script must be run as Administrator.
echo   If you did not right-click "Run as administrator",
echo   please close this window and try again.
echo.
echo   Press any key to start...
pause >nul

REM ============================================================
REM Check admin
REM ============================================================
echo.
echo [Check] Verifying administrator privileges...
net session >nul 2>&1
if errorlevel 1 (
    echo.
    echo   ERROR: Not running as administrator.
    echo   Please right-click this file and choose "Run as administrator".
    echo.
    pause
    exit /b 1
)
echo   OK: Running as administrator.

REM ============================================================
REM Config
REM ============================================================
set "TARGET=C:\Program Files\mantur-canvas"
set "GIT_EXE=%ProgramFiles%\Git\cmd\git.exe"
set "GIT_INSTALLER=%TEMP%\git-installer.exe"
set "GIT_URL=https://npmmirror.com/mirrors/git-for-windows/v2.47.0.windows.1/Git-2.47.0-64-bit.exe"

REM ============================================================
REM Step 1: Ensure Git
REM ============================================================
echo.
echo [Step 1/3] Check Git

REM First, see if git is already in PATH
where git >nul 2>&1
if not errorlevel 1 (
    echo   OK: Git found in PATH.
    set "GIT_EXE=git"
    goto :git_ready
)

REM Check default install location
if exist "%GIT_EXE%" (
    echo   OK: Git found at %GIT_EXE%
    goto :git_ready
)

if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" (
    set "GIT_EXE=%ProgramFiles(x86)%\Git\cmd\git.exe"
    echo   OK: Git found at !GIT_EXE!
    goto :git_ready
)

REM Git not found, download and install
echo   Git not found. Downloading installer from China mirror...
echo   URL: %GIT_URL%
echo   This may take a few minutes (file size ~60 MB)...
echo.

powershell -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri '%GIT_URL%' -OutFile '%GIT_INSTALLER%' -UseBasicParsing } catch { Write-Host $_.Exception.Message; exit 1 }"

if errorlevel 1 (
    echo.
    echo   ERROR: Failed to download Git installer.
    echo   Please check your network and try again.
    echo   You can also download manually from:
    echo   %GIT_URL%
    echo   then run it, then re-run this script.
    echo.
    pause
    exit /b 1
)

if not exist "%GIT_INSTALLER%" (
    echo.
    echo   ERROR: Installer was not saved.
    echo.
    pause
    exit /b 1
)

echo   Download finished. Installing Git silently...
echo   (this takes about 30-60 seconds, please wait)
echo.

"%GIT_INSTALLER%" /VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS /COMPONENTS="icons,ext\reg\shellhere,assoc,assoc_sh"

REM Wait for installer to finish
timeout /t 3 /nobreak >nul

REM Verify installation
if exist "%ProgramFiles%\Git\cmd\git.exe" (
    set "GIT_EXE=%ProgramFiles%\Git\cmd\git.exe"
    goto :git_installed_ok
)
if exist "%ProgramFiles(x86)%\Git\cmd\git.exe" (
    set "GIT_EXE=%ProgramFiles(x86)%\Git\cmd\git.exe"
    goto :git_installed_ok
)

echo.
echo   ERROR: Git installation failed.
echo   Expected git.exe was not found at the standard location.
echo.
echo   You can try running the installer manually:
echo   %GIT_INSTALLER%
echo.
pause
exit /b 1

:git_installed_ok
echo   OK: Git installed at !GIT_EXE!
del /q "%GIT_INSTALLER%" >nul 2>&1

:git_ready
"!GIT_EXE!" --version
echo.

REM ============================================================
REM Step 2: Clone or pull
REM ============================================================
echo.
echo [Step 2/3] Fetch project source

if exist "%TARGET%\.git" goto :do_pull
goto :do_clone

:do_pull
echo   Project exists at %TARGET%
echo   Running git pull...
cd /d "%TARGET%"
"!GIT_EXE!" pull
if errorlevel 1 (
    echo.
    echo   ERROR: git pull failed.
    pause
    exit /b 1
)
echo   OK: Project updated.
goto :step3

:do_clone
echo   Cloning to %TARGET% ...
cd /d "C:\Program Files"
"!GIT_EXE!" clone https://gitee.com/safay/mantur-canvas.git mantur-canvas
if errorlevel 1 (
    echo.
    echo   ERROR: git clone failed.
    echo   Possible reasons: no network, repo requires authentication.
    pause
    exit /b 1
)
echo   OK: Project cloned.

:step3

REM ============================================================
REM Step 3: Run quick-start.cmd
REM ============================================================
echo.
echo [Step 3/3] Run scripts\quick-start.cmd

set "QS=%TARGET%\scripts\quick-start.cmd"

if not exist "%QS%" (
    echo.
    echo   ERROR: not found: %QS%
    pause
    exit /b 1
)

cd /d "%TARGET%"
echo   Executing: %QS%
echo.
call "%QS%"
echo.
echo   quick-start.cmd finished with errorlevel: %errorlevel%

echo.
echo =====================================================
echo   Done. Project at: %TARGET%
echo =====================================================
echo.
pause
exit /b 0