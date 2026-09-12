# PaddleOCR service

This CPU service exposes the deterministic first stage of the recognition pipeline.

```bash
docker build -t autochina-paddleocr .
docker run --rm -p 8080:8080 \
  -e PADDLEOCR_SERVICE_TOKEN='long-random-token' \
  autochina-paddleocr
```

The service endpoints are `GET /health` and `POST /ocr`. The request body is `{ "image": "data:image/jpeg;base64,..." }`. Keep it private behind HTTPS and a token; do not expose it publicly without authentication.

Configure the Supabase Edge Function:

```bash
supabase secrets set PADDLEOCR_URL=https://your-private-host.example/ocr
supabase secrets set PADDLEOCR_SERVICE_TOKEN='the-same-long-random-token'
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set OPENROUTER_MODEL=inclusionai/ling-3.0-flash-vl:free
supabase secrets set OPENROUTER_FALLBACK_MODELS=...
```

The Edge Function sends `X-Service-Token` when `PADDLEOCR_SERVICE_TOKEN` is configured. It never sends an OpenRouter request when PaddleOCR returns sufficiently confident required fields.
