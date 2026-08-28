# Commits a coverage checkpoint on a timer.
#
# The commit message carries [skip ci], but Vercel deployed these anyway -- 24 checkpoint
# commits in twelve hours each triggered a full production build, against an account-wide
# quota of 100 deploys per day shared with every other project. The flag is left in place
# because it costs nothing, but the deploy is actually prevented by "ignoreCommand" in
# vercel.json, which skips the build when a commit touches no build input.
#
# A checkpoint changes only data/coverage-report.*, and production reads the database
# directly, so there is nothing in one of these commits for a deploy to publish.
#
# Written UTF-8 with a BOM on purpose: Windows PowerShell 5.1 decodes a BOM-less file as
# ANSI, which mangles every non-ASCII character in it.

function Import-DotEnv([string]$Path) {
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim().TrimStart([char]0xFEFF); if (-not $line -or $line.StartsWith('#')) { return }
    $i = $line.IndexOf('='); if ($i -lt 1) { return }
    $name = $line.Substring(0, $i).Trim(); $val = $line.Substring($i + 1).Trim()
    if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) { $val = $val.Substring(1, $val.Length - 2) }
    Set-Item -Path "Env:$name" -Value $val
  }
}
Set-Location 'C:\Users\shikh\Desktop\prehealth-Advisor'
while ($true) {
  try {
    Import-DotEnv '.\.env'
    pnpm --filter @workspace/scripts exec tsx src/coverage-report.ts 2>$null | Out-Null
    pnpm --filter @workspace/scripts exec tsx src/tmp-coverage-snapshot.ts 2>$null | Tee-Object -FilePath scripts\checkpoint-pulse.log -Append
    git add data/coverage-report.json data/coverage-report.md data/completion-state.json scripts/run-chain.sh scripts/src/complete-prereqs.ts 2>$null
    $staged = git diff --cached --name-only
    if ($staged) {
      $snap = Get-Content scripts\checkpoint-pulse.log -Tail 1
      git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "Checkpoint live coverage while supervisor continues.`n`n$snap" 2>$null
      git push origin HEAD:main 2>$null
      git push origin HEAD:cursor/prereq-completion-checkpoint 2>$null
      Write-Output "PUSHED $(Get-Date -Format o) $snap"
    } else {
      Write-Output "NO_CHANGES $(Get-Date -Format o)"
    }
  } catch {
    Write-Output "CHECKPOINT_ERR $(Get-Date -Format o) $($_.Exception.Message)"
  }
  # also verify supervisor still alive
  $alive = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -match 'run-chain\.sh' }
  if (-not $alive) { Write-Output "SUPERVISOR_MISSING $(Get-Date -Format o) — will not auto-restart from this loop (agent must decide)" }
  Start-Sleep -Seconds 3600
}
