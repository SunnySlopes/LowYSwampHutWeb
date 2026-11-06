# Serve this folder over HTTP (optional; index.html also works from file://).
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000
#
# Then open the printed URL. Stop with Ctrl+C.

[CmdletBinding()]
param(
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$python = Get-Command "python" -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command "py" -ErrorAction SilentlyContinue }

if ($python) {
    Write-Host ""
    Write-Host "  Low-Y Swamp Hut Web" -ForegroundColor Green
    Write-Host "  http://127.0.0.1:$Port/" -ForegroundColor Cyan
    Write-Host "  (Ctrl+C to stop)" -ForegroundColor DarkGray
    Write-Host ""
    if ($python.Name -eq "py.exe" -or $python.Name -eq "py") {
        & $python.Source -3 -m http.server $Port --bind 127.0.0.1 --directory $root
    } else {
        & $python.Source -m http.server $Port --bind 127.0.0.1 --directory $root
    }
} else {
    Write-Host "Python was not found. Opening index.html directly instead..." -ForegroundColor Yellow
    Start-Process (Join-Path $root "index.html")
}
