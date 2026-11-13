-- Isolated public demo workspaces with a one-hour lifetime.
-- Each browser tab receives three temporary role identities and its own org.
begin;

-- pg_cron is a Supabase-managed extension. Do not create it or
-- rewrite its internal grants inside an application migration: doing so can
-- re-run the platform event trigger that manages privileges on schema cron.
-- The cleanup job is registered below only when the extension is already enabled.

create table public.demo_visitor_sessions (
  session_id uuid primary key,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  org_id uuid unique references public.organizations(id) on delete set null,
  consulta_user_id uuid not null unique references auth.users(id) on delete cascade,
  operacao_user_id uuid not null unique references auth.users(id) on delete cascade,
  gestao_user_id uuid not null unique references auth.users(id) on delete cascade,
  client_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour')
);
create index demo_visitor_sessions_expiry_idx on public.demo_visitor_sessions(expires_at);
create index demo_visitor_sessions_client_idx
  on public.demo_visitor_sessions(client_hash, created_at desc)
  where client_hash is not null;

alter table public.demo_visitor_sessions enable row level security;
revoke all on public.demo_visitor_sessions from public, anon, authenticated;
grant all on public.demo_visitor_sessions to service_role;

-- Immediately detach every member from the old shared public demo workspace.
-- Its fictitious rows are retained as an inaccessible archive.
delete from public.organization_members
 where org_id = (
   select org_id from public.demo_workspace_registry where singleton = true
 );

-- Every existing RLS policy uses these helpers. A visitor loses database
-- access at expires_at even if the scheduled cleanup is delayed.
create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.organization_members m
     where m.org_id = _org
       and m.user_id = auth.uid()
       and (
         not exists (select 1 from public.demo_visitor_sessions d where d.org_id = _org)
         or exists (
           select 1 from public.demo_visitor_sessions d
            where d.org_id = _org and d.expires_at > now()
         )
       )
  );
$$;

create or replace function public.has_org_role(_org uuid, _min public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.organization_members m
     where m.org_id = _org
       and m.user_id = auth.uid()
       and m.role >= _min
       and (
         not exists (select 1 from public.demo_visitor_sessions d where d.org_id = _org)
         or exists (
           select 1 from public.demo_visitor_sessions d
            where d.org_id = _org and d.expires_at > now()
         )
       )
  );
$$;

