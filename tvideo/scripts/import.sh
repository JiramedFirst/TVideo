#!/usr/bin/env bash
# import.sh <recording-dir> <editor-project-dir>
# Bring one Playwright recording into an editor project:
#   video.webm   -> assets/footage.mp4 (H.264, EVERY frame a keyframe, so the
#                   preview can seek between the many step windows without stutter)
#   timeline.json, clicks.json -> project root
# Stale hold stills are cleared (they belong to the previous take).
# Copy recordings out of test-results/ right after each run: Playwright wipes
# that folder at the start of the next run.
set -euo pipefail
REC="${1:?usage: import.sh <recording-dir containing video.webm> <editor-project-dir>}"
PRJ="${2:?usage: import.sh <recording-dir> <editor-project-dir>}"
[ -f "$REC/video.webm" ] || { echo "no video.webm in $REC" >&2; exit 1; }
[ -f "$REC/timeline.json" ] || { echo "no timeline.json in $REC — did the clip call tl.save()?" >&2; exit 1; }
mkdir -p "$PRJ/assets"
ffmpeg -v error -y -i "$REC/video.webm" -c:v libx264 -g 1 -crf 18 -pix_fmt yuv420p -an "$PRJ/assets/footage.mp4"
cp "$REC/timeline.json" "$PRJ/timeline.json"
if [ -f "$REC/clicks.json" ]; then cp "$REC/clicks.json" "$PRJ/clicks.json"; else echo '[]' > "$PRJ/clicks.json"; fi
rm -rf "$PRJ/assets/holds"
printf 'imported %s s of footage, %s steps\n' \
  "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$PRJ/assets/footage.mp4")" \
  "$(node -e "console.log(require(require('path').resolve(process.argv[1])).length)" "$PRJ/timeline.json")"
