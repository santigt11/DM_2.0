@echo off
echo ========================================
echo   Monochrome Music - Dev Server
echo ========================================
echo.
echo Iniciando servidor de desarrollo...
echo.

REM Verificar si livereload está instalado
python -c "import livereload" 2>NUL
if errorlevel 1 (
    echo [!] livereload no esta instalado
    echo [*] Instalando livereload...
    pip install livereload
    echo.
)

REM Iniciar servidor
python dev_server.py

pause
