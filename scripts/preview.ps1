param([int]$Port = 3000)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localTools = Join-Path (Split-Path -Parent $projectRoot) '.tools'
$localNode = Join-Path $localTools 'node-v22.23.5-win-x64'
$localPnpm = Join-Path $localTools 'pnpm/node_modules/.bin/pnpm.cmd'
if (Test-Path (Join-Path $localNode 'node.exe')) {
    $env:PATH = "$localNode;$(Split-Path -Parent $localPnpm);$env:PATH"
}
$pnpmCommand = if (Test-Path $localPnpm) { $localPnpm } else { 'pnpm' }
Push-Location $projectRoot
try {
    $previewEnv = Join-Path $projectRoot 'apps/web/.env.local'
    if (-not (Test-Path $previewEnv)) {
        Copy-Item -LiteralPath 'apps/web/.env.preview.example' -Destination $previewEnv
    }
    & $pnpmCommand --filter '@clashr/web' dev:preview --port $Port --hostname 127.0.0.1
    if ($LASTEXITCODE -ne 0) { throw "Preview exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
