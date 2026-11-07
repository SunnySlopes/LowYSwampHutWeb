# LowYSwampHut · WebAssembly Web Edition

[简体中文](README.zh-CN.md) | [English](README.en.md) | [Bilingual overview](README.md)

Search for **low-Y witch huts in Minecraft Java Edition** from your browser.

The compute core is the C code from the original [`LowYSwampHut`](../LowYSwampHut) project
(`LowYSwampHutFinderBase`), compiled to WebAssembly with Emscripten. There is no backend:
seeds, ranges and results stay in your browser.

> Every seed has a dream of a low-Y swamp hut.
> — SunnySlopes

---

## Quick start

### Windows

- Double-click **`index.html`** (or `open.bat`) to run directly (`file://` is single-threaded).
- To enable multiple threads, double-click `ClickMe.bat` or run:

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
# opens http://127.0.0.1:8080/ automatically when the server is ready
# Start the server only, without opening a browser:
powershell -ExecutionPolicy Bypass -File serve.ps1 -NoOpen
```

### macOS / Linux

The page and WebAssembly are OS-independent. Modern Chrome / Edge / Firefox / Safari all work.

```bash
# Option 1: open directly (file://, single-threaded)
chmod +x open.sh
./open.sh

# Option 2: local server (HTTP, multi-threaded, opens the browser when ready)
chmod +x ClickMe.sh
./ClickMe.sh
# do not open a browser: NO_OPEN=1 ./ClickMe.sh
```

You can also open `index.html` directly, or run
`python3 -m http.server 8080 --bind 127.0.0.1`.

> When opened as `file://`, the WASM is already embedded as base64 in `js/lysh-core.js`,
> so no network is needed. However, Chrome does not allow a `file://` page to start Workers,
> so it falls back to one thread. Use `ClickMe.bat` / `ClickMe.sh` over HTTP for multiple threads.

### Mobile

`mobile.html` is the reduced portrait edition: it removes the hero, feature cards, how-it-works
and FAQ, keeping the search console and results. Most helper hints, the distance column and the
`/tp` text column are hidden; the thread count is still adjustable in the search console.
The “Mobile / Desktop” links at the bottom switch between editions.

---

## Features

| Feature | Description |
|---|---|
| Single-seed search | Any 64-bit seed; the default range is the world border |
| Seed-list search | Upload a `txt` file, one seed per line; blank lines and `#` comments are ignored; default range 256 |
| Versions | 26.2~26.3 (default), 1.19.x~26.1, 1.18.x |
| World types | Normal, Large Biomes, Single Biome (Swamp) |
| Height filter | Only **-40 / -50 / -54** (-40 is the loosest) |
| Exact Y | Same 63-column footprint average plus aquifer flood test as the desktop edition |
| Y colours | Values above **-50** use the default green; **-50 to -54** use the warm highlight |
| Pause / resume / stop | Chunked scanning; pause and stop take effect at chunk boundaries |
| Results | Table / text views; copy `/tp`; export results; export hit-seed list |
| Sorting | Single seed by Y; list by lowest Y or distance from origin |
| Bilingual | Chinese / English |
| Themes | Swamp Dusk (dark) / Tundra Morning (light) |
| Self-test | Verifies all 8 known huts for the demo seed at startup |
| License | MIT; see the footer and `LICENSE` |

### Ranges and defaults

Same as the desktop edition: **1 region = 32 × 32 chunks = 512 × 512 blocks**.

- Range presets: **64 / 256 / world border**.
- **Single seed defaults to the world border** (side length 117188 regions).
- **Seed list defaults to 256**.
- `MinX / MaxX / MinZ / MaxZ` are **inclusive** (the C core scans `[min, max+1)`);
  `Square side` is the side length in regions, centered on `(0,0)`.
- With “Square side” enabled, Min/Max are read-only; uncheck it to enter them manually.

### Performance and threading

Measured locally (seed `-1024459017`, `117,188,000` region window):

| Configuration | Regions / sec | Notes |
|---|---:|---|
| Native C CLI, single thread | ~5.2M | AVX2 + LTO |
| WASM, single thread | ~7.5M | Comparable to, or faster than, one native core |
| Native C, 32 threads | ~71M | 32 logical cores |
| WASM, 12 Web Workers (HTTP) | ~36–40M | 64 MB initial memory per Worker |

