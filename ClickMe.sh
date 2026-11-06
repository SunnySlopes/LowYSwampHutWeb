#!/usr/bin/env bash
# Serve this folder on macOS / Linux.
#   chmod +x serve.sh
#   ./serve.sh              # http://127.0.0.1:8080/ (opens browser)
#   ./serve.sh 9000         # custom port
#   NO_OPEN=1 ./serve.sh    # do not open a browser
#   ./serve.sh 9000 --no-open
set -euo pipefail
cd "$(dirname "$0")"

PORT="${1:-8080}"
OPEN_BROWSER=1
if [ "${2:-}" = "--no-open" ] || [ "${NO_OPEN:-0}" = "1" ]; then
  OPEN_BROWSER=0
fi
URL="http://127.0.0.1:$PORT/"

open_page() {
  local target="$1"
  if command -v open >/dev/null 2>&1; then
    open "$target"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$target" >/dev/null 2>&1 &
  else
    echo "Open $target manually in your browser."
  fi
}

if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys' >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1 && python -c 'import sys' >/dev/null 2>&1; then
  PY=python
else
  echo "Python 3 not found. Opening index.html directly (file://)."
  if [ "$OPEN_BROWSER" -eq 1 ]; then
    open_page "index.html"
  else
    echo "Open index.html manually in your browser."
  fi
  exit 0
fi

echo "Low-Y Swamp Hut Web: $URL"
"$PY" -m http.server "$PORT" --bind 127.0.0.1 --directory . &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' INT TERM HUP

READY=0
i=0
while [ "$i" -lt 80 ]; do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS --max-time 1 "$URL" >/dev/null 2>&1; then READY=1; break; fi
  elif command -v wget >/dev/null 2>&1; then
    if wget -q --timeout=1 -O /dev/null "$URL"; then READY=1; break; fi
  else
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then READY=1; break; fi
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  i=$((i + 1))
  sleep 0.25
done

if [ "$READY" -eq 1 ]; then
  if [ "$OPEN_BROWSER" -eq 1 ]; then
    open_page "$URL"
  fi
else
  echo "Server did not become ready. Is port $PORT already in use?" >&2
fi

wait "$SERVER_PID"
