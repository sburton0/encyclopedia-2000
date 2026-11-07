# Run on the PC: makes the lab's setup stick, which carries the setup scripts to the test machines.
#   powershell -ExecutionPolicy Bypass -File tools\lab\make-setup-stick.ps1
# The first time, it makes the PC's lab key (~\.ssh\e2k-lab), which the lab runner uses to reach the machines over SSH.
# Only the public half (e2k-lab-key.pub) goes on the stick; the private half never leaves this PC.
# It copies into an "E2K Lab Setup" folder and changes nothing else on the stick.
$ErrorActionPreference = 'Stop'
$lab = $PSScriptRoot

$key = Join-Path $HOME '.ssh\e2k-lab'
if (-not (Test-Path $key)) {
  New-Item -ItemType Directory -Force (Split-Path $key) | Out-Null
  # No passphrase, so the runner can use it unattended; it only opens the lab machines, which accept nothing else.
  ssh-keygen -t ed25519 -f $key -N '""' -C "e2k-lab $env:COMPUTERNAME" | Out-Host
  if ($LASTEXITCODE) { throw 'ssh-keygen failed' }
  Write-Host "Made the PC's lab key: $key"
}

$sticks = @(Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -and $_.DriveLetter } | Sort-Object DriveLetter)
if (-not $sticks.Count) { throw 'Plug in a USB stick first.' }
foreach ($v in $sticks) { Write-Host ("  {0}:  {1}  ({2:N1} GB free)" -f $v.DriveLetter, $(if ($v.FileSystemLabel) { $v.FileSystemLabel } else { '(no name)' }), ($v.SizeRemaining / 1GB)) }
$letter = if ($sticks.Count -eq 1) { [string]$sticks[0].DriveLetter } else { (Read-Host 'Which drive letter is the setup stick?').Trim(':', ' ') }
if (-not ($sticks | Where-Object { [string]$_.DriveLetter -eq $letter })) { throw "No USB stick at $letter`:" }

$dest = "${letter}:\E2K Lab Setup"
New-Item -ItemType Directory -Force $dest | Out-Null
foreach ($f in 'setup-windows.ps1', 'setup-windows.cmd', 'setup-mac.sh', 'setup-linux.sh', 'lab-settings.json') {
  if (Test-Path (Join-Path $lab $f)) { Copy-Item (Join-Path $lab $f) $dest -Force }
}
Copy-Item "$key.pub" (Join-Path $dest 'e2k-lab-key.pub') -Force
Write-Host ''
Write-Host "Done: $dest"
Write-Host 'On each test machine, signed in as e2k, open that folder and run the setup for its system'
Write-Host '(on Windows, double-click setup-windows.cmd).'
