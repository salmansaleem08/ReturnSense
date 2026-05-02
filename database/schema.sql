-- ReturnSense database schema
-- Apply manually in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- profiles
-- Stores seller account metadata and monthly usage limits tied to Supabase auth users.
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  username text,
  plan text default 'free',
  analyses_used int default 0,
  analyses_limit int default 20,
  created_at timestamptz default now()
);

-- buyers
-- Central analysis record for each buyer interaction and computed risk outcome.
create table if not exists public.buyers (
  id uuid default gen_random_uuid() primary key,
  seller_id uuid references public.profiles(id) on delete cascade,
  instagram_username text not null,
  phone_number text,
  address_raw text,
  address_formatted text,
  address_lat decimal(10, 7),
  address_lng decimal(10, 7),
  address_city text,
  address_province text,
  address_country text,
  address_quality_score int,
  phone_valid boolean,
  phone_carrier text,
  phone_is_voip boolean,
  phone_country text,
  ai_trust_score int,
  ai_risk_level text,
  ai_hesitation_detected boolean,
  ai_buyer_seriousness text,
  ai_reasons jsonb,
  ai_raw_response jsonb,
  final_trust_score int,
  final_risk_level text,
  chat_snapshot text,
  outcome text default 'pending',
  outcome_marked_at timestamptz,
  outcome_notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  conversation_hash text
);

create index if not exists idx_buyers_conversation_hash on public.buyers (seller_id, conversation_hash);

-- risk_signals
-- Transparent per-signal scoring entries attached to a buyer analysis.
create table if not exists public.risk_signals (
  id uuid default gen_random_uuid() primary key,
  buyer_id uuid references public.buyers(id) on delete cascade,
  signal_type text not null,
  signal_name text not null,
  impact int not null,
  description text,
  created_at timestamptz default now()
);

-- keep buyers.updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_buyers_set_updated_at on public.buyers;
create trigger trg_buyers_set_updated_at
before update on public.buyers
for each row
execute function public.set_updated_at();

-- row-level security
alter table public.profiles enable row level security;
alter table public.buyers enable row level security;
alter table public.risk_signals enable row level security;

-- profiles policies
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles
  for select
  using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles
  for update
  using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles
  for insert
  with check (auth.uid() = id);

-- buyers policies
drop policy if exists "Sellers see own buyers" on public.buyers;
create policy "Sellers see own buyers"
  on public.buyers
  for all
  using (auth.uid() = seller_id)
  with check (auth.uid() = seller_id);

-- risk_signals policies
drop policy if exists "Sellers see own risk signals" on public.risk_signals;
create policy "Sellers see own risk signals"
  on public.risk_signals
  for select
  using (
    exists (
      select 1
      from public.buyers b
      where b.id = risk_signals.buyer_id
        and b.seller_id = auth.uid()
    )
  );

drop policy if exists "Sellers create own risk signals" on public.risk_signals;
create policy "Sellers create own risk signals"
  on public.risk_signals
  for insert
  with check (
    exists (
      select 1
      from public.buyers b
      where b.id = risk_signals.buyer_id
        and b.seller_id = auth.uid()
    )
  );

drop policy if exists "Sellers update own risk signals" on public.risk_signals;
create policy "Sellers update own risk signals"
  on public.risk_signals
  for update
  using (
    exists (
      select 1
      from public.buyers b
      where b.id = risk_signals.buyer_id
        and b.seller_id = auth.uid()
    )
  );

drop policy if exists "Sellers delete own risk signals" on public.risk_signals;
create policy "Sellers delete own risk signals"
  on public.risk_signals
  for delete
  using (
    exists (
      select 1
      from public.buyers b
      where b.id = risk_signals.buyer_id
        and b.seller_id = auth.uid()
    )
  );

-- auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, username)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    nullif(new.raw_user_meta_data ->> 'username', '')
  );
  return new;
exception
  when unique_violation then
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();
