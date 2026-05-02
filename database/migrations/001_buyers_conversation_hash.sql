-- Run on existing Supabase projects if schema.sql was applied before conversation_hash existed.
alter table public.buyers add column if not exists conversation_hash text;

create index if not exists idx_buyers_conversation_hash on public.buyers (seller_id, conversation_hash);
