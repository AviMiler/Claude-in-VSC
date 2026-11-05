# התקנה והגדרות להפעלת התוסף עם מודל מקומי

התוסף מפעיל את ה-CLI של Claude Code, ולכן ההגדרות נכתבות בשני מקומות: קובץ ההגדרות של ה-CLI (שגם התוסף וגם הטרמינל קוראים ממנו), והגדרה אחת בתוסף עצמו. הנתיבים להלן הם של המחשב הזה; הנימוקים והראיות: `DEPENDENCIES.md`.

## 1. דרישות
- VS Code בגרסה 1.91 ומעלה (המחשב הזה: 1.91.1).
- Claude Code CLI בגרסה 2.1.181 ומעלה, מותקן עם הקובץ `claude-bin.exe` (נבדק על 2.1.246).
- גישה לשער המודלים `http://172.27.5.5:11436` (ראה `DEPENDENCIES.md` סעיף 3). התחברות לחשבון Anthropic (`claude auth login`) אינה נדרשת במודל מקומי.

## 2. התקנת התוסף
מעתיקים את תיקיית התוסף לתיקיית ההרחבות של VS Code:

```
C:\Users\206861775\.vscode\extensions\local.claude-local-0.1.0
```

(לפיתוח אפשר גם `code --extensionDevelopmentPath=<נתיב הריפו>`.)

## 3. קובץ ההגדרות של ה-CLI

הנתיב: `C:\Users\206861775\.claude\settings.json`

אם הקובץ לא קיים, יוצרים אותו. אם קיים, משלבים את החלק `"env"` בתוך האובייקט הקיים. **חייב להיות בלוק `"env"` אחד בלבד:** כשיש שניים, ב-JSON הבלוק האחרון מנצח והמשתנים בבלוק הראשון אובדים (כך אבד `CLAUDE_CODE_MAX_OUTPUT_TOKENS` בעבר).

```json
{
  "theme": "dark",
  "hooks": {},
  "env": {
    "ANTHROPIC_BASE_URL": "http://172.27.5.5:11436",
    "ANTHROPIC_AUTH_TOKEN": "ollama",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "qwen3.8:27b",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen3.8:27b",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen3.8:27b",
    "CLAUDE_DISABLE_TELEMETRY": "1",
    "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1",
    "CLAUDE_CODE_MAX_OUTPUT_TOKENS": "64000",
    "API_TIMEOUT_MS": "1200000",
    "CLAUDE_ENABLE_STREAM_WATCHDOG": "0",
    "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "64000"
  }
}
```

(`theme` ו-`hooks` הם מה שכבר היה בקובץ; משאירים כפי שהם.)

| משתנה | מה הוא עושה |
|---|---|
| `ANTHROPIC_BASE_URL` | כתובת השער של המודל המקומי |
| `ANTHROPIC_AUTH_TOKEN` | הערך שהשרת מצפה לו; כאן `ollama` |
| `ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` | המודל בכל שלוש הרמות. כותרת כל סשן נוצרת בקריאה למודל ה-HAIKU, ולכן שלושתם מוגדרים לאותו מודל (אחרת השרת טוען שני מודלים) |
| `CLAUDE_DISABLE_TELEMETRY`, `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | מכבים טלמטריה ובטא ניסיוניות |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | נשמר כפי שהיה בקובץ; אם הוא לא נחוץ, מוחקים אותו |
| `API_TIMEOUT_MS` | `1200000` (20 דקות). חובה: הבקשה הראשונה אחרי כ-5 דקות של חוסר פעילות כוללת טעינה קרה של המודל (נמדדו 285 שניות), וזמן עד הטוקן הראשון הוא כ-15 שניות. בלי זה תשובה איטית נכשלת ב-timeout |
| `CLAUDE_ENABLE_STREAM_WATCHDOG` | `0`. כמו הקודם: מונע ניתוק של זרם איטי |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | `64000`. ה-CLI לא מכיר את `qwen3.8:27b` ומניח חלון של 200 אלף טוקנים (מיליון עם הסיומת `[1m]`), ומד ההקשר וה-auto-compact מסתמכים על ההנחה הזו. החלון האמיתי נמדד: לפחות 50,000 ו-`context_length: 64000` ב-Ollama (`DEPENDENCIES.md` סעיפים 3.5 ו-3.6). אם החלון היה קטן מכ-25 אלף טוקנים, ההוראות של Claude Code היו נחתכות בשקט, והיה צריך לבקש ממנהל השרת להגדיל `num_ctx` |

שלושת המשתנים האחרונים (`API_TIMEOUT_MS`, `CLAUDE_ENABLE_STREAM_WATCHDOG`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS`) התוסף מעביר בעצמו דרך ההגדרה `claudeLocal.environmentVariables` (ראו סעיף 7), והם מוגדרים שם כברירת מחדל. אפשר להשאיר אותם גם בקובץ הזה. שימו לב: ה-CLI מעדיף את ה-`env` של הקובץ הזה על פני משתני הסביבה שהתוסף מעביר, ולכן כשמשתנה מוגדר בשני המקומות, הערך בקובץ הזה הוא שקובע. יוצא מן הכלל: `CLAUDE_CODE_MAX_CONTEXT_TOKENS` ומשתני המודל, שהתוסף מעביר דרך `--settings`, ושם הערך של התוסף גובר. עם החלון התוסף מוסיף גם `CLAUDE_CODE_DISABLE_1M_CONTEXT=1`, כדי שמודל ברירת המחדל לא יקבל את הסיומת `[1m]` (חלון של מיליון).

