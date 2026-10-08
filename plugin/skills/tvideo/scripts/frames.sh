#!/usr/bin/env bash
# frames.sh <video> <outdir> <t1> [t2 ...]
# Grab full-resolution frames at the given seconds plus a 4-column contact sheet.
# Read the full frames to measure zoom/ring/mask coordinates — they are in the
# recording's own pixel space (e.g. 1280x800), which is what plan.json expects.
set -euo pipefail
v="$1"; out="$2"; shift 2
mkdir -p "$out"
i=0
for t in "$@"; do
  i=$((i+1))
  ffmpeg -v error -y -ss "$t" -i "$v" -frames:v 1 "$out/$(printf %02d $i)-t$t.png"
done
ffmpeg -v error -y -pattern_type glob -i "$out/[0-9][0-9]-t*.png" -vf "scale=640:-1,tile=4x3" -frames:v 1 "$out/sheet.png"
echo "$out/sheet.png"