create or replace function public.clear_demo_visitor_workspace_data(_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _org is null then raise exception 'Ambiente demonstrativo inexistente.'; end if;
  perform pg_advisory_xact_lock(hashtext(_org::text)::bigint);

  delete from public.inventory_count_items where org_id = _org;
  delete from public.inventory_counts where org_id = _org;
  delete from public.inventory_balances where org_id = _org;

  -- Break self-references before deleting the movement ledger.
  update public.stock_movements set reversal_of = null, reversed_by = null where org_id = _org;
  delete from public.stock_movements where org_id = _org;

  delete from public.tasks where org_id = _org;
  delete from public.export_history where org_id = _org;
  delete from public.export_templates where org_id = _org;

  -- locations.parent_id is ON DELETE RESTRICT.
  update public.locations set parent_id = null where org_id = _org;
  delete from public.locations where org_id = _org;
  delete from public.location_levels where org_id = _org;
  delete from public.warehouses where org_id = _org;
  delete from public.materials where org_id = _org;
  delete from public.material_attributes where org_id = _org;

  -- Remove audit rows created by the deletes above.
  delete from public.audit_logs where org_id = _org;
end;
$$;

create or replace function public.seed_demo_visitor_inventory_accuracy(_org uuid, _user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_warehouse uuid;
  v_count uuid;
  v_item record;
  v_expected numeric;
  v_counted numeric;
  v_line_count integer;
  v_divergence_created boolean := false;
begin
  select w.id into v_warehouse
    from public.warehouses w
   where w.org_id = _org and w.active
   order by (w.code = 'CD01') desc, w.created_at
   limit 1;
  if v_warehouse is null then
    raise exception 'O ambiente demonstrativo não possui armazém ativo.';
  end if;

  insert into public.inventory_counts(
    org_id, warehouse_id, description, created_by, status, completed_at
  )
  values (
    _org, v_warehouse,
    'Inventário demonstrativo — conferência inicial (dados fictícios)',
    _user, 'em_andamento', null
  )
  returning id into v_count;

  for v_item in
    with position_lots as (
      select b.material_id, b.location_id,
             (array_agg(b.lot order by b.quantity desc, b.lot))[1] as lot
        from public.inventory_balances b
       where b.org_id = _org and b.quantity > 0
       group by b.material_id, b.location_id
    ),
    candidates as (
      select m.id as material_id, l.id as location_id,
             coalesce(
               pl.lot,
               case when m.tracks_lot then
                 'DEMO-' || replace(m.code, '-', '') || '-' || replace(l.code, '-', '')
               else '' end
             ) as lot
        from public.materials m
        cross join public.locations l
        join public.location_levels lv
          on lv.id = l.level_id and lv.org_id = l.org_id
         and lv.warehouse_id = l.warehouse_id and lv.is_storage
        join public.warehouses wh
          on wh.id = l.warehouse_id and wh.org_id = l.org_id and wh.active
        left join position_lots pl
          on pl.material_id = m.id and pl.location_id = l.id
       where m.org_id = _org and m.status = 'ativo'
         and l.org_id = _org and l.warehouse_id = v_warehouse and l.active
         and not exists (select 1 from public.locations child where child.parent_id = l.id)
       order by m.code, l.code
       limit 40
    )
    select material_id, location_id, lot from candidates
     order by material_id, location_id
  loop
    select coalesce((
      select b.quantity from public.inventory_balances b
       where b.org_id = _org
         and b.material_id = v_item.material_id
         and b.location_id = v_item.location_id
         and b.lot = v_item.lot
    ), 0) into v_expected;

    v_counted := v_expected;
    if not v_divergence_created then
      v_counted := case
        when v_expected > 0 then greatest(0, v_expected - 1)
        else v_expected + 1
      end;
      v_divergence_created := true;
    end if;

    perform public._apply_adjustment(
      _org, _user, v_item.material_id, v_item.location_id, v_item.lot,
      v_counted,
      case when v_counted <> v_expected
        then 'Divergência demonstrativa fictícia'
        else 'Conferência demonstrativa sem divergência'
      end,
      v_count, now()
    );
  end loop;

  select count(*) into v_line_count
    from public.inventory_count_items where count_id = v_count;
  if v_line_count <> 40 or not v_divergence_created then
    raise exception 'Não foi possível gerar as 40 linhas demonstrativas. Foram geradas %.', v_line_count;
  end if;

  update public.inventory_counts
     set status = 'concluido', completed_at = now()
   where id = v_count;
end;
$$;

create or replace function public.create_demo_visitor_workspace(
  _session_id uuid,
  _token_hash text,
  _consulta uuid,
  _operacao uuid,
  _gestao uuid,
  _client_hash text default null
)
returns timestamptz language plpgsql security definer set search_path = public, auth as $$
declare
  v_org uuid;
  v_expires_at timestamptz;
  v_role_claim text;
  v_active_count integer;
  v_client_count integer;
begin
  v_role_claim := coalesce(auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true), '');
  if v_role_claim <> 'service_role' then
    raise exception 'Esta função está disponível apenas para o serviço de demonstração.';
  end if;
  if _session_id is null or _token_hash is null or _token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Identificador de sessão inválido.';
  end if;

  -- All supplied identities must be bound to this exact visitor and role.
  if not exists (
    select 1 from auth.users where id = _consulta
      and raw_app_meta_data ->> 'armaZenDemoRole' = 'consulta'
      and raw_app_meta_data ->> 'armaZenDemoSessionId' = _session_id::text
  ) or not exists (
    select 1 from auth.users where id = _operacao
      and raw_app_meta_data ->> 'armaZenDemoRole' = 'operacao'
      and raw_app_meta_data ->> 'armaZenDemoSessionId' = _session_id::text
  ) or not exists (
    select 1 from auth.users where id = _gestao
      and raw_app_meta_data ->> 'armaZenDemoRole' = 'gestao'
      and raw_app_meta_data ->> 'armaZenDemoSessionId' = _session_id::text
  ) then
    raise exception 'As contas demonstrativas não passaram na validação da sessão.';
  end if;

  -- Serialize quota accounting under concurrent logins.
  perform pg_advisory_xact_lock(20261113, 1);
  select count(*) into v_active_count
    from public.demo_visitor_sessions where expires_at > now();
  if v_active_count >= 200 then
    raise exception 'O limite temporário de demonstrações simultâneas foi atingido. Tente novamente mais tarde.';
  end if;

  if _client_hash is not null then
    perform pg_advisory_xact_lock(20261113, hashtext(_client_hash));
    select count(*) into v_client_count
      from public.demo_visitor_sessions
     where client_hash = _client_hash
       and created_at > now() - interval '10 minutes'
       and expires_at > now();
    if v_client_count >= 100 then
      raise exception 'Muitas demonstrações foram iniciadas nesta rede. Aguarde alguns minutos e tente novamente.';
    end if;
  end if;

  if exists (
    select 1 from public.demo_visitor_sessions
     where session_id = _session_id or token_hash = _token_hash
  ) then
    raise exception 'Esta sessão demonstrativa já foi provisionada.';
  end if;

  insert into public.organizations(name)
  values ('armaZen — Demonstração ' || left(_session_id::text, 8))
  returning id into v_org;

  insert into public.demo_visitor_sessions(
    session_id, token_hash, org_id, consulta_user_id, operacao_user_id, gestao_user_id, client_hash
  )
  values (_session_id, _token_hash, v_org, _consulta, _operacao, _gestao, _client_hash)
  returning expires_at into v_expires_at;

  insert into public.organization_members(org_id, user_id, role)
  values
    (v_org, _consulta, 'consulta'),
    (v_org, _operacao, 'operacao'),
    (v_org, _gestao, 'gestao');

  perform public._seed_demo(v_org, _gestao);
  perform public.seed_demo_visitor_inventory_accuracy(v_org, _gestao);
  return v_expires_at;
end;
$$;

create or replace function public.restore_demo_visitor_workspace(_token_hash text)
returns timestamptz language plpgsql security definer set search_path = public, auth as $$
declare
  v_role_claim text;
  v_session public.demo_visitor_sessions%rowtype;
begin
  v_role_claim := coalesce(auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true), '');
  if v_role_claim <> 'service_role' then
    raise exception 'Esta função está disponível apenas para o serviço de demonstração.';
  end if;
  if _token_hash is null or _token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Token de demonstração inválido.';
  end if;

  select * into v_session
    from public.demo_visitor_sessions
   where token_hash = _token_hash and expires_at > now()
   for update;
  if v_session.session_id is null or v_session.org_id is null then
    raise exception 'Esta demonstração expirou ou não existe nesta aba. Entre novamente para criar um novo ambiente.';
  end if;

  perform public.clear_demo_visitor_workspace_data(v_session.org_id);
  perform public._seed_demo(v_session.org_id, v_session.gestao_user_id);
  perform public.seed_demo_visitor_inventory_accuracy(
    v_session.org_id, v_session.gestao_user_id
  );
  return v_session.expires_at;