## 4. הגדרת הנתיב ל-CLI בתוסף
ב-VS Code: `Ctrl+,` ← חיפוש `claudeLocal.claudePath` ← הערך הוא הקובץ האמיתי `claude-bin.exe`:

```
C:\Users\206861775\AppData\Local\Programs\ClaudeCode\claude-bin.exe
```

ההגדרה נשמרת ב-`C:\Users\206861775\AppData\Roaming\Code\User\settings.json`. ברירת המחדל של התוסף היא `claude` (שם בלבד, מחפש ב-PATH) ואינה מתאימה כאן, ולכן חובה להגדיר נתיב מפורש.

**לא מפנים ל-`claude.cmd`.** זו עטיפה שלפני כל הרצה שולפת את רשימת המודלים מ-`/v1/models`, שואלת "Select model number", ורק אז מפעילה את `claude-bin.exe` עם `--model` ועם המשתנים `API_TIMEOUT_MS=1200000` ו-`CLAUDE_ENABLE_STREAM_WATCHDOG=0`. התוסף מצפה לפרוטוקול JSON ולכן ייתקע על השאלה.

## 5. בדיקה
1. סוגרים את VS Code לגמרי ופותחים מחדש.
2. פותחים את התוסף ושולחים הודעה קצרה.
3. התשובה צריכה להגיע מהמודל המקומי. אם ההודעה הראשונה מתעכבת עד כמה דקות, זו טעינה קרה של המודל ולא תקלה.

## 6. דברים שכדאי לדעת
- **בחירת מודל:** בלי העטיפה, המודל נקבע מ-`settings.json` (כרגע `qwen3.8:27b`). בהרצה ישירה: `claude-bin.exe --model <id>`, כשהמזהים מגיעים מ-`GET http://172.27.5.5:11436/v1/models`. בורר המודל בתוסף שולף את הרשימה בעצמו ומחליף מודל בהפעלה מחדש של התהליך עם `--model`, כל משתני המודל (`ANTHROPIC_DEFAULT_*_MODEL` ו-`ANTHROPIC_SMALL_FAST_MODEL`) דרך `--settings`, ו-`--resume` (החלטות 1 ו-4 ב-`PLAN.md` סעיף 3).
- **מודל בלי תמיכה בכלים** (למשל `gemma3:27b`) נכשל עם `API Error: 400 ... does not support tools` ואינו שמיש עם Claude Code.
- **Checkpoints:** ההגדרה "Rewind code (checkpoints)" של ה-CLI (`/config checkpoints=true`) **אינה** מפעילה rewind בהרצה של התוסף. התוסף מפעיל אותו בעצמו עם `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` ו-`--replay-user-messages`. אין צורך לשנות את ההגדרה הקבועה; מי שרוצה לכבות אותה: `claude -p "/config checkpoints=false"`.
- **הפרויקט `claude-gui`** נפרד, וההגדרות שלו (`config.json`) לא משפיעות על התוסף.

## 7. הגדרות התוסף וקיצורי מקלדת

