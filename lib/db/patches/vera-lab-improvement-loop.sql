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
