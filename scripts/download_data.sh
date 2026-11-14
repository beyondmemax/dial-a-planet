#!/usr/bin/env bash
# Downloads the 3 NASA SVS videos into data/ (about 56 MB total).
# Run from the repo root:   bash scripts/download_data.sh
# The videos are NOT committed to git (see .gitignore). Everyone runs this once.
set -euo pipefail

cd "$(dirname "$0")/../data"

download () {
  local name="$1" url="$2"
  if [ -s "$name" ]; then
    echo "✓ $name already here, skipping"
  else
    echo "↓ $name"
    curl -L --fail -o "$name" "$url"
  fi
}

# Night Lights 2012-2023 (SVS 5313). H.265: plays in Chrome on most Macs.
download nightlights.mp4 "https://svs.gsfc.nasa.gov/vis/a000000/a005300/a005313/nightlights_flat_series_and_change_wZooms_13_EIC_2160p30_h265.mp4"

# Global sea surface currents colored by temperature (SVS 3912)
download ocean.webm "https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/ecco2_sst_flow.webmhd.webm"

# GEDI forest height, global (SVS 4950)
download forest.webm "https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_global_w_colorbar_1080p60.webm"

echo
ls -lh
echo
echo "Expected roughly: nightlights.mp4 ~34M, ocean.webm ~16M, forest.webm ~6M"
