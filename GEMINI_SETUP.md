# Gemini OCR setup

## 1. Create a Gemini API key

Create a Gemini API key in Google AI Studio and keep it private.

## 2. Add the key to Supabase

From the project root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_API_KEY
supabase secrets set GEMINI_MODEL=gemini-3.7-flash
supabase secrets set GEMINI_VTB_MODEL=gemini-3.7-flash
```

Do NOT put `GEMINI_API_KEY` into GitHub repository variables or any `VITE_*` variable. It must never reach the browser.

## 3. Deploy the Edge Function

```bash
supabase functions deploy analyze-car-plate --project-ref YOUR_PROJECT_REF
```

The deployed function is:

`https://YOUR_PROJECT_REF.supabase.co/functions/v1/analyze-car-plate`

## 4. GitHub Pages frontend

Set these GitHub Actions repository secrets:

- `VITE_SUPABASE_URL` = `https://YOUR_PROJECT_REF.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = Supabase anon/publishable key
- `VITE_EDGE_URL` = `https://YOUR_PROJECT_REF.supabase.co/functions/v1`

The frontend sends the image to the Supabase Edge Function. The Edge Function sends it to Gemini using `GEMINI_API_KEY`.

## 5. Verify the request path

Browser:

`GitHub Pages -> Supabase Edge Function -> Gemini API`

There must be NO browser request directly to `generativelanguage.googleapis.com`.

After uploading a shildik, check:

- Supabase Dashboard -> Edge Functions -> `analyze-car-plate` logs
- Google AI Studio / Gemini API usage

The Edge Function logs provider errors without exposing the API key.


### Поиск курса ВТБ через Gemini

`get-vtb-cny-rate` использует тот же `GEMINI_API_KEY`, но отдельную переменную `GEMINI_VTB_MODEL`. Gemini вызывается с инструментом Google Search и должен искать свежий курс CNY/RUB именно ВТБ, приоритетно на `vtb.ru`. Курс продажи CNY используется для расчета покупки юаней.


## Бесплатный режим курса ВТБ

Для бесплатного Gemini API функция `get-vtb-cny-rate` **не использует Google Search grounding**. Backend бесплатно получает официальную публичную страницу ВТБ, после чего Gemini извлекает из неё курс продажи CNY. Это сохраняет Gemini как AI-провайдера и не требует платного Search grounding. Официальная страница ВТБ: https://www.vtb.ru/personal/platezhi-i-perevody/obmen-valjuty/yuan/
