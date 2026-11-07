# LowYSwampHut · WebAssembly 网页版

在浏览器里搜索 **Minecraft Java 版低 Y 坐标女巫小屋**。

计算内核来自原项目 [`LowYSwampHut`](../LowYSwampHut) 的 C 代码
（`LowYSwampHutFinderBase`），通过 Emscripten 编译成 WebAssembly。页面没有后端：
种子、范围和结果都只存在于你的浏览器里。

> 每一个种子，都有一个低 y 女巫小屋的梦想。
> —— SunnySlopes

![页面预览](assets/preview-hero.png)

![搜索控制台](assets/preview-app.png)

宽屏桌面：左侧是填写与操作区，右侧是结果区；移动端/窄屏：结果区在填写区下方。两种布局下，搜索控制台之后都是「为什么用它」→ 原理 → 常见问题。

![移动端竖屏](assets/preview-mobile.png)

---

## 快速开始

### Windows

- 双击 **`index.html`**（或 `open.bat`）直接运行（`file://` 下为单线程）。
- 要启用多线程，双击 `serve.bat` 或运行：

```powershell
powershell -ExecutionPolicy Bypass -File serve.ps1
# 启动成功后自动打开 http://127.0.0.1:8080/
# 只启动服务器、不打开浏览器：powershell -ExecutionPolicy Bypass -File serve.ps1 -NoOpen
```

### macOS / Linux

页面和 WebAssembly 与操作系统无关，现代 Chrome / Edge / Firefox / Safari 均可运行。

```bash
# 方式一：直接打开（file://，单线程）
chmod +x open.sh
./open.sh

# 方式二：本地服务器（HTTP，启用多线程，启动成功后自动打开浏览器）
chmod +x serve.sh
./serve.sh
# 不自动打开：NO_OPEN=1 ./serve.sh
```

也可以直接双击/打开 `index.html`，或用 `python3 -m http.server 8080 --bind 127.0.0.1`。

> 直接打开 `file://` 时，WASM 已经以 base64 内嵌在 `js/lysh-core.js` 中，不需要网络。
> 但 Chrome 不允许 `file://` 页面启动 Worker，因此会退化为单线程；需要多线程时请用
> `serve.ps1` / `serve.sh` 通过 HTTP 打开。

### 移动端

`mobile.html` 是竖屏精简版：去掉首屏介绍、功能卡、原理和 FAQ，只保留搜索控制台与结果区，
并隐藏线程数、辅助提示、距离列和 `/tp` 文本列等非必要元素。页面底部的「移动版 / 桌面版」
链接可以在两个版本之间切换。

---

## 功能

| 功能 | 说明 |
|---|---|
| 单种子搜索 | 输入任意 64 位种子；默认范围是世界边界 |
| 种子列表搜索 | 上传 `txt`，每行一个种子，空行和 `#` 注释会被忽略；默认范围 256 |
| 多版本 | 26.2~26.3（默认）、1.19.x~26.1、1.18.x |
| 世界类型 | 普通、巨型生物群系、单群系（沼泽） |
| 高度筛选 | 只保留 **-40 / -50 / -54**（-40 最宽松） |
| 精确 Y | 与桌面版相同的 footprint 63 列平均高度 + 含水层灌满判定 |
| 暂停 / 继续 / 停止 | 扫描按区域分块，暂停和停止都在分块边界生效 |
| 结果操作 | 表格 / 文本两种视图；复制 `/tp`；导出结果；导出命中种子列表 |
| 排序 | 单种子按 Y；列表按最低 Y 或距原点距离 |
| 双语 | 中文 / English |
| 主题 | 沼泽暮色（深色）/ 苔原晨雾（浅色） |
| 自检 | 启动时验证示例种子的全部 8 个已知小屋 |
| 许可证 | MIT，见页面底部与 `LICENSE` |

### 范围与默认值

和桌面版一致：**1 个区域 = 32 × 32 个区块 = 512 × 512 个方块**。

- 范围预设：**64 / 256 / 世界边界**。
- **单种子默认世界边界**（边长 117188 区域）。
- **种子列表默认 256**。
- 界面里的 `MinX / MaxX / MinZ / MaxZ` 按 **包含端点** 处理
  （C 内核扫描 `[min, max+1)`）；`正方形边长` 是以 `(0,0)` 为中心的边长（区域数）。