**איפה Claude נפתח (כלל אחד):**
1. כל דרך לפתוח את Claude (כפתור הדמות הכתומה בסרגל הכלים של העורך, "✻ Claude" בשורת המצב, `Ctrl+Alt+C`, קישור URI) פותחת את **אותו מקום**: סרגל הצד, או לשונית עורך אחת אם `claudeLocal.preferredLocation` = `panel`. אם Claude כבר פתוח שם, הוא רק מקבל את המיקוד.
2. "שיחה חדשה" (הבועה עם + בכותרת) פותחת שיחה נוספת באותו מקום. שיחה שעובדת **ממשיכה לעבוד ברקע** ולא נעצרת; כשהיא מבקשת אישור או מסיימת מופיעה נקודה על ☰ ומספר על סמל סרגל הצד.
3. ☰ (בפינה הימנית של הכותרת) פותח את רשימת השיחות: מעבר בין שיחות פתוחות, שיחות קודמות, חיפוש, שינוי שם וסגירה. שיחה שכבר פתוחה מוצגת, לא נפתחת פעמיים.
כל ההגדרות ב-`Ctrl+,` ← חיפוש `claudeLocal`.

| הגדרה | ברירת מחדל | מה היא עושה |
|---|---|---|
| `claudeLocal.environmentVariables` | `API_TIMEOUT_MS=1200000`, `CLAUDE_ENABLE_STREAM_WATCHDOG=0`, `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000` | משתני סביבה לתהליך ה-CLI, גם בצ'אט וגם בפתיחה בטרמינל. נוספים מעל הסביבה של VS Code ודורסים משתנה בעל אותו שם. משתני החיבור (`ANTHROPIC_BASE_URL` ועוד) נשארים ב-`settings.json` של ה-CLI. שינוי חל בשיחה הבאה. |
| `claudeLocal.preferredLocation` | `sidebar` | המקום היחיד שבו Claude נפתח: `sidebar` = סרגל הצד, `panel` = לשונית עורך אחת. |
| `claudeLocal.lockEditorGroups` | כבוי | נועל את קבוצת העורכים של לשונית הצ'אט. |
| `claudeLocal.useTerminal` | כבוי | פתיחת Claude (הכפתור, שורת המצב והקיצורים) פותחת את ה-CLI בטרמינל. הפקודה "פתיחה בטרמינל" זמינה תמיד. |
| `claudeLocal.enableNewConversationShortcut` | כבוי | `Ctrl+N` פותח שיחה חדשה כשהמיקוד בצ'אט. |
| `claudeLocal.keybindings.send` / `.newLine` / `.rewind` | `Enter` / `Shift+Enter` / `Escape Escape` | קיצורים בתוך תיבת ההודעה. פורמט: `Ctrl+Enter`, או רצף מופרד ברווח: `Escape Escape`. `useCtrlEnterToSend` ממשיכה לעבוד ומחליפה בין שליחה לשורה חדשה, כל עוד שני הקיצורים בברירת המחדל. `rewind` יופעל עם בניית נקודות השמירה. |

**קיצורי VS Code** (ניתנים לשינוי): `Ctrl+Alt+C` פותח את Claude (באותו מקום, לפי הכלל למעלה), `Ctrl+Alt+E` עובר בין העורך לצ'אט (החליף את `Ctrl+Esc` ש-Windows תופס; `Ctrl+Shift+Esc` הוסר מאותה סיבה), ו-`Ctrl+N` (רק אם הופעל). לשינוי: Command Palette ← "Claude Code Local: קיצורי מקלדת" (פותח את עורך הקיצורים מסונן ל-`claude-local`). הקיצורים בתוך תיבת ההודעה אינם מופיעים שם, כי ה-webview לא רואה את קיצורי VS Code; משנים אותם בהגדרות `claudeLocal.keybindings.*`.

### בדיקה שנדרשת אצלכם: האם `Ctrl+Alt+E` עובד?
`Ctrl+Esc` הוחלף ב-`Ctrl+Alt+E` (2026-11-05), כי Windows תופס את `Ctrl+Esc`. **זה לא נבדק ב-VS Code אמיתי.** הבדיקה: לוחצים `Ctrl+Alt+E` כשהמיקוד בעורך קוד; אמור להיפתח הצ'אט. אם לא: `Ctrl+K Ctrl+S`, חיפוש `claude-local.focusToggle`, והקלדת קיצור אחר.
