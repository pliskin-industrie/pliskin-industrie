#!/bin/sh
# Pliskin Industrie 0.8.1 fuer Linux bauen -> dist/Pliskin-Industrie-linux-x86_64
set -e
cd "$(dirname "$0")/.."
python3 -m pip install -r requirements-linux.txt pyinstaller
python3 -m PyInstaller --noconfirm --onefile --name "Pliskin-Industrie-linux-x86_64" \
  --add-data "app:app" --add-data "edition.json:." --hidden-import webview.platforms.qt --hidden-import starstrings pliskin_industrie.py
echo "Fertig: dist/Pliskin-Industrie-linux-x86_64"
