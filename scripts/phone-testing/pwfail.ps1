$t = Get-Content "$env:TEMP\pw-full.txt" -Raw
$blocks = [regex]::Split($t, '(?m)^\s{2}(?=\d+\) tests\\)') | Where-Object { $_ -match '^\d+\) tests\\' }
$rows = foreach ($b in $blocks) {
  $title = ($b -split "`n")[0].Trim()
  $spec = [regex]::Match($title, 'tests\\([^:]+):').Groups[1].Value
  $err = [regex]::Match($b, '(?m)^\s+(Error|TimeoutError|AssertionError)[^\n]*\n(?:[^\n]*\n){0,2}').Value -replace '\s+', ' '
  if (-not $err) { $err = [regex]::Match($b, 'Test timeout[^\n]*').Value }
  [pscustomobject]@{ spec = $spec; err = $err.Substring(0, [Math]::Min(150, $err.Length)) }
}
"failed blocks parsed: $($rows.Count)"
$rows | Group-Object err | Sort-Object Count -Descending | ForEach-Object { "{0,3} x {1}" -f $_.Count, $_.Name; ($_.Group.spec | Sort-Object -Unique) -join ', ' | ForEach-Object { "      $_" } }
