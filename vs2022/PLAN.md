# תוכנית: Claude Code Local ל-Visual Studio 2022

## החלטות שנקבעו
| נושא | החלטה |
|---|---|
| Backend | תרגום ל-C#. ללא Node כתהליך עזר. |
| גרסת VS | 17.0 ומעלה |
| הפצה | שימוש אישי: קובץ VSIX להתקנה ידנית. ללא Marketplace. |
| מיקום | `vs2022/` בתוך הריפו הקיים, כדי לא לשבור את תוסף VS Code |
| ממשק | WebView2 עם `webview/chat` הקיים (שכבת הודעות חדשה בלבד) |

## החלטות פתוחות (להכריע לפני Phase 0)
1. **מודל התוסף:** VSSDK קלאסי (.NET Framework 4.8, `AsyncPackage`) או Extensibility החדש (out-of-process, .NET 8).
   המלצה: **VSSDK קלאסי**. הוא תומך בגרסאות 17.0+ באופן יציב, ומתאים ל-WebView2 ולקוד הקיים.
2. **שם התוסף ומזהה:** המלצה: `ClaudeCodeLocal.Vs2022`, עם GUID חדש שנוצר בפרויקט.

## שלבים

### Phase 0: שלד הפרויקט
- פרויקט VSIX ב-`vs2022/src/` עם solution, `.vsct` ו-`source.extension.vsixmanifest`.
- חבילות NuGet: `Microsoft.VisualStudio.SDK`, `Microsoft.Web.WebView2`.
- חבילה ריקה שנטענת ב-Experimental Instance.
- **סיום:** פקודה בתפריט View מופיעה ב-`devenv /RootSuffix Exp`.
- הערכה: ~15K טוקנים.

### Phase 1: חלון צ'אט
- Tool window עם WebView2 שטוען את `webview/chat` (מועתק לתוך ה-VSIX).
- שכבת הודעות: `postMessage` ו-`WebMessageReceived`, באותו פורמט שה-webview מצפה לו.
- שמירה על RTL ועברית בדף.
- **סיום:** חלון מציג את ממשק הצ'אט בעברית, והודעה מהדף מגיעה לקוד C#.
- הערכה: ~35K טוקנים.

### Phase 2: תהליך ה-CLI ו-stream-json
- ספק תהליך ב-C# (`src/cli/spawn`, `process`, `args`, `env`) עם stdin/stdout.
- פרסור stream-json והמרה לאירועים שה-webview מבין (לפי `src/panels/event-translator.js`).
- `claudePath` ו-`environmentVariables` מההגדרות.
- **סיום:** שליחת הודעה ב-VS וקבלת תשובה מה-CLI האמיתי. שימוש ב-`dev/fake-claude` לבדיקות אוטומטיות.
- הערכה: ~60K טוקנים.

### Phase 3: שיחות והיסטוריה
- קריאה read-only של `~/.claude/projects/<cwd>/*.jsonl` (לפי `src/history/*`).
- פתיחת שיחה קיימת, המשך שיחה (`--resume`), ושם שיחה.
- **סיום:** רשימת שיחות, פתיחה והמשך.
- הערכה: ~50K טוקנים.

### Phase 4: הרשאות וכרטיסי שגיאה
- כרטיס אישור הרשאות (נשלח כ-control request של ה-CLI).
- מצבי הרשאות (Auto / Plan / ברירת מחדל), ו-`bypassPermissions` רק אם מופעל בהגדרות.
- כרטיס שגיאה בעברית כשה-CLI נכשל.
- **סיום:** Claude מבקש אישור לכלי, והמשתמש מאשר או דוחה.
- הערכה: ~30K טוקנים.

### Phase 5: הגדרות
- דף Options ב-VS (`DialogPage`) עם המפתחות של `claudeLocal.*` הרלוונטיים:
  `claudePath`, `environmentVariables`, `allowDangerouslySkipPermissions`, `preferredLocation`.
- **סיום:** שינוי הגדרה נשמר ונקלט בשיחה הבאה.
- הערכה: ~20K טוקנים.

### Phase 6: אינטגרציה עם העורך
- `@` mentions של קבצים מהפרויקט הפתוח.
- פתיחת קובץ מהצ'אט, ו-diff של שינויים בעזרת `IVsDifferenceService`.
- שורת סטטוס עם מצב Claude.
- **סיום:** `@file` עובד, ו-diff נפתח ב-VS.
- הערכה: ~40K טוקנים.

### Phase 7: פיצ'רים מתקדמים (אופציונלי, אחרי שהבסיס יציב)
- Checkpoints ו-rewind, `/diff`, `/loop`, משימות ברקע, דיאלוג MCP, `/plan`.
- כל פיצ'ר נבחר בנפרד לפי צורך.
- הערכה: ~100K+ טוקנים.

### Phase 8: אריזה והתקנה
- בניית VSIX ו-`SETUP_VS2022.md` בעברית: התקנה, הגדרות ופתרון בעיות.
- **סיום:** קובץ VSIX מותקן על מחשב נקי דרך VSIX Installer.
- הערכה: ~10K טוקנים.

## סיכום הערכה
- בסיס (Phase 0–6 ו-8): כ-260K טוקנים.
- עם דיבוג וסבבי תיקון (פי 2 בערך): כ-500K טוקנים.
- Phase 7 נוסף לפי בחירה.

## סיכונים
- **פרוטוקול CLI משתנה:** הפרסור מבוסס על גרסת CLI מסוימת (2.1.246). נעגן את הגרסה ב-`SETUP_VS2022.md`.
- **Threading ב-VS:** כל גישה ל-UI חייבת לעבור דרך `JoinableTaskFactory`. טעות כאן גורמת לקריסות.
- **WebView2 Runtime:** נדרש במחשב. ב-Windows 11 הוא מותקן כברירת מחדל. ב-Windows 10 צריך לוודא.
- **בדיקות אוטומטיות מוגבלות:** חלק גדול מהבדיקות דורש VS אמיתי. נשתמש ב-`fake-claude` לבדיקות הפרוטוקול, ובבדיקה ידנית ב-Experimental Instance.

## עקרונות עבודה (מתוך הריפו)
- כל שינוי נכנס למסמך המתאים, ולא רק לצ'אט.
- אחד-אחד: כל Phase נבדק ומאושר לפני המעבר לבא.
- קומיטים רק לפי בקשה, ובענף נפרד.
