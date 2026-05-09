@echo off
title Stop Mantur Canvas

echo.
echo =====================================================
echo   Stop and Remove Mantur Canvas (pm2)
echo =====================================================
echo.

where pm2 >nul 2>&1
if errorlevel 1 (
    echo   ERROR: pm2 not found in PATH.
    echo.
    pause
    exit /b 1
)

echo   [BEFORE] Current pm2 process list:
call pm2 list
echo.

echo   [ACTION] Trying: pm2 delete mantur-canvas
call pm2 delete mantur-canvas
echo.

echo   [ACTION] Trying: pm2 delete all
call pm2 delete all
echo.

echo   [ACTION] Trying: pm2 kill (stop pm2 daemon)
call pm2 kill
echo.

echo   [AFTER] Final pm2 process list:
call pm2 list

echo.
echo =====================================================
echo   Done. All pm2 processes should be stopped now.
echo =====================================================
echo.
pause
exit /b 0