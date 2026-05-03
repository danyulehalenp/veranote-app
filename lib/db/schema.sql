create extension if not exists pgcrypto;

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create index if not exists notes_provider_id_created_at_idx
  on notes (provider_id, created_at desc);

create table if not exists memory (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  category text not null,
  content text not null,
  created_at timestamp with time zone default now()
);

create index if not exists memory_provider_id_created_at_idx
  on memory (provider_id, created_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  user_id text not null,
  action text not null,
  route text,
  metadata jsonb,
  created_at timestamp with time zone default now()
);

create index if not exists audit_logs_user_id_created_at_idx
  on audit_logs (user_id, created_at desc);

create table if not exists request_metrics (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  route text,
  model text,
  latency_ms int,
  success boolean
);

create table if not exists error_metrics (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  route text,
  error_type text,
  message text
);

create table if not exists eval_metrics (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  passed int,
  failed int
);

create table if not exists model_usage (
  id uuid primary key default gen_random_uuid(),
  timestamp timestamp with time zone default now(),
  model text,
  tokens int
);

create table if not exists provider_memory (
  id uuid primary key default gen_random_uuid(),
  provider_id text,
  category text,
  content text,
  confidence text,
  source text,
  tags text[],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists rate_limits (
  key text primary key,
  count int,
  window_start timestamp with time zone
);

create table if not exists async_tasks (
  id uuid primary key default gen_random_uuid(),
  type text,
  payload jsonb,
  status text,
  created_at timestamp with time zone default now()
);

alter table async_tasks
  add column if not exists attempts int default 0;

alter table async_tasks
  add column if not exists last_error text;

alter table async_tasks
  add column if not exists updated_at timestamp with time zone default now();

create table if not exists vera_test_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default now(),
  mode text,
  stage text,
  provider_profile_id text,
  tester_version text,
  repair_version text,
  status text
);

create index if not exists vera_test_runs_created_at_idx
  on vera_test_runs (created_at desc);

create table if not exists vera_test_cases (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references vera_test_runs(id) on delete cascade,
  category text,
  subtype text,
  prompt text,
  followup_prompt text,
  expected_answer_mode text,
  severity_if_wrong text
);

create index if not exists vera_test_cases_run_id_idx
  on vera_test_cases (run_id);

create table if not exists vera_test_results (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references vera_test_cases(id) on delete cascade,
  vera_response text,
  answer_mode_returned text,
  route_taken text,
  passed boolean,
  failure_category text,
  likely_root_cause text,
  safety_score int,
  directness_score int,
  usefulness_score int,
  chart_usability_score int,
  judge_notes text
);

create index if not exists vera_test_results_case_id_idx
  on vera_test_results (case_id);

create index if not exists vera_test_results_failure_category_idx
  on vera_test_results (failure_category);

create table if not exists vera_fix_tasks (
  id uuid primary key default gen_random_uuid(),
  result_id uuid references vera_test_results(id) on delete cascade,
  assigned_layer text,
  patch_prompt text,
  status text,
  patch_summary text,
  priority_score int default 0,
  priority_band text,
  priority_explanation jsonb,
  suggested_fix_strategy jsonb,
  regression_plan text,
  approval_required boolean default true,
  improvement_summary text,
  approved_by text,
  approved_at timestamp with time zone,
  rejected_by text,
  rejected_at timestamp with time zone
);

alter table vera_fix_tasks
  add column if not exists priority_score int default 0;

alter table vera_fix_tasks
  add column if not exists priority_band text;

alter table vera_fix_tasks
  add column if not exists priority_explanation jsonb;

alter table vera_fix_tasks
  add column if not exists suggested_fix_strategy jsonb;

alter table vera_fix_tasks
  add column if not exists regression_plan text;

alter table vera_fix_tasks
  add column if not exists approval_required boolean default true;

alter table vera_fix_tasks
  add column if not exists improvement_summary text;

alter table vera_fix_tasks
  add column if not exists approved_by text;

alter table vera_fix_tasks
  add column if not exists approved_at timestamp with time zone;

alter table vera_fix_tasks
  add column if not exists rejected_by text;

alter table vera_fix_tasks
  add column if not exists rejected_at timestamp with time zone;

create index if not exists vera_fix_tasks_status_idx
  on vera_fix_tasks (status);

create table if not exists vera_regression_results (
  id uuid primary key default gen_random_uuid(),
  fix_task_id uuid references vera_fix_tasks(id) on delete cascade,
  prompt_variant text,
  passed boolean,
  notes text
);

create index if not exists vera_regression_results_fix_task_id_idx
  on vera_regression_results (fix_task_id);

create table if not exists veranote_drafts (
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
  on veranote_drafts (provider_id, archived_at, updated_at desc);

create table if not exists veranote_provider_settings (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists veranote_note_presets (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists veranote_dictation_audit_events (
  id text primary key,
  provider_id text not null,
  session_id text not null,
  occurred_at timestamp with time zone not null,
  data jsonb not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists veranote_dictation_audit_provider_session_idx
  on veranote_dictation_audit_events (provider_id, session_id, occurred_at desc);

create table if not exists veranote_assistant_learning (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists veranote_memory_ledgers (
  provider_id text primary key,
  data jsonb not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists veranote_beta_feedback (
  id text primary key,
  provider_id text,
  category text not null,
  status text not null,
  data jsonb not null,
  created_at timestamp with time zone not null default now()
);

create index if not exists veranote_beta_feedback_created_at_idx
  on veranote_beta_feedback (created_at desc);

create table if not exists veranote_app_state (
  key text primary key,
  value text not null,
  updated_at timestamp with time zone not null default now()
);

alter table veranote_drafts enable row level security;
alter table veranote_provider_settings enable row level security;
alter table veranote_note_presets enable row level security;
alter table veranote_dictation_audit_events enable row level security;
alter table veranote_assistant_learning enable row level security;
alter table veranote_memory_ledgers enable row level security;
alter table veranote_beta_feedback enable row level security;
alter table veranote_app_state enable row level security;

revoke all on table veranote_drafts from anon, authenticated;
revoke all on table veranote_provider_settings from anon, authenticated;
revoke all on table veranote_note_presets from anon, authenticated;
revoke all on table veranote_dictation_audit_events from anon, authenticated;
revoke all on table veranote_assistant_learning from anon, authenticated;
revoke all on table veranote_memory_ledgers from anon, authenticated;
revoke all on table veranote_beta_feedback from anon, authenticated;
revoke all on table veranote_app_state from anon, authenticated;

grant all privileges on table veranote_drafts to service_role;
grant all privileges on table veranote_provider_settings to service_role;
grant all privileges on table veranote_note_presets to service_role;
grant all privileges on table veranote_dictation_audit_events to service_role;
grant all privileges on table veranote_assistant_learning to service_role;
grant all privileges on table veranote_memory_ledgers to service_role;
grant all privileges on table veranote_beta_feedback to service_role;
grant all privileges on table veranote_app_state to service_role;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  grant all privileges on sequences to service_role;
