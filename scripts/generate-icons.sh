#!/usr/bin/env bash
#
# Regenerate the PWA icon PNGs from their SVG sources.
#
# The PNGs went eight months stale behind a rebrand because there was no way to
# rebuild them — the SVG was updated to the blue colourway and the pngs stayed
# orange, and nothing surfaced the drift. Run this after touching either SVG.
#
#   npm run icons
#
# Uses qlmanage, macOS's Quick Look renderer, because it is already present on
# this machine and adding a native image toolchain (librsvg, ImageMagick) or a
# heavy devDependency (sharp) to regenerate two files a couple of times a year
# is a worse trade. Consequence: this script is macOS-only. If it ever needs to
# run on Linux, `rsvg-convert -w N -h N in.svg -o out.png` is a drop-in.

set -euo pipefail

cd "$(dirname "$0")/.."
ICONS=public/icons
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

render() {
  local src=$1 size=$2 out=$3
  qlmanage -t -s "$size" -o "$TMP" "$src" >/dev/null 2>&1
  local produced="$TMP/$(basename "$src").png"
  [ -f "$produced" ] || { echo "failed to render $src at ${size}px" >&2; exit 1; }
  mv "$produced" "$out"
  echo "  $out  (${size}x${size})"
}

echo "Rendering icons:"
render "$ICONS/icon-source.svg" 192 "$ICONS/icon-192.png"
render "$ICONS/icon-source.svg" 512 "$ICONS/icon-512.png"
render "$ICONS/icon-maskable.svg" 512 "$ICONS/icon-maskable-512.png"
echo "Done."
