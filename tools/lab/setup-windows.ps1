# Sets up a Windows 11 Pro machine as the lab's Windows test computer ("e2k-win"); see mockups/lab/test-lab-plan.md.
# Run it signed in as the "e2k" account, from the setup stick made by make-setup-stick.ps1 on the PC (double-click
# setup-windows.cmd). It asks for administrator rights, then goes through each step below, skipping what's already
# done, so it can be run again at any time. "setup-windows.cmd check" (-Check) reports each step and changes nothing.
#
# The steps: a private network; the machine name; signing in automatically; never locking (no sleep, no screen lock,
# no screensaver lock, no password on wake, no Dynamic Lock); update restarts only at night; Git, Node.js, RustDesk and
# NVDA (from winget, accepting their agreements); SSH that takes only the PC's key, from this network only; RustDesk
# with a permanent password and direct connections on this network; the screen resolution; the app's code and parts;
# one quick test; the lab agent; and formatting the test stick (only after you type ERASE).
#
# The account keeps its password (it's what keeps others out); nothing asks for it. Passwords typed here are never
# written to a file: Windows keeps the sign-in one (encrypted, through Microsoft's Autologon) and RustDesk its own.
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# --- Administrator rights (asks once, in a new window) --------------------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($Check) { $a += '-Check' }
  Start-Process powershell -Verb RunAs -ArgumentList $a
  Write-Host 'Continuing in the administrator window.'
  exit
}

# --- Settings (lab-settings.json beside this script, or in the app's code) ------------------------------------------
$here = $PSScriptRoot
$settings = $null
foreach ($f in @((Join-Path $here 'lab-settings.json'), (Join-Path $HOME 'e2k\tools\lab\lab-settings.json'))) {
  if (-not $settings -and (Test-Path $f)) { $settings = Get-Content $f -Raw | ConvertFrom-Json }
}
if (-not $settings) { throw 'lab-settings.json is missing: make the setup stick again with make-setup-stick.ps1.' }
$Account = $settings.account
$Name = $settings.machines.win32
$Repo = Join-Path $HOME 'e2k'
$State = Join-Path $env:ProgramData 'e2k-lab'
New-Item -ItemType Directory -Force $State | Out-Null

if ($env:USERNAME -ne $Account) { throw "Sign in as `"$Account`" and run this again (signed in as `"$env:USERNAME`")." }

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}
function Reg-Get($key, $name) { try { (Get-ItemProperty -Path $key -Name $name -ErrorAction Stop).$name } catch { $null } }
function Reg-Set($key, $name, $value, $type = 'DWord') {
  if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
  New-ItemProperty -Path $key -Name $name -Value $value -PropertyType $type -Force | Out-Null
}
# The current value of a power setting on mains power (powercfg /q prints it in hex).
function Power-Get($sub, $setting) {
  $out = powercfg /q SCHEME_CURRENT $sub $setting | Out-String
  if ($out -match 'Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)') { [Convert]::ToInt32($Matches[1], 16) } else { $null }
}
function Power-Set($sub, $setting, $value) {
  powercfg /setacvalueindex SCHEME_CURRENT $sub $setting $value | Out-Null
  powercfg /setdcvalueindex SCHEME_CURRENT $sub $setting $value | Out-Null
  powercfg /setactive SCHEME_CURRENT | Out-Null
}
function Read-Secret($prompt) {
  $s = Read-Host $prompt -AsSecureString
  [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}
function Winget-Has($id) {
  winget list --id $id -e --accept-source-agreements --disable-interactivity | Out-Null
  $LASTEXITCODE -eq 0
}

# The screen resolution, through Windows' own display settings.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class E2KDisplay {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra; public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [DllImport("user32.dll")] static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll")] static extern int ChangeDisplaySettings(ref DEVMODE dm, int flags);
  static DEVMODE Current() { var dm = new DEVMODE(); dm.dmSize = (short)Marshal.SizeOf(dm); EnumDisplaySettings(null, -1, ref dm); return dm; }
  public static string Get() { var dm = Current(); return dm.dmPelsWidth + "x" + dm.dmPelsHeight; }
  public static int Set(int w, int h) {
    var dm = Current(); dm.dmPelsWidth = w; dm.dmPelsHeight = h; dm.dmFields = 0x80000 | 0x100000;
    return ChangeDisplaySettings(ref dm, 1);   // CDS_UPDATEREGISTRY; 0 means it worked
  }
}
'@

