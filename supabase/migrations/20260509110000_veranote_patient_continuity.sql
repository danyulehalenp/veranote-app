create table if not exists public.veranote_patient_continuity (
  id text primary key,
  provider_id text not null,
  patient_label text not null,
  last_source_date timestamp with time zone,
  data jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_used_at timestamp with time zone,
  archived_at timestamp with time zone
);

create index if not exists veranote_patient_continuity_provider_updated_idx
  on public.veranote_patient_continuity (provider_id, archived_at, updated_at desc);

create index if not exists veranote_patient_continuity_provider_source_date_idx
  on public.veranote_patient_continuity (provider_id, last_source_date desc);

alter table public.veranote_patient_continuity enable row level security;

revoke all on table public.veranote_patient_continuity from anon, authenticated;

grant all privileges on table public.veranote_patient_continuity to service_role;