- 勾选「正方形边长」时 Min/Max 只读；取消勾选即可手动填写。

### 性能与多线程

本机实测（seed `-1024459017`，`117,188,000` 个区域的扫描窗口）：

| 方案 | 区域 / 秒 | 说明 |
|---|---:|---|
| 原生 C CLI，单线程 | ~5.2M | AVX2 + LTO |
| WASM，单线程 | ~7.5M | 单核与原生相当，甚至更快 |
| 原生 C，32 线程 | ~71M | 32 逻辑核 |
| WASM，12 个 Web Worker（HTTP） | ~36–40M | 每个 Worker 64 MB 初始内存 |

**为什么之前会觉得“慢了 1000 倍”？**

- `LowYSwampHutFinderBase-cli scan --seed X` **不传范围**时只扫
  `6000 × 6000 = 36,000,000` 个区域（本机约 0.6 s），不是世界边界。
- 网页单种子默认世界边界是 `117188² = 13,733,027,344` 个区域，
  约为前者的 **381 倍**。
- 原生 GUI / CLI 使用 32 线程，而网页在 `file://` 下只能单线程；
  两者叠加，就会得到数百到数千倍的差距。

**现在的加速方式：**

- 用 `serve.ps1` / `serve.sh` 通过 **HTTP** 打开页面：单种子大范围搜索会自动启动
  **最多 12 个 Web Worker**（移动端最多 4 个），每个 Worker 持有自己的 WASM 实例，
  不需要 SharedArrayBuffer / COOP-COEP。
- `file://` 下 Chrome 禁止 Worker 读取本地脚本，页面自动回退单线程；
  线程数字段会显示 `1`，旁边会提示用 serve 启动。
- 世界边界整图：HTTP 下本机约 **6 分钟**（实测 36–40M 区域/秒）；
  `file://` 单线程约 **30 分钟**。

### 网页版限制

- 单种子大范围：HTTP 下自动多线程；`file://` 下为单线程。
- 如果浏览器无法提供 CPU 核心数，或 Worker 创建/加载失败，页面会自动回退到
  主线程单线程继续搜索，不弹错误框；线程字段会显示回退原因。
- 种子列表模式目前按种子顺序逐个扫描（默认 256，单个种子很快）；
  世界边界 × 大量种子会非常久，建议列表模式保持 256 或 64。
- 低 Y 女巫小屋非常稀有。默认范围没有结果很正常，可以换种子或扩大范围。

---

## 示例种子

示例种子为 **`-1024459017`**（页面「示例」按钮、自检和 `examples/seeds.txt` 都使用它）。
它的 8 个已知结果为：

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

页面启动时会逐个区域验证这 8 个结果。页面上的「示例」按钮会载入手动范围
（区域 `39192..39255 × 9234..9297`），只搜索第 4 个结果
`/tp 20082832 -54 4744416`，便于快速演示；完整 8 个结果可由世界边界搜索得到。

---

## 目录结构

```
LowYSwampHutWeb/
├─ index.html              # 宽屏：左侧填写/操作，右侧结果；移动端/窄屏：结果在下方
├─ mobile.html             # 竖屏精简版（复用同一套 JS）
├─ css/
│  ├─ style.css            # 主题、布局、桌面/平板响应式
│  └─ mobile.css           # 竖屏精简样式（仅 mobile.html 加载）
├─ js/
│  ├─ i18n.js              # 中英文案
│  ├─ app.js               # UI、搜索调度、进度、导出
│  ├─ scan-worker.js       # Web Worker：独立 WASM 实例 + Z 切片扫描
│  └─ lysh-core.js         # 生成的 WASM（base64 内嵌，勿手改）
├─ wasm/
│  ├─ web_api.c            # C 内核 → JS 的薄封装（无判定逻辑）
│  ├─ build.ps1 / build.bat# Windows 构建
│  ├─ build.sh             # macOS / Linux 构建
│  └─ fetch_emsdk_zip.py   # 可选：并行下载 Emscripten 档案
├─ examples/seeds.txt      # 示例种子列表
├─ assets/                 # 页面预览图
├─ serve.ps1 / serve.bat   # Windows 本地服务器（启动成功后自动打开页面）
├─ serve.sh                # macOS / Linux 本地服务器（启动成功后自动打开浏览器）
├─ open.bat / open.sh      # 打开页面
├─ LICENSE                 # MIT（原作者 M33Galaxy / SunnySlopes）
└─ README.md
```

