# Helpers for testing the PWA on a USB-connected Android phone through a local fault-injecting proxy.
# Dot-source it:  . .\scripts\phone-testing\phone-env.ps1
#
# How it works: the phone reaches the PC only over `adb reverse` (phone localhost:8081 -> PC proxy.js -> Caddy).
# That tunnel keeps working with Wi-Fi OFF, so "offline" for the app means BOTH Wi-Fi off AND proxy stopped.
# "Server unreachable but Wi-Fi up" means: Wi-Fi on, proxy stopped (or API container stopped).
#
# Nothing here touches Docker Compose, the database, or git.

$script:Tools = $PSScriptRoot

function Initialize-PhoneEnv {
  <# adb forward for Chrome DevTools (9222) + adb reverse for the proxy (8081); starts the proxy if needed. #>
  adb devices | Select-Object -Skip 1 | Where-Object { $_ }
  adb shell svc wifi enable | Out-Null
  adb forward tcp:9222 localabstract:chrome_devtools_remote | Out-Null
  adb reverse tcp:8081 tcp:8081 | Out-Null
  Start-PhoneProxy
  adb reverse --list
}

function Start-PhoneProxy {
  if (-not (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'proxy.js' })) {
    Set-Content (Join-Path $script:Tools 'mode.txt') ''
    Start-Process node -ArgumentList (Join-Path $script:Tools 'proxy.js') -WindowStyle Hidden
    Start-Sleep 2
    'proxy started'
  } else { 'proxy already running' }
}

function Stop-PhoneProxy {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'proxy.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}

function Set-PhoneOffline { adb shell svc wifi disable | Out-Null; Stop-PhoneProxy; Start-Sleep 3 }                  # truly offline
function Set-PhoneOnline  { adb shell svc wifi enable  | Out-Null; Start-PhoneProxy; Start-Sleep 8 }                 # online again
function Set-ServerUnreachable { Stop-PhoneProxy; Start-Sleep 2 }                                                   # Wi-Fi stays on

function Set-ProxyMode([string]$Mode = '') {
  <# '' normal | cutreq:<substr> | dropresp:<substr> | slow:<ms>:<substr> | status:<code>:<substr>   (see proxy.js) #>
  Set-Content (Join-Path $script:Tools 'mode.txt') $Mode
  Clear-Content (Join-Path $script:Tools 'proxy.log') -ErrorAction SilentlyContinue
}

function Invoke-Cdp([string]$Expression, [string]$PageId) {
  <# Run JS in the phone's Chrome tab. Prefix with @ to run a file:  Invoke-Cdp "@$Tools\state.js" #>
  if ($PageId) { $env:CDP_PAGE = $PageId }
  try { node (Join-Path $script:Tools 'cdp.js') $Expression } finally { $env:CDP_PAGE = $null }
}

function Get-PhoneScreenshot([string]$Path = (Join-Path $env:TEMP 'phone.png')) {
  # Do NOT save screenshots on the phone (adb shell screencap /sdcard/x.png): they get indexed into the gallery and shift the picker.
  cmd /c "adb exec-out screencap -p > `"$Path`""
  $Path
}

function Stop-AppOnPhone { adb shell am force-stop com.android.chrome }   # simulates force-close
function Start-AppOnPhone { adb shell "am start -a android.intent.action.VIEW -d http://localhost:8081/ com.android.chrome" | Out-Null; Start-Sleep 7; adb forward tcp:9222 localabstract:chrome_devtools_remote | Out-Null }
