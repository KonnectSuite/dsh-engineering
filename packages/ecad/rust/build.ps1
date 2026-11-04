#Requires -Version 5.1
<#
.SYNOPSIS
    Build the ECAD DWG converter from this crate into the package's assets.

.DESCRIPTION
    Produces `packages/ecad/assets/acadrust.wasm` from the Rust source in this
    directory. The wasm target needs only `cargo` and the `wasm32-unknown-unknown`
    target; no MSVC toolchain and no wasm-bindgen step.

    `-Sidecar` additionally builds the native `dsh-ecad-dwg` binary into
    `packages/ecad/bin/`. That build needs the MSVC linker, so the script runs it
    through `VsDevCmd.bat` and only when asked: the wasm asset is the shipping
    transport, and no native binary is committed.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File packages/ecad/rust/build.ps1

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File packages/ecad/rust/build.ps1 -Sidecar
#>
[CmdletBinding()]
param(
    # Also build the native fallback binary into packages/ecad/bin/.
    [switch]$Sidecar,

    # Visual Studio installation used for the native build.
    [string]$VisualStudio = 'C:\Program Files\Microsoft Visual Studio\18\Community'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$rustDir = $PSScriptRoot
$packageDir = Split-Path -Parent $rustDir
$assetsDir = Join-Path $packageDir 'assets'
$binDir = Join-Path $packageDir 'bin'
$wasmTarget = 'wasm32-unknown-unknown'
$artifact = Join-Path $rustDir "target\$wasmTarget\release\dsh_ecad_dwg.wasm"
$assetPath = Join-Path $assetsDir 'acadrust.wasm'

# cargo installs to the user profile; a fresh shell may not have it on PATH yet.
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if (Test-Path $cargoBin) { $env:PATH = "$cargoBin;$env:PATH" }

<#
    Run a native build command and stream its output.
    cargo writes progress to stderr; PowerShell would otherwise raise it as an
    error record under `$ErrorActionPreference = 'Stop'`, so the preference is
    relaxed for the call and the process exit code decides success.
#>
function Invoke-BuildCommand {
    param([scriptblock]$Command, [string]$Label)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $started = [System.Diagnostics.Stopwatch]::StartNew()
        & $Command 2>&1 | ForEach-Object { Write-Host "  $_" }
        $exitCode = $LASTEXITCODE
        $started.Stop()
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($exitCode -ne 0) { throw "$Label failed with exit code $exitCode" }
    return [math]::Round($started.Elapsed.TotalSeconds, 1)
}

Write-Host '== toolchain =='
$rustcVersion = (& rustc --version) 2>&1
$cargoVersion = (& cargo --version) 2>&1
Write-Host "rustc: $rustcVersion"
Write-Host "cargo: $cargoVersion"
$installedTargets = (& rustup target list --installed) 2>&1
if ($installedTargets -notcontains $wasmTarget) {
    throw "the $wasmTarget target is not installed; run: rustup target add $wasmTarget"
}

Write-Host ''
Write-Host '== wasm build =='
Push-Location $rustDir
try {
    $wasmBuildSeconds = Invoke-BuildCommand -Label 'cargo build' -Command {
        cargo build --release --lib --target $wasmTarget
    }
} finally {
    Pop-Location
}

if (-not (Test-Path $artifact)) { throw "cargo reported success but $artifact is missing" }
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
Copy-Item -Path $artifact -Destination $assetPath -Force
$wasmSize = (Get-Item $assetPath).Length
$wasmHash = (Get-FileHash -Path $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Host ''
Write-Host '== artefact =='
Write-Host "wasm:   $assetPath"
Write-Host "size:   $wasmSize bytes"
Write-Host "sha256: $wasmHash"
Write-Host "build:  $wasmBuildSeconds s"
Write-Host "rustc:  $rustcVersion"

if ($Sidecar) {
    Write-Host ''
    Write-Host '== native sidecar build =='
    $devCmd = Join-Path $VisualStudio 'Common7\Tools\VsDevCmd.bat'
    if (-not (Test-Path $devCmd)) { throw "Visual Studio build environment not found at $devCmd" }
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null
    Push-Location $rustDir
    try {
        $sidecarBuildSeconds = Invoke-BuildCommand -Label 'cargo build (sidecar)' -Command {
            cmd.exe /c "`"$devCmd`" -arch=amd64 && cargo build --release --bin dsh-ecad-dwg"
        }
    } finally {
        Pop-Location
    }
    $sidecarArtifact = Join-Path $rustDir 'target\release\dsh-ecad-dwg.exe'
    if (-not (Test-Path $sidecarArtifact)) { throw "the sidecar binary $sidecarArtifact is missing" }
    $sidecarPath = Join-Path $binDir 'dsh-ecad-dwg.exe'
    Copy-Item -Path $sidecarArtifact -Destination $sidecarPath -Force
    Write-Host "sidecar: $sidecarPath"
    Write-Host "size:    $((Get-Item $sidecarPath).Length) bytes"
    Write-Host "build:   $sidecarBuildSeconds s"
}

Write-Host ''
Write-Host 'done'
