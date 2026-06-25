#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/bin/cat-reconstruct"
CACHE="$ROOT/.build-cache"

mkdir -p "$ROOT/bin" "$CACHE/swift"

CLANG_MODULE_CACHE_PATH="$CACHE/clang" \
SWIFT_MODULECACHE_PATH="$CACHE/swift" \
xcrun swiftc \
  -parse-as-library \
  -module-cache-path "$CACHE/swift" \
  -framework RealityKit \
  "$ROOT/native/CatReconstruct.swift" \
  -o "$OUT"

chmod +x "$OUT"
echo "$OUT"
