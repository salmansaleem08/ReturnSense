-- Optional location fields from phone intelligence (region/city when API returns them)
alter table public.buyers add column if not exists phone_region text;
alter table public.buyers add column if not exists phone_city text;
