# ============================================================
#  Build the LowYSwampHut WebAssembly core.
#
#  Prerequisites:
#    - Emscripten SDK (https://github.com/emscripten-core/emsdk)
#      installed and activated, or EMSDK pointing at the SDK root.
#    - The LowYSwampHut repository next to this web folder, with the
#      LowYSwampHutFinderBase submodule checked out.
#
#  Usage (from anywhere):
#    powershell -ExecutionPolicy Bypass -File wasm/build.ps1
#
#  Optional:
#    -CoreDir  <path to LowYSwampHutFinderBase>
#    -Emsdk    <path to emsdk root>
#    -OutDir   <directory for lysh-core.js>   (default: ..\js)
# ============================================================
[CmdletBinding()]
param(
    [string]$CoreDir = "",
    [string]$Emsdk = "",
    [string]$OutDir = "",
    [int]$InitialMemory = 67108864,
    [string]$OutName = "lysh-core.js"
)

$ErrorActionPreference = "Stop"

function Resolve-FullPath([string]$path, [string]$baseDir) {
    if ([System.IO.Path]::IsPathRooted($path)) {
        return [System.IO.Path]::GetFullPath($path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $baseDir $path))
}

$webRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $CoreDir) {
    $CoreDir = Resolve-FullPath "..\..\LowYSwampHut\LowYSwampHutFinderBase" $PSScriptRoot
}
if (-not $OutDir) {
    $OutDir = Join-Path $webRoot "js"
}
if (-not $Emsdk) {
    $candidates = @()
    if ($env:EMSDK) { $candidates += $env:EMSDK }
    $candidates += (Join-Path $env:LOCALAPPDATA "LowYSwampHutWeb\emsdk")
    $candidates += (Join-Path $env:USERPROFILE "emsdk")
    $candidates += "C:\emsdk"
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c "emsdk_env.ps1"))) { $Emsdk = $c; break }
    }
}

Write-Host "Web root : $webRoot"
Write-Host "C core   : $CoreDir"
Write-Host "Output   : $OutDir"
Write-Host "EMSDK    : $Emsdk"

if (-not (Test-Path (Join-Path $CoreDir "src\eval.c"))) {
    throw "LowYSwampHutFinderBase not found at '$CoreDir'. Pass -CoreDir <path>."
}
if (-not $Emsdk -or -not (Test-Path (Join-Path $Emsdk "emsdk_env.ps1"))) {
    throw "Emscripten SDK not found. Install emsdk and pass -Emsdk <path>, or set EMSDK."
}

# Activate the SDK in this process. Prefer a manually extracted upstream
# (see wasm/fetch_emsdk_zip.py) and fall back to emsdk_env.ps1.
$emccPath = Join-Path $Emsdk "upstream\emscripten\emcc.exe"
if (Test-Path $emccPath) {
    $configPath = Join-Path $Emsdk ".emscripten"
    $nodeExe = Get-ChildItem (Join-Path $Emsdk "node") -Recurse -Filter "node.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
    $pythonExe = Get-ChildItem (Join-Path $Emsdk "python") -Recurse -Filter "python.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
    if (-not $pythonExe) { $pythonExe = (Get-Command "python" -ErrorAction SilentlyContinue).Source }
    if (-not (Test-Path $configPath)) {
        $cfg = @"
import os
emsdk = r'$Emsdk'
LLVM_ROOT = os.path.join(emsdk, 'upstream', 'bin')
BINARYEN_ROOT = os.path.join(emsdk, 'upstream')
EMSCRIPTEN_ROOT = os.path.join(emsdk, 'upstream', 'emscripten')
NODE_JS = r'$nodeExe'
PYTHON = r'$pythonExe'
CACHE = os.path.join(emsdk, '.cache')
"@
        Set-Content -Path $configPath -Value $cfg -Encoding ascii
    }
    $env:EM_CONFIG = $configPath
    $env:PATH = "$(Join-Path $Emsdk 'upstream\bin');$(Join-Path $Emsdk 'node')" + ";" + $env:PATH
    Write-Host "Using manually extracted SDK at $Emsdk"
} else {
    Write-Host "Activating Emscripten with emsdk_env.ps1..."
    & (Join-Path $Emsdk "emsdk_env.ps1") | Out-Null
    $emccPath = (Get-Command "emcc.bat" -ErrorAction SilentlyContinue).Source
    if (-not $emccPath) { $emccPath = (Get-Command "emcc" -ErrorAction SilentlyContinue).Source }
}
if (-not $emccPath -or -not (Test-Path $emccPath)) {
    throw "emcc was not found. Install the Emscripten SDK and pass -Emsdk <path>."
}
Write-Host "Using emcc: $emccPath"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$coreSources = @(
    "src\rng.c",
    "src\noise.c",
    "src\structure.c",
    "src\climate.c",
    "src\caves.c",
    "src\phase1.c",
    "src\biome.c",
    "src\spline.c",
    "src\terrain.c",
    "src\column_top.c",
    "src\density.c",
    "src\interp_noise.c",
    "src\aquifer.c",
    "src\carver.c",
    "src\phase2.c",
    "src\eval.c",
    "src\search.c"
)

