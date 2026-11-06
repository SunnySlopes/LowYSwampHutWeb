#!/usr/bin/env python3
"""
Fetch the Emscripten wasm-binaries archive with parallel HTTP range requests.

Why this exists: the default emsdk download is a single throttled connection in
this environment (~27 KB/s for a 700 MB archive). Range requests in parallel
aggregate much more bandwidth and keep the build reproducible.

Usage:
    python wasm/fetch_emsdk_zip.py [--out <zip>] [--threads 16]

The output name must match the file emsdk expects in its downloads/ directory.
After downloading, run `emsdk install latest` / `emsdk activate latest`; emsdk
will reuse this archive instead of downloading it again.
"""

import argparse
import concurrent.futures
import os
import sys
import time
import urllib.request

DEFAULT_URL = (
    "https://storage.googleapis.com/webassembly/emscripten-releases-builds/win/"
    "eb132757325583b787fe9414b09afea9442b72ad/wasm-binaries.zip"
)
DEFAULT_NAME = "eb132757325583b787fe9414b09afea9442b72ad-wasm-binaries.zip"
DEFAULT_SIZE = 701262388
CHUNK = 4 * 1024 * 1024


def fetch_range(url, start, end, retries=8):
    """Fetch [start, end] inclusive, retrying incomplete reads."""
    want = end - start + 1
    data = bytearray()
    for attempt in range(1, retries + 1):
        pos = start + len(data)
        if pos > end:
            break
        req = urllib.request.Request(
            url,
            headers={"Range": f"bytes={pos}-{end}", "Connection": "close"},
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                if resp.status not in (200, 206):
                    raise RuntimeError(f"HTTP {resp.status}")
                while True:
                    chunk = resp.read(256 * 1024)
                    if not chunk:
                        break
                    data.extend(chunk)
        except Exception as exc:  # noqa: BLE001 - retry any transport error
            print(
                f"  retry chunk {start//CHUNK} ({len(data)}/{want}): {exc!r}",
                file=sys.stderr,
            )
            time.sleep(0.8 * attempt)
        if len(data) >= want:
            break
    if len(data) != want:
        raise RuntimeError(f"chunk {start}-{end}: got {len(data)} of {want} bytes")
    return bytes(data)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--out", default=None)
    ap.add_argument("--threads", type=int, default=16)
    args = ap.parse_args()

    out = args.out
    if not out:
        here = os.path.dirname(os.path.abspath(__file__))
        emsdk_downloads = os.path.join(
            os.path.dirname(here), "..", "..", "..",
            "AppData", "Local", "LowYSwampHutWeb", "emsdk", "downloads"
        )
        # The path above is only a hint; prefer LOCALAPPDATA when available.
        local = os.environ.get("LOCALAPPDATA")
        if local:
            emsdk_downloads = os.path.join(local, "LowYSwampHutWeb", "emsdk", "downloads")
        out = os.path.join(emsdk_downloads, DEFAULT_NAME)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    tmp_dir = os.path.join(os.path.dirname(os.path.abspath(out)), "_parts")
    os.makedirs(tmp_dir, exist_ok=True)

    total = DEFAULT_SIZE
    count = (total + CHUNK - 1) // CHUNK
    print(f"Downloading {total/1024/1024:.1f} MB in {count} parts with {args.threads} threads")
    print(f"  -> {out}")

    started = time.time()
    part_paths = []

    def job(i):
        start = i * CHUNK
        end = min(total - 1, start + CHUNK - 1)
        path = os.path.join(tmp_dir, f"part_{i:05d}")
        if os.path.exists(path) and os.path.getsize(path) == end - start + 1:
            return path
        data = fetch_range(args.url, start, end)
        with open(path, "wb") as fh:
            fh.write(data)
        return path

    with concurrent.futures.ThreadPoolExecutor(max_workers=args.threads) as pool:
        futures = {pool.submit(job, i): i for i in range(count)}
        done = 0
        for fut in concurrent.futures.as_completed(futures):
            part_paths.append(fut.result())
            done += 1
            if done % 10 == 0 or done == count:
                elapsed = time.time() - started
                print(
                    f"  {done}/{count} parts  ({done*100.0/count:.0f}%)  "
                    f"{elapsed:.0f}s  {done*CHUNK/1024/1024/max(elapsed,0.001):.1f} MB/s"
                )

    # Assemble in order.
    print("Assembling archive...")
    with open(out, "wb") as dst:
        for i in range(count):
            path = os.path.join(tmp_dir, f"part_{i:05d}")
            with open(path, "rb") as src:
                while True:
                    buf = src.read(8 * 1024 * 1024)
                    if not buf:
                        break
                    dst.write(buf)

    size = os.path.getsize(out)
    print(f"Done: {out} ({size} bytes) in {time.time()-started:.0f}s")
    if size != total:
        print(f"WARNING: expected {total} bytes", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
