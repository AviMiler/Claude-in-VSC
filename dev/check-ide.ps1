# check-ide.ps1 - בדיקת חיבור ה-CLI ל-IDE (חבילה F). קורא בלבד: לא מפעיל שרת ולא שולח כלום למודל.
# הרצה: קליק ימני על הקובץ > Run with PowerShell, או בטרמינל:  powershell -ExecutionPolicy Bypass -File .\check-ide.ps1
# אם ההרצה נחסמת, פתחו את הקובץ והדביקו אותו כולו בחלון PowerShell.
# הפלט נשמר גם בקובץ check-ide-result.txt בשולחן העבודה. שלחו אותו (הטוקן מוסתר).

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'check-ide-result.txt'
Start-Transcript -Path $out -Force | Out-Null

function H($t) { Write-Host ""; Write-Host "=== $t" -ForegroundColor Cyan }

# --- איתור claude-bin.exe (לא העטיפה claude.cmd)
H '1. איתור הקובץ הבינארי'
$cands = @()
$cmd = Get-Command claude -ErrorAction SilentlyContinue
if ($cmd) { Write-Host "claude ב-PATH: $($cmd.Source)"; $cands += (Split-Path $cmd.Source) }
$cands += (Join-Path $env:LOCALAPPDATA 'Programs\ClaudeCode')
$bin = $null
foreach ($d in ($cands | Select-Object -Unique)) {
  if (Test-Path $d) {
    $bin = Get-ChildItem $d -Recurse -Filter claude-bin.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($bin) { break }
  }
}
if (-not $bin) { Write-Host 'לא נמצא claude-bin.exe. הכניסו ידנית את הנתיב המלא למשתנה $bin בראש השלב הזה ורוצו שוב.' -ForegroundColor Red; Stop-Transcript | Out-Null; return }
Write-Host "בינארי: $bin"
$size = [math]::Round((Get-Item $bin).Length / 1MB, 1)
Write-Host "גודל: $size MB"

H '2. גרסה'
& $bin --version

H '3. דגלים שקשורים ל-IDE ב---help'
$h = & $bin --help 2>&1 | Out-String
$m = $h -split "`r?`n" | Select-String -Pattern '\bide\b' -CaseSensitive:$false
if ($m) { $m } else { Write-Host '(אין שורות עם "ide" ב---help)' }

H '4. מחרוזות בבינארי (עד 3 הקשרים לכל מחרוזת)'
$bytes = [System.IO.File]::ReadAllBytes($bin)
$text = [System.Text.Encoding]::GetEncoding(28591).GetString($bytes)
$names = 'CLAUDE_CODE_SSE_PORT','ENABLE_IDE_INTEGRATION','CLAUDE_CODE_AUTO_CONNECT_IDE','x-claude-code-ide-authorization','runningInWindows','workspaceFolders','ideName','--ide','ide\\.lock|\.claude/ide|\.claude\\ide'
foreach ($n in $names) {
  Write-Host ("--- " + $n) -ForegroundColor Yellow
  $ms = [regex]::Matches($text, $n) | Select-Object -First 3
  if (-not $ms) { Write-Host '(לא נמצא)'; continue }
  foreach ($x in $ms) {
    $st = [Math]::Max(0, $x.Index - 120)
    $len = [Math]::Min(340, $text.Length - $st)
    Write-Host (($text.Substring($st, $len)) -replace '[^\x20-\x7e]', '.')
    Write-Host '.....'
  }
}
$text = $null; $bytes = $null

H '5. קבצי נעילה ב-.claude\ide (הטוקן מוסתר)'
Get-ChildItem (Join-Path $env:USERPROFILE '.claude\ide') -Filter *.lock -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host ("--- " + $_.Name + "  (" + $_.LastWriteTime + ")")
  (Get-Content $_.FullName -Raw) -replace '("authToken"\s*:\s*")[^"]+', '$1***'
}

H '6. משתני סביבה רלוונטיים (ללא טוקנים/מפתחות)'
Get-ChildItem env: | Where-Object { $_.Name -match 'CLAUDE|SSE|IDE|VSCODE' -and $_.Name -notmatch 'TOKEN|KEY|SECRET|NONCE' } | Format-Table -AutoSize | Out-String -Width 200

Write-Host ""
Write-Host "הסתיים. התוצאה נשמרה ב: $out" -ForegroundColor Green
Stop-Transcript | Out-Null