$sourcePaths = @()
foreach ($rel in $coreSources) {
    $full = Join-Path $CoreDir $rel
    if (-not (Test-Path $full)) { throw "Missing core source: $full" }
    $sourcePaths += $full
}
$sourcePaths += (Join-Path $PSScriptRoot "web_api.c")

$exported = @(
    "_lysh_web_start",
    "_lysh_web_band",
    "_lysh_web_close",
    "_lysh_web_hits_count",
    "_lysh_web_hits_overflow",
    "_lysh_web_hit_field",
    "_lysh_web_stat",
    "_lysh_web_total_ms",
    "_lysh_web_ints_per_hit",
    "_lysh_web_version",
    "_malloc",
    "_free"
) -join ","

$outFile = Join-Path $OutDir $OutName
$includeDir = Join-Path $CoreDir "src"

$args = @(
    "-O3",
    "-ffp-contract=off",
    "-fno-fast-math",
    "-Wno-unused-parameter",
    # rng.h uses size_t without including <stddef.h>; GCC/MSVC get it
    # transitively, but clang on wasm does not. Force-include it.
    "-include", "stddef.h",
    "-I", $includeDir,
    "-o", $outFile,
    "--no-entry",
    "-s", "MODULARIZE=1",
    "-s", "EXPORT_NAME=createLyshCore",
    "-s", "SINGLE_FILE=1",
    "-s", "ENVIRONMENT=web,worker,node",
    "-s", "ALLOW_MEMORY_GROWTH=1",
    "-s", "INITIAL_MEMORY=$InitialMemory",
    "-s", "MAXIMUM_MEMORY=2147483648",
    "-s", "STACK_SIZE=8388608",
    "-s", "FILESYSTEM=0",
    "-s", "ASSERTIONS=0",
    "-s", "EXPORTED_FUNCTIONS=$exported",
    "-s", "EXPORTED_RUNTIME_METHODS=ccall,cwrap,UTF8ToString,HEAP32,HEAPU8",
    "-s", "EXPORT_ES6=0"
) + $sourcePaths

Write-Host ""
Write-Host "Compiling $($sourcePaths.Count) C files to WebAssembly..."
Write-Host "This may take a minute."
$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $emccPath @args
$code = $LASTEXITCODE
$sw.Stop()

if ($code -ne 0) {
    throw "emcc failed with exit code $code."
}
if (-not (Test-Path $outFile)) {
    throw "emcc reported success but '$outFile' does not exist."
}

$size = (Get-Item $outFile).Length
Write-Host ""
Write-Host ("Build OK in {0:N1}s" -f $sw.Elapsed.TotalSeconds)
Write-Host ("Output: {0} ({1:N2} MB, WASM embedded as base64)" -f $outFile, ($size / 1MB))
