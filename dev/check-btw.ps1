# check-btw.ps1 - בדיקת /btw מול ה-CLI האמיתי. מאתר לבד את claude-bin.exe (לא claude.cmd).
# הרצה:  powershell -ExecutionPolicy Bypass -File .\check-btw.ps1
# הפלט נשמר גם ב-check-btw-result.txt בשולחן העבודה. שלחו אותו.
# הערה: הבדיקה שולחת 3 שאלות קצרות למודל המקומי (המודל עלול להיטען: עד כמה דקות בהרצה הראשונה).

$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'check-btw-result.txt'
Start-Transcript -Path $out -Force | Out-Null
function Show-Header($t) { Write-Host ""; Write-Host "=== $t" -ForegroundColor Cyan }

Show-Header '1. איתור claude-bin.exe'
$cands = @()
$cmd = Get-Command claude -ErrorAction SilentlyContinue
if ($cmd) { $cands += (Split-Path $cmd.Source) }
$cands += (Join-Path $env:LOCALAPPDATA 'Programs\ClaudeCode')
$bin = $null
foreach ($d in ($cands | Select-Object -Unique)) {
  if (Test-Path $d) { $bin = Get-ChildItem $d -Recurse -Filter claude-bin.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName; if ($bin) { break } }
}
if (-not $bin) { Write-Host 'לא נמצא claude-bin.exe. הגדירו $bin ידנית בראש הקובץ.' -ForegroundColor Red; Stop-Transcript | Out-Null; return }
Write-Host "בינארי: $bin"
& $bin --version

Show-Header '2. האם הדגלים קיימים ב---help'
$h = & $bin --help 2>&1 | Out-String
foreach ($f in '--tools','--no-session-persistence','--output-format') { "{0}: {1}" -f $f, ($h -match [regex]::Escape($f)) }

$work = Join-Path $env:TEMP 'cl-btw-proc'
New-Item -ItemType Directory -Force $work | Out-Null
$projDir = Join-Path $env:USERPROFILE '.claude\projects'
$before = @(Get-ChildItem $projDir -Recurse -Filter *.jsonl -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
Push-Location $work

function Ask($title, $q) {
  Show-Header $title
  $r = $q | & $bin -p --output-format json --tools "" --no-session-persistence 2>&1 | Out-String
  Write-Host $r
}
Ask '3א. תשובה רגילה (צפוי: 4)' 'What is 2+2? Answer with the number only.'
Ask '3ב. בקשת כלי (צפוי: לא מריץ כלי, מסביר שאין)' 'Use a tool to list the files in the current folder.'
Ask '3ג. היסטוריה (צפוי: NONE או לא יודע)' 'What did I ask you before this message? If nothing, say NONE.'
Ask '3ד. הפקודה /btw המקורית של ה-CLI (ייתכן שלא נתמכת ב-p)' '/btw What is 2+2? Answer with the number only.'
Pop-Location

Show-Header '4. האם נוצר קובץ שיחה חדש (צפוי: אין)'
$after = @(Get-ChildItem $projDir -Recurse -Filter *.jsonl -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName)
$new = $after | Where-Object { $before -notcontains $_ }
if ($new) { Write-Host 'נוצרו קבצים חדשים (זו התנהגות ה-CLI, נרשום ונחליט):' -ForegroundColor Yellow; $new | ForEach-Object { '{0}  ({1} שורות)' -f $_, (Get-Content $_ | Measure-Object -Line).Lines } } else { Write-Host 'לא נוצר קובץ שיחה חדש (תקין)' -ForegroundColor Green }

Write-Host ""; Write-Host "הסתיים. נשמר ב: $out" -ForegroundColor Green
Stop-Transcript | Out-Null