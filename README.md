# AUTO CHINA CALCULATOR

Коммерческое веб-приложение для расчета конечной стоимости автомобиля, купленного в Китае и ввезенного в Россию.

**Фото шильдика → AI распознает автомобиль → цена в Китае → курсы валют → таможенные платежи → доставка, брокер, доп. расходы → итоговая стоимость в РФ.**

## Стек

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS v4, Recharts, Lucide, jsPDF + html2canvas
- **Финансовые расчеты:** `decimal.js` (никакого floating point) + PostgreSQL `NUMERIC`
- **Backend:** Supabase (PostgreSQL, Auth, Storage, RLS) + Supabase Edge Functions (Deno)

## Публикация на GitHub Pages

Проект уже содержит GitHub Actions workflow: `.github/workflows/deploy-pages.yml`. Важно:

1. Репозиторий должен содержать этот workflow и быть запушен в ветку `main` или `master`.
2. В GitHub откройте **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Для Supabase добавьте `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` и `VITE_EDGE_URL` в **Settings → Secrets and variables → Actions**. Без них приложение работает в локальном/demo-режиме.
4. Vite настроен с относительным `base: "./"`, поэтому сборка корректно работает и для `username.github.io`, и для `username.github.io/repository`.

После push откройте вкладку **Actions** и убедитесь, что workflow `Deploy to GitHub Pages` завершился успешно.

## Быстрый старт (локально)

```bash
npm install
npm run dev        # разработка
npm run build      # production-сборка
```

Без настройки Supabase приложение запускается в **демо-режиме**: данные хранятся в браузере
(localStorage), в интерфейсе видна плашка **DEMO DATA**, mock-адаптеры явно помечаются.
Это только для разработки — production использует `SupabaseAdapter`.

Демо-вход: любой email/пароль (аккаунт создается автоматически), администратор — `admin@autochina.ru` / `admin1234`.

## Подключение Supabase (production)

