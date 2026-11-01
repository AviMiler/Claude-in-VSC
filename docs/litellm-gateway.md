# שער LiteLLM של המודל המקומי (מתוך ה-Swagger)

מקור: דף ה-Swagger של השרת `http://172.27.5.5:11436` (**LiteLLM API 1.80.0**, OAS 3.1, `/openapi.json`), שהמשתמש הדביק ב-1.11.2026.
השרת הוא **שער LiteLLM** שמגיש את מודלי ה-Ollama בפורמט OpenAI. ה-CLI מדבר איתו דרך `ANTHROPIC_BASE_URL`, והעטיפה `claude.cmd` שולפת ממנו את רשימת המודלים.

**סטטוס (עודכן 1.11.2026):** החלק הראשון של הקובץ נכתב מתוך ה-Swagger בלבד. הנקודות נבדקו מאז בפועל, והתוצאות בסעיפים "תוצאות הבדיקה מתוך VS Code", "Ollama ישירות" ו-"מדידת חלון ההקשר" למטה. כל מקום בקובץ שאומר "לבדוק" או "לא ידוע" נענה שם.
האימות מול השער: המפתח (`ANTHROPIC_AUTH_TOKEN`) הוא `ollama`. נשלח כ-`Authorization: Bearer ollama` (חלק מהנקודות ציבוריות ולא דורשות אותו).

## פונקציות רלוונטיות לתוסף

