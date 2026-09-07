# AI audit

## AI functionality

All functionality that requires an LLM/AI provider is routed through Google Gemini in Supabase Edge Functions.

1. `analyze-car-plate` — Gemini multimodal vision extracts vehicle data from the uploaded plate/VIN image.
2. `get-vtb-cny-rate` — Gemini URL Context retrieves the official VTB CNY page for free, then Gemini extracts the current CNY/RUB selling rate from that page. It does **not** use Google Search grounding. URL Context is available on the Gemini API Free Tier.

Both use `GEMINI_API_KEY` from Supabase Secrets. The key is never exposed to the browser.

## Intentionally non-AI functionality

- `get-cbr-eur-rate` reads the official CBR XML feed directly; no LLM is needed.
- `customsEngine.ts`, money calculations, tariffs, VAT, recycling fee, and totals are deterministic calculations and must NOT depend on an LLM.
- Supabase CRUD/auth/RLS and PDF generation are deterministic application functions.
- Demo providers are explicitly marked as DEMO and are not production AI providers.

## Provider audit result

No OpenAI, Anthropic, Claude, GPT, or generic AI-provider API calls remain in the production code. `AI_API_KEY`, `AI_API_URL`, and `AI_MODEL` are not used.