1. Создайте проект на [supabase.com](https://supabase.com).
2. Выполните `supabase/schema.sql` в SQL Editor — создаются таблицы, RLS-политики, storage-бакет `car-plates`,
   триггер профиля, админ-функция статистики, таблица `api_rate_limits` для лимитов на AI-функции.
3. Задеплойте Edge Functions (все требуют валидный JWT — `verify_jwt` по умолчанию включен, деплоить БЕЗ флага `--no-verify-jwt`):
   ```bash
   supabase functions deploy analyze-car-plate
   supabase functions deploy get-vtb-cny-rate
   supabase functions deploy get-cbr-eur-rate
   supabase functions deploy refresh-exchange-rates
   ```
   Все три "конечных" функции (`analyze-car-plate`, `get-vtb-cny-rate`, `get-cbr-eur-rate`) требуют авторизованного
   пользователя (проверяется по `Authorization: Bearer <access_token>`), а первые две дополнительно ограничены
   rate-limit'ом (`api_rate_limits`), т.к. дергают платный LLM. Анонимные посетители получают понятную ошибку
   с предложением войти или ввести данные вручную — калькулятор доступен без логина, но AI-функции требуют аккаунт.
   `refresh-exchange-rates` — служебная функция для планового обновления курсов (см. ниже), вызывается только
   с `SUPABASE_SERVICE_ROLE_KEY`, из браузера не используется и не должна быть доступна публично.
4. (Опционально) Плановое обновление курсов через `pg_cron`, чтобы курсы были свежими без действий пользователя:
   ```sql
   select cron.schedule(
     'refresh-exchange-rates',
     '0 */2 * * *', -- каждые 2 часа
     $$ select net.http_post(
          url := '<VITE_EDGE_URL>/refresh-exchange-rates',
          headers := jsonb_build_object('Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>')
        ) $$
   );
   -- и чистка api_rate_limits раз в сутки
   select cron.schedule('cleanup-rate-limits', '0 3 * * *', $$ select public.cleanup_rate_limits() $$);
   ```
5. Секреты — **только в Supabase Secrets, никогда в frontend**:
   ```bash
   supabase secrets set AI_API_KEY=...    # ключ LLM-провайдера (OCR шильдиков + поиск курса ВТБ)
   supabase secrets set AI_API_URL=...    # (опц.) OpenAI-совместимый endpoint
   supabase secrets set AI_MODEL=...      # (опц.) модель, по умолчанию gpt-4o-mini / gpt-4o
   supabase secrets set VTB_RATES_URL=... # (опц.) страница котировок ВТБ, по умолчанию https://www.vtb.ru/personal/kotirovki
   supabase secrets set VTB_RATES_URL_2=...# (опц.) резервный источник курса
   supabase secrets set CBR_API_URL=...   # (опц.) по умолчанию https://www.cbr.ru/scripts/XML_daily.asp
   ```
6. Переменные окружения frontend (`.env`, не секретные):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   VITE_EDGE_URL=https://xxxx.supabase.co/functions/v1
   ```
   Без `VITE_SUPABASE_URL` автоматически включается локальный демо-адаптер.

## Архитектура

```
src/
  lib/
    types.ts                 — доменные типы
    money.ts                 — Decimal-утилиты форматирования (ru-RU)
    engine/customsEngine.ts  — детерминированный расчетный движок (пошлина, сбор,
                               утильсбор база×коэффициент, акциз, НДС, итог, удорожание)
    db.ts                    — DbAdapter: SupabaseAdapter (production) / LocalAdapter (dev)
    providers/
      rates.ts               — ExchangeRateProvider: Edge (ВТБ+ЦБ), Dev (ЦБ-зеркало), Mock (DEMO)
      recognition.ts         — CarRecognitionProvider: Edge AI / Mock (abstraction layer)
  data/seedRules.ts          — сид правил (ДЕМО-структура, заменить на официальные ставки!)
  state/AppContext.tsx       — auth, настройки, правила, тосты
  components/calculator/*    — 5 шагов мастера
  pages/*                    — /, /calculator, /calculations, /calculations/:id, /profile, /admin, /login
supabase/
  schema.sql                 — таблицы + RLS + storage + triggers
  functions/*                — Edge Functions (секреты только в Secrets)
```

### Ключевые принципы

- **Тарифы не зашиты в код.** Пошлина/сбор/акциз/НДС — таблица `customs_rules`, утильсбор —
  `recycling_fee_rules` (база × коэффициент). Движок выбирает правило по дате расчета, типу импортера,
  двигателю, объему, мощности и возрасту. CRUD — в админ-панели.
- **Версионирование.** Каждый расчет сохраняет snapshot: курсы с источниками и timestamp,
  все примененные тарифы с формулами, версию правил (`calculation_rule_versions`).
  Обновление тарифов **не пересчитывает** старые расчеты.
- **Курсы.** У ВТБ нет публичного API, поэтому `get-vtb-cny-rate` использует **LLM-агента**: backend скачивает
  страницу котировок ВТБ (и доп. источники), LLM извлекает курс CNY/RUB (приоритет — курс продажи юаня),
  затем backend валидирует результат по официальному курсу ЦБ РФ (тот же XML-источник, что и `get-cbr-eur-rate`;
  отклонение более ±15% отклоняется). EUR — официальный курс ЦБ РФ (`get-cbr-eur-rate`), история в `exchange_rates`.
  Источник недоступен → явная ошибка + ручной ввод (источник `Manual`) или демо-курс (источник `Demo`, плашка DEMO DATA).
  Устаревший курс никогда не используется молча. Обе функции требуют авторизации и кэшируют результат ВТБ на
  10 минут, чтобы не дергать LLM на каждый чих; сверх лимита (3 запроса ВТБ / 10 распознаваний шильдика за
  10 минут на пользователя) возвращается 429.
- **Расчет и сохранение — на клиенте.** `computeFullCalculation`/`calculateCustoms` выполняются в браузере
  (`src/lib/engine`), а `saveCalculation` пишет снапшот напрямую через `supabase-js` с anon key — RLS сама
  гарантирует `user_id = auth.uid()`. Отдельных Edge Functions для расчета/сохранения нет (сознательно не
  делали дублирующий серверный расчет с доступом service-role в обход RLS — риск несовпадения логики и приема
  чужого `user_id` от клиента перевешивает пользу).
- **Надбавка 2,5%.** Прибавляется **к стоимости автомобиля и считается от инвойса**:
  `стоимость авто = цена в Китае + 2,5% × инвойс` (по курсу ВТБ). Прочие суммы в юанях
  (доставка по Китаю, расходы) конвертируются по курсу ВТБ без надбавки. Таможенная стоимость —
  инвойс по курсу ВТБ без надбавки. Расчетный курс инвойса справочно: `ВТБ × 1,025`.
- **RLS.** Пользователь видит только свои расчеты; тарифы, курсы и настройки на запись — только администратору.
- **AI через backend.** `CarRecognitionProvider` — abstraction layer; провайдер меняется без правок frontend.
  OCR с `confidence < 0.7` подсвечивается: «Проверьте значение».

## Важно про ставки

Значения в `src/data/seedRules.ts` и сиде `schema.sql` — **демонстрационная структура** (форма правил
повторяет методику: % от таможенной стоимости, €/см³ по возрастным диапазонам, коэффициенты утильсбора),
помечена `is_demo = true`. **Замените их на официальные действующие ставки** через админ-панель или SQL
перед использованием в работе с реальными платежами.

## Тестовые сценарии (ручная проверка)

1. Бензиновый автомобиль (физлицо, 2998 см³, 340 л.с., 3–5 лет) → пошлина €/см³, утильсбор 0.26.
2. Дизельный автомобиль → та же сетка, акциз/НДС «Не применяется».
3. Электромобиль (объем null) → пошлина 15%, акциз «не облагается», утильсбор по возрасту.
4. Гибрид / Plug-in Hybrid → расчет по объему ДВС.
5. Разный год выпуска (до 3 / 3–5 / старше 5 лет) → разные формулы пошлины и коэффициенты.
6. Разный объем (999 / 1500 / 2500 / 3500 см³) → разные диапазоны €/см³.
7. Разная мощность (80 / 120 / 300 л.с.) → влияет на акциз юрлица.
8. Физлицо → единая пошлина, без акциза/НДС.
9. Юрлицо → пошлина % + акциз ₽/л.с. + НДС 20% на (ТС + пошлина + акциз).
10. Ручной курс → источник `Manual`, пометка в интерфейсе и в снапшоте.
11. Автоматический курс (ЦБ) → источник `CBR` с датой курса.
12. Нулевые дополнительные расходы → нулевые строки свернуты, раскрываются тумблером.
13. Несколько доп. расходов в RUB/CNY/EUR → автоматическая конвертация в ₽.
14. Детерминизм: одинаковые входы + версия правил → одинаковый итог (движок чистый, Decimal).

## Отказ от ответственности

Расчет является предварительным и не является официальным таможенным расчетом. Итоговые платежи зависят
от документов, таможенной стоимости, характеристик автомобиля и действующего законодательства.