| נקודה | שיטה | מה היא נותנת | למה זה חשוב לנו | סטטוס |
|---|---|---|---|---|
| `/v1/models`, `/models` | GET | רשימת מזהי המודלים (10 כרגע) | רשימת הבורר; העטיפה משתמשת בה | **נקראה** |
| `/v1/model/info`, `/model/info` | GET | פרטים לכל מודל (בד"כ `model_info`: `max_input_tokens`, `max_tokens`, `supports_vision`, `supports_function_calling`, `supports_reasoning`...) | יכולות לכל מודל וחלון הקשר, בלי ניחושים. פותר את "להציג רק אם רלוונטי" | לבדוק |
| `/model_group/info` | GET | מידע מקובץ לפי קבוצת מודלים (גם בד"כ חלון הקשר ויכולות) | חלופה ל-`/model/info` | לבדוק |
| `/public/model_hub`, `/public/model_hub/info` | GET | רשימת מודלים ציבורית עם יכולות | אפשרות בלי מפתח | לבדוק |
| `/models/{model_id}`, `/v1/models/{model_id}` | GET | פרטי מודל בודד | בדיקה נקודתית | לבדוק |
| `/utils/token_counter` | POST | ספירת טוקנים להודעות למודל נתון | מד הקשר מדויק, ובדיקת גודל הפרומפט מול החלון | לבדוק |
| `/utils/supported_openai_params` | GET (`?model=`) | אילו פרמטרים המודל תומך בהם (למשל reasoning) | האם Effort/Thinking רלוונטיים | לבדוק |
| `/v1/chat/completions` | POST | קריאה בפורמט OpenAI; `usage.prompt_tokens` | מדידת `num_ctx` בדרך האמפירית (הפלאטו של `prompt_tokens`) | מתוכנן |
| `/routes` | GET | רשימת כל הנתיבים בשרת | למצוא את נתיב ה-Anthropic (`/v1/messages`) שה-CLI משתמש בו, והוא לא מופיע ברשימה שהודבקה | לבדוק |
| `/ui` | דפדפן | פאנל הניהול של LiteLLM | הגדרת מודלים ומפתחות על ידי מנהל השרת (למשל חלון הקשר) | מידע |

### נקודות שנראות אך לא רלוונטיות כרגע
- **שער MCP של LiteLLM** (`/v1/mcp/server`, `/mcp-rest/tools/list`, `/{mcp_server_name}/mcp`): אפשרות להעביר שרתי MCP דרך השער. לא נחוץ, כי ה-CLI מנהל את ה-MCP שלו (`db-meta`).
- הקבוצות `assistants`, `threads`, `embeddings`, `audio`, `images`, `videos`, `batches`, `fine-tuning`, `vector_stores`, `credentials`, `pass-through` (Gemini, Bedrock, Azure...), `responses`, `rerank`, `ocr`, `search`: לא קשורות לצ'אט.

## פקודות לבדיקה (PowerShell)

```powershell
$h = @{ Authorization = "Bearer ollama" }
Invoke-RestMethod http://172.27.5.5:11436/v1/model/info -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod http://172.27.5.5:11436/model_group/info -Headers $h | ConvertTo-Json -Depth 8
Invoke-RestMethod http://172.27.5.5:11436/public/model_hub | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://172.27.5.5:11436/utils/supported_openai_params?model=qwen3.8:27b" -Headers $h
Invoke-RestMethod -Method Post -Uri http://172.27.5.5:11436/utils/token_counter -Headers $h -ContentType application/json -Body '{"model":"qwen3.8:27b","messages":[{"role":"user","content":"hello world"}]}'
Invoke-RestMethod http://172.27.5.5:11436/routes -Headers $h
```

אם נקודה מחזירה 401, הנקודה דורשת מפתח אחר מ-`ollama`. אם 404 או 405, היא לא זמינה בשער הזה.
מה לשלוח: הפלט של כל פקודה (אפשר לקצר רשימות ארוכות לשני מודלים: `qwen3.8:27b` ומודל אחד נוסף).

## מה זה משנה בתוכנית (אם הנקודות עובדות)
- **בורר מודל:** כל מודל ברשימה יוצג עם יכולותיו (ראייה, חשיבה, כלים) וחלון ההקשר שלו, ושורות Effort/Thinking יוצגו רק למי שהשער מצהיר שתומך. זה מממש את הדרישה "להציג רק אם רלוונטי".
- **חלון הקשר:** `CLAUDE_CODE_MAX_CONTEXT_TOKENS` ייקבע לפי `max_input_tokens` של המודל הנבחר במקום מדידה ידנית (עם אישור שהערך הוא החלון שמוגדר בפועל ב-Ollama ולא רק המקסימום התיאורטי של המודל).
- **מד הקשר:** אפשר להשתמש ב-`/utils/token_counter` כמקור נוסף.
- **ההחלטה** (האם התוסף שולף נתונים מהשער בעצמו; הוחלט: כן, רשימת מודלים בלבד) הייתה חשובה: היא נותנת לא רק רשימה אלא גם יכולות.

## ממצא נוסף (1.11.2026)
`gemma3:27b` נדחה בשער עם `litellm.BadRequestError: ... does not support tools`, ושם מודל שאינו קיים עם `Invalid model name passed`. כלומר השער יודע מי תומך בכלים, והנקודות `/v1/model/info` ו-`/model_group/info` עשויות לחשוף זאת (למשל `supports_function_calling`). זה הופך אותן לחשובות במיוחד לבורר המודל. `/api/show` של Ollama אינו חשוף דרך השער (404).

---

## תוצאות הבדיקה מתוך VS Code (1.11.2026)

הרצה מתוך ה-Extension Host של VS Code 1.91.1 (Node 20.9.0, Electron 29.4.0, בלי פרוקסי, `http.proxySupport: override`). **התוסף יכול לגשת לשער**, גם דרך `http` של Node וגם דרך `fetch`, ובמהירות (15 עד 250 מילישניות).

| נקודה | תוצאה |
|---|---|
| `GET /v1/models` | 200, עשרה מודלים. **עובד בלי מפתח** וגם עם מפתח |
| `GET /v1/model/info` | 200 (29 KB). השדות `model_info.*` ריקים (`null`), אבל `litellm_params` מכיל את ההגדרות של כל מודל (ראה למטה) |
| `GET /model_group/info` | 200. `supports_vision`, `supports_function_calling`, `supports_reasoning` הם `false` לכל המודלים, וגם ל-`qwen3.8:27b` שמזהה תמונות ומפעיל כלים. **לא אמין** |
| `GET /public/model_hub` | 200, ריק |
| `GET /utils/supported_openai_params` | 400 `Could not map model=qwen3.8:27b` (LiteLLM לא מכיר את המודל) |
| `POST /utils/token_counter` | 200: `total_tokens: 9` ל-`hello world`, עם `tokenizer_type: openai_tokenizer`. **ספירה משוערת בלבד** (לא המפענח של המודל) |
| `GET /routes` | 200, 422 נתיבים. כולל `/v1/messages` ו-`/v1/messages/count_tokens` (נתיבי Anthropic שבהם ה-CLI משתמש), `/health`, `/anthropic/{endpoint}` |

### הגדרות כל מודל בשער (`litellm_params`)
כל המודלים מגיעים ל-`api_base: http://localhost:11435/v1` (שרת תואם OpenAI על אותו מחשב, פורט 11435), עם `extra_body.num_ctx`:

| מודל | `num_ctx` | `max_input_tokens` | `max_tokens` (פלט) | הערות |
|---|---|---|---|---|
| qwen3.8:27b | **12288** | 8192 | 4096 | `stop_sequences: ["</block>"]`, `output_config.effort: high` |
| qwen3:latest | 12288 | 8192 | 4096 | |
| gemma4:26b | 12288 | 8192 | 4096 | `effort: high` |
| gemma3:27b | 12288 | 8192 | 4096 | **לא תומך בכלים** (נבדק) |
| gemma4:31b | 12288 | 8192 | 4096 | **פלט JSON כפוי** `{"title": string}` |
| qwen2.5-coder:7b | 16384 | 12288 | 4096 | **פלט JSON כפוי** `{"title": string}` |
| qwen2.5:7b | 16384 | 12288 | 4096 | |
| gpt-oss:20b | 16384 | 12288 | 4096 | |
| llama3.1:70b | 8192 | 4096 | 4096 | timeout 900 |
| gpt-oss:120b | 6144 | 4096 | 2048 | timeout 1200 |

### מסקנות
1. **גישה מהתוסף אפשרית טכנית.** נשארת רק ההחלטה אם זה מותר מבחינת הכללים.
2. **יכולות המודל לא נקראות מהשער.** `model_group/info` אומר `false` לכל, ו-`litellm_params.model_info` אומר `supports_function_calling: true` לכל (כולל `gemma3:27b` שנכשל). לכן סינון לפי יכולות צריך להתבסס על **רשימה ידנית** (הגדרה בתוסף, כמו `modelDenylist`) או על זיהוי שגיאת "does not support tools" אחרי ניסיון.
3. **שני מודלים מוגדרים לפלט JSON של כותרת בלבד** (`qwen2.5-coder:7b`, `gemma4:31b`; `output_config.format` עם סכמה `{title}`), כנראה לצורך יצירת כותרות. הם לא מתאימים לשיחה. אפשר לזהות אותם אוטומטית לפי הנוכחות של `extra_body.output_config.format`.
4. **`effort: high` קבוע בהגדרת השער** ל-`qwen3.8:27b`, ולכן בחירת Effort בתוסף אינה משפיעה (תואם לבדיקה שלא הראתה הבדל). שורת Effort נשארת מחוץ לתוכנית.
5. **(נענה בהמשך הקובץ: ההגדרה לא נאכפת והחלון האמיתי לפחות 50,000.)** **חלון ההקשר המוגדר הוא 12288 טוקנים** (`num_ctx`) ל-`qwen3.8:27b`, ו-`max_input_tokens` 8192. אבל Claude Code שולח כ-24,700 טוקנים להודעה פשוטה. **לא ידוע אם ההגדרה נאכפת**: אם כן, ההוראות נחתכות בשקט (ובכך אולי מוסבר חלק מההתנהגות המוזרה של המודל, כמו מצב התכנון). בדיקת הפלאטו של `prompt_tokens` (`docs/remaining-checks-round3.txt`, חלק ג) מכריעה. אם החלון קטן מכ-32 אלף, מומלץ לבקש ממנהל השרת להגדיל `num_ctx` ל-`qwen3.8:27b`.
6. **ערך ל-`CLAUDE_CODE_MAX_CONTEXT_TOKENS`:** *(הוחלף)* הערך הסופי הוא `64000`, לא 12288 (ראה "מדידת חלון ההקשר" למטה).

---

## Ollama ישירות בפורט 11435 (1.11.2026)

השער פונה ל-`http://localhost:11435/v1` על מחשב השרת. הבדיקה `GET http://172.27.5.5:11435/api/ps` מהמחשב של המשתמש **הצליחה**, כלומר **Ollama נגיש ישירות** (הפורט לא חסום), ונקודות ה-API המקוריות שלו זמינות שם, בניגוד לשער (`/api/show` בשער מחזיר 404).

תוצאה שנצפתה (המודל הטעון באותו רגע, `gemma4:26b`):

| שדה | ערך | משמעות |
|---|---|---|
| `context_length` | **64000** | **חלון ההקשר שבו המודל טעון בפועל.** שונה מ-`extra_body.num_ctx` שבשער (12288 ל-gemma4:26b), כלומר ההגדרה בשער **לא נאכפת** (שרת ה-OpenAI-תואם של Ollama מתעלם ממנה, והחלון נקבע ברמת השרת, כנראה `OLLAMA_CONTEXT_LENGTH`) |
| `size` = `size_vram` | 17,785,065,307 בתים | המודל נטען כולו ל-GPU |
| `details` | `gguf`, `gemma4`, `25.8B`, `Q4_K_M` | פורמט, משפחה, גודל פרמטרים וקוונטיזציה |
| `expires_at` | כ-5 דקות קדימה | ה-keep-alive: המודל נפרק אחרי חוסר פעילות |

### מסקנות
1. **חששות החיתוך פחות חמורים:** Claude Code שולח כ-25 אלף טוקנים, וזה נכנס בחלון של 64,000. עדיין לא נבדק על `qwen3.8:27b` עצמו (הוא לא היה טעון באותו רגע), ולכן הערך לאישור: להפעיל הודעה עם `qwen3.8:27b` ואז להריץ שוב `/api/ps`.
2. **`CLAUDE_CODE_MAX_CONTEXT_TOKENS`:** ערך זמני **64000** (לא 12288 שבשער).
3. **יכולות מודל אמיתיות:** `POST http://172.27.5.5:11435/api/show` (לכל מודל) מחזיר ב-Ollama `capabilities` (למשל `completion`, `vision`, `tools`, `thinking`), `details`, `parameters` ו-`model_info` (כולל `<ארכיטקטורה>.context_length`). זה מקור אמין לסינון מודלים (ראייה, כלים) במקום נתוני השער. **לא אומת עדיין.**
4. **חיבור התוסף:** שליפה ישירה מ-Ollama (11435) היא אפשרות נוספת לצד השער. השער הוא הנתיב הרשמי שה-CLI משתמש בו, ופורט 11435 חשוף כנראה בגלל תצורת הרשת הנוכחית. ההחלטה איזה מקור להשתמש בו נשארת פתוחה.
5. **שרת משותף:** `ollama ps` מציג את המודל שנטען על ידי מי שהשתמש בו לאחרונה (כאן `gemma4:26b`, ולא `qwen3.8:27b`). הרצת בדיקות שטוענות מודלים אחרים משפיעה על כולם.

---

## מדידת חלון ההקשר דרך השער (1.11.2026): `qwen3.8:27b`

בדיקת הפלאטו (`/v1/chat/completions`, פרומפט של N מילים):

| מילים | `prompt_tokens` | זמן |
|---|---|---|
| 2,000 | 2,012 | **285 שניות** (טעינה קרה של המודל) |
| 6,000 | 6,012 | 2 שניות |
| 12,000 | 12,012 | 3 שניות |
| 25,000 | 25,012 | 7 שניות |
| 50,000 | 50,012 | 16 שניות |

### מסקנות
1. **אין פלאטו:** `prompt_tokens` גדל ליניארית עד 50,000, ולכן **החלון האפקטיבי הוא לפחות 50,000 טוקנים** (תואם ל-`context_length: 64000` מ-`/api/ps`). `num_ctx: 12288` ו-`max_input_tokens: 8192` שבהגדרות השער **לא נאכפים**. Claude Code (כ-25 אלף טוקנים) נכנס בנוחות, וההוראות לא נחתכות.
2. **ערך מומלץ:** `CLAUDE_CODE_MAX_CONTEXT_TOKENS=64000`.
3. **טעינה קרה של 285 שניות (כמעט 5 דקות):** הבקשה הראשונה אחרי חוסר פעילות (ה-keep-alive של Ollama הוא כ-5 דקות) כוללת טעינת המודל ל-GPU, אולי גם פריקת מודל אחר. לכן:
   - `API_TIMEOUT_MS=1200000` (20 דקות) הכרחי כדי שהבקשה הראשונה לא תיכשל.
   - הצ'אט צריך להסביר "המודל נטען, זה יכול לקחת כמה דקות" כשהתשובה הראשונה מתעכבת, ולא להיראות תקוע.
4. **מהירות עיבוד פרומפט:** כ-3,000 טוקנים לשנייה (50,000 ב-16 שניות). הודעה ראשונה עם כ-25 אלף טוקנים של הוראות לוקחת כ-8 שניות אחרי שהמודל טעון.

