# Emits AGENT_LOOP_TICK every 30 minutes so Cursor can wake and verify checkpoints.
# Real GitHub pushes are handled by checkpoint-30m.ps1 — this only wakes the agent.
$ErrorActionPreference = 'Continue'
$Prompt = 'CHECKPOINT30m: Do NOT kill run-chain/complete-prereqs. 1) Ensure checkpoint-30m.ps1 alive (restart if dead). 2) Load .env; run coverage-report.ts + tmp-coverage-snapshot. 3) Commit+push coverage-report.json/.md + completion-state.json to origin/main (no secrets/logs). 4) Verify healthz=200. 5) Brief parent: counts, SHA, ETA. 6) Keep driving UNFINISHED->0; fix clusters without fabricating.'
while ($true) {
  Start-Sleep -Seconds 1800
  Write-Output ("AGENT_LOOP_TICK_checkpoint30m {`"prompt`":`"$Prompt`"}")
}
