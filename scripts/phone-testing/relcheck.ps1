$d = Join-Path $env:TEMP 'rel-assets'
New-Item -ItemType Directory -Force $d | Out-Null
docker cp inspection_pwa-proxy-1:/srv/releases/current/assets/. $d 2>&1 | Out-Null
$files = Get-ChildItem $d -Filter *.js
"release: " + (docker exec inspection_pwa-proxy-1 cat /srv/releases/active-release)
"js files: " + $files.Count
foreach ($s in @('just found unreachable', 'Opening Hydrant', 'Opening Smoke', 'Opening Automatic Sprinkler', 'inspection unavailable', 'Server inspection check timed out')) {
  $hit = $files | Select-String -SimpleMatch $s -List | ForEach-Object { $_.Filename }
  '{0,-36} => {1}' -f $s, ($hit -join ', ')
}
$b = $files | Select-String -Pattern 'build-\d{8}T\d{6}Z' -AllMatches | ForEach-Object { $_.Matches.Value } | Sort-Object -Unique
'build ids: ' + ($b -join ', ')
