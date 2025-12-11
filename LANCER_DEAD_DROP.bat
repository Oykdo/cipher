@echo off
REM ========================================
REM  Dead Drop - Launcher
REM  Version: 0.0.1-alpha
REM ========================================

title Dead Drop Launcher

echo.
echo ========================================
echo   Dead Drop - Secure Messenger
echo ========================================
echo.
echo Demarrage de l'application...
echo.

REM Vérifier si Node.js est installé
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas installe !
    echo.
    echo Veuillez installer Node.js v18+ depuis https://nodejs.org/
    echo.
    pause
    exit /b 1
)

REM Vérifier si les dépendances sont installées
if not exist "node_modules\" (
    echo Installation des dependances...
    echo Cela peut prendre quelques minutes...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERREUR] L'installation a echoue !
        echo.
        pause
        exit /b 1
    )
)

REM Lancer l'application
echo.
echo Lancement de Dead Drop...
echo.
echo - Backend: http://localhost:4000
echo - Frontend: http://localhost:5173
echo - Electron: Fenetre de l'application
echo.
echo Appuyez sur Ctrl+C pour arreter l'application.
echo.

call npm run dev

REM Si l'application s'arrête
echo.
echo Application arretee.
pause