# --- The steps: each has a test (is it done?) and a way to do it ------------------------------------------------------
# A step's Do may return 'restart' (done, takes effect after a restart) or 'later: <why>' (can't be done yet).
$steps = [System.Collections.Generic.List[object]]::new()
function Step($name, [scriptblock]$test, [scriptblock]$do) { $steps.Add([pscustomobject]@{ Name = $name; Test = $test; Do = $do }) }

Step 'Network set to Private (the firewall rules below are for this network only)' {
  @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -ne 'Private' }).Count -eq 0
} {
  Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -ne 'Private' } | Set-NetConnectionProfile -NetworkCategory Private
}

Step "Machine named $Name" {
  $env:COMPUTERNAME -eq $Name.ToUpper() -or (Reg-Get 'HKLM:\SYSTEM\CurrentControlSet\Control\ComputerName\ComputerName' 'ComputerName') -eq $Name.ToUpper()
} {
  Rename-Computer -NewName $Name -Force -WarningAction SilentlyContinue
  'restart'
}

Step "Signs in as $Account automatically" {
  $w = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
  (Reg-Get $w 'AutoAdminLogon') -eq '1' -and (Reg-Get $w 'DefaultUserName') -eq $Account -and -not (Reg-Get $w 'DefaultPassword')
} {
  if (-not (Get-LocalUser -Name $Account -ErrorAction SilentlyContinue)) { return "later: `"$Account`" isn't a local account on this machine" }
  Add-Type -AssemblyName System.DirectoryServices.AccountManagement
  $ctx = [System.DirectoryServices.AccountManagement.PrincipalContext]::new('Machine')
  $noPassword = "later: $Account has no password. Add one (Settings > Accounts > Sign-in options > Password), then run this again"
  for ($i = 0; ; $i++) {
    $pw = Read-Secret "The password of $Account (to sign in automatically; not shown or saved in a file)"
    if (-not $pw) { return $noPassword }
    # Windows refuses to check a blank password ("Account restrictions..."), so that means there isn't one.
    try { $ok = $ctx.ValidateCredentials($Account, $pw) } catch { return $noPassword }
    if ($ok) { break }
    if ($i -ge 2) { return 'later: the password was not accepted' }
    Write-Host '  That password was not accepted. Try again.' -ForegroundColor Yellow
  }
  # "Only allow Windows Hello sign-in" must be off, or Windows ignores automatic sign-in.
  Reg-Set 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device' 'DevicePasswordLessBuildVersion' 0
  # Microsoft's Sysinternals Autologon keeps the password encrypted (not in plain text in the registry).
  $exe = Join-Path $State 'Autologon64.exe'
  if (-not (Test-Path $exe)) { Invoke-WebRequest 'https://live.sysinternals.com/Autologon64.exe' -OutFile $exe -UseBasicParsing }
  $sig = Get-AuthenticodeSignature $exe
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    Remove-Item $exe -Force; throw 'Autologon64.exe is not signed by Microsoft; not used.'
  }
  # The machine's new name, in case the rename above is waiting for a restart.
  & $exe -accepteula $Account $Name.ToUpper() $pw | Out-Null
  $pw = $null
}

Step 'Never locks (no screen lock, screensaver lock, password on wake, Dynamic Lock)' {
  (Reg-Get 'HKCU:\Control Panel\Desktop' 'ScreenSaveActive') -eq '0' -and
  (Reg-Get 'HKCU:\Control Panel\Desktop' 'ScreenSaverIsSecure') -eq '0' -and
  (Reg-Get 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization' 'NoLockScreen') -eq 1 -and
  (Reg-Get 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon' 'EnableGoodbye') -eq 0 -and
  -not (Reg-Get 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'InactivityTimeoutSecs') -and
  (Power-Get 'SUB_NONE' 'CONSOLELOCK') -eq 0
} {
  Reg-Set 'HKCU:\Control Panel\Desktop' 'ScreenSaveActive' '0' 'String'
  Reg-Set 'HKCU:\Control Panel\Desktop' 'ScreenSaverIsSecure' '0' 'String'
  Remove-ItemProperty 'HKCU:\Control Panel\Desktop' 'SCRNSAVE.EXE' -ErrorAction SilentlyContinue
  Reg-Set 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization' 'NoLockScreen' 1
  Reg-Set 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon' 'EnableGoodbye' 0
  Remove-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' 'InactivityTimeoutSecs' -ErrorAction SilentlyContinue
  powercfg -attributes SUB_NONE CONSOLELOCK -ATTRIB_HIDE | Out-Null   # hidden by default, so it couldn't be read back
  Power-Set 'SUB_NONE' 'CONSOLELOCK' 0   # "If you've been away, when should Windows require you to sign in again?": Never
}

Step 'Never sleeps (the display turns off after 30 minutes and wakes without a password)' {
  (Power-Get 'SUB_SLEEP' 'STANDBYIDLE') -eq 0 -and (Power-Get 'SUB_SLEEP' 'HIBERNATEIDLE') -eq 0 -and
  (Power-Get '2a737441-1930-4402-8d77-b2bebba308a3' '48e6b7a6-50f5-4782-a5d4-53bb8f07e226') -eq 0
} {
  powercfg /change standby-timeout-ac 0 | Out-Null
  powercfg /change hibernate-timeout-ac 0 | Out-Null
  powercfg /change monitor-timeout-ac 30 | Out-Null
  powercfg /hibernate off | Out-Null
  Power-Set '2a737441-1930-4402-8d77-b2bebba308a3' '48e6b7a6-50f5-4782-a5d4-53bb8f07e226' 0   # USB sticks never put to sleep
}

Step 'Update restarts only between midnight and 8 am' {
  $p = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
  (Reg-Get $p 'SetActiveHours') -eq 1 -and (Reg-Get $p 'ActiveHoursStart') -eq 8 -and (Reg-Get $p 'ActiveHoursEnd') -eq 0
} {
  $p = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'
  Reg-Set $p 'SetActiveHours' 1; Reg-Set $p 'ActiveHoursStart' 8; Reg-Set $p 'ActiveHoursEnd' 0
}

Step 'winget (to install the tools)' { [bool](Get-Command winget -ErrorAction SilentlyContinue) } {
  Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { 'later: update "App Installer" in the Microsoft Store, then run this again' }
}

foreach ($app in @(
    @{ Id = 'Git.Git'; Name = 'Git' }, @{ Id = 'OpenJS.NodeJS.LTS'; Name = 'Node.js' },
    @{ Id = 'RustDesk.RustDesk'; Name = 'RustDesk' }, @{ Id = 'NVAccess.NVDA'; Name = 'NVDA' })) {
  $id = $app.Id
  Step "$($app.Name) installed" ([scriptblock]::Create("Winget-Has '$id'")) ([scriptblock]::Create(@"
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { return 'later: needs winget' }
    winget install --id '$id' -e --silent --accept-package-agreements --accept-source-agreements --disable-interactivity
    Refresh-Path
"@))
}

Step 'SSH: on, only the PC''s key, only from this network' {
  $cfg = Join-Path $env:ProgramData 'ssh\sshd_config'
  $keys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
  (Get-Service sshd -ErrorAction SilentlyContinue).StartType -eq 'Automatic' -and (Test-Path $keys) -and
  (Get-Content $keys -Raw) -match 'e2k-lab' -and (Test-Path $cfg) -and (Get-Content $cfg -TotalCount 1) -eq 'PasswordAuthentication no' -and
  (@(Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Get-NetFirewallAddressFilter).RemoteAddress -contains 'LocalSubnet')
} {
  $keyFile = Join-Path $here 'e2k-lab-key.pub'
  if (Test-Path $keyFile) { $key = (Get-Content $keyFile -Raw).Trim() }
  else { $key = (Read-Host "The PC's public key (one line, from make-setup-stick.ps1)").Trim() }
  if ($key -notmatch '^ssh-(ed25519|rsa) \S+ e2k-lab') { return 'later: no valid PC key (e2k-lab-key.pub on the setup stick)' }
  if ((Get-WindowsCapability -Online -Name 'OpenSSH.Server*').State -ne 'Installed') {
    Get-WindowsCapability -Online -Name 'OpenSSH.Server*' | Add-WindowsCapability -Online | Out-Null
  }
  Start-Service sshd   # creates sshd_config the first time
  # An administrator's keys live here on Windows, readable only by Administrators and SYSTEM.
  $keys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
  Set-Content -Path $keys -Value $key -Encoding ascii
  icacls $keys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' | Out-Null
  # No passwords over the network: the first value read wins, so it goes at the top.
  $cfg = Join-Path $env:ProgramData 'ssh\sshd_config'
  $lines = Get-Content $cfg | Where-Object { $_ -notmatch '^\s*#?\s*(PasswordAuthentication|KbdInteractiveAuthentication|PubkeyAuthentication)\b' }
  Set-Content -Path $cfg -Encoding ascii -Value (@('PasswordAuthentication no', 'KbdInteractiveAuthentication no', 'PubkeyAuthentication yes') + $lines)
  Reg-Set 'HKLM:\SOFTWARE\OpenSSH' 'DefaultShell' "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" 'String'
  if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow | Out-Null
  }
  Set-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -Profile Private -RemoteAddress LocalSubnet -Enabled True
  Set-Service sshd -StartupType Automatic
  Restart-Service sshd
}

Step 'RustDesk: permanent password, direct connections from this network' {
  (Test-Path (Join-Path $State 'rustdesk-password-set')) -and
  [bool](Get-NetFirewallRule -Name 'E2K-RustDesk-Direct' -ErrorAction SilentlyContinue)
} {
  $rd = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'
  if (-not (Test-Path $rd)) { return 'later: needs RustDesk' }
  for ($i = 0; ; $i++) {
    $a = Read-Secret 'A permanent RustDesk password for this machine (you type it when connecting; at least 8 characters)'
    $b = Read-Secret 'The same password again'
    if ($a -eq $b -and $a.Length -ge 8) { break }
    if ($i -ge 2) { return 'later: the passwords did not match' }
    Write-Host '  They did not match, or it was shorter than 8 characters. Try again.' -ForegroundColor Yellow
  }
  # rustdesk.exe is a windowed program, so each call is waited for.
  $run = { param([string[]]$a) Start-Process $rd -ArgumentList $a -Wait -WindowStyle Hidden }
  & $run @('--password', "`"$a`""); $a = $null; $b = $null
  & $run @('--option', 'direct-server', 'Y')          # connect by address on this network, no outside server
  & $run @('--option', 'approve-mode', 'password')    # the password is enough; nobody needs to click Accept
  New-NetFirewallRule -Name 'E2K-RustDesk-Direct' -DisplayName 'RustDesk direct (lab)' -Direction Inbound -Protocol TCP `
    -LocalPort 21118 -Profile Private -RemoteAddress LocalSubnet -Action Allow | Out-Null
  New-Item -ItemType File -Force (Join-Path $State 'rustdesk-password-set') | Out-Null
}

$w = [int]$settings.screen.width; $h = [int]$settings.screen.height
Step "Screen is ${w}x${h} (the desk monitor's size)" { [E2KDisplay]::Get() -eq "${w}x${h}" } {
  $r = [E2KDisplay]::Set($w, $h)
  if ($r -ne 0) { "later: the display doesn't offer ${w}x${h} (is the HDMI dummy plug in?)" }
}

Step "The app's code in $Repo" { Test-Path (Join-Path $Repo '.git') } {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return 'later: needs Git' }
  git clone $settings.repo $Repo
  if ($LASTEXITCODE) { throw 'git clone failed' }
}

Step "The app's parts (npm ci, Electron)" { Test-Path (Join-Path $Repo 'node_modules\electron\dist\electron.exe') } {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { return 'later: needs Node.js' }
  if (-not (Test-Path (Join-Path $Repo 'package.json'))) { return "later: needs the app's code" }
  Push-Location $Repo
  try {
    npm ci; if ($LASTEXITCODE) { throw 'npm ci failed' }
    node node_modules/electron/install.js; if ($LASTEXITCODE) { throw 'installing Electron failed' }
  } finally { Pop-Location }
}

Step 'A quick test passes (Home loads)' { Test-Path (Join-Path $State 'quick-test-passed') } {
  if (-not (Test-Path (Join-Path $Repo 'node_modules\electron\dist\electron.exe'))) { return "later: needs the app's parts" }
  Push-Location $Repo
  try { node tools/test/run.js --only home } finally { Pop-Location }
  if ($LASTEXITCODE) { throw "the quick test failed: see the report in $Repo\tools\test\results" }
  New-Item -ItemType File -Force (Join-Path $State 'quick-test-passed') | Out-Null
}

Step 'The lab agent starts with the desktop' {
  [bool](Get-ScheduledTask -TaskName 'E2K lab agent' -ErrorAction SilentlyContinue)
} {
  $agent = Join-Path $Repo 'tools\lab\agent.js'
  if (-not (Test-Path $agent)) { return 'later: the lab agent is not built yet; run this again once it is' }
  $node = (Get-Command node).Source
  $act = New-ScheduledTaskAction -Execute $node -Argument "`"$agent`"" -WorkingDirectory $Repo
  $trig = New-ScheduledTaskTrigger -AtLogOn -User "$env:COMPUTERNAME\$Account"
  $prin = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$Account" -LogonType Interactive -RunLevel Highest
  $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName 'E2K lab agent' -Action $act -Trigger $trig -Principal $prin -Settings $set | Out-Null
  Start-ScheduledTask -TaskName 'E2K lab agent'
}

$main = $settings.stick.main; $fat = $settings.stick.fat32; $fatGB = [int]$settings.stick.fat32SizeGB
Step "Test stick: $main (exFAT) and $fat (FAT32, $fatGB GB)" {
  $v = Get-Volume
  [bool]($v | Where-Object { $_.FileSystemLabel -eq $main -and $_.FileSystem -eq 'exFAT' }) -and
  [bool]($v | Where-Object { $_.FileSystemLabel -eq $fat -and $_.FileSystem -eq 'FAT32' })
} {
  # Never the stick this script is running from, never a disk that isn't USB, and never one Windows starts from.
  $from = $null
  if ($here -match '^([A-Za-z]):') { $from = (Get-Partition -DriveLetter $Matches[1] -ErrorAction SilentlyContinue).DiskNumber }
  # Nor any stick holding the "E2K Lab Setup" folder, in case this was copied off the setup stick and run from there.
  $setup = @(Get-Volume | Where-Object { $_.DriveLetter -and (Test-Path "$($_.DriveLetter):\E2K Lab Setup") } |
    ForEach-Object { (Get-Partition -DriveLetter $_.DriveLetter -ErrorAction SilentlyContinue).DiskNumber })
  $disks = @(Get-Disk | Where-Object { $_.BusType -eq 'USB' -and $_.Number -ne $from -and $setup -notcontains $_.Number -and -not $_.IsBoot -and -not $_.IsSystem })
  if (-not $disks.Count) { return 'later: plug in a stick for testing (not the setup stick) and run this again' }
  Write-Host ''
  foreach ($d in $disks) {
    $labels = (Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue | Get-Volume -ErrorAction SilentlyContinue |
      ForEach-Object { if ($_.FileSystemLabel) { $_.FileSystemLabel } else { '(no name)' } }) -join ', '
    Write-Host ("  Disk {0}: {1}, {2:N1} GB, now holding: {3}" -f $d.Number, $d.FriendlyName, ($d.Size / 1GB), $(if ($labels) { $labels } else { 'nothing' }))
  }
  $n = if ($disks.Count -eq 1) { $disks[0].Number } else { [int](Read-Host 'Which disk number becomes the test stick?') }
  $disk = $disks | Where-Object { $_.Number -eq $n }
  if (-not $disk) { return 'later: no such disk' }
  if ($disk.Size -lt 16GB) { return 'later: that stick is smaller than 16 GB' }
  Write-Host ("  Everything on disk {0} ({1}, {2:N1} GB) will be erased." -f $disk.Number, $disk.FriendlyName, ($disk.Size / 1GB)) -ForegroundColor Yellow
  if ((Read-Host '  Type ERASE to format it, or press Enter to skip') -cne 'ERASE') { return 'later: skipped (nothing was changed)' }
  if ($disk.PartitionStyle -ne 'RAW') { Clear-Disk -Number $disk.Number -RemoveData -RemoveOEM -Confirm:$false }
  Initialize-Disk -Number $disk.Number -PartitionStyle MBR
  New-Partition -DiskNumber $disk.Number -Size ([int64]$fatGB * 1GB) -AssignDriveLetter |
    Format-Volume -FileSystem FAT32 -NewFileSystemLabel $fat -Confirm:$false | Out-Null
  New-Partition -DiskNumber $disk.Number -UseMaximumSize -AssignDriveLetter |
    Format-Volume -FileSystem exFAT -NewFileSystemLabel $main -Confirm:$false | Out-Null
}

# --- Run them --------------------------------------------------------------------------------------------------------
Refresh-Path
Write-Host ''
Write-Host "Setting up $Name$(if ($Check) { ' (check only: nothing is changed)' })" -ForegroundColor Cyan
Write-Host ''
$restart = $false; $left = @(); $failed = @()
foreach ($s in $steps) {
  $done = $false
  try { $done = [bool](& $s.Test) } catch {}
  if ($done) { Write-Host "  [ok]    $($s.Name)" -ForegroundColor Green; continue }
  if ($Check) { Write-Host "  [to do] $($s.Name)"; $left += $s.Name; continue }
  Write-Host "  ...     $($s.Name)"
  try {
    # A step's own messages ('restart', 'later: ...') are kept; everything else it prints is shown.
    $r = $null
    & $s.Do | ForEach-Object { if ($_ -is [string] -and ($_ -eq 'restart' -or $_.StartsWith('later: '))) { $r = $_ } else { $_ | Out-Host } }
    if ($r -is [string] -and $r -eq 'restart') { $restart = $true; Write-Host "  [done]  $($s.Name) (after a restart)" -ForegroundColor Green }
    elseif ($r -is [string] -and $r.StartsWith('later: ')) { $left += "$($s.Name): $($r.Substring(7))"; Write-Host "  [later] $($s.Name): $($r.Substring(7))" -ForegroundColor Yellow }
    elseif ([bool](& $s.Test)) { Write-Host "  [done]  $($s.Name)" -ForegroundColor Green }
    else { $restart = $true; Write-Host "  [done]  $($s.Name) (may need a restart to show)" -ForegroundColor Green }
  } catch {
    $failed += "$($s.Name): $($_.Exception.Message)"
    Write-Host "  [error] $($s.Name): $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host ''
if ($failed.Count) { Write-Host "$($failed.Count) step(s) failed; fix them and run this again." -ForegroundColor Red }
if ($left.Count) { Write-Host "$($left.Count) step(s) still to do: run this again when they're ready." -ForegroundColor Yellow }
if ($restart) { Write-Host 'Restart the machine (it signs in by itself), then run this again to confirm.' -ForegroundColor Cyan }
if (-not ($failed.Count -or $left.Count -or $restart)) { Write-Host "$Name is ready." -ForegroundColor Green }
Write-Host ''
Read-Host 'Press Enter to close'
