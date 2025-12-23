# Security Checklist (Userscript)

- **No secrets in frontend/userscript**: keep API keys/config out of source; `config/firebase.*` is unused and should stay template-only.
- **Network calls**: `services/ariesRooms.ts` and `integrations/ariesBridge.ts` use `GM_xmlhttpRequest`; ensure headers/URLs stay explicit and avoid dynamic untrusted injection.
- **Validate external data**: guard parsing of Aries responses and any scraped inputs; check for null/shape before use.
- **Error hygiene**: log detailed errors to console; avoid leaking stack traces to in-page UI.
- **Data ownership**: when adding features that expose other players’ data, ensure only intended data is shown; avoid assuming predictable IDs are safe.
- **Rate/volume caution**: keep polling/refresh intervals reasonable to avoid hammering Aries API or the game DOM.
