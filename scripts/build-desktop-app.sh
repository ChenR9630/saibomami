#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/dist/NEKO.SYNC Desktop Pet.app"
ZIP="$ROOT/dist/neko-sync-desktop-mac.zip"
CONTENTS="$APP/Contents"
MACOS="$CONTENTS/MacOS"
CACHE="$ROOT/.build-cache"

mkdir -p "$MACOS" "$CACHE"

CLANG_MODULE_CACHE_PATH="$CACHE/clang" \
SWIFT_MODULECACHE_PATH="$CACHE/swift" \
xcrun swiftc \
  -module-cache-path "$CACHE/swift" \
  -framework AppKit \
  -framework WebKit \
  "$ROOT/native/DesktopPet.swift" \
  -o "$MACOS/NEKO.SYNC Desktop Pet"

cat > "$CONTENTS/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>NEKO.SYNC Desktop Pet</string>
  <key>CFBundleExecutable</key>
  <string>NEKO.SYNC Desktop Pet</string>
  <key>CFBundleIdentifier</key>
  <string>local.neko.sync.desktop-pet</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>NEKO.SYNC Desktop Pet</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

chmod +x "$MACOS/NEKO.SYNC Desktop Pet"
codesign --force --deep --sign - "$APP"
ditto -c -k --keepParent "$APP" "$ZIP"
echo "$APP"
echo "$ZIP"
