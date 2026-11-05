# Claude Code Local - בדיקות CLI בהרצה אחת (בלי התוסף).
# הרצה:  powershell -ExecutionPolicy Bypass -File C:\Users\user\Claude-in-VSC\dev\run-cli-checks.ps1
# בלי שאלה על המודל:  ... -File ...\run-cli-checks.ps1 -Model qwen3.8:27b
# התוצאה מודפסת וגם נשמרת בקובץ: %TEMP%\cl-cli-results.txt (אפשר להעתיק משם).
param([string]$Model = '')

$ErrorActionPreference = 'Continue'
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$resultsFile = Join-Path $env:TEMP 'cl-cli-results.txt'
Start-Transcript -Path $resultsFile -Force | Out-Null

function Section($t) { Write-Host ''; Write-Host ('=== ' + $t) -ForegroundColor Cyan }

# ---------- שלב 0: מציאת הקובץ, סביבה, מודל ----------
Section 'שלב 0: הכנה'
$claude = 'C:\Users\206861775\AppData\Local\Programs\ClaudeCode\claude-bin.exe'
if (-not (Test-Path $claude)) {
  $cmd = (Get-Command claude -ErrorAction SilentlyContinue).Source
  $found = if ($cmd) { Get-ChildItem (Split-Path $cmd) -Recurse -Filter claude-bin.exe -ErrorAction SilentlyContinue | Select-Object -First 1 }
  if ($found) { $claude = $found.FullName }
}
if (-not (Test-Path $claude)) {
  Write-Host 'לא נמצא claude-bin.exe. עצרו והעתיקו לי את הפלט.' -ForegroundColor Red
  Stop-Transcript | Out-Null; return
}
'נמצא: ' + $claude
$env:API_TIMEOUT_MS = '1200000'
$env:CLAUDE_ENABLE_STREAM_WATCHDOG = '0'
'גרסה: ' + (& $claude --version)

if (-not $Model) {
  $ids = @()
  try { $ids = (Invoke-RestMethod 'http://172.27.5.5:11436/v1/models' -TimeoutSec 10).data.id } catch {}
  if (-not $ids) { $ids = 'qwen2.5-coder:7b','qwen2.5:7b','gpt-oss:20b','gemma4:26b','gemma3:27b','gemma4:31b','qwen3:latest','llama3.1:70b','gpt-oss:120b','qwen3.8:27b' }
  for ($i = 0; $i -lt $ids.Count; $i++) { '{0}. {1}' -f ($i + 1), $ids[$i] }
  $pick = Read-Host 'מספר מודל (Enter = qwen3.8:27b)'
  $Model = if ($pick -match '^\d+$' -and [int]$pick -ge 1 -and [int]$pick -le $ids.Count) { $ids[[int]$pick - 1] } else { 'qwen3.8:27b' }
}
'המודל שנבחר: ' + $Model

function Msg($t) { @{ type = 'user'; message = @{ role = 'user'; content = @(@{ type = 'text'; text = $t }) } } | ConvertTo-Json -Depth 6 -Compress }

# ---------- בדיקה 1: האם @ מורחב ----------
Section 'בדיקה 1: האם ה-CLI מרחיב @ (כלי קריאה וחיפוש חסומים)'
$dir = Join-Path $env:TEMP 'cl-at-test'
New-Item -ItemType Directory -Force $dir | Out-Null
Set-Content -Path (Join-Path $dir 'secret.txt') -Value 'The secret word of this file is PINEAPPLE-7731' -Encoding utf8
$abs = (Join-Path $dir 'secret.txt') -replace '\\', '/'
function Ask($label, $text) {
  Write-Host ('--- ' + $label) -ForegroundColor Yellow
  $out = (Msg $text) | & $claude --model $Model -p --input-format stream-json --output-format stream-json --verbose --disallowedTools 'Read,Glob,Grep,Bash,Edit,Write,WebFetch'
  $got = $false
  foreach ($line in $out) {
    try { $j = $line | ConvertFrom-Json } catch { continue }
    if ($j.type -eq 'result') { $got = $true; 'תשובה: ' + $j.result }
  }
  if (-not $got) { 'לא התקבלה תשובה. הפלט הגולמי:'; $out | Select-Object -First 5 }
}
Push-Location $dir
Ask '1: @ with full path' "@$abs What is the secret word in this file? Answer with one word."
Ask '2: @ with relative path' "@secret.txt What is the secret word in this file? Answer with one word."
Ask '3: control, no @ (should fail)' "What is the secret word in the file secret.txt in the current folder? Answer with one word."
Ask '4: explicit instruction, no tools' "Start your work from the file @$abs. What is the secret word in it? Answer with one word."
Pop-Location

# ---------- בדיקה 2: /btw ----------
Section 'בדיקה 2: /btw'
$dir2 = Join-Path $env:TEMP 'cl-btw-test'
New-Item -ItemType Directory -Force $dir2 | Out-Null
$lines = @(
  (Msg 'Remember the number 4242. Reply with only: OK'),
  (Msg '/btw What number did I ask you to remember? Answer with the number only.'),
  (Msg '/btw Use a tool to list the files in the current folder.'),
  (Msg 'What number did I ask you to remember? Answer with the number only.')
)
Push-Location $dir2
$out = $lines | & $claude --model $Model -p --input-format stream-json --output-format stream-json --verbose
Pop-Location
$sid = $null
foreach ($l in $out) {
  try { $j = $l | ConvertFrom-Json } catch { continue }
  if ($j.type -eq 'system' -and $j.subtype -eq 'init') { $sid = $j.session_id; 'init: btw ברשימת הפקודות = ' + ($j.slash_commands -contains 'btw') + ' | model=' + $j.model }
  elseif ($j.type -eq 'result') { 'result[' + $j.subtype + ']: ' + $j.result }
  elseif ($j.type -eq 'assistant') {
    $t = ($j.message.content | Where-Object { $_.type -eq 'text' } | ForEach-Object { $_.text }) -join ' '
    $u = ($j.message.content | Where-Object { $_.type -eq 'tool_use' } | ForEach-Object { $_.name }) -join ','
    "assistant: טקסט=[$t] כלים=[$u]"
  }
  elseif ($j.type -ne 'stream_event') { 'אחר: ' + $j.type + '/' + $j.subtype }
}
if (-not $sid) { 'לא התקבל מזהה שיחה (init). הפלט הגולמי:'; $out | Select-Object -First 5 }
else {
  $enc = $dir2 -replace '[^A-Za-z0-9]', '-'
  $tr = Join-Path $env:USERPROFILE ".claude\projects\$enc\$sid.jsonl"
  'תמלול: ' + $tr
  if (Test-Path $tr) {
    'שורות בתמלול שמכילות "btw": ' + (Select-String -Path $tr -Pattern 'btw' -SimpleMatch | Measure-Object).Count
    'שורות בתמלול שמכילות "4242": ' + (Select-String -Path $tr -Pattern '4242' -SimpleMatch | Measure-Object).Count
  } else { 'קובץ התמלול לא נמצא' }
}

# ---------- בדיקה 4: חלון ההקשר ----------
Section 'בדיקה 3: חלון ההקשר (/api/ps, המודל חייב להיות טעון עכשיו)'
try {
  Invoke-RestMethod http://172.27.5.5:11435/api/ps | Select-Object -ExpandProperty models | Select-Object name, context_length | Format-Table -AutoSize | Out-String -Width 200
} catch { 'שגיאה בקריאת /api/ps: ' + $_.Exception.Message }

Section 'סיום'
'התוצאה נשמרה גם בקובץ: ' + $resultsFile
Stop-Transcript | Out-Null
