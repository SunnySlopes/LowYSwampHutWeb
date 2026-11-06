/* ============================================================
   i18n — 与 Java 桌面版一致的 中文 / English 双语
   ============================================================ */
(function () {
  'use strict';

  const I18N = {
    zh: {
      'page.title': '低 Y 女巫小屋搜索 · WebAssembly 版',
      'brand.name': '低 Y 女巫小屋',
      'brand.tag': 'Low-Y Swamp Hut · Web',
      'nav.search': '开始搜索',
      'nav.features': '功能',
      'nav.how': '原理',
      'nav.faq': '常见问题',

      'engine.loading': '引擎加载中',
      'engine.ready': 'WASM 就绪',
      'engine.error': 'WASM 不可用',

      'hero.eyebrow': 'MINECRAFT JAVA EDITION · WEBASSEMBLY',
      'hero.title1': '在浏览器里，',
      'hero.title2': '找到最低的女巫小屋',
      'hero.lede': '完整移植自 LowYSwampHut 的 C 内核，通过 WebAssembly 在你的设备上本地计算。不需要安装 Java，不需要上传种子 —— 打开网页就能开始。',
      'hero.ctaPrimary': '开始搜索',
      'hero.ctaSecondary': '它如何工作',
      'hero.stat1': '版本支持',
      'hero.stat2': '世界类型',
      'hero.stat3': '本地计算',

      'features.eyebrow': '为什么用它',
      'features.title': '与桌面版同源的搜索内核',
      'features.sub': '不是重新实现，也不是查表 —— 是同一套 C 代码编译成 WebAssembly。',
      'features.f1.title': '同一套 C 内核',
      'features.f1.body': '阶段 1 气候筛选与阶段 2 精确高度都由原项目 C 内核完成，与 Java 桌面版走同一条代码路径。',
      'features.f2.title': '种子不出浏览器',
      'features.f2.body': '所有计算在本地 WebAssembly 中完成，没有后端、没有上传、没有遥测。断网也能继续用。',
      'features.f3.title': '精确的小屋 Y',
      'features.f3.body': 'Y 来自 footprint 全部 63 列的平均高度，并经过含水层灌满判定 —— 就是游戏里真实的建筑高度。',
      'features.f4.title': '多版本 · 多世界',
      'features.f4.body': '支持 26.2~26.3、1.19.x~26.1、1.18.x，以及普通、巨型生物群系、单群系（沼泽）三种世界。',

      'app.eyebrow': '搜索控制台',
      'app.title': '开始寻找你的低 Y 女巫小屋',
      'app.sub': '单种子默认世界边界（HTTP 下自动多线程），种子列表默认 256；file:// 下为单线程，建议用 serve 启动以启用多线程。',
      'hint.threads': '浏览器版固定单线程',
      'hint.threadsAuto': '自动：{n} 个 Web Worker',
      'hint.threadsSingle': 'file:// 下为单线程；用 serve 启动可多线程',
      'hint.threadsUnknown': '无法读取 CPU 核心数，已使用单线程',
      'hint.threadsFallback': '多线程不可用，已回退单线程',
      'hint.threadsOneCore': '仅检测到 1 个逻辑核心，使用单线程',
      'hint.threadsList': '列表模式逐个种子扫描',
      'hint.heightShort': '只保留 -40 及以下',
      'hint.square': '取消勾选可手动填写 Min/Max',
      'known.title': '示例种子的已知结果',
      'known.desc': '这是原项目验收数据中该种子的 8 个小屋。示例按钮只搜索其中第 4 个；完整列表可由世界边界搜索得到。',
      'tab.single': '单种子搜索',
      'tab.list': '从种子列表搜索',
      'panel.target': '搜索目标',
      'panel.world': '世界参数',
      'panel.range': '搜索范围',
      'panel.seedFile': '种子列表',
      'label.seedFile': '种子文件',
      'label.seed': '种子 Seed',
      'label.version': '版本',
      'label.preset': '世界类型',
      'label.height': '筛选小屋高度',
      'label.threads': '线程数',
      'label.squareMode': '使用以 (0,0) 为中心的正方形区域',
      'label.side': '正方形边长',
      'hint.seed': '支持 -2^63 ~ 2^63-1 的整数',
      'hint.height': '高度门槛越高，搜索越慢。Y 取自 footprint 的平均高度。',
      'hint.range': '区域坐标 × 512 = 方块坐标。范围越大，耗时越长；可在下方看到预计时间。',
      'preset.normal': '普通世界',
      'preset.large': '巨型生物群系',
      'preset.single': '单群系（沼泽）',
      'preset.demo': '示例 64',
      'preset.world': '世界边界',
      'drop.title': '拖入种子文件，或点击选择',
      'drop.hint': '纯文本，每行一个种子；空行与 # 开头的行会被忽略',
      'drop.loaded': '已载入种子文件',

      'btn.demo': '示例',
      'btn.start': '开始搜索',
      'btn.pause': '暂停',
      'btn.resume': '继续',
      'btn.stop': '停止',
      'btn.reset': '重置',
      'btn.resetDefault': '重置',
      'btn.export': '导出',
      'btn.exportSeeds': '导出种子列表',
      'btn.sortY': '按 Y 排序',
      'btn.sortDistance': '按距离排序',
      'btn.clear': '清空',
      'btn.copyAll': '复制全部',
      'btn.tryDemo': '试试示例种子',
      'btn.cancel': '取消',
      'btn.confirm': '继续',
      'btn.retry': '重新加载',

      'progress.idle': '等待开始',
      'progress.processed': '已处理',
      'progress.results': '结果',
      'progress.elapsed': '已用时间',
      'progress.remaining': '剩余时间',
      'progress.currentSeed': '当前种子',

      'results.title': '检查结果',
      'results.emptyTitle': '还没有结果',
      'results.emptyBody': '设置好种子和范围，点击「开始搜索」。命中的小屋会以 /tp 坐标的形式出现在这里。',
      'table.seed': '种子',
      'table.distance': '距离原点',
      'table.tp': '/tp 命令',

      'how.eyebrow': '原理',
      'how.title': '三步，从种子到坐标',
      'how.sub': '和桌面版完全相同的判定流程，只是在浏览器里跑。',
      'how.s1.title': '输入种子与范围',
      'how.s1.body': '种子可以是任意 64 位整数。范围用「区域」表示：1 个区域 = 32 × 32 个区块 = 512 × 512 个方块。',
      'how.s2.title': 'WASM 逐区域筛选',
      'how.s2.body': '阶段 1 用气候、洞穴梯子、大陆性与含水层洪水度快速排除绝大多数区域；只有极少数候选进入阶段 2。',
      'how.s3.title': '精确高度与群系确认',
      'how.s3.body': '阶段 2 计算 footprint 全部 63 列的平均高度，并确认群系确实是沼泽、没有被水灌满，最后输出 /tp 坐标。',
      'tech.p1.title': '气候与洞穴梯子',
      'tech.p1.body': 'erosion / temperature / ridge / continentalness 与多层洞穴噪声，逐项淘汰候选区域。',
      'tech.p2.title': '63 列 footprint',
      'tech.p2.body': '三线性插值高度图 + 含水层判定 + 洞穴雕刻，得到真实的方块高度。Y 即小屋的真实 Y。',
      'tech.biome.title': '真实群系门',
      'tech.biome.body': '用 Minecraft 的多噪声群系参数树做最终判定，而不是只看气候近似值，避免假阳性。',

      'faq.eyebrow': '常见问题',
      'faq.title': '你可能想知道',
      'faq.q1': '结果里的 Y 是什么？',
      'faq.a1': 'Y 是小屋 footprint 全部 63 列高度的平均值（整数除法，向零截断），也就是游戏里女巫小屋的真实建筑高度。它不是海平面，也不是近似值。',
      'faq.q2': '为什么整图搜索仍然需要几分钟？',
      'faq.a2': '单种子在 HTTP 下会自动使用多个 Web Worker，但整图仍有 137 亿个区域，受 CPU 和内存带宽限制，无法像小范围那样瞬间完成；file:// 下浏览器不允许 Worker 读取本地脚本，会回退为单线程，明显更慢。',
      'faq.q3': '线程数是怎么自动工作的？',
      'faq.a3': 'HTTP 下页面会启动最多 12 个 Web Worker（移动端最多 4 个），每个 Worker 持有自己的 WASM 实例并扫描一段 Z 范围，因此不需要 SharedArrayBuffer / COOP-COEP。file:// 下无法启动这种 Worker，自动回退单线程；用 serve.ps1 / serve.sh 打开即可多线程。如果浏览器无法提供 CPU 核心数，或 Worker 创建/加载失败，也会自动回退单线程，不弹错误框。',
      'faq.q4': '找不到小屋是正常的吗？',
      'faq.a4': '是。低 Y 女巫小屋非常稀有，整个 Minecraft 世界边界内通常也只有个位数到十几个。如果当前范围没有结果，可以换种子或扩大范围；高度筛选只提供 -40 及以下，-40 是最宽松的选项。',
      'faq.q7': '可以在 macOS / Linux 上运行吗？',
      'faq.a7': '可以。网页和 WASM 与操作系统无关，Chrome / Edge / Firefox / Safari 都能运行。构建脚本提供 Windows 的 build.ps1 和 macOS / Linux 的 build.sh；serve.sh 用于本地服务器。',
      'faq.q8': '这个页面使用什么许可证？',
      'faq.a8': 'MIT License。页面与 WASM 封装代码以 MIT 发布，C 内核沿用原项目的 MIT 许可证。完整文本见页面底部的许可证链接。',
      'faq.q5': '会上传我的种子或数据吗？',
      'faq.a5': '不会。页面没有后端接口，所有计算在浏览器本地完成。种子只存在于当前页面内存中，刷新或关闭页面后即消失。',
      'faq.q6': '支持哪些版本和世界类型？',
      'faq.a6': '支持 26.2~26.3（默认）、1.19.x~26.1、1.18.x；世界类型支持普通、巨型生物群系和单群系（沼泽）。版本会同时影响阶段 1 规则和群系参数表。',

      'credit.quote': '每一个种子，都有一个低 y 女巫小屋的梦想。',
      'credit.by': '—— SunnySlopes · 原作：b站 M33三角座星系 & SunnySlopes',
      'credit.web': '本页面是 LowYSwampHut 的 WebAssembly 网页版，计算内核来自原项目，UI 为网页重新设计。',
      'footer.engine': '内核',
      'footer.mobile': '移动版',
      'footer.desktop': '桌面版',
      'mobile.note': '移动版精简了页面介绍与装饰，完整说明见桌面版。多线程需用 HTTP 打开；file:// 下为单线程。',
      'license.link': 'MIT 许可证',

      'boot.title': '正在唤醒 WASM 内核…',
      'boot.text': '首次加载需要解析不到 1 MB 的 WebAssembly 模块，通常只需一两秒。',
      'boot.failed': 'WASM 内核加载失败',
      'boot.failedHint': '请确认 js/lysh-core.js 存在，并使用支持 WebAssembly 的现代浏览器打开。',
      'boot.selftestFail': '内核自检未通过：示例小屋的结果与预期不一致，搜索可能不可靠。请刷新页面或重新构建 WASM。',

      'status.idle': '等待开始',
      'status.preparing': '准备世界…',
      'status.running': '正在扫描',
      'status.paused': '已暂停',
      'status.completed': '搜索完成',
      'status.stopped': '已停止',
      'status.startingWorkers': '正在启动并行引擎…',
      'status.stopping': '正在停止…',
      'status.error': '出错',
      'status.doneEmpty': '搜索完成，没有命中',
      'status.doneHits': '搜索完成，找到 {n} 个小屋',

      'time.zero': '0天 0时 0分 0秒',
      'time.format': '{d}天 {h}时 {m}分 {s}秒',
      'time.calculating': '计算中…',
      'time.paused': '已暂停',
      'time.completed': '已完成',
      'time.stopped': '已停止',
      'time.estimating': '估算中…',
      'time.about': '约 {t}',
      'range.summary': '{cells} 区域 · 约 {time}',
      'range.blocks': '= {n} 方块',
      'range.large': '范围较大，浏览器单线程可能耗时较久',
      'range.overLimit': '超出网页上限',
      'range.world': '世界边界',
      'range.worldWarn': '完整世界边界约有 137 亿个区域，浏览器单线程预计需要数小时，超出网页版支持范围。继续将改为网页版最大范围 8192 × 8192（约 6700 万区域）。仍要继续吗？',
      'range.tooLargeTitle': '范围过大',
      'range.tooLargeBody': '当前范围有 {cells} 个区域，超过浏览器版上限 {max}。请缩小范围，或分多次搜索。',
      'range.confirmTitle': '大范围搜索',
      'range.confirmBody': '当前范围约有 {cells} 个区域，预计需要 {time}。浏览器在扫描期间会持续占用计算资源。仍要继续吗？',
      'range.badOrder': 'Min 必须小于 Max。',
      'range.badInteger': '范围必须是整数。',

      'err.seedRequired': '请输入种子。',
      'err.seedFormat': '种子必须是整数。',
      'err.seedRange': '种子超出 64 位整数范围。',
      'err.fileRequired': '请先选择种子文件。',
      'err.fileEmpty': '文件里没有有效的种子。',
      'err.fileRead': '读取文件失败：{msg}',
      'err.engine': 'WASM 引擎不可用，请刷新页面重试。',
      'err.oom': 'WASM 内存不足，请缩小搜索范围或刷新页面。',
      'err.band': '扫描过程中发生错误：{msg}',
      'err.hitOverflow': '单个分带的命中数超过内部缓冲，部分结果可能没有显示。请缩小范围后重试。',
      'err.threads': '浏览器版固定为单线程。',
      'err.busy': '已有搜索正在进行，请先停止。',
      'err.seedTooMany': '文件包含 {n} 个种子，超过浏览器版建议上限（{max}）。请拆分文件后重试。',

      'toast.copied': '已复制到剪贴板',
      'toast.copyFailed': '复制失败，请手动选择文本',
      'toast.exported': '已导出：{name}',
      'toast.noResults': '还没有可以导出的结果',
      'toast.fileLoaded': '已载入 {n} 个种子',
      'toast.demoLoaded': '已填入示例种子与范围，点击「开始搜索」',
      'toast.stopped': '搜索已停止',
      'toast.seedRequired': '先输入种子再开始',
      'toast.rangeReset': '已重置搜索范围',
      'toast.ba': '浏览器不支持导出文件',
      'toast.importNoSeeds': '没有找到有效种子',

      'list.current': '{i} / {n}',
      'list.progress': '当前种子 {i}/{n} · {p}%',
      'list.done': '已完成 {i}/{n} 个种子',
      'list.total': '总进度 {i}/{n}',
      'list.eta': '剩余约 {t}',
      'list.seed': '种子',

      'progress.estimateCells': '{cells} 个区域 · WASM',
      'progress.estimateTime': '预计约 {t}',
      'progress.scanSpeed': '{rate} 区域/秒',
      'progress.seedHits': '本种子结果 {n}',

      'results.countLabel': '{n} 条',
      'results.sortY': '已按 Y 从低到高排序',
      'results.sortDistance': '已按距离从近到远排序',
      'results.cleared': '结果已清空',
      'results.seedGroup': '种子 {seed}',

      'table.tpShort': '/tp',
      'table.copy': '复制坐标',
      'table.distanceUnit': '{n} 格',

      'common.unknown': '未知',
      'common.lowest': '最低 Y',
      'common.seconds': '秒',
      'common.minutes': '分钟',
      'common.hours': '小时'
    },

    en: {
      'page.title': 'Low-Y Swamp Hut Search · WebAssembly Edition',
      'brand.name': 'Low-Y Swamp Hut',
      'brand.tag': 'Low-Y Swamp Hut · Web',
      'nav.search': 'Search',
      'nav.features': 'Features',
      'nav.how': 'How it works',
      'nav.faq': 'FAQ',

      'engine.loading': 'Engine loading',
      'engine.ready': 'WASM ready',
      'engine.error': 'WASM unavailable',

      'hero.eyebrow': 'MINECRAFT JAVA EDITION · WEBASSEMBLY',
      'hero.title1': 'Find the lowest',
      'hero.title2': 'swamp hut, in your browser',
      'hero.lede': 'The original LowYSwampHut C core, compiled to WebAssembly and running entirely on your device. No Java install, no seed upload — just open the page.',
      'hero.ctaPrimary': 'Start searching',
      'hero.ctaSecondary': 'How it works',
      'hero.stat1': 'Versions',
      'hero.stat2': 'World presets',
      'hero.stat3': 'Local compute',

      'features.eyebrow': 'WHY THIS PAGE',
      'features.title': 'The same core as the desktop app',
      'features.sub': 'Not a reimplementation, not a lookup table — the very same C code, compiled to WebAssembly.',
      'features.f1.title': 'One C core',
      'features.f1.body': 'Phase 1 climate filtering and phase 2 exact height both run the original C core, on the exact same code path as the Java desktop app.',
      'features.f2.title': 'Seeds stay local',
      'features.f2.body': 'Everything runs in local WebAssembly. No backend, no upload, no telemetry. It even works offline.',
      'features.f3.title': 'Exact hut Y',
      'features.f3.body': 'Y is the average of all 63 footprint columns, checked against the aquifer flood test — the real in-game hut height.',
      'features.f4.title': 'Many versions',
      'features.f4.body': '26.2~26.3, 1.19.x~26.1 and 1.18.x, with Normal, Large Biomes and Single Biome (Swamp) world presets.',

      'app.eyebrow': 'SEARCH CONSOLE',
      'app.title': 'Start hunting your low-Y swamp hut',
      'app.sub': 'Single seed defaults to the world border (auto multi-worker on HTTP); the seed list defaults to 256. Under file:// it is single-threaded — use serve to enable workers.',
      'hint.threads': 'Single-threaded in the browser',
      'hint.threadsAuto': 'Auto: {n} Web Workers',
      'hint.threadsSingle': 'Single-thread under file://; use serve for workers',
      'hint.threadsUnknown': 'CPU core count unavailable; using one thread',
      'hint.threadsFallback': 'Workers unavailable; fell back to one thread',
      'hint.threadsOneCore': 'Only one logical core detected; using one thread',
      'hint.threadsList': 'Seed list scans seeds sequentially',
      'hint.heightShort': 'Only -40 or lower',
      'hint.square': 'Uncheck to enter Min/Max manually',
      'known.title': 'Known results for the demo seed',
      'known.desc': 'These are the 8 huts for this seed from the project acceptance data. The demo button searches the 4th one; the full list comes from a world-border search.',
      'tab.single': 'Single seed',
      'tab.list': 'Seed list',
      'panel.target': 'Target',
      'panel.world': 'World options',
      'panel.range': 'Search range',
      'panel.seedFile': 'Seed list',
      'label.seedFile': 'Seed file',
      'label.seed': 'Seed',
      'label.version': 'Version',
      'label.preset': 'World preset',
      'label.height': 'Max hut Y',
      'label.threads': 'Threads',
      'label.squareMode': 'Use a square range centred on (0,0)',
      'label.side': 'Square side',
      'hint.seed': 'Any integer from -2^63 to 2^63-1',
      'hint.height': 'A higher threshold is slower. Y is the footprint average height.',
      'hint.range': 'Region coordinate × 512 = block coordinate. Larger ranges take longer; an estimate is shown below.',
      'preset.normal': 'Normal',
      'preset.large': 'Large Biomes',
      'preset.single': 'Single Biome (Swamp)',
      'preset.demo': 'Demo 64',
      'preset.world': 'World border',
      'drop.title': 'Drop a seed file here, or click to choose',
      'drop.hint': 'Plain text, one seed per line; blank lines and # comments are ignored',
      'drop.loaded': 'Seed file loaded',

      'btn.demo': 'Demo',
      'btn.start': 'Start search',
      'btn.pause': 'Pause',
      'btn.resume': 'Resume',
      'btn.stop': 'Stop',
      'btn.reset': 'Reset',
      'btn.resetDefault': 'Reset',
      'btn.export': 'Export',
      'btn.exportSeeds': 'Export seed list',
      'btn.sortY': 'Sort by Y',
      'btn.sortDistance': 'Sort by distance',
      'btn.clear': 'Clear',
      'btn.copyAll': 'Copy all',
      'btn.tryDemo': 'Try the demo seed',
      'btn.cancel': 'Cancel',
      'btn.confirm': 'Continue',
      'btn.retry': 'Reload',

      'progress.idle': 'Ready',
      'progress.processed': 'Processed',
      'progress.results': 'Results',
      'progress.elapsed': 'Elapsed',
      'progress.remaining': 'Remaining',
      'progress.currentSeed': 'Current seed',

      'results.title': 'Search results',
      'results.emptyTitle': 'No results yet',
      'results.emptyBody': 'Set a seed and range, then press Start search. Matching huts will appear here as /tp coordinates.',
      'table.seed': 'Seed',
      'table.distance': 'Distance',
      'table.tp': '/tp command',

      'how.eyebrow': 'HOW IT WORKS',
      'how.title': 'Three steps from seed to coordinates',
      'how.sub': 'The exact same decision pipeline as the desktop app, running in your browser.',
      'how.s1.title': 'Enter seed and range',
      'how.s1.body': 'Any 64-bit integer works. Ranges are in regions: 1 region = 32 × 32 chunks = 512 × 512 blocks.',
      'how.s2.title': 'WASM filters each region',
      'how.s2.body': 'Phase 1 quickly rejects the vast majority using climate, cave ladders, continentalness and aquifer floodedness; only a handful reach phase 2.',
      'how.s3.title': 'Exact height and biome check',
      'how.s3.body': 'Phase 2 averages all 63 footprint columns, confirms the biome is really swamp and that the footprint is not flooded, then emits the /tp coordinates.',
      'tech.p1.title': 'Climate and cave ladders',
      'tech.p1.body': 'Erosion, temperature, ridge and continentalness gates, plus multiple cave noise layers, reject candidate regions one by one.',
      'tech.p2.title': '63-column footprint',
      'tech.p2.body': 'Trilinear interpolated heightmap, aquifer test and cave carving produce the real block height. Y is the hut’s true Y.',
      'tech.biome.title': 'Real biome gate',
      'tech.biome.body': 'The final check uses Minecraft’s multi-noise biome parameter tree rather than the climate approximation, eliminating false positives.',

      'faq.eyebrow': 'FAQ',
      'faq.title': 'Things you may wonder',
      'faq.q1': 'What does the Y value mean?',
      'faq.a1': 'Y is the average of all 63 footprint column heights (integer division, truncated toward zero) — the actual in-game witch hut height. It is not sea level, and it is not an approximation.',
      'faq.q2': 'Why does a full-world scan still take minutes?',
      'faq.a2': 'A single seed uses several Web Workers over HTTP, but the full world still has 13.7 billion regions and is limited by CPU and memory bandwidth; it cannot finish instantly like a small range. Under file:// the browser blocks local worker scripts, so it falls back to one thread and is noticeably slower.',
      'faq.q3': 'How does the thread count work?',
      'faq.a3': 'Over HTTP the page starts up to 12 Web Workers (up to 4 on mobile). Each worker owns its own WASM instance and scans a Z slice, so SharedArrayBuffer / COOP-COEP are not required. Under file:// those workers cannot load local scripts, so it falls back to one thread; use serve.ps1 / serve.sh to get the workers. If the CPU core count is unavailable or a worker fails to start, the page also falls back to one thread without an error dialog.',
      'faq.q4': 'Is it normal to find nothing?',
      'faq.a4': 'Yes. Low-Y swamp huts are extremely rare — often only a handful to a dozen across the entire world border. If the current range finds nothing, try another seed or a larger range; the height filter only offers -40 and below, and -40 is the loosest option.',
      'faq.q7': 'Does it run on macOS / Linux?',
      'faq.a7': 'Yes. The page and WebAssembly are OS-independent and work in Chrome / Edge / Firefox / Safari. Build scripts are provided for both Windows (build.ps1) and macOS / Linux (build.sh); use serve.sh for a local server.',
      'faq.q8': 'What license is this page under?',
      'faq.a8': 'MIT License. The page and WASM wrapper are released under MIT, and the C core keeps the original project’s MIT license. The full text is linked in the footer.',
      'faq.q5': 'Do you upload my seed or data?',
      'faq.a5': 'No. There is no backend. Everything is computed locally in your browser. Seeds only live in the current page’s memory and disappear when you refresh or close the page.',
      'faq.q6': 'Which versions and world types are supported?',
      'faq.a6': '26.2~26.3 (default), 1.19.x~26.1 and 1.18.x, with Normal, Large Biomes and Single Biome (Swamp) presets. The version affects both phase 1 rules and the biome parameter table.',

      'credit.quote': 'Every seed has a dream of a low-Y swamp hut.',
      'credit.by': '— SunnySlopes · Original by M33Galaxy & SunnySlopes',
      'credit.web': 'This page is the WebAssembly edition of LowYSwampHut. The compute core comes from the original project; the web UI is newly designed.',
      'footer.engine': 'Core',
      'footer.mobile': 'Mobile',
      'footer.desktop': 'Desktop',
      'mobile.note': 'The mobile edition keeps the search console only; see the desktop page for the full guide. Multi-worker needs HTTP; file:// is single-threaded.',
      'license.link': 'MIT License',

      'boot.title': 'Waking up the WASM core…',
      'boot.text': 'The first load parses under 1 MB of WebAssembly, which usually takes a second or two.',
      'boot.failed': 'Failed to load the WASM core',
      'boot.failedHint': 'Make sure js/lysh-core.js exists and open the page in a modern browser with WebAssembly support.',
      'boot.selftestFail': 'Core self-test failed: the known sample hut does not match the expected result. Search results may be unreliable. Reload the page or rebuild the WASM core.',

      'status.idle': 'Ready',
      'status.preparing': 'Preparing world…',
      'status.running': 'Scanning',
      'status.paused': 'Paused',
      'status.completed': 'Search complete',
      'status.stopped': 'Stopped',
      'status.startingWorkers': 'Starting parallel workers…',
      'status.stopping': 'Stopping…',
      'status.error': 'Error',
      'status.doneEmpty': 'Complete — no hits',
      'status.doneHits': 'Complete — {n} hut(s) found',

      'time.zero': '0d 0h 0m 0s',
      'time.format': '{d}d {h}h {m}m {s}s',
      'time.calculating': 'Calculating…',
      'time.paused': 'Paused',
      'time.completed': 'Completed',
      'time.stopped': 'Stopped',
      'time.estimating': 'Estimating…',
      'time.about': 'about {t}',
      'range.summary': '{cells} regions · ~{time}',
      'range.blocks': '= {n} blocks',
      'range.large': 'Large range — single-threaded WASM may take a while',
      'range.overLimit': 'Over the web limit',
      'range.world': 'World border',
      'range.worldWarn': 'The full world border has about 13.7 billion regions. Single-threaded WASM would take hours and it exceeds the web limit. Continuing will use the web maximum of 8192 × 8192 (about 67 million regions). Continue?',
      'range.tooLargeTitle': 'Range too large',
      'range.tooLargeBody': 'This range has {cells} regions, above the web limit of {max}. Please shrink it or split the search.',
      'range.confirmTitle': 'Large search',
      'range.confirmBody': 'This range has about {cells} regions and may take {time}. The browser will keep using CPU while it scans. Continue?',
      'range.badOrder': 'Min must be less than Max.',
      'range.badInteger': 'Range values must be integers.',

      'err.seedRequired': 'Please enter a seed.',
      'err.seedFormat': 'The seed must be an integer.',
      'err.seedRange': 'The seed is outside the 64-bit integer range.',
      'err.fileRequired': 'Please choose a seed file first.',
      'err.fileEmpty': 'The file contains no valid seeds.',
      'err.fileRead': 'Could not read the file: {msg}',
      'err.engine': 'The WASM engine is unavailable. Please reload the page.',
      'err.oom': 'WASM ran out of memory. Shrink the range or reload the page.',
      'err.band': 'Scan error: {msg}',
      'err.hitOverflow': 'A single band produced more hits than the internal buffer could hold, so some results may be missing. Try a smaller range.',
      'err.threads': 'The web build is fixed to a single thread.',
      'err.busy': 'A search is already running. Stop it first.',
      'err.seedTooMany': 'The file contains {n} seeds, above the recommended web limit of {max}. Please split the file.',

      'toast.copied': 'Copied to clipboard',
      'toast.copyFailed': 'Copy failed — please select the text manually',
      'toast.exported': 'Exported: {name}',
      'toast.noResults': 'There is nothing to export yet',
      'toast.fileLoaded': 'Loaded {n} seeds',
      'toast.demoLoaded': 'Demo seed and range filled in — press Start search',
      'toast.stopped': 'Search stopped',
      'toast.seedRequired': 'Enter a seed before starting',
      'toast.rangeReset': 'Search range reset',
      'toast.ba': 'This browser cannot export files',
      'toast.importNoSeeds': 'No valid seeds found',

      'list.current': '{i} / {n}',
      'list.progress': 'Seed {i}/{n} · {p}%',
      'list.done': 'Completed {i}/{n} seeds',
      'list.total': 'Total {i}/{n}',
      'list.eta': '~{t} left',
      'list.seed': 'Seed',

      'progress.estimateCells': '{cells} regions · WASM',
      'progress.estimateTime': 'Estimated ~{t}',
      'progress.scanSpeed': '{rate} regions/s',
      'progress.seedHits': '{n} hit(s) for this seed',

      'results.countLabel': '{n} row(s)',
      'results.sortY': 'Sorted by Y, lowest first',
      'results.sortDistance': 'Sorted by distance, nearest first',
      'results.cleared': 'Results cleared',
      'results.seedGroup': 'Seed {seed}',

      'table.tpShort': '/tp',
      'table.copy': 'Copy coordinates',
      'table.distanceUnit': '{n} blocks',

      'common.unknown': 'unknown',
      'common.lowest': 'lowest Y',
      'common.seconds': 's',
      'common.minutes': 'm',
      'common.hours': 'h'
    }
  };

  const STORAGE_LANG = 'lysh.lang';

  function detectLang() {
    try {
      const saved = localStorage.getItem(STORAGE_LANG);
      if (saved === 'zh' || saved === 'en') return saved;
    } catch (e) { /* ignore */ }
    const nav = (navigator.language || 'zh').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'en';
  }

  let current = detectLang();

  function formatNumber(n) {
    try { return Number(n).toLocaleString(current === 'zh' ? 'zh-CN' : 'en-US'); }
    catch (e) { return String(n); }
  }

  function t(key, vars) {
    const dict = I18N[current] || I18N.zh;
    let s = dict[key];
    if (s == null) s = (I18N.zh[key] != null ? I18N.zh[key] : key);
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] == null ? m : String(vars[name]);
      });
    }
    return s;
  }

  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (el.getAttribute('data-i18n-html') === 'true') el.innerHTML = val;
      else el.textContent = val;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
  }

  function setLang(lang, opts) {
    current = lang === 'en' ? 'en' : 'zh';
    document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
    try { localStorage.setItem(STORAGE_LANG, current); } catch (e) { /* ignore */ }
    applyI18n(document);
    if (!(opts && opts.silent) && typeof window.__lyshOnLanguageChange === 'function') {
      window.__lyshOnLanguageChange(current);
    }
  }

  function toggleLang() {
    setLang(current === 'zh' ? 'en' : 'zh');
  }

  window.__LYSH_I18N = { dict: I18N, get lang() { return current; } };
  window.t = t;
  window.applyI18n = applyI18n;
  window.setLang = setLang;
  window.toggleLang = toggleLang;
  window.formatNumber = formatNumber;

  document.addEventListener('DOMContentLoaded', function () {
    document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';
    applyI18n(document);
  });
})();