end;
$$;

create or replace function public.cleanup_expired_demo_visitor_sessions()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare
  v_session record;
  v_deleted integer := 0;
begin
  for v_session in
    select * from public.demo_visitor_sessions
     where expires_at <= now()
     order by expires_at
     for update skip locked
  loop
    if v_session.org_id is not null then
      perform public.clear_demo_visitor_workspace_data(v_session.org_id);
      delete from public.organizations where id = v_session.org_id;
      -- Cascading member deletion creates audit entries; remove them as well.
      delete from public.audit_logs where org_id = v_session.org_id;
    end if;

    delete from public.demo_visitor_sessions where session_id = v_session.session_id;
    delete from auth.users
     where id in (v_session.consulta_user_id, v_session.operacao_user_id, v_session.gestao_user_id);
    v_deleted := v_deleted + 1;
  end loop;
  return v_deleted;
end;
$$;

-- Keep the public demonstration team fixed for both legacy and visitor spaces.
create or replace function public.add_member_by_email(_org uuid, _email text, _role public.app_role)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  v_demo_role text;
begin
  if not public.has_org_role(_org, 'gestao') then
    raise exception 'Sem permissão para gerenciar usuários.';
  end if;
  if exists (select 1 from public.demo_workspace_registry where org_id = _org)
     or exists (select 1 from public.demo_visitor_sessions where org_id = _org) then
    raise exception 'A equipe do ambiente demonstrativo é fixa e não aceita usuários externos.';
  end if;

  select id, raw_app_meta_data ->> 'armaZenDemoRole'
    into uid, v_demo_role
    from auth.users
   where lower(email) = lower(trim(_email))
   limit 1;
  if uid is null then
    raise exception 'Nenhum usuário cadastrado com este e-mail. Peça para a pessoa criar a conta primeiro.';
  end if;
  if v_demo_role is not null then
    raise exception 'Perfis reservados da demonstração não podem ser associados a outras organizações.';
  end if;

  insert into public.organization_members(org_id, user_id, role)
  values (_org, uid, _role)
  on conflict (org_id, user_id) do update set role = excluded.role;
end;
$$;

revoke all on function public.clear_demo_visitor_workspace_data(uuid) from public, anon, authenticated;
revoke all on function public.seed_demo_visitor_inventory_accuracy(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_demo_visitor_workspace(uuid, text, uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.restore_demo_visitor_workspace(text) from public, anon, authenticated;
revoke all on function public.cleanup_expired_demo_visitor_sessions() from public, anon, authenticated;

grant execute on function public.create_demo_visitor_workspace(uuid, text, uuid, uuid, uuid, text) to service_role;
grant execute on function public.restore_demo_visitor_workspace(text) to service_role;
grant execute on function public.cleanup_expired_demo_visitor_sessions() to service_role, postgres;

-- Schedule the expiry sweep only when Supabase Cron is enabled.
-- Dynamic SQL keeps this migration applicable even when pg_cron is not installed.
-- The name check makes retries idempotent and avoids duplicate cleanup jobs.
do $cron_schedule$
declare
  v_job_exists boolean := false;
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select exists (select 1 from cron.job where jobname = $1)'
      into v_job_exists
      using 'armazen-demo-visitor-cleanup';

    if not v_job_exists then
      execute 'select cron.schedule($1, $2, $3)'
        into v_job_id
        using
          'armazen-demo-visitor-cleanup',
          '* * * * *',
          'select public.cleanup_expired_demo_visitor_sessions()';
    end if;
  else
    raise notice 'pg_cron ainda não está habilitado. A migration foi aplicada, mas a limpeza automática está pendente. Habilite Supabase Cron em Integrations > Cron e registre o job armazen-demo-visitor-cleanup.';
  end if;
end;
$cron_schedule$;

commit;
