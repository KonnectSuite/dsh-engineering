# Launch AryaCode (dev home) with this working tree's engineering bundle and a local model.
#
# Why a script: the installed AryaCode at ~/.aryacode loads the engineering bundle that the
# market published (0.93.0 before the Optix work), so the Optix screen/production tools only
# exist in a profile that points at the packed tarball built from this branch. This script
# boots the `optix-live` profile under the dev home, which is a copy of the installed
# desktop profile with the engineering dependency swapped for artifacts\aryacode-dsh-engineering-*.tgz.
#
# Usage:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\launch-dev-optix.ps1
#         ... -Port 8080 -NoOpen
param(
  [int]$Port = 0,
  [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$profileName = 'optix-live'
$devHome = Join-Path $env:LOCALAPPDATA 'AryaCode-dev\home'
$dsh = 'C:\Users\KNPhu\AryaCode\KonnectSuite\AryaCode\apps\desktop\.desktop-build\targets\win-x64\dsh\node_modules\@deepseek-ai\dsh\lib\bin.js'

if (-not (Test-Path $dsh)) {
  throw "dsh entry not found at $dsh - the AryaCode checkout moved, fix the path in this script."
}
if (-not (Test-Path (Join-Path $devHome ("profiles\" + $profileName)))) {
  throw "profile '$profileName' not found under $devHome - recreate it (see HANDOFF.md, 'Use it in AryaCode today')."
}

$tarball = Get-ChildItem (Join-Path $repo 'artifacts') -Filter 'aryacode-dsh-engineering-*.tgz' -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($tarball) {
  Write-Host ("engineering bundle: " + $tarball.Name + " (" + $tarball.LastWriteTime + ")")
} else {
  Write-Host 'engineering bundle: no tarball in artifacts\ - the profile keeps whatever it already installed.'
}

$env:DSH_HOME = $devHome
$launch = @($dsh, '--profile', $profileName, '--host', '127.0.0.1', '--port', "$Port")
if ($NoOpen) { $launch += '--no-open' }

Write-Host ("DSH_HOME=" + $devHome)
Write-Host ("booting profile " + $profileName + " ...")
& node @launch
