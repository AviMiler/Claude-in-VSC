# הגדרות להפעלת התוסף עם מודל מקומי

התוסף מפעיל את ה-CLI של Claude Code, ולכן ההגדרות נכתבות בשני מקומות: קובץ ההגדרות של ה-CLI (שגם התוסף וגם הטרמינל קוראים ממנו), והגדרה אחת בתוסף עצמו.

## 1. קובץ ההגדרות של ה-CLI

הנתיב: `C:\Users\User\.claude\settings.json`

אם הקובץ לא קיים, יוצרים אותו. אם קיים, מוסיפים רק את החלק `"env"` לתוך האובייקט הקיים.

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://172.27.5.5:11436",
    "ANTHROPIC_AUTH_TOKEN": "ollama",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "qwen3.8:27b",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "qwen3.8:27b",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "qwen3.8:27b",
    "CLAUDE_DISABLE_TELEMETRY": "1",
    "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS": "1"
  }
}
```

- `ANTHROPIC_BASE_URL`: כתובת השרת של Ollama (המודל המקומי).
- `ANTHROPIC_AUTH_TOKEN`: ערך שהשרת מצפה לו. עבור Ollama זה `ollama`.
- שלושת ערכי `ANTHROPIC_DEFAULT_*_MODEL`: המודל שה-CLI משתמש בו בכל שלוש הרמות (Opus, Sonnet, Haiku).
- שתי ההגדרות האחרונות מכבות טלמטריה ובטא ניסיוניות.

## 2. הגדרת הנתיב ל-CLI בתוסף

ב-VS Code: `Ctrl+,` ← חיפוש `claudeLocal.claudePath` ← הערך:

```
C:\Users\User\.local\bin\claude.exe
```

ההגדרה נשמרת ב-`C:\Users\User\AppData\Roaming\Code\User\settings.json`. ברירת המחדל של התוסף היא `claude` (שם בלבד, מחפש ב-PATH).

## 3. התקנת התוסף

התוסף הועתק לתיקיית ההרחבות של VS Code:

`C:\Users\User\.vscode\extensions\local.claude-local-0.1.0`

## 4. הגרסה המינימלית של VS Code

ב-`package.json` שונתה הדרישה מ-`^1.94.0` ל-`^1.91.0`, כי VS Code בגרסה 1.91.1 לא טען את התוסף. התוסף עדיין לא נבדק בגרסה הזו.

## 5. שינויים נוספים שנדרשים (נמצאו בבדיקה מול ה-CLI ב-1.11.2026)

הבדיקה בוצעה על CLI בגרסה 2.1.246 ו-VS Code 1.91.1. פירוט הממצאים: `docs/features-plan.md`.

### 5.1 הנתיב ל-CLI חייב להיות הקובץ האמיתי, לא העטיפה

`claude.cmd` (בתיקיית ההתקנה של Claude Code) הוא עטיפה: לפני כל הרצה הוא שולף את רשימת המודלים מ-`/v1/models`, שואל "Select model number", ורק אז מפעיל את `claude-bin.exe` עם `--model`. התוסף מצפה לפרוטוקול JSON ולכן ייתקע על השאלה.

ב-`claudeLocal.claudePath` יש לציין את `claude-bin.exe` עצמו. במחשב הזה:

```
C:\Users\206861775\AppData\Local\Programs\ClaudeCode\claude-bin.exe
```

(הנתיב בסעיף 2 למעלה, `C:\Users\User\.local\bin\claude.exe`, שייך להתקנה אחרת.)

### 5.2 משתני סביבה שהעטיפה מגדירה והתוסף לא

העטיפה מגדירה גם `API_TIMEOUT_MS=1200000` ו-`CLAUDE_ENABLE_STREAM_WATCHDOG=0`. בלעדיהם, עם מודל מקומי איטי (זמן עד הטוקן הראשון כ-15 שניות), תשובה ארוכה עלולה להיכשל בגלל timeout. מוסיפים אותם לבלוק `env` בקובץ ההגדרות של ה-CLI.

### 5.3 קובץ ההגדרות מכיל שני בלוקי `"env"`

ב-`C:\Users\206861775\.claude\settings.json` מופיעים שני בלוקי `"env"`. ב-JSON הבלוק האחרון מנצח, ולכן `CLAUDE_CODE_MAX_OUTPUT_TOKENS` לא נקרא. יש לאחד לבלוק אחד:

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
    "CLAUDE_ENABLE_STREAM_WATCHDOG": "0"
  }
}
```

