-- Run once in your Supabase project's SQL editor.
create table if not exists public.meeting_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{"version":1,"meetings":[],"templates":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint valid_workspace check (
    payload->>'version' = '1' and jsonb_typeof(payload->'meetings') = 'array'
    and jsonb_typeof(payload->'templates') = 'array'
  )
);
alter table public.meeting_workspaces enable row level security;
revoke all on public.meeting_workspaces from anon;
grant select, insert, update on public.meeting_workspaces to authenticated;
drop policy if exists "Own meeting workspace" on public.meeting_workspaces;
create policy "Own meeting workspace" on public.meeting_workspaces
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Compare-and-swap prevents older tabs/devices from replacing newer notes.
create or replace function public.save_meeting_workspace(expected_revision bigint, workspace_payload jsonb)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare current_revision bigint;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  insert into public.meeting_workspaces (user_id) values (auth.uid()) on conflict do nothing;
  select revision into current_revision from public.meeting_workspaces
    where user_id = auth.uid() for update;
  if current_revision <> expected_revision then
    raise exception 'Workspace changed on another device' using errcode = '40001';
  end if;
  update public.meeting_workspaces set payload = workspace_payload,
    revision = current_revision + 1, updated_at = now() where user_id = auth.uid();
  return current_revision + 1;
end;
$$;
revoke all on function public.save_meeting_workspace(bigint,jsonb) from public, anon;
grant execute on function public.save_meeting_workspace(bigint,jsonb) to authenticated;
