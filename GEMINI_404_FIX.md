# Gemini 404 fix

The previous build used `gemini-3.8-flash` as the default model. The current deployment is pinned to `gemini-3.7-flash`, which is documented as GA and supports image input, structured outputs, and Google Search grounding.

Gemini 3.x generation configs must not send deprecated sampling parameters such as `temperature`; those were removed from the requests.

Supabase secrets:
- GEMINI_API_KEY
- GEMINI_MODEL=gemini-3.7-flash
- GEMINI_VTB_MODEL=gemini-3.7-flash
