create extension if not exists pgcrypto;

create table if not exists public.veranote_drafts (
  id text primary key,
  provider_id text not null,
  version int not null default 1,
  data jsonb not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_saved_at timestamp with time zone,
  last_opened_at timestamp with time zone,
  archived_at timestamp with time zone
);

create index if not exists veranote_drafts_provider_active_updated_idx
  on public.veranote_drafts (provider_id, archived_at, updated_at desc);

create table if not exists public.veranote_provider_settings (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.veranote_note_presets (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.veranote_dictation_audit_events (
  id text primary key,
  provider_id text not null,
  session_id text not null,
  occurred_at timestamp with time zone not null,
  data jsonb not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists veranote_dictation_audit_provider_session_idx
  on public.veranote_dictation_audit_events (provider_id, session_id, occurred_at desc);

create table if not exists public.veranote_assistant_learning (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.veranote_memory_ledgers (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.veranote_beta_feedback (
  id text primary key,
  provider_id text,
  category text not null,
  status text not null,
  data jsonb not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists veranote_beta_feedback_created_at_idx
  on public.veranote_beta_feedback (created_at desc);

create table if not exists public.veranote_app_state (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone not null default now()
);

alter table public.veranote_drafts enable row level security;
alter table public.veranote_provider_settings enable row level security;
alter table public.veranote_note_presets enable row level security;
alter table public.veranote_dictation_audit_events enable row level security;
alter table public.veranote_assistant_learning enable row level security;
alter table public.veranote_memory_ledgers enable row level security;
alter table public.veranote_beta_feedback enable row level security;
alter table public.veranote_app_state enable row level security;

revoke all on table public.veranote_drafts from anon, authenticated;
revoke all on table public.veranote_provider_settings from anon, authenticated;
revoke all on table public.veranote_note_presets from anon, authenticated;
revoke all on table public.veranote_dictation_audit_events from anon, authenticated;
revoke all on table public.veranote_assistant_learning from anon, authenticated;
revoke all on table public.veranote_memory_ledgers from anon, authenticated;
revoke all on table public.veranote_beta_feedback from anon, authenticated;
revoke all on table public.veranote_app_state from anon, authenticated;

grant all privileges on table public.veranote_drafts to service_role;
grant all privileges on table public.veranote_provider_settings to service_role;
grant all privileges on table public.veranote_note_presets to service_role;
grant all privileges on table public.veranote_dictation_audit_events to service_role;
grant all privileges on table public.veranote_assistant_learning to service_role;
grant all privileges on table public.veranote_memory_ledgers to service_role;
grant all privileges on table public.veranote_beta_feedback to service_role;
grant all privileges on table public.veranote_app_state to service_role;
