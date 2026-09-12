-- Cache for the OCR pipeline. Keys contain only a SHA-256 image hash, never the image or API keys.
create table if not exists public.recognition_cache (
  image_sha256 text primary key check (image_sha256 ~ '^[a-f0-9]{64}$'),
  result jsonb not null,
  provider text not null check (provider in ('PaddleOCR','OpenRouter')),
  model text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.recognition_cache enable row level security;
drop policy if exists recognition_cache_none on public.recognition_cache;
create policy recognition_cache_none on public.recognition_cache for all using (false) with check (false);
create index if not exists recognition_cache_expires_idx on public.recognition_cache(expires_at);