(`CLAUDE_CODE_MAX_OUTPUT_TOKENS` נשמר כפי שהיה בקובץ. אם הערך לא נחוץ, מוחקים אותו.)

### 5.4 חלון ההקשר של המודל

ה-CLI לא מכיר את `qwen3.8:27b` ולכן מניח חלון של 200 אלף טוקנים (ו-1 מיליון עם הסיומת `[1m]`). מד ההקשר וה-auto-compact מסתמכים על ההנחה הזו. אחרי שנמדד החלון האמיתי (`num_ctx`, ראה `docs/remaining-checks-plan.txt`), מוסיפים ל-`env`:

```
"CLAUDE_CODE_MAX_CONTEXT_TOKENS": "<הערך שנמדד>"
```

אם החלון קטן מכ-25 אלף טוקנים, ההוראות של Claude Code נחתכות בשקט, ויש לבקש ממנהל השרת להגדיל אותו (`PARAMETER num_ctx` ב-Modelfile).

### 5.5 בחירת מודל

העטיפה מגדירה את שלושת `ANTHROPIC_DEFAULT_*_MODEL` ואת `--model` לפי הבחירה. בלי העטיפה, המודל נקבע מ-`settings.json` (כרגע `qwen3.8:27b`). להחלפת מודל בהרצה ישירה: `claude-bin.exe --model <id>`, כשהמזהים מגיעים מ-`GET http://172.27.5.5:11436/v1/models`. בורר מודל בתוסף יצריך שליפה של הרשימה הזו (החלטה פתוחה, ראה `docs/features-plan.md`).

### 5.6 הגדרת checkpoints

במהלך הבדיקות הורצה `claude -p "/config checkpoints=true"`, והיא משנה הגדרה קבועה של ה-CLI. בבדיקה (1.11.2026) התברר שהיא **לא** מפעילה rewind בהרצה של התוסף: `rewind_files` עבד רק כשהתהליך הופעל עם המשתנה `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=1` והדגל `--replay-user-messages`, והתוסף יעשה זאת בעצמו. אפשר להחזיר את ההגדרה: `claude -p "/config checkpoints=false"`.

### 5.7 החלפת מודל

הכותרת של כל סשן נוצרת בקריאה למודל ה-HAIKU (`ANTHROPIC_DEFAULT_HAIKU_MODEL`). אם בוחרים מודל אחר ב-`--model` בלי לעדכן את שלושת משתני `ANTHROPIC_DEFAULT_*_MODEL`, השרת טוען שני מודלים. העטיפה מגדירה את שלושתם לבחירה, והתוסף יעשה אותו דבר בהחלפת מודל (הפעלה מחדש של התהליך עם `--resume`).
מודלים שאינם תומכים בכלים (למשל `gemma3:27b`) נכשלים עם `API Error: 400 ... does not support tools` ואינם שמישים עם Claude Code.

## בדיקה

1. סוגרים את VS Code לגמרי ופותחים מחדש.
2. פותחים את התוסף ושולחים הודעה קצרה.
3. התשובה צריכה להגיע מהמודל המקומי.

## הערות

- ה-GUI של `claude-gui` הוא פרויקט נפרד, וההגדרות שלו (`config.json`) לא משפיעות על התוסף.
- ההתחברות לחשבון Anthropic (`claude auth login`) לא נדרשת כשמשתמשים במודל מקומי.
