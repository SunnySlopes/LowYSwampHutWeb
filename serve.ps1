# Serve this folder over HTTP (optional; index.html also works from file://).
#
#   powershell -ExecutionPolicy Bypass -File serve.ps1
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 9000
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -NoOpen
#
# The page opens automatically once the server is ready.
# Stop with Ctrl+C.

[CmdletBinding()]
param(
    [int]$Port = 8080,
    [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$url = "http://127.0.0.1:$Port/"

# Fail early instead of accidentally opening some other program already on the port.
$portInUse = $false
try {
    $probe = New-Object System.Net.Sockets.TcpClient
    $probe.Connect("127.0.0.1", $Port)
    $portInUse = $true
    $probe.Close()
} catch { }

if ($portInUse) {
    Write-Host "Port $Port is already in use. Try -Port 8081." -ForegroundColor Yellow
    exit 1
}

$python = Get-Command "python" -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command "py" -ErrorAction SilentlyContinue }

$openJob = $null
if ($python) {
    Write-Host ""
    Write-Host "  Low-Y Swamp Hut Web" -ForegroundColor Green
    Write-Host "  $url" -ForegroundColor Cyan
    Write-Host "  (Ctrl+C to stop)" -ForegroundColor DarkGray
    Write-Host ""

    if (-not $NoOpen) {
        try {
            $openJob = Start-Job -ScriptBlock {
                param($u, $p)
                for ($i = 0; $i -lt 80; $i++) {
                    $client = $null
                    try {
                        $client = New-Object System.Net.Sockets.TcpClient
                        $client.Connect("127.0.0.1", $p)
                        $client.Close()
                        Start-Process $u
                        return
                    } catch {
                        if ($client) { $client.Close() }
                    }
                    Start-Sleep -Milliseconds 250
                }
            } -ArgumentList $url, $Port
        } catch {
            Write-Host "Could not start the auto-open helper; open $url manually." -ForegroundColor Yellow
        }
    }

    try {
        if ($python.Name -eq "py.exe" -or $python.Name -eq "py") {
            & $python.Source -3 -m http.server $Port --bind 127.0.0.1 --directory $root
        } else {
            & $python.Source -m http.server $Port --bind 127.0.0.1 --directory $root
        }
    } finally {
        if ($openJob) {
            Stop-Job $openJob -ErrorAction SilentlyContinue
            Remove-Job $openJob -Force -ErrorAction SilentlyContinue
        }
    }
} else {
    Write-Host "Python was not found. Opening index.html directly instead..." -ForegroundColor Yellow
    if ($NoOpen) {
        Write-Host "Open $(Join-Path $root 'index.html') in your browser." -ForegroundColor Cyan
    } else {
        Start-Process (Join-Path $root "index.html")
    }
}
