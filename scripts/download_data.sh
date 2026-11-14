#!/usr/bin/env bash
# Downloads the NASA data into data/ (git-ignored, everyone runs this once).
#   bash scripts/download_data.sh            -> Night Lights only (~15 MB)
#   bash scripts/download_data.sh all        -> also ocean + forest videos (later datasets)
set -euo pipefail

cd "$(dirname "$0")/../data"

get () {
  local out="$1" url="$2"
  if [ -s "$out" ]; then
    echo "✓ $out (already here)"
  else
    echo "↓ $out"
    curl -sSL --fail -o "$out" "$url"
  fi
}

# ---------- Night Lights 2012-2023 (NASA SVS 5475, equirectangular 2048x1024) ----------
# Each year is shown for 60 frames in NASA's sequence; we grab the middle frame of each year.
# Frame for year Y = 30 + 60 * (Y - 2012). Frame 1100 = the 2012->2023 change map.
NL="https://svs.gsfc.nasa.gov/vis/a000000/a005400/a005475/frames/2048x1024_2x1_30p/nightlights_change_2012-2024_KSC_SOS_plus2/nightlights_2012-2024_KSC_SOS_04_plus2_"
mkdir -p nightlights
for year in $(seq 2012 2023); do
  frame=$(printf "%04d" $((30 + 60 * (year - 2012))))
  get "nightlights/$year.png" "${NL}${frame}_2k.png"
done
get "nightlights/change.png" "${NL}1100_2k.png"

# ---------- Later datasets (optional) ----------
if [ "${1:-}" = "all" ]; then
  get ocean.webm  "https://svs.gsfc.nasa.gov/vis/a000000/a003900/a003912/ecco2_sst_flow.webmhd.webm"
  get forest.webm "https://svs.gsfc.nasa.gov/vis/a000000/a004900/a004950/GEDI_global_w_colorbar_1080p60.webm"
fi

echo
ls -lh nightlights
echo
echo "Expected: 2012.png ... 2023.png + change.png, about 1.1 MB each."
