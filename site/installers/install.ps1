# codeGem skills installer (Windows PowerShell 5+ and PowerShell 7).
#
#   irm @@SITE_URL@@/install.ps1 | iex; Install-Skills feature-loop pre-merge-check
#   irm @@SITE_URL@@/install.ps1 | iex; Install-Skills -All
#
# Options (GNU-style --all, --global, --no-deps, --force, --list also work):
#   <skill> ...   Skills to install. Skills they use are installed too.
#   -All          Install every skill.
#   -Global       Install into ~/.claude/skills (all projects) instead of .\.claude\skills.
#   -NoDeps       Do not install the skills a named skill uses.
#   -Force        Replace skills you named that are already installed. The old copy is
#                 moved to .claude\skills\.backup\<name>-<timestamp>\ first.
#                 Never applies to skills pulled in as dependencies.
#   -List         List available skills.
#
# Files are downloaded only from the skills site, never from GitHub.
# To point at a different site: $env:CODEGEM_SKILLS_URL = 'https://your-site.example'
#
# Loading this script only defines Install-Skills; nothing runs until you call it.
# It never calls `exit`, so it is safe to run with `iex` in your own session.

$script:CodeGemBakedUrl = '@@SITE_URL@@'

function Install-Skills {
    [CmdletBinding()]
    param(
        [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
        [string[]] $Names,
        [switch] $All,
        [switch] $Global,
        [switch] $NoDeps,
        [switch] $Force,
        [switch] $List
    )

    $ErrorActionPreference = 'Stop'
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is very slow with the progress bar on PS 5
    try {
        # TLS 1.2 for older Windows PowerShell 5.1 defaults.
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        } catch { }

        # Accept GNU-style flags too, so commands look the same on every OS.
        $skillNames = @()
        foreach ($n in @($Names)) {
            if ([string]::IsNullOrWhiteSpace($n)) { continue }
            switch ($n) {
                '--all'     { $All = $true; continue }
                '--global'  { $Global = $true; continue }
                '--no-deps' { $NoDeps = $true; continue }
                '--force'   { $Force = $true; continue }
                '--list'    { $List = $true; continue }
                default {
                    if ($n.StartsWith('-')) { Write-Host ("error: " + "Unknown option: $n") -ForegroundColor Red; return }
                    $skillNames += $n
                }
            }
        }

        $base = $script:CodeGemBakedUrl
        if ($env:CODEGEM_SKILLS_URL) { $base = $env:CODEGEM_SKILLS_URL }
        $base = $base.TrimEnd('/')
        if ($base -match 'SET-SITE_URL-AT-BUILD-TIME' -or $base -match '@@SITE_URL') {
            Write-Host ("error: " + "This installer was built without a site URL. Set `$env:CODEGEM_SKILLS_URL = 'https://<your-skills-site>' and try again, or rebuild the site with SITE_URL set.") -ForegroundColor Red
            return
        }

        try {
            $manifest = Invoke-RestMethod -UseBasicParsing -Uri "$base/manifest.json"
            if ($manifest -is [string]) { $manifest = $manifest | ConvertFrom-Json }
        } catch {
            Write-Host ("error: " + "Could not download the skill list from $base/manifest.json : $($_.Exception.Message)") -ForegroundColor Red
            return
        }
        $byName = @{}
        foreach ($s in @($manifest.skills)) { $byName[$s.name] = $s }
        $allNames = @($manifest.skills | ForEach-Object { $_.name })
        if ($allNames.Count -eq 0) { Write-Host ("error: " + "The skill list from $base is empty.") -ForegroundColor Red; return }

        if ($List) {
            Write-Host "Available skills ($($allNames.Count)):"
            foreach ($n in $allNames) { Write-Host "  $n" }
            return
        }

        if ($All) { $skillNames = $allNames }
        if ($skillNames.Count -eq 0) {
            Write-Host ("error: " + "Name at least one skill, or use -All. Example: Install-Skills feature-loop") -ForegroundColor Red
            return
        }

        $bad = @($skillNames | Where-Object { -not $byName.ContainsKey($_) })
        if ($bad.Count -gt 0) {
            Write-Host ("error: Unknown skill(s): " + ($bad -join ', ') + ". Run Install-Skills -List to see what is available.") -ForegroundColor Red
            return
        }

        $requested = New-Object System.Collections.Generic.List[string]
        foreach ($n in $skillNames) { if (-not $requested.Contains($n)) { $requested.Add($n) } }
        $plan = New-Object System.Collections.Generic.List[string]
        foreach ($n in $requested) { $plan.Add($n) }
        if (-not $NoDeps) {
            foreach ($n in $requested) {
                foreach ($d in @($byName[$n].allDeps)) {
                    if ($d -and -not $plan.Contains($d)) { $plan.Add($d) }
                }
            }
        }

        if ($Global) {
            $target = Join-Path (Join-Path $HOME '.claude') 'skills'
        } else {
            $target = Join-Path (Join-Path (Get-Location).ProviderPath '.claude') 'skills'
        }
        New-Item -ItemType Directory -Force -Path $target | Out-Null

        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("codegem-skills-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force -Path $tmp | Out-Null
        $onUnix = ($PSVersionTable.PSVersion.Major -ge 6) -and (-not $IsWindows)

        $installed = @(); $updated = @(); $backups = @(); $skipped = @(); $skippedDeps = @()
        try {
            foreach ($name in $plan) {
                $explicit = $requested.Contains($name)
                $dest = Join-Path $target $name
                if (Test-Path -LiteralPath $dest) {
                    if ($explicit -and $Force) { }
                    elseif ($explicit) { $skipped += $name; continue }
                    else { $skippedDeps += $name; continue }
                }

                # Stage first so a failed download never touches an existing install.
                $stage = Join-Path $tmp $name
                Write-Host "Downloading $name ..."
                foreach ($f in @($byName[$name].files)) {
                    $rel = [string]$f.path
                    if ($rel.StartsWith('/') -or $rel.Contains('..')) { throw "Refusing unsafe path in manifest: $rel" }
                    $out = Join-Path $stage ($rel -replace '/', [System.IO.Path]::DirectorySeparatorChar)
                    $dir = Split-Path -Parent $out
                    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
                    try {
                        Invoke-WebRequest -UseBasicParsing -Uri "$base/skills/$name/$rel" -OutFile $out
                    } catch {
                        throw "Download failed for $name ($rel): $($_.Exception.Message). Nothing was changed for this skill."
                    }
                    if ($onUnix -and $f.exec) { & chmod +x $out }
                }

                if (Test-Path -LiteralPath $dest) {
                    $backupRoot = Join-Path $target '.backup'
                    New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
                    $backup = Join-Path $backupRoot "$name-$stamp"
                    $i = 1
                    while (Test-Path -LiteralPath $backup) { $backup = Join-Path $backupRoot "$name-$stamp-$i"; $i++ }
                    Move-Item -LiteralPath $dest -Destination $backup
                    Move-Item -LiteralPath $stage -Destination $dest
                    $updated += $name; $backups += $backup
                } else {
                    Move-Item -LiteralPath $stage -Destination $dest
                    $installed += $name
                }
            }
        } finally {
            Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }

        Write-Host ""
        Write-Host "codeGem skills -> $target"
        if ($installed.Count -gt 0) { Write-Host "  Installed ($($installed.Count)): $($installed -join ', ')" }
        if ($updated.Count -gt 0) {
            Write-Host "  Updated ($($updated.Count)): $($updated -join ', ')"
            foreach ($b in $backups) { Write-Host "    old copy backed up to $b" }
        }
        if ($skipped.Count -gt 0) {
            Write-Host "  Skipped, already installed ($($skipped.Count)): $($skipped -join ', ')"
            Write-Host "    to update: Install-Skills -Force $($skipped -join ' ')"
        }
        if ($skippedDeps.Count -gt 0) {
            Write-Host "  Dependencies already installed, left as is ($($skippedDeps.Count)): $($skippedDeps -join ', ')"
            if ($Force) { Write-Host "    -Force only replaces skills you name; name these to update them." }
        }
        if ($installed.Count -eq 0 -and $updated.Count -eq 0) { Write-Host "  Nothing new to install." }
        Write-Host ""
        if ($Global) {
            Write-Host "Next: open any project in Claude Code (run: claude) and type /$($requested[0])"
        } else {
            Write-Host "Next: in this folder, run: claude   then type /$($requested[0])"
        }
    } finally {
        $ProgressPreference = $oldProgress
    }
}