> The page defaults to the local maximum thread count and can be adjusted in the thread-count field;
> the 12-Worker row above is the measured configuration.

**Why did it feel about 1000× slower before?**

- `LowYSwampHutFinderBase-cli scan --seed X` with **no range** scans only
  `6000 × 6000 = 36,000,000` regions (about 0.6 s here), not the world border.
- The web page defaults to the world border: `117188² = 13,733,027,344` regions,
  about **381×** more.
- The native GUI / CLI uses 32 threads, while the web page under `file://` is single-threaded.
  Together these produce a difference of hundreds to thousands of times.

**Current acceleration:**

- Open the page over **HTTP** with `ClickMe.bat` / `ClickMe.sh`: a single-seed large search defaults
  to the **local maximum thread count** (up to 32 on desktop, up to 4 on mobile), adjustable in the
  thread-count field. Each Worker owns its own WASM instance; SharedArrayBuffer / COOP-COEP are
  not required.
- Under `file://`, Chrome does not allow Workers to load local scripts, so the page automatically
  falls back to one thread; the thread-count field shows `1` and points to serve.
- Full world border: about **6 minutes** over HTTP locally (36–40M regions/sec measured);
  about **30 minutes** with one `file://` thread.

### Web-edition limitations

- Large single-seed ranges: HTTP defaults to the local maximum thread count, adjustable;
  `file://` is single-threaded.
- If the browser cannot report CPU cores, or a Worker fails to create/load, the page automatically
  falls back to the main-thread single-threaded engine without an error dialog; the thread field
  shows the reason.
- Seed-list mode currently scans seeds one at a time (default 256, which is fast per seed).
  World border × many seeds takes a very long time; keep the list range at 256 or 64.
- Low-Y witch huts are very rare. No result in the default range is normal; try another seed or
  a larger range.

---

## Example seed

The demo seed is **`-1024459017`** (used by the “Example” button, the self-test, and
`examples/seeds.txt`). Its 8 known results are:

```
/tp 234016 -44 -18221904
/tp 27607376 -47 -7240176
/tp 16007952 -43 3516000
/tp 20082832 -54 4744416
/tp 10995248 -54 7276048
/tp 3267728 -54 10839360
/tp -2260784 -54 13017184
/tp -2274464 -54 17901776
```

At startup the page verifies these 8 results region by region. The “Example” button loads a
manual range (regions `39192..39255 × 9234..9297`) and searches only the 4th result,
`/tp 20082832 -54 4744416`, for a quick demo; the full set is found by searching the world border.

---

## Directory structure

```
LowYSwampHutWeb/
├─ index.html              # Wide: form/actions on the left, results on the right; mobile/narrow: results below
├─ mobile.html             # Reduced portrait edition (reuses the same JS)
├─ css/
│  ├─ style.css            # Theme, layout, desktop/tablet responsive rules
│  └─ mobile.css           # Reduced portrait styles (mobile.html only)
├─ js/
│  ├─ i18n.js              # Chinese / English strings
│  ├─ app.js               # UI, scan scheduling, progress, export
│  ├─ scan-worker.js       # Web Worker: own WASM instance + Z-slice scan
│  └─ lysh-core.js         # Generated WASM (base64 embedded; do not edit)
├─ wasm/
│  ├─ web_api.c            # Thin C-core → JS wrapper (no detection logic)
│  ├─ build.ps1 / build.bat  # Windows build
│  ├─ build.sh             # macOS / Linux build
│  └─ fetch_emsdk_zip.py   # Optional: parallel Emscripten archive download
├─ examples/seeds.txt      # Example seed list
├─ assets/                 # Page assets (screenshot)
├─ ClickMe.bat / ClickMe.sh # Local server (opens the browser when ready)
├─ serve.ps1               # Windows server script used by ClickMe.bat
├─ open.bat / open.sh      # Open the page
├─ LICENSE                 # MIT (original authors M33Galaxy / SunnySlopes)
├─ README.md               # Bilingual overview
├─ README.zh-CN.md         # Full Chinese documentation
└─ README.en.md            # Full English documentation
```

