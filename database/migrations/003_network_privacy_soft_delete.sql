-- Network intelligence (hashed identifiers only). Access via service role / backend only.
create table if not exists public.network_ig_outcomes (
  username_hash text primary key,
  delivered_count int not null default 0,
  returned_count int not null default 0,
  fake_count int not null default 0,
  cancelled_count int not null default 0,
  total_marked int not null default 0,
  updated_at timestamptz default now()
);

alter table public.network_ig_outcomes enable row level security;

-- Append-only style ledger: survives seller workspace deletion.
create table if not exists public.outcome_ledger (
  id uuid default gen_random_uuid() primary key,
  ig_username_hash text not null,
  phone_hash text,
  outcome text not null,
  buyer_id uuid references public.buyers(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_outcome_ledger_ig on public.outcome_ledger(ig_username_hash);
alter table public.outcome_ledger enable row level security;

-- Gradual signal weight learning (per-signal stats; no raw chat).
create table if not exists public.signal_weight_stats (
  signal_name text primary key,
  observations int not null default 0,
  correct_predictions int not null default 0,
  weight_multiplier numeric not null default 1.0,
  updated_at timestamptz default now()
);

alter table public.signal_weight_stats enable row level security;

-- Seller workspace: soft-delete analysis rows.
alter table public.buyers add column if not exists deleted_at timestamptz;

create index if not exists idx_buyers_seller_active on public.buyers (seller_id) where deleted_at is null;
