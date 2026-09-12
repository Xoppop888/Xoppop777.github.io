-- ============================================================
-- AUTO CHINA CALCULATOR — Supabase schema
-- Применить в SQL Editor Supabase-проекта.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

-- авто-создание профиля при регистрации
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- exchange_rates ----------
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency text not null check (currency in ('CNY','EUR')),
  rate numeric(12,6) not null,
  source text not null check (source in ('VTB','CBR','Manual','Demo')),
  fetched_at timestamptz not null,
  is_manual boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- calculation_rule_versions ----------
create table if not exists public.calculation_rule_versions (
  version text primary key,
  name text not null,
  effective_from date not null,
  is_demo boolean not null default false
);

-- ---------- customs_rules (пошлина, сбор, акциз, НДС) ----------
create table if not exists public.customs_rules (
  id text primary key,
  kind text not null check (kind in ('duty','fee','excise','vat')),
  name text not null,
  vehicle_type text,
  importer_type text,
  engine_type text,
  min_engine_volume numeric,
  max_engine_volume numeric,
  min_power numeric,
  max_power numeric,
  min_vehicle_age numeric,
  max_vehicle_age numeric,
  min_customs_value numeric,
  max_customs_value numeric,
  formula text not null,
  rate numeric,
  fixed_amount numeric,
  coefficient numeric,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  version text not null default 'ru-2026.1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- recycling_fee_rules (утилизационный сбор) ----------
create table if not exists public.recycling_fee_rules (
  id text primary key,
  kind text not null check (kind in ('recycling_base','recycling_coeff')),
  name text not null,
  vehicle_type text,
  importer_type text,
  engine_type text,
  min_engine_volume numeric,
  max_engine_volume numeric,
  min_power numeric,
  max_power numeric,
  min_vehicle_age numeric,
  max_vehicle_age numeric,
  min_customs_value numeric,
  max_customs_value numeric,
  formula text not null,
  rate numeric,
  fixed_amount numeric,
  coefficient numeric,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  version text not null default 'ru-2026.1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- additional_expense_types ----------
create table if not exists public.additional_expense_types (
  id text primary key,
  name text not null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'RUB' check (currency in ('RUB','CNY','EUR'))
);

insert into public.additional_expense_types (id, name, amount, currency) values
  ('et-sbkts', 'СБКТС', 35000, 'RUB'),
  ('et-epts', 'ЭПТС', 5000, 'RUB'),
  ('et-lab', 'Лаборатория / испытания', 25000, 'RUB'),
  ('et-parking', 'Стоянка СВХ', 15000, 'RUB'),
  ('et-glonass', 'ЭРА-ГЛОНАСС', 7000, 'RUB')
on conflict (id) do nothing;

-- ---------- app_settings ----------
create table if not exists public.app_settings (
  id int primary key default 1,
  cny_markup numeric(6,3) not null default 2.5,
  broker_default_price numeric(14,2) not null default 40000,
  rule_version text not null default 'ru-2026.1'
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- ---------- сид реальных тарифов 2026 (сгенерировано из src/data/seedRules.ts) ----------
insert into public.calculation_rule_versions (version, name, effective_from, is_demo) values ('ru-2026.1', 'РФ, 2026 — сверено 06.09.2026 (утильсбор для юрлиц/сверх льготы требует проверки)', '2026-01-01', false) on conflict (version) do update set name = excluded.name, effective_from = excluded.effective_from, is_demo = excluded.is_demo;

insert into public.customs_rules (id, kind, name, vehicle_type, importer_type, engine_type, min_engine_volume, max_engine_volume, min_power, max_power, min_vehicle_age, max_vehicle_age, min_customs_value, max_customs_value, formula, rate, fixed_amount, coefficient, effective_from, effective_to, is_active, version) values
('duty-p-u3-v1000', 'duty', 'Физлицо, до 3 лет, до 1000 см³', null, 'physical', null, null, 1000, null, null, 0, 2, null, null, 'percent_or_eur_cc_max', 54, null, 2.5, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-u3-v1500', 'duty', 'Физлицо, до 3 лет, 1000–1500 см³', null, 'physical', null, 1001, 1500, null, null, 0, 2, null, null, 'percent_or_eur_cc_max', 48, null, 3.5, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-u3-v1800', 'duty', 'Физлицо, до 3 лет, 1500–1800 см³', null, 'physical', null, 1501, 1800, null, null, 0, 2, null, null, 'percent_or_eur_cc_max', 48, null, 5.5, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-u3-v2300', 'duty', 'Физлицо, до 3 лет, 1800–2300 см³', null, 'physical', null, 1801, 2300, null, null, 0, 2, null, null, 'percent_or_eur_cc_max', 48, null, 7.5, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-u3-v3000', 'duty', 'Физлицо, до 3 лет, 2300–3000 см³', null, 'physical', null, 2301, 3000, null, null, 0, 2, null, null, 'percent_or_eur_cc_max', 48, null, 12, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-u3-vmax', 'duty', 'Физлицо, до 3 лет, свыше 3000 см³', null, 'physical', null, 3001, null, null, null, 0, 2, null, null, 'percent_or_eur_cc_max', 48, null, 15.5, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-35-v1000', 'duty', 'Физлицо, 3–5 лет, до 1000 см³', null, 'physical', null, null, 1000, null, null, 3, 5, null, null, 'eur_per_cc', 1.5, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-35-v1500', 'duty', 'Физлицо, 3–5 лет, 1000–1500 см³', null, 'physical', null, 1001, 1500, null, null, 3, 5, null, null, 'eur_per_cc', 1.7, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-35-v1800', 'duty', 'Физлицо, 3–5 лет, 1500–1800 см³', null, 'physical', null, 1501, 1800, null, null, 3, 5, null, null, 'eur_per_cc', 2.5, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-35-v2300', 'duty', 'Физлицо, 3–5 лет, 1800–2300 см³', null, 'physical', null, 1801, 2300, null, null, 3, 5, null, null, 'eur_per_cc', 2.7, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-35-v3000', 'duty', 'Физлицо, 3–5 лет, 2300–3000 см³', null, 'physical', null, 2301, 3000, null, null, 3, 5, null, null, 'eur_per_cc', 2.7, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-35-vmax', 'duty', 'Физлицо, 3–5 лет, свыше 3000 см³', null, 'physical', null, 3001, null, null, null, 3, 5, null, null, 'eur_per_cc', 3.6, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-5p-v1000', 'duty', 'Физлицо, старше 5 лет, до 1000 см³', null, 'physical', null, null, 1000, null, null, 6, null, null, null, 'eur_per_cc', 3.0, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-5p-v1500', 'duty', 'Физлицо, старше 5 лет, 1000–1500 см³', null, 'physical', null, 1001, 1500, null, null, 6, null, null, null, 'eur_per_cc', 3.2, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-5p-v1800', 'duty', 'Физлицо, старше 5 лет, 1500–1800 см³', null, 'physical', null, 1501, 1800, null, null, 6, null, null, null, 'eur_per_cc', 3.5, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-5p-v2300', 'duty', 'Физлицо, старше 5 лет, 1800–2300 см³', null, 'physical', null, 1801, 2300, null, null, 6, null, null, null, 'eur_per_cc', 4.8, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-5p-v3000', 'duty', 'Физлицо, старше 5 лет, 2300–3000 см³', null, 'physical', null, 2301, 3000, null, null, 6, null, null, null, 'eur_per_cc', 5.0, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-5p-vmax', 'duty', 'Физлицо, старше 5 лет, свыше 3000 см³', null, 'physical', null, 3001, null, null, null, 6, null, null, null, 'eur_per_cc', 5.7, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-p-ev', 'duty', 'Физлицо, электромобиль', null, 'physical', 'electric', null, null, null, null, null, null, null, null, 'percent', 15, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-l-ice', 'duty', 'Юрлицо, ДВС/гибрид', null, 'legal', null, null, null, null, null, null, null, null, null, 'percent', 15, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('duty-l-ev', 'duty', 'Юрлицо, электромобиль', null, 'legal', 'electric', null, null, null, null, null, null, null, null, 'percent', 15, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b1', 'fee', 'Сбор: до 200 000 ₽', null, null, null, null, null, null, null, null, null, null, 200000, 'fixed', null, 1231, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b2', 'fee', 'Сбор: 200 000,01 – 450 000 ₽', null, null, null, null, null, null, null, null, null, 200000.01, 450000, 'fixed', null, 2462, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b3', 'fee', 'Сбор: 450 000,01 – 1 200 000 ₽', null, null, null, null, null, null, null, null, null, 450000.01, 1200000, 'fixed', null, 4924, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b4', 'fee', 'Сбор: 1 200 000,01 – 2 700 000 ₽', null, null, null, null, null, null, null, null, null, 1200000.01, 2700000, 'fixed', null, 13541, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b5', 'fee', 'Сбор: 2 700 000,01 – 4 200 000 ₽', null, null, null, null, null, null, null, null, null, 2700000.01, 4200000, 'fixed', null, 18465, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b6', 'fee', 'Сбор: 4 200 000,01 – 5 500 000 ₽', null, null, null, null, null, null, null, null, null, 4200000.01, 5500000, 'fixed', null, 21344, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b7', 'fee', 'Сбор: 5 500 000,01 – 10 000 000 ₽', null, null, null, null, null, null, null, null, null, 5500000.01, 10000000, 'fixed', null, 49240, null, '2026-01-01', null, true, 'ru-2026.1'),
('fee-b8', 'fee', 'Сбор: свыше 10 000 000 ₽', null, null, null, null, null, null, null, null, null, 10000000.01, null, 'fixed', null, 73860, null, '2026-01-01', null, true, 'ru-2026.1'),
('exc-l-90', 'excise', 'Акциз: до 90 л.с. включительно (0 ₽/л.с.)', null, 'legal', null, null, null, null, 90, null, null, null, null, 'fixed', null, 0, null, '2026-01-01', null, true, 'ru-2026.1'),
('exc-l-150', 'excise', 'Акциз: 90–150 л.с.', null, 'legal', null, null, null, 90.01, 150, null, null, null, null, 'per_hp', 70, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('exc-l-200', 'excise', 'Акциз: 150–200 л.с.', null, 'legal', null, null, null, 150.01, 200, null, null, null, null, 'per_hp', 664, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('exc-l-300', 'excise', 'Акциз: 200–300 л.с.', null, 'legal', null, null, null, 200.01, 300, null, null, null, null, 'per_hp', 1086, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('exc-l-400', 'excise', 'Акциз: 300–400 л.с.', null, 'legal', null, null, null, 300.01, 400, null, null, null, null, 'per_hp', 1850, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('exc-l-500', 'excise', 'Акциз: 400–500 л.с.', null, 'legal', null, null, null, 400.01, 500, null, null, null, null, 'per_hp', 1916, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('exc-l-max', 'excise', 'Акциз: свыше 500 л.с.', null, 'legal', null, null, null, 500.01, null, null, null, null, null, 'per_hp', 1978, null, null, '2026-01-01', null, true, 'ru-2026.1'),
('vat-20', 'vat', 'НДС 20%', null, null, null, null, null, null, null, null, null, null, null, 'percent', 20, null, null, '2026-01-01', null, true, 'ru-2026.1')
on conflict (id) do update set (kind, name, vehicle_type, importer_type, engine_type, min_engine_volume, max_engine_volume, min_power, max_power, min_vehicle_age, max_vehicle_age, min_customs_value, max_customs_value, formula, rate, fixed_amount, coefficient, effective_from, effective_to, is_active, version) = (excluded.kind, excluded.name, excluded.vehicle_type, excluded.importer_type, excluded.engine_type, excluded.min_engine_volume, excluded.max_engine_volume, excluded.min_power, excluded.max_power, excluded.min_vehicle_age, excluded.max_vehicle_age, excluded.min_customs_value, excluded.max_customs_value, excluded.formula, excluded.rate, excluded.fixed_amount, excluded.coefficient, excluded.effective_from, excluded.effective_to, excluded.is_active, excluded.version);

insert into public.recycling_fee_rules (id, kind, name, vehicle_type, importer_type, engine_type, min_engine_volume, max_engine_volume, min_power, max_power, min_vehicle_age, max_vehicle_age, min_customs_value, max_customs_value, formula, rate, fixed_amount, coefficient, effective_from, effective_to, is_active, version) values
('rec-base', 'recycling_base', 'База утильсбора (легковое ТС)', null, null, null, null, null, null, null, null, null, null, null, 'fixed', null, 20000, null, '2026-01-01', null, true, 'ru-2026.1'),
('rec-p-priv-u3', 'recycling_base', 'Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, до 3 лет', null, 'physical', null, null, 3000, null, 160, 0, 2, null, null, 'fixed', null, 3400, null, '2026-01-01', null, true, 'ru-2026.1'),
('rec-p-priv-u3-coeff', 'recycling_coeff', 'Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, до 3 лет', null, 'physical', null, null, 3000, null, 160, 0, 2, null, null, 'percent', null, null, 1, '2026-01-01', null, true, 'ru-2026.1'),
('rec-p-priv-3p', 'recycling_base', 'Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, старше 3 лет', null, 'physical', null, null, 3000, null, 160, 3, null, null, null, 'fixed', null, 5200, null, '2026-01-01', null, true, 'ru-2026.1'),
('rec-p-priv-3p-coeff', 'recycling_coeff', 'Физлицо, личное польз., ≤160 л.с. и ≤3000 см³, старше 3 лет', null, 'physical', null, null, 3000, null, 160, 3, null, null, null, 'percent', null, null, 1, '2026-01-01', null, true, 'ru-2026.1'),
('rec-p-priv-ev', 'recycling_coeff', 'Физлицо, электромобиль, личное пользование ⚠️ ТРЕБУЕТ ПРОВЕРКИ', null, 'physical', 'electric', null, null, null, null, null, null, null, null, 'percent', null, null, 0.17, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-u3-v1000', 'recycling_coeff', 'Коммерческая сетка, до 3 лет, до 1000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ', null, null, null, null, 1000, null, null, 0, 2, null, null, 'percent', null, null, 4.06, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-u3-v2000', 'recycling_coeff', 'Коммерческая сетка, до 3 лет, 1000–2000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ', null, null, null, 1001, 2000, null, null, 0, 2, null, null, 'percent', null, null, 13.22, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-u3-v3000', 'recycling_coeff', 'Коммерческая сетка, до 3 лет, 2000–3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ', null, null, null, 2001, 3000, null, null, 0, 2, null, null, 'percent', null, null, 35.28, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-u3-vmax', 'recycling_coeff', 'Коммерческая сетка, до 3 лет, свыше 3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ (анонсировано удвоение с 04.2026)', null, null, null, 3001, null, null, null, 0, 2, null, null, 'percent', null, null, 57.76, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-3p-v1000', 'recycling_coeff', 'Коммерческая сетка, старше 3 лет, до 1000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ', null, null, null, null, 1000, null, null, 3, null, null, null, 'percent', null, null, 6.67, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-3p-v2000', 'recycling_coeff', 'Коммерческая сетка, старше 3 лет, 1000–2000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ', null, null, null, 1001, 2000, null, null, 3, null, null, null, 'percent', null, null, 21.73, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-3p-v3000', 'recycling_coeff', 'Коммерческая сетка, старше 3 лет, 2000–3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ', null, null, null, 2001, 3000, null, null, 3, null, null, null, 'percent', null, null, 58.06, '2026-01-01', null, true, 'ru-2026.1'),
('rec-comm-3p-vmax', 'recycling_coeff', 'Коммерческая сетка, старше 3 лет, свыше 3000 см³ ⚠️ ТРЕБУЕТ ПРОВЕРКИ (анонсировано удвоение с 04.2026)', null, null, null, 3001, null, null, null, 3, null, null, null, 'percent', null, null, 94.68, '2026-01-01', null, true, 'ru-2026.1')
on conflict (id) do update set (kind, name, vehicle_type, importer_type, engine_type, min_engine_volume, max_engine_volume, min_power, max_power, min_vehicle_age, max_vehicle_age, min_customs_value, max_customs_value, formula, rate, fixed_amount, coefficient, effective_from, effective_to, is_active, version) = (excluded.kind, excluded.name, excluded.vehicle_type, excluded.importer_type, excluded.engine_type, excluded.min_engine_volume, excluded.max_engine_volume, excluded.min_power, excluded.max_power, excluded.min_vehicle_age, excluded.max_vehicle_age, excluded.min_customs_value, excluded.max_customs_value, excluded.formula, excluded.rate, excluded.fixed_amount, excluded.coefficient, excluded.effective_from, excluded.effective_to, excluded.is_active, excluded.version);

update public.app_settings set rule_version = 'ru-2026.1' where id = 1;

-- ---------- calculations (snapshot каждого расчета) ----------
create table if not exists public.calculations (
  id uuid primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  car_data jsonb not null,
  snapshot jsonb not null,            -- полный снапшот: входы, курсы, тарифы, итоги
  image_url text,
  china_price_cny numeric(14,2) not null,
  invoice_price_cny numeric(14,2) not null,
  cny_rate numeric(12,6) not null,
  cny_rate_source text not null,
  eur_rate numeric(12,6) not null,
  eur_rate_source text not null,
  customs_value_rub numeric(14,2) not null,
  customs_duty numeric(14,2) not null,
  customs_fee numeric(14,2) not null,
  recycling_fee numeric(14,2) not null,
  excise numeric(14,2) not null,
  vat numeric(14,2) not null,
  shipping_cost numeric(14,2) not null,
  broker_cost numeric(14,2) not null,
  other_costs numeric(14,2) not null,
  total_cost_rub numeric(14,2) not null,
  customs_rule_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists calculations_user_idx on public.calculations(user_id, created_at desc);

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.customs_rules enable row level security;
alter table public.recycling_fee_rules enable row level security;
alter table public.additional_expense_types enable row level security;
alter table public.app_settings enable row level security;
alter table public.calculation_rule_versions enable row level security;
alter table public.calculations enable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles: сам себя + админы всех
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (auth.uid() = id or public.is_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (auth.uid() = id);

-- calculations: только свои; админ видит все
drop policy if exists calc_select on public.calculations;
create policy calc_select on public.calculations for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists calc_insert on public.calculations;
create policy calc_insert on public.calculations for insert with check (auth.uid() = user_id);
drop policy if exists calc_delete on public.calculations;
create policy calc_delete on public.calculations for delete using (auth.uid() = user_id);

-- курсы и тарифы: чтение всем авторизованным, запись ТОЛЬКО админам
drop policy if exists rates_select on public.exchange_rates;
create policy rates_select on public.exchange_rates for select using (auth.role() = 'authenticated' or public.is_admin());
drop policy if exists rates_write on public.exchange_rates;
create policy rates_write on public.exchange_rates for all using (public.is_admin());

drop policy if exists rules_select on public.customs_rules;
create policy rules_select on public.customs_rules for select using (true);
drop policy if exists rules_write on public.customs_rules;
create policy rules_write on public.customs_rules for all using (public.is_admin());

drop policy if exists rec_rules_select on public.recycling_fee_rules;
create policy rec_rules_select on public.recycling_fee_rules for select using (true);
drop policy if exists rec_rules_write on public.recycling_fee_rules;
create policy rec_rules_write on public.recycling_fee_rules for all using (public.is_admin());

drop policy if exists exp_types_select on public.additional_expense_types;
create policy exp_types_select on public.additional_expense_types for select using (true);
drop policy if exists exp_types_write on public.additional_expense_types;
create policy exp_types_write on public.additional_expense_types for all using (public.is_admin());

drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select using (true);
drop policy if exists settings_write on public.app_settings;
create policy settings_write on public.app_settings for all using (public.is_admin());

drop policy if exists versions_select on public.calculation_rule_versions;
create policy versions_select on public.calculation_rule_versions for select using (true);
drop policy if exists versions_write on public.calculation_rule_versions;
create policy versions_write on public.calculation_rule_versions for all using (public.is_admin());

-- ---------- api_rate_limits (ограничение вызовов платных AI Edge Functions) ----------
create table if not exists public.api_rate_limits (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_rate_limits_lookup_idx on public.api_rate_limits(user_id, endpoint, created_at desc);

-- пишет/читает только service role (Edge Functions), обычным пользователям недоступна
alter table public.api_rate_limits enable row level security;
drop policy if exists rate_limits_none on public.api_rate_limits;
create policy rate_limits_none on public.api_rate_limits for all using (false) with check (false);

-- автоочистка старых записей (держим только последние сутки)
create or replace function public.cleanup_rate_limits() returns void
language sql security definer set search_path = public as $$
  delete from public.api_rate_limits where created_at < now() - interval '1 day';
$$;

-- ---------- recognition_cache (PaddleOCR/OpenRouter) ----------
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

-- ---------- Storage: фотографии шильдиков ----------
insert into storage.buckets (id, name, public) values ('car-plates', 'car-plates', false)
on conflict (id) do nothing;

drop policy if exists plates_user_all on storage.objects;
create policy plates_user_all on storage.objects
  for all using (bucket_id = 'car-plates' and auth.uid()::text = (storage.foldername(name))[1]);

-- ---------- админ-статистика ----------
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'calculations', (select count(*) from public.calculations),
    'avg_total_rub', coalesce((select avg(total_cost_rub)::numeric(14,2) from public.calculations), 0),
    'today', (select count(*) from public.calculations where created_at >= date_trunc('day', now())),
    'month', (select count(*) from public.calculations where created_at >= date_trunc('month', now()))
  ) into result;
  return result;
end $$;

-- ---------- явные GRANT для anon/authenticated ----------
-- Без этого PostgREST может отвечать 403 на некоторые таблицы даже при
-- корректных RLS-политиках: RLS ограничивает СТРОКИ, но базовое право на
-- операцию (SELECT/INSERT/...) над таблицей должно быть выдано отдельно.
-- Обычно Supabase выдаёт эти права автоматически, но для таблиц, созданных
-- через сырой SQL (а не через UI-конструктор), это стоит делать явно.
grant usage on schema public to anon, authenticated;

grant select on public.customs_rules to anon, authenticated;
grant select on public.recycling_fee_rules to anon, authenticated;
grant select, insert, update on public.exchange_rates to authenticated;
grant select on public.app_settings to anon, authenticated;
grant select on public.calculation_rule_versions to anon, authenticated;
grant select on public.additional_expense_types to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.calculations to authenticated;
-- api_rate_limits: право на операцию нужно, чтобы RLS вообще начал работать,
-- но политика rate_limits_none (using(false)) в любом случае блокирует все строки
-- для обычных пользователей — реальный доступ есть только у service role.
grant select, insert on public.api_rate_limits to authenticated;
grant select, insert, update, delete on public.recognition_cache to authenticated;

grant usage, select on all sequences in schema public to authenticated;
