/* ============================================================
   Low-Y Swamp Hut · WebAssembly Edition — app logic
   - loads the C core compiled to WASM (js/lysh-core.js)
   - drives chunked, pausable scans from the main thread
   - renders results, progress, export and i18n UI
   ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------- constants */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const INT64_MIN = -(1n << 63n);
  const INT64_MAX = (1n << 63n) - 1n;
  const REGION_TO_BLOCKS = 512;

  /* 网页版不再限制搜索范围：单种子默认世界边界，种子列表默认 256。
   * 世界边界约为 137 亿个区域，单线程 WASM 需要数十分钟；进度条会给出估算。 */
  const MAX_SEEDS = 250000;
  const WARN_SEEDS = 20000;

  const TARGET_BAND_CELLS = 16384;
  const INITIAL_RATE = 7500000; // regions / second per worker, refined after each search

  const DEMO = {
    seed: '-1024459017',
    version: '26.2',
    preset: 'normal',
    height: '-40',
    minX: 39192,
    maxX: 39255,
    minZ: 9234,
    maxZ: 9297,
    side: 64
  };

  /* The seed above has 8 known low-Y huts in the project acceptance data.
   * Boot-time self-test checks all of them (one region each). */
  const SELF_TEST_SEED = -1024459017n;
  const SELF_TEST_HITS = [
    { x: 234016, z: -18221904, y: -44 },
    { x: 27607376, z: -7240176, y: -47 },
    { x: 16007952, z: 3516000, y: -43 },
    { x: 20082832, z: 4744416, y: -54 },
    { x: 10995248, z: 7276048, y: -54 },
    { x: 3267728, z: 10839360, y: -54 },
    { x: -2260784, z: 13017184, y: -54 },
    { x: -2274464, z: 17901776, y: -54 }
  ];

  /* C API hit field indices (web_api.c / eval.h) */
  const HIT = {
    X: 0, Z: 1, RX: 2, RZ: 3, DIR: 4, AVG_Y: 5,
    FLOODED: 6, OK: 7, WET: 8, SIZE_X: 9, SIZE_Z: 10, REJECT: 11
  };

  /* ---------------------------------------------------------- state */
  const state = {
    lang: 'zh',
    engine: null,
    engineReady: false,
    engineStatus: 'loading',
    engineVersion: '',
    selfTestOk: false,
    running: false,
    paused: false,
    stopRequested: false,
    activeMode: null,
    mode: 'single',
    view: 'table',
    rate: INITIAL_RATE,
    rateList: INITIAL_RATE,
    seeds: [],
    file: null,
    results: { single: [], list: [] },
    sort: { single: 'none', list: 'none' },
    progress: { single: newProgress(), list: newProgress() },
    search: null,
    pool: null,
    parallel: false,
    workerCount: 1,
    threadFallback: false,
    seen: new Set(),
    lastPaint: 0,
    overflowWarned: false
  };

  function newProgress() {
    return {
      statusKey: 'progress.idle',
      statusVars: null,
      phase: 'idle',
      percent: 0,
      processed: 0,
      total: 0,
      cells: 0,
      completedSeeds: 0,
      totalSeeds: 0,
      currentSeed: '',
      seedIndex: 0,
      elapsedMs: 0,
      remainingMs: -1,
      rate: 0
    };
  }

  const lang = () => (window.__LYSH_I18N ? window.__LYSH_I18N.lang : 'zh');
  const t = (key, vars) => window.t(key, vars);
  const fmt = (n) => window.formatNumber(n);

  /* ---------------------------------------------------------- small helpers */
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function parseIntStrict(value) {
    if (typeof value !== 'string') value = String(value);
    const s = value.trim();
    if (!/^[+-]?\d+$/.test(s)) return null;
    const n = Number(s);
    return Number.isSafeInteger(n) ? n : null;
  }

  function parseSeed(value) {
    const s = String(value || '').trim();
    if (!s) return { error: 'err.seedRequired' };
    if (!/^[+-]?\d+$/.test(s)) return { error: 'err.seedFormat' };
    let seed;
    try { seed = BigInt(s); } catch (e) { return { error: 'err.seedFormat' }; }
    if (seed < INT64_MIN || seed > INT64_MAX) return { error: 'err.seedRange' };
    return { seed: seed };
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return t('time.format', { d: d, h: h, m: m, s: s });
  }

  function formatDuration(ms) {
    ms = Math.max(0, ms);
    const zh = lang() === 'zh';
    if (ms < 1000) return (ms / 1000).toFixed(1) + (zh ? ' 秒' : 's');
    const sec = Math.round(ms / 1000);
    if (sec < 60) return sec + (zh ? ' 秒' : 's');
    const min = Math.round(sec / 60);
    if (min < 60) return min + (zh ? ' 分钟' : ' min');
    const hr = Math.round(min / 60);
    if (hr < 48) return hr + (zh ? ' 小时' : ' h');
    return Math.round(hr / 24) + (zh ? ' 天' : ' d');
  }

  const estimateCellsMs = (cells, mode) => {
    const rate = mode === 'single' ? state.rate : state.rateList;
    return (cells / Math.max(1, rate)) * 1000;
  };

  function chooseBandRows(width) {
    return clamp(Math.ceil(TARGET_BAND_CELLS / Math.max(1, width)), 1, 64);
  }

  function yieldToUI() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* ---------------------------------------------------------- WASM engine */
  class WasmEngine {
    constructor(module) {
      this.m = module;
      this.active = false;
      this.overflow = false;
    }

    start(seed, cfg) {
      const lo = Number(BigInt.asUintN(32, seed));
      const hi = Number(BigInt.asUintN(32, seed >> 32n));
      const ok = this.m._lysh_web_start(
        lo, hi,
        cfg.mc1182 ? 1 : 0,
        cfg.singleBiome ? 1 : 0,
        cfg.v262 ? 1 : 0,
        cfg.largeBiomes ? 1 : 0,
        cfg.phase1Height,
        0,
        1
      );
      this.active = ok === 1;
      this.overflow = false;
      return this.active;
    }

    band(rx0, rx1, rz0, rz1, maxY) {
      if (!this.active) return [];
      const ok = this.m._lysh_web_band(rx0, rx1, rz0, rz1, maxY);
      if (ok !== 1) throw new Error('lysh_web_band failed');
      const n = this.m._lysh_web_hits_count();
      const hits = [];
      for (let i = 0; i < n; i++) {
        hits.push({
          x: this.m._lysh_web_hit_field(i, HIT.X),
          z: this.m._lysh_web_hit_field(i, HIT.Z),
          y: this.m._lysh_web_hit_field(i, HIT.AVG_Y),
          dir: this.m._lysh_web_hit_field(i, HIT.DIR),
          wet: this.m._lysh_web_hit_field(i, HIT.WET),
          sizeX: this.m._lysh_web_hit_field(i, HIT.SIZE_X),
          sizeZ: this.m._lysh_web_hit_field(i, HIT.SIZE_Z)
        });
      }
      this.overflow = this.m._lysh_web_hits_overflow() === 1;
      return hits;
    }

    close() {
      if (this.active) {
        try { this.m._lysh_web_close(); } catch (e) { /* ignore */ }
        this.active = false;
      }
    }
  }

  /** A small pool of independent WASM instances (one per Web Worker).
   *  Each worker scans a disjoint Z slice; no SharedArrayBuffer is needed,
   *  so this works on a normal HTTP origin without COOP/COEP headers. */
  class ScanPool {
    constructor(count) {
      this.count = count;
      this.workers = [];
      this.readyCount = 0;
      this.doneCount = 0;
      this.workerScanned = new Array(count).fill(0);
      this.totalScanned = 0;
      this.error = null;
      this.onHits = null;
      this.onProgress = null;
      this.onError = null;
      this.resolveDone = null;
      this.stopTimer = null;
    }

    init() {
      if (this.count < 1) return Promise.reject(new Error('no workers'));
      return new Promise((resolve, reject) => {
        let settled = false;
        let remaining = this.count;
        const timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error('worker init timeout'));
        }, 15000);
        const finish = (ok, err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (ok) resolve();
          else reject(err || new Error('worker init failed'));
        };

        for (let i = 0; i < this.count; i++) {
          let w;
          try {
            w = new Worker('js/scan-worker.js');
          } catch (e) {
            this.terminate();
            finish(false, e);
            return;
          }
          this.workers.push(w);
          w.onmessage = (ev) => {
            const msg = ev.data || {};
            if (msg.type === 'ready') {
              remaining--;
              if (remaining === 0) finish(true);
            } else {
              this.handle(i, msg);
              if (msg.type === 'error') finish(false, this.error);
            }
          };
          w.onerror = (ev) => {
            this.error = new Error((ev && ev.message) || 'worker error');
            this.terminate();
            finish(false, this.error);
            this.resolveDoneOnce();
          };
          w.onmessageerror = () => {
            this.error = new Error('worker message error');
            this.terminate();
            finish(false, this.error);
            this.resolveDoneOnce();
          };
          w.postMessage({ type: 'init' });
        }
      });
    }

    handle(index, msg) {
      if (msg.type === 'hits') {
        if (this.onHits) this.onHits(msg.hits || [], index);
      } else if (msg.type === 'progress') {
        this.workerScanned[index] = msg.scanned || 0;
        this.emitProgress();
      } else if (msg.type === 'done') {
        this.workerScanned[index] = msg.scanned || 0;
        this.doneCount++;
        this.emitProgress();
        if (this.doneCount >= this.count) this.resolveDoneOnce();
      } else if (msg.type === 'error') {
        this.error = new Error(msg.error || 'worker error');
        this.terminate();
        if (this.onError) this.onError(this.error);
        this.resolveDoneOnce();
      }
    }

    emitProgress() {
      this.totalScanned = this.workerScanned.reduce(function (a, b) { return a + b; }, 0);
      if (this.onProgress) this.onProgress(this.totalScanned);
    }

    resolveDoneOnce() {
      if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
      if (this.resolveDone) {
        const fn = this.resolveDone;
        this.resolveDone = null;
        fn();
      }
    }

    start(seed, cfg, slices, bandRows, callbacks) {
      this.onHits = callbacks.hits;
      this.onProgress = callbacks.progress;
      this.onError = callbacks.error;
      const lo = Number(BigInt.asUintN(32, seed));
      const hi = Number(BigInt.asUintN(32, seed >> 32n));
      for (let i = 0; i < this.workers.length; i++) {
        const slice = slices[i];
        this.workers[i].postMessage({
          type: 'scan',
          seedLo: lo,
          seedHi: hi,
          mc1182: cfg.mc1182 ? 1 : 0,
          singleBiome: cfg.singleBiome ? 1 : 0,
          v262: cfg.v262 ? 1 : 0,
          largeBiomes: cfg.largeBiomes ? 1 : 0,
          phase1Height: cfg.phase1Height,
          maxY: cfg.maxY,
          rx0: cfg.rx0,
          rx1: cfg.rx1,
          rz0: slice.rz0,
          rz1: slice.rz1,
          bandRows: bandRows
        });
      }
    }

    waitDone() {
      if (this.doneCount >= this.count) return Promise.resolve();
      return new Promise((resolve) => { this.resolveDone = resolve; });
    }

    pause() { this.workers.forEach(function (w) { w.postMessage({ type: 'pause' }); }); }
    resume() { this.workers.forEach(function (w) { w.postMessage({ type: 'resume' }); }); }

    stop() {
      this.workers.forEach(function (w) { w.postMessage({ type: 'stop' }); });
      // A worker can be in the middle of one C band; give it a moment to
      // finish the band and report done, then force-release the UI.
      this.stopTimer = setTimeout(() => {
        if (this.doneCount < this.count) {
          this.terminate();
          this.resolveDoneOnce();
        }
      }, 1500);
    }

    terminate() {
      if (this.stopTimer) { clearTimeout(this.stopTimer); this.stopTimer = null; }
      this.workers.forEach(function (w) {
        try { w.terminate(); } catch (e) { /* ignore */ }
      });
      this.workers = [];
    }
  }

  /* ---------------------------------------------------------- boot */
  async function bootEngine() {
    const overlay = $('bootOverlay');
    overlay.classList.remove('is-hidden');
    $('bootError').classList.add('hidden');
    $('bootRetry').classList.add('hidden');
    $('bootTitle').textContent = t('boot.title');
    $('bootText').textContent = t('boot.text');
    setBootProgress(6);

    let fake = 6;
    const timer = setInterval(() => {
      fake = Math.min(88, fake + (88 - fake) * 0.09 + 0.4);
      setBootProgress(fake);
    }, 150);

    try {
      if (typeof WebAssembly === 'undefined') {
        throw new Error('This browser does not support WebAssembly.');
      }
      if (typeof createLyshCore !== 'function') {
        throw new Error('js/lysh-core.js is missing or failed to load.');
      }

      const module = await createLyshCore({
        print: function () { console.log.apply(console, ['[lysh]'].concat(Array.from(arguments))); },
        printErr: function () { console.warn.apply(console, ['[lysh]'].concat(Array.from(arguments))); },
        onAbort: function (what) { console.error('[lysh] aborted:', what); }
      });

      if (!module || !module._lysh_web_start) {
        throw new Error('The WASM module did not expose the expected API.');
      }

      state.engine = new WasmEngine(module);
      let version = '2.0.3';
      try {
        const ptr = module._lysh_web_version();
        if (ptr) version = module.UTF8ToString(ptr);
      } catch (e) { /* keep fallback */ }
      state.engineVersion = version;
      state.engineReady = true;
      state.engineStatus = 'ready';

      const shortVersion = /(\d+\.\d+\.\d+)/.exec(version);
      $('engineVersion').textContent = shortVersion ? 'v' + shortVersion[1] : version;
      $('footerVersion').textContent = version;
      setEngineState('ready');
      setBootProgress(100);

      // Verify the WASM build against one of the project's known-good huts.
      try {
        state.selfTestOk = runSelfTest();
      } catch (e) {
        state.selfTestOk = false;
        console.warn('[lysh] self-test failed:', e);
      }
      if (!state.selfTestOk) {
        setTimeout(function () { showToast(t('boot.selftestFail'), 'warn', 6500); }, 900);
      } else {
        $('engineBadge').title = t('engine.ready') + ' · ' + version + ' · self-test OK';
      }

      clearInterval(timer);
      setTimeout(function () { overlay.classList.add('is-hidden'); }, 420);
    } catch (err) {
      clearInterval(timer);
      state.engineReady = false;
      state.engineStatus = 'error';
      setEngineState('error');
      showBootError(err);
      console.error('[lysh] boot failed:', err);
    }
    syncButtons();
  }

  function setBootProgress(pct) {
    $('bootProgress').style.width = clamp(pct, 0, 100) + '%';
  }

  function showBootError(err) {
    $('bootTitle').textContent = t('boot.failed');
    $('bootText').textContent = t('boot.failedHint');
    const box = $('bootError');
    box.classList.remove('hidden');
    box.textContent = String(err && err.stack ? err.stack : err);
    $('bootRetry').classList.remove('hidden');
    setBootProgress(100);
  }

  function runSelfTest() {
    // All 8 known huts for seed -1024459017 (project acceptance data).
    // One session (one noise-stack init) is reused for all 8 one-region bands.
    const cfg = {
      mc1182: 0, singleBiome: 0, v262: 1, largeBiomes: 0,
      phase1Height: -40, maxY: -40
    };
    const engine = state.engine;
    if (!engine) return false;
    try {
      if (!engine.start(SELF_TEST_SEED, cfg)) return false;
      for (let i = 0; i < SELF_TEST_HITS.length; i++) {
        const h = SELF_TEST_HITS[i];
        const rx = Math.floor(h.x / 512);
        const rz = Math.floor(h.z / 512);
        const hits = engine.band(rx, rx + 1, rz, rz + 1, -40);
        if (!hits.some(function (hit) {
          return hit.x === h.x && hit.z === h.z && hit.y === h.y;
        })) return false;
      }
      return true;
    } finally {
      engine.close();
    }
  }

  /* ---------------------------------------------------------- engine badge */
  function setEngineState(status) {
    state.engineStatus = status;
    const badge = $('engineBadge');
    const text = $('engineText');
    badge.classList.remove('is-ready', 'is-error');
    if (status === 'ready') {
      badge.classList.add('is-ready');
      text.textContent = t('engine.ready');
    } else if (status === 'error') {
      badge.classList.add('is-error');
      text.textContent = t('engine.error');
      badge.title = t('engine.error');
    } else {
      text.textContent = t('engine.loading');
    }
  }

  /* ---------------------------------------------------------- ranges */
  const DEFAULT_SIDE = { s: 117188, l: 256 };

  /** Number of independent WebAssembly workers for a single-seed search.
   *  file:// cannot start workers in Chrome; HTTP(S) can use CPU cores. */
  function cpuCores() {
    try {
      const n = Number(navigator.hardwareConcurrency);
      return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 0;
    } catch (e) {
      return 0;
    }
  }

  function workerCount() {
    if (location.protocol === 'file:') return 1;
    if (typeof Worker === 'undefined') return 1;
    const cores = cpuCores();
    if (!cores) return 1;
    const small = !!(window.matchMedia && window.matchMedia('(max-width: 900px)').matches);
    const mem = Number(navigator.deviceMemory);
    const maxByMode = small ? 4 : 12;
    const byMem = Number.isFinite(mem) && mem > 0
      ? (mem >= 8 ? 12 : (mem >= 4 ? 4 : 2))
      : (small ? 4 : 8);
    return Math.max(1, Math.min(maxByMode, cores, byMem));
  }

  function threadHintKey(n) {
    if (n > 1) return 'hint.threadsAuto';
    if (state.threadFallback) return 'hint.threadsFallback';
    if (location.protocol === 'file:') return 'hint.threadsSingle';
    if (typeof Worker === 'undefined') return 'hint.threadsFallback';
    if (!cpuCores()) return 'hint.threadsUnknown';
    return 'hint.threadsOneCore';
  }

  function syncThreadHint() {
    const n = state.workerCount || 1;
    const key = threadHintKey(n);
    const hint = key === 'hint.threadsAuto' ? t(key, { n: n }) : t(key);
    const sThreads = $('sThreads');
    const lThreads = $('lThreads');
    if (sThreads) sThreads.value = String(n);
    if (lThreads) lThreads.value = '1';
    const sHint = $('sThreadHint');
    if (sHint) sHint.textContent = hint;
    const lHint = $('lThreadHint');
    if (lHint) lHint.textContent = t('hint.threadsList');
    if (sThreads) sThreads.title = hint;
  }

  function tryReadRange(prefix) {
    const squareEl = $(prefix + 'SquareMode');
    if (!squareEl) return { ok: false, errorKey: 'range.badInteger' };
    const square = squareEl.checked;
    const maxY = Number($(prefix + 'Height').value);
    const version = $(prefix + 'Version').value;
    const preset = $(prefix + 'Preset').value;

    let minX, maxX, minZ, maxZ, side = null;

    if (square) {
      side = parseIntStrict($(prefix + 'Side').value);
      if (side == null || side < 1) return { ok: false, errorKey: 'range.badInteger' };
      minX = -Math.floor(side / 2);
      maxX = minX + side - 1;
      minZ = minX;
      maxZ = maxX;
    } else {
      minX = parseIntStrict($(prefix + 'MinX').value);
      maxX = parseIntStrict($(prefix + 'MaxX').value);
      minZ = parseIntStrict($(prefix + 'MinZ').value);
      maxZ = parseIntStrict($(prefix + 'MaxZ').value);
      if (minX == null || maxX == null || minZ == null || maxZ == null) {
        return { ok: false, errorKey: 'range.badInteger' };
      }
      if (minX > maxX || minZ > maxZ) return { ok: false, errorKey: 'range.badOrder' };
    }

    // The UI fields are inclusive; the C core scans [rx0, rx1).
    if (minX < -2147483648 || maxX > 2147483646 ||
        minZ < -2147483648 || maxZ > 2147483646) {
      return { ok: false, errorKey: 'range.badInteger' };
    }

    const width = maxX - minX + 1;
    const height = maxZ - minZ + 1;
    if (width <= 0 || height <= 0) return { ok: false, errorKey: 'range.badOrder' };
    const cells = width * height;
    if (!Number.isSafeInteger(cells) || cells <= 0) {
      return { ok: false, errorKey: 'range.tooLargeTitle' };
    }

    return {
      ok: true,
      minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ,
      rx0: minX, rx1: maxX + 1, rz0: minZ, rz1: maxZ + 1,
      width: width, height: height, cells: cells, side: side, square: square,
      maxY: maxY, version: version, preset: preset
    };
  }

  function buildConfig(range) {
    return {
      minX: range.minX, maxX: range.maxX, minZ: range.minZ, maxZ: range.maxZ,
      rx0: range.rx0, rx1: range.rx1, rz0: range.rz0, rz1: range.rz1,
      width: range.width, height: range.height, cells: range.cells,
      maxY: range.maxY,
      phase1Height: Math.max(range.maxY, -50),
      mc1182: range.version === '1.18' ? 1 : 0,
      v262: range.version === '26.2' ? 1 : 0,
      singleBiome: range.preset === 'single' ? 1 : 0,
      largeBiomes: range.preset === 'large' ? 1 : 0,
      version: range.version,
      preset: range.preset
    };
  }

  function syncBoundsFromSide(prefix) {
    const square = $(prefix + 'SquareMode').checked;
    if (!square) return;
    const side = parseIntStrict($(prefix + 'Side').value);
    if (side == null || side < 1) return;
    const min = -Math.floor(side / 2);
    const max = min + side - 1;
    $(prefix + 'MinX').value = String(min);
    $(prefix + 'MaxX').value = String(max);
    $(prefix + 'MinZ').value = String(min);
    $(prefix + 'MaxZ').value = String(max);
  }

  function updateBlockHint(input, hintEl) {
    if (!input || !hintEl) return;
    const v = parseIntStrict(input.value);
    hintEl.textContent = v == null ? '' : t('range.blocks', { n: fmt(v * REGION_TO_BLOCKS) });
  }

  function updateHints(prefix) {
    updateBlockHint($(prefix + 'Side'), $(prefix + 'SideBlocks'));
    updateBlockHint($(prefix + 'MinX'), $(prefix + 'MinXBlocks'));
    updateBlockHint($(prefix + 'MaxX'), $(prefix + 'MaxXBlocks'));
    updateBlockHint($(prefix + 'MinZ'), $(prefix + 'MinZBlocks'));
    updateBlockHint($(prefix + 'MaxZ'), $(prefix + 'MaxZBlocks'));
  }

  function updateRangeSummaries() {
    ['s', 'l'].forEach(function (prefix) {
      const el = $(prefix + 'RangeSummary');
      if (!el) return;
      const r = tryReadRange(prefix);
      if (!r.ok) {
        el.textContent = '–';
        el.classList.remove('over');
        return;
      }
      const ms = estimateCellsMs(r.cells, prefix === 's' ? 'single' : 'list');
      el.textContent = t('range.summary', { cells: fmt(r.cells), time: formatDuration(ms) });
      el.classList.remove('over');
      el.title = t('time.about', { t: formatDuration(ms) }) + ' · ' +
        fmt(r.cells) + ' regions × 512² blocks';
    });
  }

  function applyBoundLock(prefix, running) {
    const squareEl = $(prefix + 'SquareMode');
    if (!squareEl) return;
    const square = squareEl.checked;
    squareEl.disabled = !!running;
    $(prefix + 'Side').disabled = !!running || !square;
    ['MinX', 'MaxX', 'MinZ', 'MaxZ'].forEach(function (id) {
      $(prefix + id).disabled = !!running || square;
    });
    const bounds = $(prefix + 'Bounds');
    if (bounds) {
      bounds.classList.toggle('is-locked', square);
      bounds.classList.toggle('square-on', square);
    }
    const presets = $(prefix + 'Presets');
    if (presets) $$('.preset-btn', presets).forEach(function (b) { b.disabled = !!running; });
  }

  function setSquareMode(prefix, side) {
    $(prefix + 'SquareMode').checked = true;
    $(prefix + 'Side').value = String(side);
    syncBoundsFromSide(prefix);
    applyBoundLock(prefix, false);
    updateHints(prefix);
    updateRangeSummaries();
    markPreset(prefix, side);
  }

  function markPreset(prefix, side) {
    const container = $(prefix + 'Presets');
    if (!container) return;
    $$('.preset-btn', container).forEach(function (b) {
      b.classList.toggle('active', Number(b.dataset.side) === Number(side));
    });
  }

  function resetRange(prefix) {
    const side = DEFAULT_SIDE[prefix];
    setSquareMode(prefix, side);
    showToast(t('toast.rangeReset'), 'success');
  }

  function handlePreset(prefix, side) {
    setSquareMode(prefix, side);
  }

  /* ---------------------------------------------------------- results */
  function resultKey(seed, x, z) {
    return (seed == null ? '' : String(seed)) + '|' + x + '|' + z;
  }

  function addHits(hits, seed) {
    const mode = state.activeMode;
    if (!mode) return;
    const seedStr = seed == null ? null : seed.toString();
    const arr = state.results[mode];
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      const key = resultKey(seedStr, h.x, h.z);
      if (state.seen.has(key)) continue;
      state.seen.add(key);
      arr.push({
        seed: seedStr,
        x: h.x, y: h.y, z: h.z,
        dir: h.dir, wet: h.wet, sizeX: h.sizeX, sizeZ: h.sizeZ
      });
    }
  }

  function groupResults(mode) {
    const arr = state.results[mode];
    if (mode === 'single') {
      const rows = arr.slice();
      if (state.sort.single === 'y') rows.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      return [{ seed: null, rows: rows }];
    }

    const map = new Map();
    for (let i = 0; i < arr.length; i++) {
      const r = arr[i];
      const key = r.seed;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const groups = [];
    map.forEach(function (rows, seed) {
      rows.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
      groups.push({
        seed: seed,
        rows: rows,
        minY: rows.reduce(function (m, r) { return Math.min(m, r.y); }, Infinity),
        minDist: rows.reduce(function (m, r) {
          return Math.min(m, r.x * r.x + r.z * r.z);
        }, Infinity)
      });
    });
    if (state.sort.list === 'y') {
      groups.sort(function (a, b) { return a.minY - b.minY; });
    } else if (state.sort.list === 'distance') {
      groups.sort(function (a, b) { return a.minDist - b.minDist; });
    }
    return groups;
  }

  function orderedRows(mode) {
    const out = [];
    groupResults(mode).forEach(function (g) { g.rows.forEach(function (r) { out.push(r); }); });
    return out;
  }

  function resultsText(mode) {
    const groups = groupResults(mode);
    const lines = [];
    groups.forEach(function (g) {
      if (g.seed != null) lines.push(g.seed);
      g.rows.forEach(function (r) {
        lines.push('/tp ' + r.x + ' ' + r.y + ' ' + r.z);
      });
    });
    return lines.length ? lines.join('\n') + '\n' : '';
  }

  function yClass(y) {
    if (y <= -45) return '';
    if (y <= -35) return 'y-mid';
    return 'y-high';
  }

  function makeCell(text, cls) {
    const td = document.createElement('td');
    if (cls) td.className = cls;
    td.textContent = text;
    return td;
  }

  function renderResults() {
    const mode = state.mode;
    const all = state.results[mode];
    const groups = groupResults(mode);
    const rows = [];
    groups.forEach(function (g) { g.rows.forEach(function (r) { rows.push(r); }); });

    $('resultsCount').textContent = fmt(all.length);
    const empty = all.length === 0;
    $('resultsEmpty').classList.toggle('hidden', !empty);
    $('resultsTableWrap').classList.toggle('hidden', empty || state.view !== 'table');
    $('resultsTextView').classList.toggle('hidden', empty || state.view !== 'text');
    updateResultsChrome();

    if (empty) {
      $('resultsBody').innerHTML = '';
      $('resultsRaw').textContent = '';
      syncButtons();
      return;
    }

    if (state.view === 'text') {
      $('resultsRaw').textContent = resultsText(mode);
      syncButtons();
      return;
    }

    const frag = document.createDocumentFragment();
    const listMode = mode === 'list';
    rows.forEach(function (r, index) {
      const tr = document.createElement('tr');
      tr.title = 'footprint ' + r.sizeX + '×' + r.sizeZ + ' · dir ' + r.dir + ' · wet ' + r.wet + '/63';

      tr.appendChild(makeCell(String(index + 1), 'col-idx'));

      const seedTd = document.createElement('td');
      seedTd.className = 'col-seed' + (listMode ? '' : ' hidden');
      if (r.seed != null) {
        const code = document.createElement('code');
        code.textContent = r.seed;
        seedTd.appendChild(code);
      } else {
        seedTd.textContent = '–';
      }
      tr.appendChild(seedTd);

      tr.appendChild(makeCell(String(r.x), 'cell-num'));

      const yTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'y-badge ' + yClass(r.y);
      badge.textContent = String(r.y);
      yTd.appendChild(badge);
      tr.appendChild(yTd);

      tr.appendChild(makeCell(String(r.z), 'cell-num'));

      const dist = document.createElement('td');
      dist.className = 'cell-distance';
      dist.textContent = fmt(Math.round(Math.hypot(r.x, r.z)));
      dist.title = t('table.distanceUnit', { n: fmt(Math.round(Math.hypot(r.x, r.z))) });
      tr.appendChild(dist);

      const tpTd = document.createElement('td');
      tpTd.className = 'cell-tp';
      tpTd.textContent = '/tp ' + r.x + ' ' + r.y + ' ' + r.z;
      tr.appendChild(tpTd);

      const actTd = document.createElement('td');
      actTd.className = 'col-actions';
      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'row-btn';
      copyBtn.title = t('table.copy');
      copyBtn.setAttribute('aria-label', t('table.copy'));
      copyBtn.innerHTML = '<svg class="icon"><use href="#i-copy"></use></svg>';
      copyBtn.addEventListener('click', function () {
        copyText('/tp ' + r.x + ' ' + r.y + ' ' + r.z);
      });
      actions.appendChild(copyBtn);
      actTd.appendChild(actions);
      tr.appendChild(actTd);

      frag.appendChild(tr);
    });

    $('resultsBody').replaceChildren(frag);
    syncButtons();
  }

  function updateResultsChrome() {
    const listMode = state.mode === 'list';
    const head = $('resultsHeadRow');
    if (head) {
      const seedTh = head.querySelector('.col-seed');
      if (seedTh) seedTh.classList.toggle('hidden', !listMode);
    }
    $('btnExportSeeds').classList.toggle('hidden', !listMode);
    $('btnSortDistance').classList.toggle('hidden', !listMode);
    $('btnSortY').setAttribute('aria-pressed', state.sort[state.mode] === 'y' ? 'true' : 'false');
    $('btnSortDistance').setAttribute('aria-pressed', state.sort[state.mode] === 'distance' ? 'true' : 'false');
  }

  /* ---------------------------------------------------------- progress */
  function elapsedMs() {
    const s = state.search;
    if (!s) return 0;
    let ms = performance.now() - s.startTime - s.pausedMs;
    if (state.paused && s.pauseStart) ms -= performance.now() - s.pauseStart;
    return Math.max(0, ms);
  }

  function computeRate(processed, elapsed) {
    if (processed <= 0 || elapsed < 150) return 0;
    return clamp(processed / (elapsed / 1000), 50000, 500000000);
  }

  function remainingMs(processed, total, elapsed) {
    if (processed <= 0 || elapsed <= 0) return -1;
    if (processed >= total) return 0;
    return Math.max(0, elapsed * (total - processed) / processed);
  }

  function paintProgress(force) {
    const now = performance.now();
    if (!force && now - state.lastPaint < 70) return;
    state.lastPaint = now;

    const p = state.progress[state.mode] || newProgress();
    const card = $('progressCard');
    card.classList.toggle('is-running', p.phase === 'running');
    card.classList.toggle('is-paused', p.phase === 'paused');
    card.classList.toggle('is-done', p.phase === 'done');
    card.classList.toggle('is-error', p.phase === 'error');

    $('progressStatus').textContent = t(p.statusKey, p.statusVars);
    const pct = Math.max(0, Math.min(100, p.percent || 0));
    $('progressPercent').textContent = pct.toFixed(2) + '%';
    $('progressBar').style.width = pct + '%';
    $('progressTrack').setAttribute('aria-valuenow', pct.toFixed(2));

    if (state.mode === 'list') {
      $('progressProcessed').textContent = fmt(p.completedSeeds) + ' / ' + fmt(p.totalSeeds);
    } else {
      $('progressProcessed').textContent = fmt(p.processed) + ' / ' + fmt(p.total);
    }
    $('progressResults').textContent = fmt(state.results[state.mode].length);

    if (p.elapsedMs > 0) {
      $('progressElapsed').textContent = formatTime(p.elapsedMs);
    } else if (p.phase === 'idle') {
      $('progressElapsed').textContent = t('time.zero');
    } else {
      $('progressElapsed').textContent = t('time.calculating');
    }

    let remain;
    if (p.phase === 'paused') remain = t('time.paused');
    else if (p.phase === 'done') remain = t('time.completed');
    else if (p.statusKey === 'status.stopped') remain = t('time.stopped');
    else if (p.phase === 'error') remain = t('time.stopped');
    else if (p.remainingMs < 0) remain = t('time.calculating');
    else remain = formatTime(p.remainingMs);
    $('progressRemaining').textContent = remain;

    const listRow = state.mode === 'list' && p.totalSeeds > 0;
    $('progressSeedRow').classList.toggle('hidden', !listRow);
    if (listRow) {
      $('progressCurrentSeed').textContent = p.currentSeed || '–';
      $('progressSeedIndex').textContent = fmt(p.seedIndex) + ' / ' + fmt(p.totalSeeds);
    }

    if (p.cells > 0) {
      const parts = [t('progress.estimateCells', { cells: fmt(p.cells) })];
      if (p.rate > 0) parts.push(t('progress.scanSpeed', { rate: fmt(Math.round(p.rate)) }));
      $('progressEstimate').textContent = parts.join(' · ');
    } else {
      $('progressEstimate').textContent = '';
    }
  }

  function beginSearch(mode, cfg, totalCells, totalSeeds) {
    state.running = true;
    state.paused = false;
    state.stopRequested = false;
    state.activeMode = mode;
    state.parallel = false;
    state.seen = new Set();
    state.overflowWarned = false;
    state.search = {
      startTime: performance.now(),
      pausedMs: 0,
      pauseStart: 0,
      mode: mode,
      cfg: cfg,
      totalCells: totalCells
    };

    const p = newProgress();
    p.phase = 'running';
    p.statusKey = 'status.preparing';
    p.cells = totalCells;
    p.total = mode === 'list' ? totalSeeds : cfg.cells;
    p.totalSeeds = totalSeeds;
    p.rate = 0;
    state.progress[mode] = p;

    state.results[mode] = [];
    state.sort[mode] = 'none';
    state.lastPaint = 0;

    state.mode = mode;
    setRunningUI(true);
    renderResults();
    paintProgress(true);
    syncButtons();
    return p;
  }

  function finishSearch(mode, outcome, opts) {
    opts = opts || {};
    const finalElapsed = opts.elapsed != null ? opts.elapsed : elapsedMs();
    if (state.pool) {
      state.pool.terminate();
      state.pool = null;
    }
    if (state.engine) state.engine.close();

    const p = state.progress[mode];
    state.running = false;
    state.paused = false;
    state.stopRequested = false;
    state.search = null;

    p.elapsedMs = finalElapsed;
    if (outcome === 'completed') {
      p.percent = 100;
      p.processed = mode === 'list' ? p.cells : p.total;
      p.remainingMs = 0;
      p.phase = 'done';
      if (mode === 'list' && state.seeds.length) {
        p.completedSeeds = state.seeds.length;
        p.seedIndex = state.seeds.length;
      }
      const n = state.results[mode].length;
      p.statusKey = n > 0 ? 'status.doneHits' : 'status.doneEmpty';
      p.statusVars = { n: fmt(n) };
      if (p.rate > 0) {
        if (mode === 'list') {
          state.rateList = p.rate;
        } else if (state.parallel) {
          // p.rate is already the aggregate rate of all workers.
          state.rate = p.rate;
        } else {
          // A small single-seed search ran in one thread; extrapolate it to
          // the worker count used by large searches.
          state.rate = p.rate * (state.workerCount > 1 ? state.workerCount * 0.5 : 1);
        }
      }
    } else if (outcome === 'stopped') {
      p.phase = 'idle';
      p.statusKey = 'status.stopped';
      p.remainingMs = 0;
      showToast(t('toast.stopped'), 'warn');
    } else {
      p.phase = 'error';
      p.statusKey = 'status.error';
      p.remainingMs = 0;
      const msg = opts.error && opts.error.message ? opts.error.message : String(opts.error || '');
      showToast(t('err.band', { msg: msg }), 'error', 6000);
    }

    state.parallel = false;
    setRunningUI(false);
    syncButtons();
    paintProgress(true);
  }

  function warnOverflow() {
    if (state.overflowWarned) return;
    state.overflowWarned = true;
    showToast(t('err.hitOverflow'), 'warn', 6000);
  }

  async function waitWhilePaused() {
    while (state.paused && state.running && !state.stopRequested) {
      await sleep(120);
    }
  }

  /* ---------------------------------------------------------- search runners */
  async function runSingle(seed, cfg) {
    const mode = 'single';
    const p = beginSearch(mode, cfg, cfg.cells, 0);
    let processed = 0;
    let lastYield = performance.now();
    let lastPaint = 0;
    const bandRows = chooseBandRows(cfg.width);

    try {
      if (!state.engine.start(seed, cfg)) throw new Error(t('err.oom'));
      p.statusKey = 'status.running';
      paintProgress(true);

      let z = cfg.rz0;
      while (z < cfg.rz1) {
        if (state.stopRequested) break;
        if (state.paused) { await waitWhilePaused(); continue; }

        const zEnd = Math.min(cfg.rz1, z + bandRows);
        const hits = state.engine.band(cfg.rx0, cfg.rx1, z, zEnd, cfg.maxY);
        if (state.engine.overflow) warnOverflow();
        if (hits.length) {
          addHits(hits, null);
          renderResults();
        }
        processed += (zEnd - z) * cfg.width;
        z = zEnd;

        p.processed = processed;
        p.percent = Math.min(99.99, processed / cfg.cells * 100);
        p.elapsedMs = elapsedMs();
        p.rate = computeRate(processed, p.elapsedMs);
        p.remainingMs = remainingMs(processed, cfg.cells, p.elapsedMs);

        const now = performance.now();
        if (now - lastPaint > 80 || z >= cfg.rz1) {
          paintProgress();
          lastPaint = now;
        }
        if (now - lastYield > 16) {
          await yieldToUI();
          lastYield = performance.now();
        }
      }

      if (state.stopRequested) {
        finishSearch(mode, 'stopped');
      } else {
        p.percent = 100;
        p.processed = cfg.cells;
        p.elapsedMs = elapsedMs();
        finishSearch(mode, 'completed', { elapsed: p.elapsedMs });
      }
    } catch (err) {
      console.error('[lysh] single search failed:', err);
      finishSearch(mode, 'error', { error: err });
    }
  }

  /** Switch the current single-seed search to the main-thread engine. */
  function prepareSingleThreadFallback() {
    state.threadFallback = true;
    state.workerCount = 1;
    state.parallel = false;
    state.rate = INITIAL_RATE;
    syncThreadHint();
    updateRangeSummaries();
  }

  /** Single-seed search split across Web Workers, each with its own WASM
   *  instance. Used for large ranges when the page is served over HTTP(S). */
  async function runSingleParallel(seed, cfg, count) {
    const mode = 'single';
    const p = beginSearch(mode, cfg, cfg.cells, 0);
    state.parallel = true;
    state.workerCount = count;
    p.statusKey = 'status.startingWorkers';
    paintProgress(true);

    const pool = new ScanPool(count);
    state.pool = pool;
    let processed = 0;
    let lastPaint = 0;
    let initialized = false;
    let scanStarted = false;

    try {
      await pool.init();
      initialized = true;

      if (state.stopRequested) {
        pool.terminate();
        state.pool = null;
        finishSearch(mode, 'stopped');
        return;
      }

      if (pool.error) throw pool.error;

      p.phase = 'running';
      p.statusKey = 'status.running';
      paintProgress(true);

      const rows = cfg.rz1 - cfg.rz0;
      const base = Math.floor(rows / count);
      const rem = rows % count;
      const slices = [];
      let z0 = cfg.rz0;
      for (let i = 0; i < count; i++) {
        const take = base + (i < rem ? 1 : 0);
        slices.push({ rz0: z0, rz1: z0 + take });
        z0 += take;
      }

      // Larger bands reduce worker/message overhead; still ~0.1 s per band.
      const bandRows = Math.min(4096, Math.max(1, Math.ceil(1048576 / Math.max(1, cfg.width))));

      pool.start(seed, cfg, slices, bandRows, {
        hits: function (hits) {
          if (state.stopRequested) return;
          addHits(hits, null);
          renderResults();
        },
        progress: function (scanned) {
          processed = scanned;
          p.processed = scanned;
          p.percent = Math.min(99.99, scanned / cfg.cells * 100);
          p.elapsedMs = elapsedMs();
          p.rate = computeRate(scanned, p.elapsedMs);
          p.remainingMs = remainingMs(scanned, cfg.cells, p.elapsedMs);
          const now = performance.now();
          if (now - lastPaint > 80) {
            paintProgress();
            lastPaint = now;
          }
        },
        error: function (err) {
          console.error('[lysh] scanner worker error:', err);
        }
      });
      scanStarted = true;

      await pool.waitDone();
      pool.terminate();
      state.pool = null;

      if (state.stopRequested) {
        finishSearch(mode, 'stopped');
      } else if (pool.error) {
        if (processed === 0 && !state.stopRequested) {
          prepareSingleThreadFallback();
          console.warn('[lysh] worker failed before progress; falling back to single thread.', pool.error);
          await runSingle(seed, cfg);
          return;
        }
        finishSearch(mode, 'error', { error: pool.error });
      } else {
        p.percent = 100;
        p.processed = cfg.cells;
        p.elapsedMs = elapsedMs();
        finishSearch(mode, 'completed', { elapsed: p.elapsedMs });
      }
    } catch (err) {
      pool.terminate();
      state.pool = null;

      if (state.stopRequested) {
        finishSearch(mode, 'stopped');
        return;
      }

      if (!initialized || !scanStarted) {
        // Worker creation, module load or scan startup failed: keep the
        // search usable by continuing on the main thread. The thread hint
        // explains the fallback; no error dialog is shown.
        prepareSingleThreadFallback();
        console.warn('[lysh] worker startup failed; falling back to single thread.', err);
        await runSingle(seed, cfg);
        return;
      }

      console.error('[lysh] parallel search failed:', err);
      finishSearch(mode, 'error', { error: err });
    }
  }

  async function runList(cfg) {
    const mode = 'list';
    const seeds = state.seeds;
    const totalCells = cfg.cells * seeds.length;
    const p = beginSearch(mode, cfg, totalCells, seeds.length);
    let processed = 0;
    let completed = 0;
    let lastYield = performance.now();
    let lastPaint = 0;
    const bandRows = chooseBandRows(cfg.width);

    try {
      p.statusKey = 'status.running';
      paintProgress(true);

      for (let i = 0; i < seeds.length; i++) {
        if (state.stopRequested) break;
        if (state.paused) await waitWhilePaused();
        if (state.stopRequested) break;

        const seed = seeds[i];
        p.currentSeed = seed.toString();
        p.seedIndex = i + 1;
        p.completedSeeds = completed;
        p.statusKey = 'status.running';
        paintProgress(true);

        if (!state.engine.start(seed, cfg)) throw new Error(t('err.oom'));

        let z = cfg.rz0;
        lastYield = performance.now();
        while (z < cfg.rz1) {
          if (state.stopRequested) break;
          if (state.paused) { await waitWhilePaused(); continue; }

          const zEnd = Math.min(cfg.rz1, z + bandRows);
          const hits = state.engine.band(cfg.rx0, cfg.rx1, z, zEnd, cfg.maxY);
          if (state.engine.overflow) warnOverflow();
          if (hits.length) {
            addHits(hits, seed);
            renderResults();
          }
          processed += (zEnd - z) * cfg.width;
          z = zEnd;

          p.processed = processed;
          p.percent = Math.min(99.99, processed / totalCells * 100);
          p.completedSeeds = completed;
          p.elapsedMs = elapsedMs();
          p.rate = computeRate(processed, p.elapsedMs);
          p.remainingMs = remainingMs(processed, totalCells, p.elapsedMs);

          const now = performance.now();
          if (now - lastPaint > 80 || z >= cfg.rz1) {
            paintProgress();
            lastPaint = now;
          }
          if (now - lastYield > 16) {
            await yieldToUI();
            lastYield = performance.now();
          }
        }

        state.engine.close();
        if (state.stopRequested) break;

        completed++;
        p.completedSeeds = completed;
        p.processed = processed;
        p.percent = Math.min(99.99, processed / totalCells * 100);
        p.elapsedMs = elapsedMs();
        p.rate = computeRate(processed, p.elapsedMs);
        p.remainingMs = remainingMs(processed, totalCells, p.elapsedMs);
        paintProgress(true);
      }

      if (state.stopRequested) {
        finishSearch(mode, 'stopped');
      } else {
        p.percent = 100;
        p.processed = totalCells;
        p.elapsedMs = elapsedMs();
        finishSearch(mode, 'completed', { elapsed: p.elapsedMs });
      }
    } catch (err) {
      console.error('[lysh] list search failed:', err);
      state.engine.close();
      finishSearch(mode, 'error', { error: err });
    }
  }

  /* ---------------------------------------------------------- start actions */
  function setSeedError(msg) {
    $('sSeedError').textContent = msg || '';
  }

  async function startSingle() {
    if (!state.engineReady) { showToast(t('err.engine'), 'error'); return; }
    if (state.running) { showToast(t('err.busy'), 'warn'); return; }

    setSeedError('');
    const parsed = parseSeed($('sSeed').value);
    if (parsed.error) {
      setSeedError(t(parsed.error));
      showToast(t(parsed.error), 'error');
      $('sSeed').focus();
      return;
    }

    const range = tryReadRange('s');
    if (!range.ok) {
      showToast(t(range.errorKey), 'error');
      return;
    }
    const cfg = buildConfig(range);
    const n = state.workerCount || 1;
    if (n > 1 && cfg.cells >= 8388608) {
      await runSingleParallel(parsed.seed, cfg, n);
    } else {
      await runSingle(parsed.seed, cfg);
    }
  }

  async function startList() {
    if (!state.engineReady) { showToast(t('err.engine'), 'error'); return; }
    if (state.running) { showToast(t('err.busy'), 'warn'); return; }
    if (!state.seeds.length) {
      $('lFileError').textContent = t('err.fileRequired');
      showToast(t('err.fileRequired'), 'error');
      return;
    }
    $('lFileError').textContent = '';

    const range = tryReadRange('l');
    if (!range.ok) {
      showToast(t(range.errorKey), 'error');
      return;
    }
    const cfg = buildConfig(range);
    const totalCells = cfg.cells * state.seeds.length;

    if (!Number.isSafeInteger(totalCells) || totalCells > 4e15) {
      showToast(t('range.tooLargeTitle'), 'error');
      return;
    }

    await runList(cfg);
  }

  /* ---------------------------------------------------------- pause / stop */
  function togglePause() {
    if (!state.running) return;
    const s = state.search;
    const p = state.progress[state.mode];
    if (!s || !p) return;

    if (state.paused) {
      if (s.pauseStart) {
        s.pausedMs += performance.now() - s.pauseStart;
        s.pauseStart = 0;
      }
      state.paused = false;
      p.phase = 'running';
      p.statusKey = 'status.running';
    } else {
      state.paused = true;
      s.pauseStart = performance.now();
      p.phase = 'paused';
      p.statusKey = 'status.paused';
    }
    if (state.pool) {
      if (state.paused) state.pool.pause();
      else state.pool.resume();
    }
    syncPauseLabels();
    paintProgress(true);
    syncButtons();
  }

  function stopSearch() {
    if (!state.running) return;
    const s = state.search;
    if (state.paused && s && s.pauseStart) {
      s.pausedMs += performance.now() - s.pauseStart;
      s.pauseStart = 0;
    }
    state.paused = false;
    state.stopRequested = true;
    if (state.pool) state.pool.stop();
    const p = state.progress[state.mode];
    if (p) {
      p.phase = 'running';
      p.statusKey = 'status.stopping';
    }
    syncPauseLabels();
    paintProgress(true);
    syncButtons();
  }

  function syncPauseLabels() {
    [['sPause', 's'], ['lPause', 'l']].forEach(function (pair) {
      const btn = $(pair[0]);
      if (!btn) return;
      const span = btn.querySelector('span');
      if (span) span.textContent = t(state.paused ? 'btn.resume' : 'btn.pause');
      const use = btn.querySelector('use');
      if (use) use.setAttribute('href', state.paused ? '#i-play' : '#i-pause');
    });
  }

  /* ---------------------------------------------------------- controls state */
  const SINGLE_INPUT_IDS = ['sSeed', 'sVersion', 'sPreset', 'sHeight', 'sRandom', 'sDemo', 'sStart', 'sReset'];
  const LIST_INPUT_IDS = ['lVersion', 'lPreset', 'lHeight', 'lStart', 'lReset'];

  function setRunningUI(running) {
    SINGLE_INPUT_IDS.forEach(function (id) { const el = $(id); if (el) el.disabled = !!running; });
    LIST_INPUT_IDS.forEach(function (id) { const el = $(id); if (el) el.disabled = !!running; });

    applyBoundLock('s', running);
    applyBoundLock('l', running);

    const drop = $('lDropzone');
    if (drop) drop.classList.toggle('is-disabled', !!running);
    const fileInput = $('lFileInput');
    if (fileInput) fileInput.disabled = !!running;

    $('tab-single').disabled = !!running;
    $('tab-list').disabled = !!running;

    $('sPause').disabled = !running;
    $('lPause').disabled = !running;
    $('sStop').disabled = !running;
    $('lStop').disabled = !running;

    if (!running) {
      applyBoundLock('s', false);
      applyBoundLock('l', false);
    }
    syncPauseLabels();
    syncButtons();
  }

  function syncButtons() {
    const running = state.running;
    const ready = state.engineReady;

    ['sStart', 'lStart'].forEach(function (id) {
      const el = $(id);
      if (el) el.disabled = running || !ready;
    });
    ['sReset', 'lReset'].forEach(function (id) {
      const el = $(id);
      if (el) el.disabled = running;
    });

    $('sPause').disabled = !running;
    $('lPause').disabled = !running;
    $('sStop').disabled = !running;
    $('lStop').disabled = !running;

    $('tab-single').disabled = running;
    $('tab-list').disabled = running;

    const mode = state.mode;
    const hasResults = state.results[mode].length > 0;

    $('emptyDemoBtn').disabled = running || !ready;
    $('btnCopyAll').disabled = !hasResults;
    $('btnExport').disabled = !hasResults;
    $('btnExportSeeds').disabled = !hasResults || mode !== 'list';
    $('btnSortY').disabled = !hasResults;
    $('btnSortDistance').disabled = !hasResults || mode !== 'list';
    $('btnClear').disabled = running || !hasResults;
  }

  /* ---------------------------------------------------------- tabs */
  function switchMode(mode) {
    if (state.running) {
      showToast(t('err.busy'), 'warn');
      return;
    }
    state.mode = mode;
    const single = mode === 'single';
    $('tab-single').classList.toggle('active', single);
    $('tab-list').classList.toggle('active', !single);
    $('tab-single').setAttribute('aria-selected', single ? 'true' : 'false');
    $('tab-list').setAttribute('aria-selected', single ? 'false' : 'true');
    $('panel-single').classList.toggle('hidden', !single);
    $('panel-list').classList.toggle('hidden', single);
    updateResultsChrome();
    renderResults();
    paintProgress(true);
    syncButtons();
    syncPauseLabels();
  }

  /* ---------------------------------------------------------- file loading */
  async function readFileText(file) {
    if (file && typeof file.text === 'function') {
      return await file.text();
    }
    return await new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(reader.error || new Error('read failed')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  async function loadSeedFile(file) {
    if (state.running || !file) return;
    $('lFileError').textContent = '';
    try {
      let text = await readFileText(file);
      text = text.replace(/^\uFEFF/, '');

      const seeds = [];
      const lines = text.split(/\r?\n/);
      let tooMany = false;
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line || line.charAt(0) === '#') continue;
        if (!/^[+-]?\d+$/.test(line)) continue;
        let seed;
        try { seed = BigInt(line); } catch (e) { continue; }
        if (seed < INT64_MIN || seed > INT64_MAX) continue;
        seeds.push(seed);
        if (seeds.length > MAX_SEEDS) { tooMany = true; break; }
      }

      if (tooMany) {
        throw new Error(t('err.seedTooMany', { n: fmt(seeds.length), max: fmt(MAX_SEEDS) }));
      }
      if (!seeds.length) {
        throw new Error(t('err.fileEmpty'));
      }

      state.seeds = seeds;
      state.file = file;
      updateFileUI(file, seeds.length);

      showToast(t('toast.fileLoaded', { n: fmt(seeds.length) }),
        seeds.length > WARN_SEEDS ? 'warn' : 'success',
        seeds.length > WARN_SEEDS ? 5500 : 3200);
    } catch (err) {
      state.seeds = [];
      state.file = null;
      clearFileUI();
      $('lFileError').textContent = err.message;
      showToast(err.message, 'error', 6000);
    }
  }

  function updateFileUI(file, count) {
    $('lFileName').textContent = file.name;
    $('lSeedCount').textContent = fmt(count);
    $('lFileInfo').classList.remove('hidden');
    $('lDropTitle').textContent = t('drop.loaded');
    $('lDropzone').classList.add('has-file');
    $('lFileError').textContent = '';
  }

  function clearFileUI() {
    $('lFileInfo').classList.add('hidden');
    $('lFileName').textContent = '–';
    $('lSeedCount').textContent = '0';
    $('lDropTitle').textContent = t('drop.title');
    $('lDropzone').classList.remove('has-file');
    $('lFileInput').value = '';
  }

  /* ---------------------------------------------------------- export / copy */
  function downloadText(name, text) {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1200);
      return true;
    } catch (e) {
      showToast(t('toast.ba'), 'error');
      return false;
    }
  }

  function exportResults() {
    const mode = state.mode;
    if (!state.results[mode].length) { showToast(t('toast.noResults'), 'warn'); return; }
    const name = mode === 'list' ? 'search_output.txt' : 'search_output.txt';
    if (downloadText(name, resultsText(mode))) {
      showToast(t('toast.exported', { name: name }), 'success');
    }
  }

  function exportSeedList() {
    if (state.mode !== 'list' || !state.results.list.length) {
      showToast(t('toast.noResults'), 'warn');
      return;
    }
    const groups = groupResults('list');
    const seeds = [];
    groups.forEach(function (g) {
      if (g.seed != null && seeds.indexOf(g.seed) < 0) seeds.push(g.seed);
    });
    if (!seeds.length) { showToast(t('toast.noResults'), 'warn'); return; }
    const name = 'seed_list.txt';
    if (downloadText(name, seeds.join('\n') + '\n')) {
      showToast(t('toast.exported', { name: name }), 'success');
    }
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        showToast(t('toast.copied'), 'success', 1800);
        return;
      }
    } catch (e) { /* fall through */ }

    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      ta.remove();
      showToast(ok ? t('toast.copied') : t('toast.copyFailed'), ok ? 'success' : 'error', 2000);
    } catch (e) {
      showToast(t('toast.copyFailed'), 'error');
    }
  }

  function copyAll() {
    if (!state.results[state.mode].length) { showToast(t('toast.noResults'), 'warn'); return; }
    copyText(resultsText(state.mode));
  }

  function clearResults() {
    if (state.running) return;
    state.results[state.mode] = [];
    state.sort[state.mode] = 'none';
    renderResults();
    paintProgress(true);
    showToast(t('results.cleared'), 'success', 1800);
  }

  /* ---------------------------------------------------------- modal / toast */
  function confirmDialog(title, message) {
    return new Promise(function (resolve) {
      const dlg = $('confirmDialog');
      $('confirmTitle').textContent = title;
      $('confirmMessage').textContent = message;

      function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve(dlg.returnValue === 'ok');
      }
      dlg.addEventListener('close', onClose);
      dlg.returnValue = 'cancel';
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else { resolve(false); }
    });
  }

  function showToast(message, type, duration) {
    const host = $('toastHost');
    if (!host) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    const icon = type === 'error' ? '#i-warn' : (type === 'warn' ? '#i-warn' : '#i-check');
    el.innerHTML = '<svg class="icon"><use href="' + icon + '"></use></svg><span></span>';
    el.querySelector('span').textContent = message;
    host.appendChild(el);
    const ms = duration || 3200;
    setTimeout(function () {
      el.classList.add('is-leaving');
      setTimeout(function () { el.remove(); }, 220);
    }, ms);
  }

  /* ---------------------------------------------------------- language / theme */
  function syncLangLabel() {
    const label = $('langLabel');
    if (label) label.textContent = lang() === 'zh' ? 'EN' : '中文';
  }

  function onLanguageChange() {
    state.lang = lang();
    syncLangLabel();
    syncPauseLabels();
    syncThreadHint();
    setEngineState(state.engineStatus);
    if (state.file) $('lDropTitle').textContent = t('drop.loaded');
    document.title = t('page.title');
    updateHints('s');
    updateHints('l');
    updateRangeSummaries();
    renderResults();
    paintProgress(true);
    // Some values (elapsed time, range summary) are generated text; repaint on
    // the next frame too so they pick up the new locale after layout settles.
    requestAnimationFrame(function () { paintProgress(true); });
  }

  function initTheme() {
    let theme = 'dark';
    try {
      const saved = localStorage.getItem('lysh.theme');
      if (saved === 'dark' || saved === 'light') theme = saved;
    } catch (e) { /* ignore */ }
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('lysh.theme', next); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------- events */
  function bindEvents() {
    $('tab-single').addEventListener('click', function () { switchMode('single'); });
    $('tab-list').addEventListener('click', function () { switchMode('list'); });

    $('langToggle').addEventListener('click', function () { window.toggleLang(); });
    $('themeToggle').addEventListener('click', toggleTheme);

    // single fields
    $('sSeed').addEventListener('input', function () { setSeedError(''); });
    $('sSeed').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); startSingle(); }
    });
    $('sRandom').addEventListener('click', function () {
      const bytes = new Uint8Array(8);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      let v = 0n;
      for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(bytes[i]);
      $('sSeed').value = BigInt.asIntN(64, v).toString();
      setSeedError('');
    });
    $('sDemo').addEventListener('click', fillDemo);
    $('sStart').addEventListener('click', startSingle);
    $('sPause').addEventListener('click', togglePause);
    $('sStop').addEventListener('click', stopSearch);
    $('sReset').addEventListener('click', function () { resetRange('s'); });

    $('sSquareMode').addEventListener('change', function () {
      applyBoundLock('s', state.running);
      if ($('sSquareMode').checked) syncBoundsFromSide('s');
      updateHints('s');
      updateRangeSummaries();
    });
    $('sSide').addEventListener('input', function () {
      if ($('sSquareMode').checked) syncBoundsFromSide('s');
      updateHints('s');
      updateRangeSummaries();
      clearPresetActive('s');
    });
    ['sMinX', 'sMaxX', 'sMinZ', 'sMaxZ'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        updateHints('s');
        updateRangeSummaries();
        clearPresetActive('s');
      });
    });
    $('sPresets').addEventListener('click', function (e) {
      const btn = e.target.closest('.preset-btn');
      if (btn) handlePreset('s', Number(btn.dataset.side));
    });

    // list fields
    $('lFileInput').addEventListener('change', function () {
      if (this.files && this.files[0]) loadSeedFile(this.files[0]);
    });
    $('lDropzone').addEventListener('click', function () {
      if (state.running) return;
      $('lFileInput').click();
    });
    $('lDropzone').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!state.running) $('lFileInput').click();
      }
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      $('lDropzone').addEventListener(ev, function (e) {
        e.preventDefault();
        if (!state.running) $('lDropzone').classList.add('drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      $('lDropzone').addEventListener(ev, function (e) {
        e.preventDefault();
        $('lDropzone').classList.remove('drag');
      });
    });
    $('lDropzone').addEventListener('drop', function (e) {
      if (state.running) return;
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadSeedFile(file);
    });

    $('lStart').addEventListener('click', startList);
    $('lPause').addEventListener('click', togglePause);
    $('lStop').addEventListener('click', stopSearch);
    $('lReset').addEventListener('click', function () { resetRange('l'); });

    $('lSquareMode').addEventListener('change', function () {
      applyBoundLock('l', state.running);
      if ($('lSquareMode').checked) syncBoundsFromSide('l');
      updateHints('l');
      updateRangeSummaries();
    });
    $('lSide').addEventListener('input', function () {
      if ($('lSquareMode').checked) syncBoundsFromSide('l');
      updateHints('l');
      updateRangeSummaries();
      clearPresetActive('l');
    });
    ['lMinX', 'lMaxX', 'lMinZ', 'lMaxZ'].forEach(function (id) {
      $(id).addEventListener('input', function () {
        updateHints('l');
        updateRangeSummaries();
        clearPresetActive('l');
      });
    });
    $('lPresets').addEventListener('click', function (e) {
      const btn = e.target.closest('.preset-btn');
      if (btn) handlePreset('l', Number(btn.dataset.side));
    });

    // results
    $('viewTable').addEventListener('click', function () { setView('table'); });
    $('viewText').addEventListener('click', function () { setView('text'); });
    $('btnCopyAll').addEventListener('click', copyAll);
    $('btnExport').addEventListener('click', exportResults);
    $('btnExportSeeds').addEventListener('click', exportSeedList);
    $('btnSortY').addEventListener('click', function () {
      if (state.mode === 'single') {
        state.sort.single = state.sort.single === 'y' ? 'none' : 'y';
      } else {
        state.sort.list = state.sort.list === 'y' ? 'none' : 'y';
      }
      renderResults();
    });
    $('btnSortDistance').addEventListener('click', function () {
      state.sort.list = state.sort.list === 'distance' ? 'none' : 'distance';
      renderResults();
    });
    $('btnClear').addEventListener('click', clearResults);
    $('emptyDemoBtn').addEventListener('click', async function () {
      switchMode('single');
      fillDemo();
      await startSingle();
    });

    $('bootRetry').addEventListener('click', function () { location.reload(); });

    window.addEventListener('beforeunload', function (e) {
      if (state.running) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  function clearPresetActive(prefix) {
    const container = $(prefix + 'Presets');
    if (!container) return;
    $$('.preset-btn', container).forEach(function (b) { b.classList.remove('active'); });
  }

  function setView(view) {
    state.view = view;
    $('viewTable').classList.toggle('active', view === 'table');
    $('viewText').classList.toggle('active', view === 'text');
    renderResults();
  }

  function fillDemo() {
    if (state.running) return;
    switchMode('single');
    $('sSeed').value = DEMO.seed;
    $('sVersion').value = DEMO.version;
    $('sPreset').value = DEMO.preset;
    $('sHeight').value = DEMO.height;
    $('sSquareMode').checked = false;
    $('sSide').value = String(DEMO.side);
    $('sMinX').value = String(DEMO.minX);
    $('sMaxX').value = String(DEMO.maxX);
    $('sMinZ').value = String(DEMO.minZ);
    $('sMaxZ').value = String(DEMO.maxZ);
    applyBoundLock('s', false);
    updateHints('s');
    updateRangeSummaries();
    clearPresetActive('s');
    setSeedError('');
    showToast(t('toast.demoLoaded'), 'success', 3600);
  }

  /* ---------------------------------------------------------- init */
  function init() {
    initTheme();
    state.lang = lang();
    state.workerCount = workerCount();
    state.rate = INITIAL_RATE * (state.workerCount > 1 ? state.workerCount * 0.5 : 1);
    state.rateList = INITIAL_RATE;

    $('year').textContent = String(new Date().getFullYear());
    document.title = t('page.title');

    syncThreadHint();

    // defaults: derive min/max from the square side, like the Java GUI does
    syncBoundsFromSide('s');
    syncBoundsFromSide('l');
    updateHints('s');
    updateHints('l');
    applyBoundLock('s', false);
    applyBoundLock('l', false);
    markPreset('s', 117188);
    markPreset('l', 256);

    bindEvents();
    setView('table');
    switchMode('single');
    updateRangeSummaries();
    paintProgress(true);
    syncLangLabel();
    syncPauseLabels();
    syncButtons();

    window.__lyshOnLanguageChange = onLanguageChange;

    // Live clock / ETA refresh while scanning.
    setInterval(function () {
      if (!state.running) return;
      const p = state.progress[state.mode];
      if (!p || !state.search) return;
      p.elapsedMs = elapsedMs();
      p.rate = computeRate(p.processed, p.elapsedMs);
      p.remainingMs = remainingMs(p.processed, p.cells, p.elapsedMs);
      paintProgress(true);
    }, 250);

    bootEngine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
