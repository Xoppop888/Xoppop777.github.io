-- Телеметрия распознавания шильдика: нужна, чтобы сравнить PaddleOCR и vision-модель
-- по фактическим цифрам (доля fallback, задержка, полнота полей), а не по ощущениям.
create table if not exists public.recognition_metrics (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  image_sha256 text check (image_sha256 ~ '^[a-f0-9]{64}$'),
  provider text not null check (provider in ('PaddleOCR','OpenRouter')),
  model text,
  fallback_used boolean not null default false,
  manual_required boolean not null default false,
  paddleocr_ms integer not null default 0,
  openrouter_ms integer not null default 0,
  fields_recognized smallint not null default 0
);

alter table public.recognition_metrics enable row level security;

-- Пишет только Edge Function через service role; читает админ через отдельную функцию.
drop policy if exists recognition_metrics_none on public.recognition_metrics;
create policy recognition_metrics_none on public.recognition_metrics for all using (false) with check (false);

create index if not exists recognition_metrics_created_idx on public.recognition_metrics(created_at desc);

create or replace function public.recognition_provider_stats(days integer default 30)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(
    jsonb_agg(row_to_json(t)),
    '[]'::jsonb
  )
  from (
    select
      provider,
      model,
      count(*) as requests,
      round(avg(case when fallback_used then 1 else 0 end)::numeric, 3) as fallback_rate,
      round(avg(case when manual_required then 1 else 0 end)::numeric, 3) as manual_rate,
      round(avg(paddleocr_ms)::numeric, 0) as avg_paddleocr_ms,
      round(avg(openrouter_ms)::numeric, 0) as avg_openrouter_ms,
      round(avg(fields_recognized)::numeric, 2) as avg_fields
    from public.recognition_metrics
    where created_at > now() - make_interval(days => days)
      and public.is_admin()
    group by provider, model
  ) t;
$$;

revoke all on function public.recognition_provider_stats(integer) from public;
grant execute on function public.recognition_provider_stats(integer) to authenticated;
