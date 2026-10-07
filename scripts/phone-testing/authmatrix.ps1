# Auth/authorization matrix against https://localhost/api. Set PWA_TECH_USER/PASS, PWA_SUPERVISOR_USER/PASS, PWA_ADMIN_USER/PASS in the environment first (never commit them).
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
$base = "https://localhost/api"
function Hit($label, $method, $path, $session, $headers, $body) {
  try {
    $args = @{ Uri = "$base/$path"; Method = $method; UseBasicParsing = $true; ErrorAction = 'Stop' }
    if ($session) { $args.WebSession = $session }
    if ($headers) { $args.Headers = $headers }
    if ($body) { $args.Body = $body; $args.ContentType = 'application/json' }
    $r = Invoke-WebRequest @args
    "{0,-58} -> {1}" -f $label, $r.StatusCode
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    "{0,-58} -> {1}" -f $label, $code
  }
}
function Login($u, $p) {
  $s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-WebRequest -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ username = $u; password = $p } | ConvertTo-Json) -WebSession $s -UseBasicParsing | Out-Null
  return $s
}
$job44 = "02696704-9ea9-4945-9682-431d312ff9ea"
$photo = (docker exec inspection_pwa-postgres-1 psql -U inspection_app -d inspection -Atc "select photo_uuid from staged_inspection_evidence where job_id='$job44' and status='accepted' limit 1").Trim()
$job47 = (docker exec inspection_pwa-postgres-1 psql -U inspection_app -d inspection -Atc "select id from inspection_jobs where job_reference='SV-20260928-47'").Trim()
"== unauthenticated"
Hit "POST /sync" Post "sync" $null $null '{"items":[]}'
Hit "POST /v7-evidence/stage" Post "v7-evidence/stage" $null $null $null
Hit "GET  accepted photo content" Get "v7-evidence/accepted/$photo/content" $null $null $null
Hit "GET  inspection-jobs" Get "inspection-jobs" $null $null $null
Hit "GET  manager final-report.pdf" Get "manager/service-visits/$job44/final-report.pdf" $null $null $null
"== technician-demo (inspector)"
$t = Login $env:PWA_TECH_USER $env:PWA_TECH_PASS
Hit "GET  own job final-report.pdf" Get "inspection-jobs/$job44/final-report.pdf" $t $null $null
Hit "GET  manager route (role)" Get "manager/service-visits/$job44/final-report" $t $null $null
Hit "GET  other technician's job SV-47" Get "inspection-jobs/$job47" $t $null $null
Hit "GET  other technician's job final-report" Get "inspection-jobs/$job47/final-report" $t $null $null
Hit "POST /sync with wrong X-Expected-User-Id" Post "sync" $t @{ "X-Expected-User-Id" = "1" } '{"items":[]}'
Hit "POST /sync with right X-Expected-User-Id" Post "sync" $t @{ "X-Expected-User-Id" = "436" } '{"items":[]}'
Hit "GET  accepted photo content (own job)" Get "v7-evidence/accepted/$photo/content" $t $null $null
"== supervisor"
$sv = Login $env:PWA_SUPERVISOR_USER $env:PWA_SUPERVISOR_PASS
Hit "GET  manager final-report" Get "manager/service-visits/$job44/final-report" $sv $null $null
Hit "GET  accepted photo content" Get "v7-evidence/accepted/$photo/content" $sv $null $null
Hit "POST /sync as supervisor" Post "sync" $sv $null '{"items":[]}'
"== manager (admin)"
$m = Login $env:PWA_ADMIN_USER $env:PWA_ADMIN_PASS
Hit "GET  manager final-report" Get "manager/service-visits/$job44/final-report" $m $null $null
Hit "GET  accepted photo content" Get "v7-evidence/accepted/$photo/content" $m $null $null