---

## Rebuilding the WASM

The WASM is already included. You only need to rebuild after changing the C core or
`wasm/web_api.c`.

### Prerequisites

- Install and activate the [Emscripten SDK](https://github.com/emscripten-core/emsdk).
- Keep the original project as a sibling directory:

```
LowYSwampHut/
├─ LowYSwampHut/           # Original project (contains LowYSwampHutFinderBase)
└─ LowYSwampHutWeb/        # This directory
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File wasm/build.ps1
```

### macOS / Linux

```bash
chmod +x wasm/build.sh
./wasm/build.sh
# custom core path:
# CORE_DIR=/path/to/LowYSwampHutFinderBase ./wasm/build.sh
```

Both scripts use the same source list and compiler options:

- `-O3 -ffp-contract=off -fno-fast-math`, keeping floating-point behavior identical to the desktop build;
- `--no-entry -sMODULARIZE=1 -sSINGLE_FILE=1`, producing a single `js/lysh-core.js`
  (WASM base64 embedded);
- **64 MB** initial memory per instance, `-sALLOW_MEMORY_GROWTH=1`;
  up to 32 Workers on desktop (4 on mobile); 12 Workers use about 768 MB initially.

The build overwrites `js/lysh-core.js`. Reload the page; the top-right badge should show
**WASM ready**, and when the startup self-test passes its title contains `self-test OK`.

---

## Implementation notes

- `wasm/web_api.c` does only four things: reconstruct the 64-bit seed, manage one scan session,
  call `lysh_scan_session_band` by band, and expose results through a flat `int` interface.
  It contains **no terrain / structure / biome detection**.
- A seed calls `lysh_scan_session_open` once; every band reuses the same noise stacks, and
  `lysh_scan_session_close` runs at the end.
- The page scans in bands of about 16k regions and uses `setTimeout(0)` between bands to yield
  to the main thread; pause / stop are checked at band boundaries.
- `Y` is the C core's `avg_y`: the sum of the 63 footprint column heights divided by 63
  (truncated toward zero), matching the desktop edition and the original acceptance table.

### Self-test points

At startup the page verifies each known hut region by region:

| # | hut X | hut Z | Y |
|---|---|---|---|
| 1 | `234016` | `-18221904` | `-44` |
| 2 | `27607376` | `-7240176` | `-47` |
| 3 | `16007952` | `3516000` | `-43` |
| 4 | `20082832` | `4744416` | `-54` |
| 5 | `10995248` | `7276048` | `-54` |
| 6 | `3267728` | `10839360` | `-54` |
| 7 | `-2260784` | `13017184` | `-54` |
| 8 | `-2274464` | `17901776` | `-54` |

---

## Browser requirements

- A modern version of Chrome / Edge / Firefox / Safari with WebAssembly support.
- JavaScript must be enabled.
- The Clipboard API may be unavailable under `file://`; the page falls back to
  `document.execCommand('copy')`.

---

## License

This project is released under the **MIT License**; see [LICENSE](LICENSE) for the full text.
The footer and credits section also link to the license.

---

## Credits

- [M33Galaxy](https://github.com/M33Galaxy) — core algorithm and C core
- [SunnySlopes](https://github.com/SunnySlopes) — inspiration and desktop UI
- [Original Java edition repository](https://github.com/M33Galaxy/LowYSwampHut)
- [Base library](https://github.com/M33Galaxy/LowYSwampHutFinderBase)
- [Web edition repository](https://github.com/SunnySlopes/LowYSwampHutWeb) — if the online search is slow or you run into problems, download it and run locally for a faster search
- [KalleStruik](https://github.com/KalleStruik) — Noise Sampler (reference)
- Font: Jiangcheng Heiti (desktop edition); the web edition uses system fonts so it works offline
- Preview image: user-provided low-Y witch hut screenshot (`assets/low-y-swamp-hut.webp`)
- Emscripten (MIT) — C-to-WebAssembly toolchain

This page is an unofficial WebAssembly edition of LowYSwampHut;
the compute core and result semantics come from the original project, while the web UI is newly designed.
