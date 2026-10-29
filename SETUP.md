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

## בדיקה

1. סוגרים את VS Code לגמרי ופותחים מחדש.
2. פותחים את התוסף ושולחים הודעה קצרה.
3. התשובה צריכה להגיע מהמודל המקומי.

## הערות

- ה-GUI של `claude-gui` הוא פרויקט נפרד, וההגדרות שלו (`config.json`) לא משפיעות על התוסף.
- ההתחברות לחשבון Anthropic (`claude auth login`) לא נדרשת כשמשתמשים במודל מקומי.
