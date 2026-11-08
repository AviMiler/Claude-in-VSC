# check-ide-server.ps1 - בדיקת שרת ה-IDE של התוסף (PLAN.md סעיף 7). רוצו אחרי ההכנה ב-VS Code (שלב 0 למטה).
# הרצה: powershell -ExecutionPolicy Bypass -File .\check-ide-server.ps1          (קריאה בלבד)
#        powershell -ExecutionPolicy Bypass -File .\check-ide-server.ps1 -Probe   (גם מריץ את ה-CLI פעם אחת מול השרת; שולח הודעה קצרה אחת למודל)
# הפלט נשמר גם ב-check-ide-server-result.txt בשולחן העבודה. הטוקנים מוסתרים. שלחו את הקובץ ואת שורות [ide] מהיומן.
# לא קוראים כאן ל-claude או ל-claude.cmd (עטיפה עם תפריט): רק ל-claude-bin.exe.
param([switch]$Probe)

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'check-ide-server-result.txt'
Start-Transcript -Path $out -Force | Out-Null

function Show-Step($t) { Write-Host ""; Write-Host "=== $t" -ForegroundColor Cyan }

Show-Step '0. הכנה ב-VS Code (לפני הסקריפט)'
Write-Host '  א. בהגדרות (settings.json):  "claudeLocal.ideServer": true,  "claudeLocal.ideServerVerboseLog": true'
Write-Host '  ב. Ctrl+Shift+P > Developer: Reload Window, כשתיקיית פרויקט פתוחה.'
Write-Host '  ג. פתחו את הצ''אט של התוסף ושלחו הודעה קצרה. חכו 30 שניות.'
Write-Host '  ד. Ctrl+Shift+P > "העתקת יומן" והדביקו לקובץ את כל השורות עם [ide] (כותרות החיבור והודעות JSON-RPC, הטוקן מוסתר).'
Write-Host '     אם אין שום שורת "handshake": ה-CLI לא ניסה להתחבר. אם יש "rejected": הכותרות בשורת ה-handshake מראות איפה ה-CLI שולח את הטוקן.'

Show-Step '1. איתור claude-bin.exe'
$dirs = @()
$cmd = Get-Command claude -ErrorAction SilentlyContinue
if ($cmd) { Write-Host "claude ב-PATH: $($cmd.Source)"; $dirs += (Split-Path $cmd.Source) }
$dirs += (Join-Path $env:LOCALAPPDATA 'Programs\ClaudeCode')
$bin = $null
foreach ($d in ($dirs | Select-Object -Unique)) {
  if (Test-Path $d) {
    $bin = Get-ChildItem $d -Recurse -Filter claude-bin.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($bin) { break }
  }
}
if ($bin) { Write-Host "בינארי: $bin"; & $bin --version } else { Write-Host 'לא נמצא claude-bin.exe (הבדיקה עם -Probe לא תרוץ). הכניסו את הנתיב המלא ל-$bin ורוצו שוב.' -ForegroundColor Yellow }

Show-Step '2. קבצי הנעילה'
$cfg = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $env:USERPROFILE '.claude' }
$ideDir = Join-Path $cfg 'ide'
Write-Host "תיקייה: $ideDir"
$locks = @(Get-ChildItem $ideDir -Filter *.lock -ErrorAction SilentlyContinue)
if (-not $locks.Count) { Write-Host 'אין קבצי נעילה. התוסף לא רץ, ההגדרה claudeLocal.ideServer כבויה, או שהשרת לא עלה (חפשו "failed to start" ביומן).' -ForegroundColor Yellow }
$live = @()
foreach ($f in $locks) {
  $port = [int]$f.BaseName
  try { $j = Get-Content $f.FullName -Raw | ConvertFrom-Json } catch { Write-Host "$($f.Name): לא קריא"; continue }
  $proc = Get-Process -Id $j.pid -ErrorAction SilentlyContinue
  $open = $false
  $tcp = New-Object System.Net.Sockets.TcpClient
  try { $open = $tcp.ConnectAsync('127.0.0.1', $port).Wait(800) } catch {} finally { $tcp.Close() }
  $tok = if ($j.authToken) { "$($j.authToken.Substring(0, [Math]::Min(4, $j.authToken.Length)))*** (אורך $($j.authToken.Length))" } else { '(אין)' }
  Write-Host ("{0}: pid={1} ({2}) port-open={3} ideName={4} transport={5} runningInWindows={6} token={7}" -f $f.Name, $j.pid, ($(if ($proc) { $proc.ProcessName } else { 'לא רץ' })), $open, $j.ideName, $j.transport, $j.runningInWindows, $tok)
  Write-Host ("    workspaceFolders: " + ($j.workspaceFolders -join ' | '))
  if ($proc -and $open) { $live += [pscustomobject]@{ Port = $port; Folder = @($j.workspaceFolders)[0] } }
}

if (-not $Probe) {
  Show-Step 'סוף (בלי -Probe). כדי שה-CLI יתחבר פעם אחת מכאן, הריצו שוב עם -Probe.'
  Stop-Transcript | Out-Null
  return
}

Show-Step '3. Probe: הרצת ה-CLI עם CLAUDE_CODE_SSE_PORT'
if (-not $bin -or -not $live.Count) { Write-Host 'אין בינארי או אין נעילה חיה; מדלג.' -ForegroundColor Yellow; Stop-Transcript | Out-Null; return }
$target = $live[0]
Write-Host "פורט $($target.Port), תיקייה $($target.Folder). (אם יש כמה חלונות VS Code, זה הראשון.)"
$env:CLAUDE_CODE_SSE_PORT = [string]$target.Port
Push-Location $target.Folder
try {
  $lines = & $bin -p 'Reply with the single word: ok' --output-format stream-json --verbose 2>&1
} finally {
  Pop-Location
  Remove-Item Env:CLAUDE_CODE_SSE_PORT -ErrorAction SilentlyContinue
}
foreach ($line in $lines) {
  $s = [string]$line
  if ($s -notmatch '^\{') { Write-Host "  (שורה לא-JSON) $s"; continue }
  try { $m = $s | ConvertFrom-Json } catch { continue }
  if ($m.type -eq 'system' -and $m.subtype -eq 'init') {
    Write-Host '  שרתי MCP לפי ה-CLI (init):'
    foreach ($srv in @($m.mcp_servers)) { Write-Host "    $($srv.name): $($srv.status)" }
    $ideTools = @($m.tools) | Where-Object { $_ -match 'ide' }
    Write-Host ("  כלים עם 'ide' בשם: " + ($(if ($ideTools) { $ideTools -join ', ' } else { '(אין)' })))
  }
  if ($m.type -eq 'result') { Write-Host "  תוצאה: $($m.subtype)" }
}
Write-Host ''
Write-Host 'עכשיו ב-VS Code: "העתקת יומן" והוסיפו את שורות [ide] שנוצרו בזמן ה-Probe (handshake, accepted/rejected, << / >>).'
Stop-Transcript | Out-Null
