# Real 30-minute GitHub/Vercel checkpoint — commits and pushes, not just tick prints.
# Does NOT start a second complete-prereqs worker.
$ErrorActionPreference = 'Continue'
$Root = 'C:\Users\shikh\Desktop\prehealth-Advisor'
$Log = Join-Path $Root 'scripts\checkpoint-30m.log'
Set-Location $Root

function Import-DotEnv([string]$Path) {
  if (-not (Test-Path $Path)) { return }
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim().TrimStart([char]0xFEFF)
    if (-not $line -or $line.StartsWith('#')) { return }
    $i = $line.IndexOf('=')
    if ($i -lt 1) { return }
    $name = $line.Substring(0, $i).Trim()
    $val = $line.Substring($i + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
      $val = $val.Substring(1, $val.Length - 2)
    }
    Set-Item -Path "Env:$name" -Value $val
  }
}

function Write-Log([string]$msg) {
  $line = "$(Get-Date -Format o) $msg"
  Add-Content -LiteralPath $Log -Value $line
  Write-Output $line
}

function Invoke-Checkpoint {
  Import-DotEnv (Join-Path $Root '.env')
  if (-not $env:DATABASE_URL) {
    Write-Log 'SKIP no DATABASE_URL'
    return
  }

  # Never race a second worker — only coverage + state commits.
  $alive = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'run-chain\.sh|complete-prereqs\.ts' }
  Write-Log ("supervisor_alive=$([bool]$alive)")

  pnpm --filter @workspace/scripts exec tsx src/coverage-report.ts 2>&1 | Out-Null
  $snap = pnpm --filter @workspace/scripts exec tsx src/tmp-coverage-snapshot.ts 2>&1 | Select-String 'TOTALS' | Select-Object -Last 1
  Write-Log ("coverage $($snap.Line)")

  git fetch origin --quiet 2>$null
  git add data/coverage-report.json data/coverage-report.md data/completion-state.json 2>$null
  # Refuse secrets
  $cached = git diff --cached --name-only
  if (-not $cached) {
    Write-Log 'NO_CHANGES'
  } else {
    $bad = git diff --cached | Select-String -Pattern 'DATABASE_URL=|OPENAI_API_KEY=|postgresql://|sk-[A-Za-z0-9]{20,}|fc-[a-f0-9]{20,}' -Quiet
    if ($bad) {
      Write-Log 'REFUSING_SECRET_PATTERN'
      git reset HEAD -- data/coverage-report.json data/coverage-report.md data/completion-state.json 2>$null
      return
    }
    $msg = @"
Checkpoint live coverage (30m cadence).

$($snap.Line)
"@
    git commit -m $msg 2>&1 | Out-Null
    git push origin HEAD 2>&1 | Out-Null
    git push origin HEAD:main 2>&1 | Out-Null
    $sha = git rev-parse --short origin/main
    Write-Log "PUSHED $sha"
  }

  try {
    $h = (Invoke-WebRequest -Uri 'https://prehealth-advisor.vercel.app/api/healthz' -UseBasicParsing -TimeoutSec 20).Content
    Write-Log "HEALTHZ $h"
  } catch {
    Write-Log "HEALTHZ_FAIL $($_.Exception.Message)"
  }
}

Write-Log 'START durable 30m checkpoint loop'
# Run one immediately, then every 30 minutes
Invoke-Checkpoint
while ($true) {
  Start-Sleep -Seconds 1800
  try { Invoke-Checkpoint } catch { Write-Log "ERR $($_.Exception.Message)" }
}
