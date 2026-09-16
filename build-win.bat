@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo Instaluji zavislosti (pokud je potreba)...
echo ---------------------------------------------------
call npm install
if errorlevel 1 (
    echo.
    echo npm install selhal, viz chyba vyse.
    pause
    exit /b 1
)

echo.
echo Spoustim Windows portable + zip build...
echo ---------------------------------------------------
call npm run build:win

echo.
echo ---------------------------------------------------
echo Hotovo (nebo viz chyba vyse). Vysledek hledejte ve slozce dist.
pause
