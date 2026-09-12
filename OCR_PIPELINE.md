# OCR pipeline

Распознавание построено по принципу **PaddleOCR → OpenRouter → ручной ввод**. Supabase Edge Function принимает изображение, вычисляет SHA-256 и возвращает ранее сохранённый результат, если такой результат моложе 30 дней. При отсутствии кэша вызывается приватный PaddleOCR HTTP-сервис. OpenRouter вызывается только если PaddleOCR не настроен, завершился ошибкой или его результат имеет низкую уверенность по ключевым полям. Если оба автоматических этапа недоступны, интерфейс оставляет форму характеристик доступной для ручного заполнения и показывает понятную ошибку.

## Backend secrets

```bash
supabase secrets set PADDLEOCR_URL=https://your-private-host.example/ocr
supabase secrets set PADDLEOCR_SERVICE_TOKEN='long-random-token'
supabase secrets set OPENROUTER_API_KEY='...'
supabase secrets set OPENROUTER_MODEL='inclusionai/ling-3.0-flash-vl:free'
supabase secrets set OPENROUTER_FALLBACK_MODELS='model-two:free,model-three:free'
```

Ключ OpenRouter не попадает во frontend. Для разработки можно оставить только `OPENROUTER_API_KEY`: функция сразу перейдёт к OpenRouter, но это будет расходовать его лимит. Для production следует развернуть PaddleOCR и использовать OpenRouter как fallback.

## PaddleOCR service

В каталоге `services/paddleocr` находится CPU-сервис на FastAPI и PaddleOCR PP-OCRv5. Он поддерживает китайский и английский текст и принимает `data:image/...;base64,...`.

```bash
cd services/paddleocr
docker build -t autochina-paddleocr .
docker run --rm -p 8080:8080 \
  -e PADDLEOCR_SERVICE_TOKEN='long-random-token' \
  autochina-paddleocr
curl http://127.0.0.1:8080/health
```

Сервис необходимо разместить за HTTPS и не публиковать без token-а. После размещения задайте его URL в `PADDLEOCR_URL`.

## Database

Выполните обновлённый `supabase/schema.sql` или отдельную миграцию `supabase/migrations/20260912_recognition_cache.sql`. Таблица `recognition_cache` закрыта RLS для обычного пользователя; Edge Function обращается к ней через service role.

## Проверка

После deploy функции:

1. Загрузите одну фотографию дважды. Второй запрос должен иметь `cache: true`.
2. При работающем PaddleOCR ответ должен иметь `provider: "PaddleOCR"`, а OpenRouter не должен вызываться.
3. При отключённом PaddleOCR ответ должен иметь `provider: "OpenRouter"` и `fallback_used: true`.
4. При отключённых обоих backend-провайдерах frontend должен оставить поля доступными для ручного ввода и показать код диагностики.
5. В каждом случае перед расчётом проверьте поля с низкой уверенностью.
