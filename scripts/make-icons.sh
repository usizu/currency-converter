#!/bin/bash
# Generate PWA icons from a source image.
# Usage: ./scripts/make-icons.sh <source-image>
#
# Produces:
#   public/icons/icon-180.png  (apple-touch-icon, no alpha)
#   public/icons/icon-192.png  (PWA manifest)
#   public/icons/icon-512.png  (PWA manifest)

set -euo pipefail

SRC="${1:?Usage: $0 <source-image>}"
OUT="public/icons"
mkdir -p "$OUT"

# Trim white border, then resize + flatten alpha to white background
for size in 180 192 512; do
  convert "$SRC" -trim +repage \
    -resize "${size}x${size}" \
    -gravity center -extent "${size}x${size}" \
    -background white -alpha remove -alpha off \
    "$OUT/icon-${size}.png"
  echo "Created $OUT/icon-${size}.png (${size}x${size})"
done

echo "Done. Don't forget to update index.html apple-touch-icon if needed."
