# AI audit

## AI functionality

AI functionality is routed through Supabase Edge Functions, after deterministic OCR has had the first attempt.

1. `analyze-car-plate` — self-hosted PaddleOCR runs first; OpenRouter vision is used only when OCR is unavailable or below confidence threshold. If both fail, the UI requires manual input.
2. `get-vtb-cny-rate` — direct backend HTTP fetch of the official VTB source; no AI, URL Context, Search grounding, or provider key is used.

`PADDLEOCR_URL` and `OPENROUTER_API_KEY` are stored only in Supabase Secrets. The keys are never exposed to the browser. Results are cached by SHA-256 image hash.

## Intentionally non-AI functionality

- `get-cbr-eur-rate` reads the official CBR XML feed directly; no LLM is needed.
- `customsEngine.ts`, money calculations, tariffs, VAT, recycling fee, and totals are deterministic calculations and must NOT depend on an LLM.
- Supabase CRUD/auth/RLS and PDF generation are deterministic application functions.
- Demo providers are explicitly marked as DEMO and are not production AI providers.

## Provider audit result

No OpenAI, Anthropic, Claude, GPT, or generic AI-provider API calls remain in the production code. `AI_API_KEY`, `AI_API_URL`, and `AI_MODEL` are not used.
