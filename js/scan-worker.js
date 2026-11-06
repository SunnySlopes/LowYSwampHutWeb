/* ============================================================
   LowYSwampHut scan worker
   - loads its own WebAssembly instance
   - scans one Z slice of the requested rectangle
   - posts hits and progress back to the main thread
   - can be paused / resumed / stopped between bands
   ============================================================ */
importScripts('lysh-core.js');

let mod = null;
let stopRequested = false;
let paused = false;

self.onmessage = function (ev) {
  const msg = ev.data || {};
  if (msg.type === 'init') {
    init(msg);
  } else if (msg.type === 'scan') {
    runScan(msg);
  } else if (msg.type === 'pause') {
    paused = true;
  } else if (msg.type === 'resume') {
    paused = false;
  } else if (msg.type === 'stop') {
    stopRequested = true;
  }
};

async function init() {
  try {
    mod = await createLyshCore({
      print: function () {},
      printErr: function () {}
    });
    if (!mod || !mod._lysh_web_start) throw new Error('WASM module has no API');
    self.postMessage({ type: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', error: String((err && err.stack) || err) });
  }
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function hitField(i, field) {
  return mod._lysh_web_hit_field(i, field);
}

async function runScan(msg) {
  if (!mod) {
    self.postMessage({ type: 'error', error: 'WASM module is not ready' });
    return;
  }

  // Do not reset paused/stopRequested here: a pause or stop sent while the
  // worker was still initializing must survive into the scan loop.
  const seedLo = msg.seedLo;
  const seedHi = msg.seedHi;
  const width = msg.rx1 - msg.rx0;
  const bandRows = Math.max(1, msg.bandRows | 0);
  const started = Date.now();
  let scanned = 0;
  let lastProgress = 0;

  const okStart = mod._lysh_web_start(
    seedLo, seedHi,
    msg.mc1182 ? 1 : 0,
    msg.singleBiome ? 1 : 0,
    msg.v262 ? 1 : 0,
    msg.largeBiomes ? 1 : 0,
    msg.phase1Height,
    0,
    1
  );
  if (!okStart) {
    self.postMessage({ type: 'error', error: 'lysh_web_start failed' });
    return;
  }

  try {
    for (let z = msg.rz0; z < msg.rz1; z += bandRows) {
      if (stopRequested) break;
      while (paused && !stopRequested) {
        await sleep(80);
      }
      if (stopRequested) break;

      const zEnd = Math.min(msg.rz1, z + bandRows);
      const ok = mod._lysh_web_band(msg.rx0, msg.rx1, z, zEnd, msg.maxY);
      if (!ok) throw new Error('lysh_web_band failed');

      const n = mod._lysh_web_hits_count();
      if (n > 0) {
        const hits = [];
        for (let i = 0; i < n; i++) {
          hits.push({
            x: hitField(i, 0),
            z: hitField(i, 1),
            y: hitField(i, 5),
            dir: hitField(i, 4),
            wet: hitField(i, 8),
            sizeX: hitField(i, 9),
            sizeZ: hitField(i, 10)
          });
        }
        self.postMessage({ type: 'hits', hits: hits });
      }

      scanned += (zEnd - z) * width;
      const now = Date.now();
      if (now - lastProgress >= 100) {
        lastProgress = now;
        self.postMessage({ type: 'progress', scanned: scanned });
      }

      // Let incoming pause/resume/stop messages run between bands.
      await sleep(0);
    }
  } catch (err) {
    self.postMessage({ type: 'error', error: String((err && err.stack) || err) });
    try { mod._lysh_web_close(); } catch (e) { /* ignore */ }
    return;
  }

  try { mod._lysh_web_close(); } catch (e) { /* ignore */ }
  self.postMessage({
    type: 'done',
    scanned: scanned,
    stopped: stopRequested,
    ms: Date.now() - started
  });
}
