#!/usr/bin/env bash
# Serve this folder on macOS / Linux.
#   chmod +x serve.sh
#   ./serve.sh          # http://127.0.0.1:8080/
#   ./serve.sh 9000     # custom port
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8080}"

if command -v python3 >/dev/null 2>&1; then
  echo "Low-Y Swamp Hut Web: http://127.0.0.1:$PORT/"
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  echo "Low-Y Swamp Hut Web: http://127.0.0.1:$PORT/"
  exec python -m http.server "$PORT" --bind 127.0.0.1
else
  echo "Python 3 not found. Opening index.html directly (file://)."
  if command -v open >/dev/null 2>&1; then
    exec open index.html
  elif command -v xdg-open >/dev/null 2>&1; then
    exec xdg-open index.html
  else
    echo "Open index.html manually in your browser."
  fi
fi
