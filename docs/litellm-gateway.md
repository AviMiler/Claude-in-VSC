# שער LiteLLM ו-Ollama: מסמך הפניה

עודכן: 1.11.2026. כל מה שכתוב כאן נבדק בפועל (מתוך VS Code 1.91.1, מהטרמינל, או בבקשות ישירות), אלא אם סומן "לא נבדק". כלי הבדיקה: `dev/gateway-probe/` (ראה `dev/README.md`). איך התוסף משתמש בשער: `docs/final-plan.md` סעיף 3, החלטות 1, 5 ו-6.

## 1. מה זה ואיך מתחברים
| נושא | ערך |
|---|---|
| השער | **LiteLLM API 1.80.0** (OAS 3.1, `/openapi.json`), מגיש את מודלי ה-Ollama בפורמט OpenAI: `http://172.27.5.5:11436`. ה-CLI מדבר איתו דרך `ANTHROPIC_BASE_URL` |
| Ollama | `http://172.27.5.5:11435` (השער פונה אליו כ-`api_base: http://localhost:11435/v1`). **נגיש ישירות** מהמחשב של המשתמש; פורט 11434 סגור |
| מפתח | `ANTHROPIC_AUTH_TOKEN` הוא `ollama`, נשלח כ-`Authorization: Bearer ollama`. חלק מהנקודות ציבוריות ולא דורשות אותו |
| העטיפה `claude.cmd` | שולפת מהשער את רשימת המודלים (`/v1/models`) לפני כל הרצה. התוסף מפעיל את `claude-bin.exe` ישירות (`SETUP.md` §4) |
| השרת משותף | `/api/ps` הציג `gemma4:26b` טעון בזמן שנבדק `qwen3.8:27b`. בדיקות שטוענות מודלים משפיעות על כל המשתמשים |
| ניהול | `/ui` בדפדפן: פאנל הניהול של LiteLLM (הגדרת מודלים ומפתחות על ידי מנהל השרת) |

## 2. נקודות השער: התוצאה בפועל
נבדק מתוך ה-Extension Host של VS Code 1.91.1 (Node 20.9.0, Electron 29.4.0, בלי פרוקסי, `http.proxySupport: override`), גם עם `http` של Node וגם עם `fetch`, תוך 15 עד 250 מילישניות. **התוסף יכול לגשת לשער.**

| נקודה | שיטה | תוצאה | משמעות |
|---|---|---|---|
| `/v1/models`, `/models` | GET | 200, **עשרה מזהי מודלים**. עובד בלי מפתח וגם עם מפתח | מקור רשימת הבורר (הוחלט) |
| `/v1/model/info`, `/model/info` | GET | 200 (29 KB). שדות `model_info.*` ריקים (`null`); `litellm_params` מכיל את ההגדרות של כל מודל (סעיף 3) | מקור לסימון מודלי JSON-כותרת בלבד |
| `/model_group/info` | GET | 200. `supports_vision`, `supports_function_calling`, `supports_reasoning` הם `false` לכל המודלים, גם ל-`qwen3.8:27b` שרואה תמונות ומפעיל כלים | **לא אמין** |
| `/public/model_hub` | GET | 200, ריק | אין שימוש |
| `/utils/supported_openai_params?model=` | GET | 400 `Could not map model=qwen3.8:27b` (LiteLLM לא מכיר את המודל) | אין שימוש |
| `/utils/token_counter` | POST | 200: `total_tokens: 9` ל-`hello world`, `tokenizer_type: openai_tokenizer` | **ספירה משוערת בלבד**; `get_context_usage` של ה-CLI נשאר המקור למד ההקשר |
| `/routes` | GET | 200, 422 נתיבים: כולל `/v1/messages` ו-`/v1/messages/count_tokens` (נתיבי Anthropic שה-CLI משתמש בהם), `/health`, `/anthropic/{endpoint}` | |
| `/v1/chat/completions` | POST | משמש למדידת החלון (סעיף 6); `usage.prompt_tokens` בתשובה | |
| `/models/{model_id}`, `/v1/models/{model_id}` | GET | לא נבדק | |

