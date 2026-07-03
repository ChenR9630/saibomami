#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
WIN_DIR="$DIST/NEKO.SYNC Windows Client"
LEGACY_WIN_DIR="$DIST/NEKO.SYNC Desktop Pet Windows"
WIN_ZIP="$DIST/neko-sync-desktop-windows.zip"

zsh "$ROOT/scripts/build-desktop-app.sh" >/dev/null

rm -rf "$WIN_DIR" "$LEGACY_WIN_DIR" "$WIN_ZIP"
mkdir -p "$WIN_DIR"
cp "$ROOT/scripts/start-desktop-windows.cmd" "$WIN_DIR/NEKO.SYNC Client.cmd"
cp "$ROOT/scripts/start-desktop-windows.cmd" "$WIN_DIR/NEKO.SYNC Desktop Pet.cmd"
cp "$ROOT/scripts/start-desktop-windows.ps1" "$WIN_DIR/start-desktop-windows.ps1"
(
  cd "$DIST"
  zip -qr "$WIN_ZIP" "NEKO.SYNC Windows Client"
)

echo "$DIST/neko-sync-desktop-mac.zip"
echo "$WIN_ZIP"
