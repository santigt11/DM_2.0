@echo off
echo.
echo ========================================
echo   DM 2.0 - Starting Development Servers
echo ========================================
echo.
echo Starting servers...
echo.

REM Iniciar servidor de desarrollo en una nueva ventana
start "Dev Server - Port 8000" cmd /k "python dev_server.py"

REM Esperar 1 segundo
timeout /t 1 /nobreak >nul

REM Iniciar servidor de descargas en otra ventana
start "Download Server - Port 8001" cmd /k "python download_server.py"

echo.
echo ✓ Servers started!
echo.
echo 🌐 Dev Server:      http://localhost:8000
echo 🎵 Download Server: http://localhost:8001
echo.
echo To stop servers, close their terminal windows or press Ctrl+C
echo.
pause