פירוש קודי שגיאה: `401` = הנקודה דורשת מפתח אחר מ-`ollama`; `404`/`405` = אינה זמינה בשער הזה. `/public/model_hub/info` לא נבדק. שגיאות שנצפו בשער: `gemma3:27b` נדחה עם `litellm.BadRequestError: ... does not support tools`, ושם שלא קיים עם `Invalid model name passed`. `/api/show` של Ollama **אינו חשוף דרך השער** (404). נקודות שאינן קשורות לצ'אט (שער MCP של LiteLLM, וקבוצות `assistants`, `embeddings`, `audio`, `images`, `batches` ועוד): לא בשימוש, ה-CLI מנהל את ה-MCP שלו.

## 3. הגדרות כל מודל בשער (`litellm_params`)
כל המודלים מגיעים ל-`api_base: http://localhost:11435/v1`, עם `extra_body.num_ctx`:

| מודל | `num_ctx` | `max_input_tokens` | `max_tokens` (פלט) | הערות |
|---|---|---|---|---|
| qwen3.8:27b | 12288 | 8192 | 4096 | `stop_sequences: ["</block>"]`, `output_config.effort: high`. נמדד בפועל חלון של לפחות 50,012 (סעיף 6) |
| qwen3:latest | 12288 | 8192 | 4096 | |
| gemma4:26b | 12288 | 8192 | 4096 | `effort: high`. `/api/ps` הראה `context_length: 64000` (סעיף 5) |
| gemma3:27b | 12288 | 8192 | 4096 | **לא תומך בכלים** (נבדק): `does not support tools` |
| gemma4:31b | 12288 | 8192 | 4096 | **פלט JSON כפוי** `{"title": string}` |
| qwen2.5-coder:7b | 16384 | 12288 | 4096 | **פלט JSON כפוי** `{"title": string}` |
| qwen2.5:7b | 16384 | 12288 | 4096 | |
| gpt-oss:20b | 16384 | 12288 | 4096 | |
| llama3.1:70b | 8192 | 4096 | 4096 | timeout 900 |
| gpt-oss:120b | 6144 | 4096 | 2048 | timeout 1200 |

**`num_ctx` ו-`max_input_tokens` לא נאכפים:** נמדד רק ל-`qwen3.8:27b` (פלאטו, סעיף 6) ול-`gemma4:26b` (`/api/ps`); שאר המודלים לא נמדדו.

## 4. מה אמין ומה לא
1. **יכולות המודלים בשער לא אמינות.** `/model_group/info` אומר `false` לכל; `litellm_params.model_info` אומר `supports_function_calling: true` לכל (גם ל-`gemma3:27b` שנכשל). לכן סינון המודלים נעשה לפי רשימה (`claudeLocal.modelDenylist`, ברירת מחדל `gemma3:27b`) ולפי זיהוי שגיאת "does not support tools".
2. **שני מודלים מוגדרים לפלט JSON של כותרת בלבד** (`qwen2.5-coder:7b`, `gemma4:31b`; `extra_body.output_config.format` עם סכמה `{title}`), כנראה ליצירת כותרות. הם לא מתאימים לשיחה ומוסתרים אוטומטית מהבורר לפי נוכחות השדה.
3. **`effort: high` קבוע** בהגדרת השער, ולכן בחירת Effort בתוסף אינה משפיעה (תואם לבדיקה שלא הראתה הבדל). שורת Effort מחוץ לתוכנית.
4. **רשימת המודלים** (`/v1/models`) היא המקור היחיד לשמות המודלים: ה-`initialize` של ה-CLI מחזיר רק ארבעה כינויים של אותו מודל.

