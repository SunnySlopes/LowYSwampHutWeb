#!/usr/bin/env bash
# ============================================================
#  Build the LowYSwampHut WebAssembly core on macOS / Linux.
#
#  Prerequisites:
#    - Emscripten SDK activated (emcc on PATH), or EMCC / EMSDK set.
#    - The LowYSwampHut repository next to this web folder.
#
#  Usage:
#    chmod +x wasm/build.sh
#    ./wasm/build.sh
#
#  Optional environment variables:
#    CORE_DIR   path to LowYSwampHutFinderBase
#    OUT_DIR    output directory (default: ../js)
#    EMCC       path to the emcc executable
#    EMSDK      emsdk root (used when EMCC is unset)
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

CORE_DIR="${CORE_DIR:-$WEB_ROOT/../LowYSwampHut/LowYSwampHutFinderBase}"
OUT_DIR="${OUT_DIR:-$WEB_ROOT/js}"
OUT_NAME="${OUT_NAME:-lysh-core.js}"
INITIAL_MEMORY="${INITIAL_MEMORY:-67108864}"

if [ -z "${EMCC:-}" ]; then
  if command -v emcc >/dev/null 2>&1; then
    EMCC="$(command -v emcc)"
  elif [ -n "${EMSDK:-}" ] && [ -x "$EMSDK/upstream/emscripten/emcc" ]; then
    EMCC="$EMSDK/upstream/emscripten/emcc"
  else
    echo "error: emcc not found. Install/activate Emscripten, or set EMCC / EMSDK." >&2
    exit 1
  fi
fi

if [ ! -f "$CORE_DIR/src/eval.c" ]; then
  echo "error: LowYSwampHutFinderBase not found at '$CORE_DIR'." >&2
  echo "       Pass CORE_DIR=/path/to/LowYSwampHutFinderBase" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

SOURCES=(
  "$CORE_DIR/src/rng.c"
  "$CORE_DIR/src/noise.c"
  "$CORE_DIR/src/structure.c"
  "$CORE_DIR/src/climate.c"
  "$CORE_DIR/src/caves.c"
  "$CORE_DIR/src/phase1.c"
  "$CORE_DIR/src/biome.c"
  "$CORE_DIR/src/spline.c"
  "$CORE_DIR/src/terrain.c"
  "$CORE_DIR/src/column_top.c"
  "$CORE_DIR/src/density.c"
  "$CORE_DIR/src/interp_noise.c"
  "$CORE_DIR/src/aquifer.c"
  "$CORE_DIR/src/carver.c"
  "$CORE_DIR/src/phase2.c"
  "$CORE_DIR/src/eval.c"
  "$CORE_DIR/src/search.c"
)

for f in "${SOURCES[@]}"; do
  if [ ! -f "$f" ]; then
    echo "error: missing core source: $f" >&2
    exit 1
  fi
done
SOURCES+=("$SCRIPT_DIR/web_api.c")

EXPORTED="_lysh_web_start,_lysh_web_band,_lysh_web_close,_lysh_web_hits_count,_lysh_web_hits_overflow,_lysh_web_hit_field,_lysh_web_stat,_lysh_web_total_ms,_lysh_web_ints_per_hit,_lysh_web_version,_malloc,_free"

OUT_FILE="$OUT_DIR/$OUT_NAME"

echo "Web root : $WEB_ROOT"
echo "C core   : $CORE_DIR"
echo "Output   : $OUT_FILE"
echo "emcc     : $EMCC"
echo
echo "Compiling ${#SOURCES[@]} C files to WebAssembly..."
echo "This may take a minute."

"$EMCC" \
  -O3 \
  -ffp-contract=off \
  -fno-fast-math \
  -Wno-unused-parameter \
  -include stddef.h \
  -I "$CORE_DIR/src" \
  -o "$OUT_FILE" \
  --no-entry \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=createLyshCore \
  -s SINGLE_FILE=1 \
  -s ENVIRONMENT=web,worker,node \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY="$INITIAL_MEMORY" \
  -s MAXIMUM_MEMORY=2147483648 \
  -s STACK_SIZE=8388608 \
  -s FILESYSTEM=0 \
  -s ASSERTIONS=0 \
  -s "EXPORTED_FUNCTIONS=$EXPORTED" \
  -s EXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,HEAP32,HEAPU8 \
  -s EXPORT_ES6=0 \
  "${SOURCES[@]}"

if [ ! -f "$OUT_FILE" ]; then
  echo "error: build finished but $OUT_FILE is missing." >&2
  exit 1
fi

SIZE="$(wc -c < "$OUT_FILE" | tr -d ' ')"
echo
echo "Build OK."
echo "Output: $OUT_FILE ($SIZE bytes, WASM embedded as base64)"
