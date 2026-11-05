# run-h-checks.ps1 - one script for the package H pre-checks (PLAN.md section 6, item 10).
#
# What it checks (from the command line, no VS Code needed):
#   (a) the CLI shows our local MCP server's tools to the model (http and stdio)
#   (b) the model calls the tool and gets the answer back
#   (c) the token cost of the tool list (compared with a run without the server)
# Not covered here (need VS Code): (c) model picks readSymbol over reading a whole file,
# (d) jsconfig.json effect, (e) findImporters accuracy.
#
# Usage (Windows PowerShell 5.1 or PowerShell 7, from this dev folder):
#   .\run-h-checks.ps1 -ClaudePath "C:\path\to\claude-bin.exe"
#   .\run-h-checks.ps1 -ClaudePath "C:\path\to\claude-bin.exe" -Model "qwen3.8:27b" -Transport http
#   .\run-h-checks.ps1 -ClaudePath "C:\path\to\claude-bin.exe" -Cleanup   (only deletes probe folders)
#
# Takes roughly 5-20 minutes, mostly the cold model load (about 285 seconds).
param(
  [string]$ClaudePath = "",
  [string]$Model = "",
  [ValidateSet("both", "http", "stdio")] [string]$Transport = "both",
  [int]$TurnTimeout = 600,
  [string]$Out = "mcp-report.txt",
  [switch]$CopyReport,
  [switch]$Cleanup
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

function Remove-ProbeFolders {
  $tempDirs = Get-ChildItem -Path $env:TEMP -Filter "claude-probe-mcp-*" -Directory -ErrorAction SilentlyContinue
  $projDirs = Get-ChildItem -Path (Join-Path $env:USERPROFILE ".claude\projects") -Filter "*claude-probe-mcp*" -Directory -ErrorAction SilentlyContinue
  foreach ($d in @($tempDirs) + @($projDirs)) {
    if ($d) { Remove-Item -LiteralPath $d.FullName -Recurse -Force; Write-Host "deleted: $($d.FullName)" }
  }
}

if ($Cleanup) {
  Remove-ProbeFolders
  return
}

# ---- 0. Prerequisites ----
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) { throw "Node.js is not installed or not in PATH (need version 18 or newer)." }
$nodeVersion = (& node --version).Trim()
Write-Host "Node: $nodeVersion"

if (-not $ClaudePath) { throw "Pass -ClaudePath with the full path to claude-bin.exe." }
if (-not (Test-Path -LiteralPath $ClaudePath)) { throw "claude-bin.exe not found at: $ClaudePath" }
if ($ClaudePath -match '\.(cmd|bat)$') { throw "Use claude-bin.exe, not the .cmd/.bat wrapper (it hangs on 'Select model number')." }

# Files received by email arrive as .txt; rebuild the .js next to this script if needed.
$probe = Join-Path $PSScriptRoot "probe-mcp-standalone.js"
$probeTxt = Join-Path $PSScriptRoot "probe-mcp-standalone.txt"
if (-not (Test-Path -LiteralPath $probe) -and (Test-Path -LiteralPath $probeTxt)) {
  Copy-Item -LiteralPath $probeTxt -Destination $probe
  Write-Host "Created probe-mcp-standalone.js from the .txt copy."
}
if (-not (Test-Path -LiteralPath $probe)) { throw "probe-mcp-standalone.js (or its .txt copy) was not found next to this script." }

# ---- 1. CLI support for --mcp-config and http transport (quick, optional info) ----
Write-Host "`n== CLI support ==" -ForegroundColor Cyan
$cliVersion = (& $ClaudePath --version 2>&1 | Out-String).Trim()
Write-Host "CLI version: $cliVersion"
Write-Host "mcp add --help (transport lines):"
& $ClaudePath mcp add --help | Select-String "transport"
Write-Host "--help (mcp-config / strict-mcp lines):"
& $ClaudePath --help | Select-String "mcp-config|strict-mcp"

# ---- 2. The probe: (a) (b) (c) ----
Write-Host "`n== MCP probe (takes 5-20 minutes) ==" -ForegroundColor Cyan
$probeArgs = @($probe, "--claude", $ClaudePath, "--out", $Out, "--transport", $Transport, "--turn-timeout", "$TurnTimeout")
if ($Model) { $probeArgs += @("--model", $Model) }
& node @probeArgs
if ($LASTEXITCODE -ne 0) { throw "The probe exited with code $LASTEXITCODE. The partial report (if any) is in $Out." }

# ---- 3. Summary of the report ----
$reportPath = Join-Path $PSScriptRoot $Out
$report = Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | ConvertFrom-Json

Write-Host "`n== Summary ==" -ForegroundColor Cyan
Write-Host "CLI: $($report.cliVersion)"
$base = $report.baseline
if ($base) {
  Write-Host ("baseline (no server): timedOut={0} inputTokens={1} ms={2}" -f $base.timedOut, $base.inputTotal, $base.ms)
}
foreach ($run in @($report.runs)) {
  $verdict = if ($run.serverSawToolsList -and $run.serverSawPingCall -and $run.modelAnswerHasNonce) { "PASS" } else { "FAIL" }
  Write-Host ""
  Write-Host ("[{0}] transport={1}" -f $verdict, $run.transport) -ForegroundColor $(if ($verdict -eq "PASS") { "Green" } else { "Red" })
  Write-Host "  (a) server got initialize:  $($run.serverSawInitialize)"
  Write-Host "  (a) server got tools/list:  $($run.serverSawToolsList)"
  Write-Host "  (b) model called ping:      $($run.serverSawPingCall)"
  Write-Host "  (b) model answer has nonce: $($run.modelAnswerHasNonce)"
  Write-Host "  (c) extra input tokens:     $($run.extraInputTokensVsBaseline)"
  Write-Host "  timedOut=$($run.timedOut) code=$($run.code) ms=$($run.ms)"
  if ($verdict -eq "FAIL" -and $run.stderr) {
    Write-Host "  stderr (last part):" -ForegroundColor Yellow
    Write-Host $run.stderr
  }
}

Write-Host "`nReport: $reportPath"
Write-Host "Read it before sharing: it contains model answers and folder paths."
if ($CopyReport) {
  Get-Content -LiteralPath $reportPath -Raw -Encoding UTF8 | Set-Clipboard
  Write-Host "Report copied to the clipboard."
}
Write-Host "To delete the probe's temporary folders later: .\run-h-checks.ps1 -ClaudePath `"...`" -Cleanup"
