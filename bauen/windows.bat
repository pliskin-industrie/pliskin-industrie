@echo off
title Pliskin Industrie 0.8.1 bauen (Windows)
cd /d "%~dp0.."
echo Baut dist\Pliskin-Industrie.exe (braucht Python 3.12: https://www.python.org)
py -m pip install -r requirements-windows.txt pyinstaller
py -m PyInstaller --noconfirm --onefile --windowed --icon pliskin.ico --name "Pliskin-Industrie" --add-data "app;app" --add-data "edition.json;." --hidden-import starstrings pliskin_industrie.py
if %errorlevel% neq 0 ( echo Build fehlgeschlagen. & pause & exit /b )
echo Fertig: dist\Pliskin-Industrie.exe
pause