---

## 重新构建 WASM

WASM 已经随页面提供。只有修改 C 内核或 `wasm/web_api.c` 时才需要重新构建。

### 准备

- 安装 [Emscripten SDK](https://github.com/emscripten-core/emsdk) 并激活。
- 确保原项目位于本目录同级：

```
LowYSwampHut/
├─ LowYSwampHut/           # 原项目（含 LowYSwampHutFinderBase）
└─ LowYSwampHutWeb/        # 本目录
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File wasm/build.ps1
```

### macOS / Linux

```bash
chmod +x wasm/build.sh
./wasm/build.sh
# 自定义内核路径：
# CORE_DIR=/path/to/LowYSwampHutFinderBase ./wasm/build.sh
```

两个脚本使用相同的源文件列表和编译选项：

- `-O3 -ffp-contract=off -fno-fast-math`，保持浮点行为与桌面版一致；
- `--no-entry -sMODULARIZE=1 -sSINGLE_FILE=1`，生成单文件 `js/lysh-core.js`
  （WASM base64 内嵌）；
- 单实例初始内存 **64 MB**，`-sALLOW_MEMORY_GROWTH=1` 按需增长；
  12 个 Worker 约 768 MB 初始内存。

构建产物覆盖 `js/lysh-core.js`。重新打开页面，右上角显示 **WASM 就绪**，
启动自检通过时 badge 标题会包含 `self-test OK`。

---

## 实现说明

- `wasm/web_api.c` 只做四件事：还原 64 位种子、管理一个扫描会话、
  按带调用 `lysh_scan_session_band`、把结果以扁平的 `int` 接口暴露给 JS。
  **没有任何地形 / 结构 / 群系判定。**
- 一个种子只 `lysh_scan_session_open` 一次；每个带复用同一批噪声栈，
  扫完 `lysh_scan_session_close`。
- 页面按约 16k 区域一个带切片，带之间 `setTimeout(0)` 让出主线程；
  暂停 / 停止在带边界检查。
- `Y` 就是 C 内核的 `avg_y`：footprint 63 列高度之和 / 63（向零截断），
  与桌面版和原项目验收表一致。

### 自检点

启动时按区域逐个验证：

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

## 浏览器要求

- Chrome / Edge / Firefox / Safari 的现代版本（支持 WebAssembly）。
- 需要启用 JavaScript。
- 剪贴板 API 在 `file://` 下可能不可用，页面会自动回退到
  `document.execCommand('copy')`。

---

## 许可证

本项目以 **MIT License** 发布，完整文本见 [LICENSE](LICENSE)。
页面底部和致谢区也提供了许可证链接。

---

## 致谢

- [M33Galaxy](https://github.com/M33Galaxy) —— 核心算法与 C 内核
- [SunnySlopes](https://github.com/SunnySlopes) —— 灵感与桌面版 UI
- [原 Java 版库](https://github.com/M33Galaxy/LowYSwampHut)
- [基底库](https://github.com/M33Galaxy/LowYSwampHutFinderBase)
- [网页版库](https://github.com/SunnySlopes/LowYSwampHutWeb) —— 当在线搜索过慢或遇到问题时请下载该库本地启动进行快速搜索
- [KalleStruik](https://github.com/KalleStruik) —— Noise Sampler（参考）
- 字体：江城黑体（桌面版）；网页版使用系统字体以保证离线可用
- 展示图：用户提供的低 Y 女巫小屋游戏截图（`assets/low-y-swamp-hut.webp`）
- Emscripten（MIT）—— C 到 WebAssembly 的编译工具链

本页面是 LowYSwampHut 的非官方 WebAssembly 网页版；
计算内核与结果口径来自原项目，网页 UI 为重新设计。

## Git remote

本目录已初始化为 git 仓库，并设置远端：

```text
origin  https://github.com/SunnySlopes/LowYSwampHutWeb
```

按用户要求，**没有创建 commit、没有 push**。
