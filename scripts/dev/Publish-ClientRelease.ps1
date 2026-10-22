[CmdletBinding()]
param(
    # Tag or commit to release, for example release-20261025. It must contain .gitattributes.
    [Parameter(Mandatory = $true)]
    [string]$Ref,

    # Branch the client PC tracks. It only ever contains client files.
    [string]$Branch = "client-release",

    # Remote to push to with -Push, for example "client" (a separate private repository the client PC
    # clones from) or "origin".
    [string]$Remote = "client",

    [switch]$Push
)

# Developer-only. Builds one commit on $Branch whose files are exactly `git archive $Ref`, which leaves
# out every path marked export-ignore in .gitattributes (all of docs/, tests, agent notes, test
# scripts), so the release is application code, Docker/Caddy files and operations scripts only. The working tree, the index and the current branch are never touched. The new commit is
# tagged client/<Ref>. Push with -Push, or push $Branch and the tag yourself.
#
# Client PC (first time):  git clone --branch client-release --single-branch <release repo URL> C:\InspectionSystem\app
# Client PC (update):      git pull

$ErrorActionPreference = "Stop"

$scriptFolder = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$repo = Split-Path -Parent (Split-Path -Parent $scriptFolder)

function Invoke-Git {
    $output = & git -C $repo @args
    if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') failed (exit $LASTEXITCODE)." }
    return $output
}

$commit = (Invoke-Git rev-parse --verify "$Ref^{commit}").Trim()
$short = $commit.Substring(0, 9)
$tag = "client/$Ref"

& git -C $repo cat-file -e "${commit}:.gitattributes" 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "$Ref has no .gitattributes, so nothing would be excluded. Release a commit that contains it."
}
& git -C $repo rev-parse --verify -q "refs/tags/$tag" | Out-Null
if ($LASTEXITCODE -eq 0) { throw "Tag $tag already exists. Each release tag is published once." }

$work = Join-Path ([System.IO.Path]::GetTempPath()) ("client-release-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$tree = Join-Path $work "tree"
$zip = Join-Path $work "release.zip"
$index = Join-Path $work "index"
New-Item -ItemType Directory -Force -Path $tree | Out-Null

try {
    # 1. Export the release files. autocrlf off on both sides keeps every file byte-identical.
    Invoke-Git -c core.autocrlf=false archive --format=zip -o $zip $commit | Out-Null
    Expand-Archive -LiteralPath $zip -DestinationPath $tree
    Remove-Item -LiteralPath $zip
    @(
        "MFE Inspection - client release",
        "Release:       $Ref",
        "Source commit: $commit",
        "Built (UTC):   $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm'))"
    ) | Set-Content -LiteralPath (Join-Path $tree "RELEASE.txt") -Encoding ascii

    # 2. Stage those files into a private index and write a tree object.
    $env:GIT_INDEX_FILE = $index
    Invoke-Git -c core.autocrlf=false --work-tree=$tree add -A -f . | Out-Null
    $treeId = (Invoke-Git write-tree).Trim()

    # 3. Safety net: refuse if anything developer-only slipped through.
    $files = Invoke-Git ls-tree -r --name-only $treeId
    $leaks = $files | Where-Object {
        ($_ -match '^(\.agents|\.claude|runtime\.example)/') -or
        ($_ -in @('AGENTS.md', 'HANDOVER.md', 'skills-lock.json', 'requirements.txt')) -or
        ($_ -match '^docs/') -or
        ($_ -match '^apps/(web|api)/tests/') -or
        ($_ -match '\.test\.tsx?$') -or
        ($_ -match '^scripts/(dev|phone-testing|security|testing)/')
    }
    if ($leaks) { throw "Developer-only files would be published:`n$($leaks -join "`n")" }
    # Developer machine paths in any shipped text file (the file list above cannot catch these).
    $pathHits = Get-ChildItem -LiteralPath $tree -Recurse -File |
        Where-Object { $_.Name -ne 'package-lock.json' -and $_.Length -lt 2MB -and $_.Extension -notin @('.png', '.jpg', '.ico', '.woff', '.woff2', '.pdf', '.docx') } |
        Select-String -Pattern 'PWA_OfflineRecordWebApp', 'C:\\Users\\[^\\]+\\AppData' -List |
        ForEach-Object { $_.Path.Substring($tree.Length + 1).Replace('\', '/') }
    if ($pathHits) { throw "Developer machine paths found in files that would be published:`n$($pathHits -join "`n")" }
    foreach ($required in @('docker-compose.yml', 'apps/api/Dockerfile', 'infra/reverse-proxy/Dockerfile', 'scripts/Backup-All.ps1', 'scripts/Prepare-ClientPC.ps1')) {
        if ($files -notcontains $required) { throw "Release is missing $required." }
    }

    # 4. Commit on the release branch (parent = previous release), unless nothing changed.
    $parent = & git -C $repo rev-parse --verify -q "refs/heads/$Branch"
    if ($LASTEXITCODE -ne 0) { $parent = $null }
    if ($parent) {
        $parentTree = (Invoke-Git rev-parse "$parent^{tree}").Trim()
        if ($parentTree -eq $treeId) { Write-Host "$Branch already has exactly these files. Nothing to do."; return }
    }
    $message = "Client release $Ref (from $short)"
    $newCommit = if ($parent) { (Invoke-Git commit-tree $treeId -p $parent -m $message).Trim() }
                 else { (Invoke-Git commit-tree $treeId -m $message).Trim() }
    if ($parent) { Invoke-Git update-ref "refs/heads/$Branch" $newCommit $parent | Out-Null }
    else { Invoke-Git update-ref "refs/heads/$Branch" $newCommit "" | Out-Null }
    Invoke-Git tag $tag $newCommit | Out-Null

    Write-Host "Published $Ref ($short) to branch $Branch as $($newCommit.Substring(0, 9)), tagged $tag."
    Write-Host "$(@($files).Count) files in the release."
}
finally {
    Remove-Item Env:GIT_INDEX_FILE -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

if ($Push) {
    Invoke-Git push $Remote "refs/heads/${Branch}:refs/heads/$Branch" "refs/tags/${tag}:refs/tags/$tag" | Out-Null
    Write-Host "Pushed $Branch and $tag to $Remote."
}
else {
    Write-Host "Not pushed. When ready:  git push $Remote ${Branch} $tag"
}