## 5. Ollama ישירות בפורט 11435
`GET http://172.27.5.5:11435/api/ps` הצליח, כלומר ה-API המקורי של Ollama זמין (בניגוד לשער). תוצאה לדוגמה (המודל הטעון באותו רגע, `gemma4:26b`):

| שדה | ערך | משמעות |
|---|---|---|
| `context_length` | **64000** | החלון שבו המודל טעון בפועל. שונה מ-`num_ctx` בשער (12288), כלומר ההגדרה בשער **לא נאכפת**; החלון נקבע ברמת השרת (כנראה `OLLAMA_CONTEXT_LENGTH`) |
| `size` = `size_vram` | 17,785,065,307 בתים | נטען כולו ל-GPU |
| `details` | `gguf`, `gemma4`, `25.8B`, `Q4_K_M` | פורמט, משפחה, גודל, קוונטיזציה |
| `expires_at` | כ-5 דקות קדימה | keep-alive: המודל נפרק אחרי חוסר פעילות |

- `POST :11435/api/show` (לכל מודל) אמור להחזיר `capabilities` (`completion`, `vision`, `tools`, `thinking`), `parameters` ו-`model_info` (כולל `<ארכיטקטורה>.context_length`). זה מקור פוטנציאלי אמין לסינון מודלים במקום נתוני השער. **לא נבדק.**
- פורט 11435 חשוף כנראה בגלל תצורת הרשת הנוכחית; השער הוא הנתיב הרשמי של ה-CLI, ולכן התוסף שולף את הרשימה ממנו.

## 6. מדידת חלון ההקשר דרך השער: `qwen3.8:27b`
בדיקת פלאטו (`/v1/chat/completions`, פרומפט של N מילים; השיטה ב-`dev/README.md`):

| מילים | `prompt_tokens` | זמן |
|---|---|---|
| 2,000 | 2,012 | **285 שניות** (טעינה קרה של המודל) |
| 6,000 | 6,012 | 2 שניות |
| 12,000 | 12,012 | 3 שניות |
| 25,000 | 25,012 | 7 שניות |
| 50,000 | 50,012 | 16 שניות |

1. **אין פלאטו:** `prompt_tokens` גדל ליניארית עד 50,000, ולכן החלון האפקטיבי הוא **לפחות 50,000 טוקנים** (תואם ל-`context_length: 64000` מ-`/api/ps`). Claude Code שולח כ-25 אלף טוקנים להודעה פשוטה (נמדדו כ-24,700 קלט), ונכנס בנוחות; ההוראות לא נחתכות.
2. **ערך:** `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`. ה-CLI לא מכיר את המודל ומניח 200 אלף.
3. **טעינה קרה של 285 שניות** (כמעט 5 דקות; אחר כך 2 עד 16 שניות): הבקשה הראשונה אחרי חוסר פעילות (keep-alive כ-5 דקות) כוללת טעינת המודל ל-GPU, אולי גם פריקת מודל אחר. לכן `API_TIMEOUT_MS=1200000` (20 דקות) הכרחי, והצ'אט מציג "המודל נטען, זה יכול לקחת כמה דקות" כשהתשובה מתעכבת.
4. **מהירות עיבוד פרומפט:** כ-3,000 טוקנים לשנייה (50,000 ב-16 שניות); הודעה ראשונה של כ-25 אלף טוקנים לוקחת כ-8 שניות אחרי שהמודל טעון.

## 7. מה פתוח
- אישור `context_length: 64000` ל-`qwen3.8:27b` עצמו דרך `/api/ps` כשהוא טעון (נמדד כבר חלון של לפחות 50,000, ולכן לא חוסם).
- בדיקת `POST :11435/api/show` ליכולות אמיתיות לכל מודל (ראייה, כלים, חשיבה). ראייה נבדקה רק על `qwen3.8:27b`, וכלים על `qwen3.8:27b`, `gemma4:26b` (תקין) ו-`gemma3:27b` (נכשל).
