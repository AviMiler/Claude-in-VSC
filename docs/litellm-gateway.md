# שער LiteLLM של המודל המקומי (מתוך ה-Swagger)

מקור: דף ה-Swagger של השרת `http://172.27.5.5:11436` (**LiteLLM API 1.80.0**, OAS 3.1, `/openapi.json`), שהמשתמש הדביק ב-1.11.2026.
השרת הוא **שער LiteLLM** שמגיש את מודלי ה-Ollama בפורמט OpenAI. ה-CLI מדבר איתו דרך `ANTHROPIC_BASE_URL`, והעטיפה `claude.cmd` שולפת ממנו את רשימת המודלים.

**סטטוס:** הרשימה מבוססת על מה שמופיע ב-Swagger בלבד. נקראה בפועל רק `GET /v1/models` (מחזיר מזהי מודלים בלבד, בלי יכולות). שאר הפונקציות עדיין לא הופעלו, ושדות התשובה הם מה ש-LiteLLM מחזיר בדרך כלל ויש לאמת אותם.
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
- **ההחלטה הפתוחה** (האם התוסף שולף נתונים מהשער בעצמו) הופכת חשובה יותר: היא נותנת לא רק רשימה אלא גם יכולות.

## ממצא נוסף (1.11.2026)
`gemma3:27b` נדחה בשער עם `litellm.BadRequestError: ... does not support tools`, ושם מודל שאינו קיים עם `Invalid model name passed`. כלומר השער יודע מי תומך בכלים, והנקודות `/v1/model/info` ו-`/model_group/info` עשויות לחשוף זאת (למשל `supports_function_calling`). זה הופך אותן לחשובות במיוחד לבורר המודל. `/api/show` של Ollama אינו חשוף דרך השער (404).

