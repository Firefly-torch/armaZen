-- Demo profiles and inventory-count workflow.
-- The demo credentials are never supplied by the browser: server code provisions
-- only three reserved accounts, and a service-role-only function links them to
-- one shared, fictitious workspace.

begin;

alter table public.inventory_counts
  add column status text not null default 'em_andamento'
    check (status in ('em_andamento', 'concluido')),
  add column completed_at timestamptz;

grant select, insert, update on public.inventory_counts to authenticated;

drop policy if exists "operacao insert inventory counts" on public.inventory_counts;
create policy "operacao insert inventory counts"
  on public.inventory_counts for insert to authenticated
  with check (
    public.has_org_role(org_id, 'operacao')
    and created_by = auth.uid()
    and status = 'em_andamento'
    and completed_at is null
  );

drop policy if exists "operacao update inventory counts" on public.inventory_counts;
create policy "operacao update inventory counts"
  on public.inventory_counts for update to authenticated
  using (
    public.has_org_role(org_id, 'gestao')
    or (public.has_org_role(org_id, 'operacao') and created_by = auth.uid())
  )
  with check (
    public.has_org_role(org_id, 'gestao')
    or (public.has_org_role(org_id, 'operacao') and created_by = auth.uid())
  );

-- Serialize inventory counting per count session and prevent duplicate scans
-- from replacing the expected balance twice.
create or replace function public._apply_adjustment(
  _org uuid,
  _user uuid,
  _material uuid,
  _location uuid,
  _lot text,
  _counted numeric,
  _reason text,
  _count uuid,
  _at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  bal numeric;
  diff numeric;
  mid uuid;
  v_lot text := coalesce(trim(_lot), '');
  m record;
  iid uuid;
  v_count uuid := _count;
  v_count_status text;
begin
  if _counted is null or _counted < 0 then
    raise exception 'A quantidade contada não pode ser negativa.';
  end if;
  if coalesce(trim(_reason), '') = '' then
    raise exception 'Informe o motivo do ajuste.';
  end if;

  select * into m from public.materials where id = _material and org_id = _org;
  if m.id is null then raise exception 'Material inexistente.'; end if;
  perform public._check_location(_org, _location, false);

  if v_count is null then
    insert into public.inventory_counts(org_id, description, created_by, created_at)
    values (_org, 'Contagem avulsa', _user, _at)
    returning id into v_count;
  else
    select status into v_count_status
      from public.inventory_counts
      where id = v_count and org_id = _org
      for update;

    if not found then raise exception 'Inventário inexistente.'; end if;
    if v_count_status <> 'em_andamento' then
      raise exception 'Este inventário já foi concluído e não aceita novas contagens.';
    end if;
  end if;

  if exists (
    select 1
    from public.inventory_count_items
    where count_id = v_count
      and material_id = _material
      and location_id = _location
      and lot = v_lot
  ) then
    raise exception 'Este material, endereço e lote já foram contados neste inventário.';
  end if;

  insert into public.inventory_balances(org_id, material_id, location_id, lot, quantity)
  values (_org, _material, _location, v_lot, 0)
  on conflict do nothing;

  select quantity into bal
    from public.inventory_balances
    where material_id = _material
      and location_id = _location
      and inventory_balances.lot = v_lot
    for update;

  diff := _counted - bal;
  if diff <> 0 then
    update public.inventory_balances
      set quantity = _counted, updated_at = now()
      where material_id = _material
        and location_id = _location
        and inventory_balances.lot = v_lot;

    insert into public.stock_movements(
      org_id, type, material_id, quantity, from_location_id, to_location_id,
      lot, reason, expected_qty, counted_qty, user_id, created_at, reference
    )
    values (
      _org, 'ajuste', _material, abs(diff),
      case when diff < 0 then _location end,
      case when diff > 0 then _location end,
      v_lot, trim(_reason), bal, _counted, _user, _at, 'Inventário'
    )
    returning id into mid;
  end if;

  delete from public.inventory_balances
    where material_id = _material
      and location_id = _location
      and inventory_balances.lot = v_lot
      and quantity = 0;

  insert into public.inventory_count_items(
    org_id, count_id, material_id, location_id, lot, expected_qty,
    counted_qty, difference, reason, movement_id, user_id, created_at
  )
  values (
    _org, v_count, _material, _location, v_lot, bal,
    _counted, diff, trim(_reason), mid, _user, _at
  )
  returning id into iid;

  return iid;
end;
$$;

-- Demo profiles may not be invited into other organizations, and the three
-- reserved demo roles cannot be reassigned or removed from their workspace.
create or replace function public.add_member_by_email(
  _org uuid, _email text, _role public.app_role
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  v_demo_role text;
begin
  if not public.has_org_role(_org, 'gestao') then
    raise exception 'Sem permissão para gerenciar usuários.';
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

create or replace function public.set_member_role(_member uuid, _role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mm record;
  v_demo_role text;
begin
  select * into mm from public.organization_members where id = _member;
  if mm.id is null or not public.has_org_role(mm.org_id, 'gestao') then
    raise exception 'Sem permissão.';
  end if;

  select raw_app_meta_data ->> 'armaZenDemoRole' into v_demo_role
    from auth.users where id = mm.user_id;
  if v_demo_role is not null then
    raise exception 'O perfil demonstrativo mantém sua função fixa.';
  end if;

  if mm.role = 'gestao' and _role <> 'gestao'
    and (select count(*) from public.organization_members where org_id = mm.org_id and role = 'gestao') <= 1 then
    raise exception 'A organização precisa ter ao menos um usuário de gestão.';
  end if;
  update public.organization_members set role = _role where id = _member;
end;
$$;

create or replace function public.remove_member(_member uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mm record;
  v_demo_role text;
begin
  select * into mm from public.organization_members where id = _member;
  if mm.id is null or not public.has_org_role(mm.org_id, 'gestao') then
    raise exception 'Sem permissão.';
  end if;

  select raw_app_meta_data ->> 'armaZenDemoRole' into v_demo_role
    from auth.users where id = mm.user_id;
  if v_demo_role is not null then
    raise exception 'Os três perfis demonstrativos não podem ser removidos do ambiente de demonstração.';
  end if;

  if mm.role = 'gestao'
    and (select count(*) from public.organization_members where org_id = mm.org_id and role = 'gestao') <= 1 then
    raise exception 'A organização precisa ter ao menos um usuário de gestão.';
  end if;
  delete from public.organization_members where id = _member;
end;
$$;

-- Reserved demo users cannot create a second organization and silently elevate
-- themselves outside their assigned demonstration profile.
create or replace function public.create_organization(_name text, _with_demo boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $
declare
  oid uuid;
  v_demo_role text;
begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;

  select raw_app_meta_data ->> 'armaZenDemoRole' into v_demo_role
    from auth.users where id = auth.uid();
  if v_demo_role is not null then
    raise exception 'As contas de demonstração usam uma organização compartilhada e não podem criar outra organização.';
  end if;

  if (select count(*) from public.organization_members where user_id = auth.uid() and role = 'gestao') >= 5 then
    raise exception 'Limite de organizações atingido.';
  end if;

  insert into public.organizations(name) values (trim(_name)) returning id into oid;
  insert into public.organization_members(org_id, user_id, role) values (oid, auth.uid(), 'gestao');
  if _with_demo then perform public._seed_demo(oid, auth.uid()); end if;
  return oid;
end;
$;

-- Store the reserved demo workspace by immutable id instead of looking it up
-- by a user-editable organization name.
create table public.demo_workspace_registry (
  singleton boolean primary key default true check (singleton),
  org_id uuid not null unique references public.organizations(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.demo_workspace_registry enable row level security;
revoke all on public.demo_workspace_registry from public, anon, authenticated;
grant all on public.demo_workspace_registry to service_role;

create or replace function public.ensure_demo_workspace(
  _consulta uuid,
  _operacao uuid,
  _gestao uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org uuid;
  v_role_claim text;
begin
  v_role_claim := coalesce(auth.jwt() ->> 'role', current_setting('request.jwt.claim.role', true), '');
  if v_role_claim <> 'service_role' then
    raise exception 'Esta função está disponível apenas para o serviço de provisionamento.';
  end if;

  -- Ensure that caller-supplied ids are the three pre-approved app demo users.
  if not exists (
    select 1 from auth.users
    where id = _consulta
      and lower(email) = 'demo.consulta@armazen.app'
      and raw_app_meta_data ->> 'armaZenDemoRole' = 'consulta'
  ) or not exists (
    select 1 from auth.users
    where id = _operacao
      and lower(email) = 'demo.operacao@armazen.app'
      and raw_app_meta_data ->> 'armaZenDemoRole' = 'operacao'
  ) or not exists (
    select 1 from auth.users
    where id = _gestao
      and lower(email) = 'demo.gestao@armazen.app'
      and raw_app_meta_data ->> 'armaZenDemoRole' = 'gestao'
  ) then
    raise exception 'As contas de demonstração não passaram na validação.';
  end if;

  perform pg_advisory_xact_lock(20261021, 1);

  select org_id into v_org
    from public.demo_workspace_registry
    where singleton = true
    for update;

  if v_org is null then
    insert into public.organizations(name)
      values ('armaZen — Ambiente de demonstração')
      returning id into v_org;
    insert into public.demo_workspace_registry(singleton, org_id)
      values (true, v_org);
  end if;

  if not exists (select 1 from public.warehouses where org_id = v_org)
    and not exists (select 1 from public.materials where org_id = v_org) then
    perform public._seed_demo(v_org, _gestao);
  elsif not exists (select 1 from public.warehouses where org_id = v_org)
    or not exists (select 1 from public.materials where org_id = v_org) then
    raise exception 'O ambiente demonstrativo está parcialmente configurado; revise os dados antes de continuar.';
  end if;

  -- Demo identities are reserved for this shared workspace.
  delete from public.organization_members
    where user_id in (_consulta, _operacao, _gestao)
      and org_id <> v_org;

  insert into public.organization_members(org_id, user_id, role)
    values (v_org, _consulta, 'consulta')
    on conflict (org_id, user_id) do update set role = excluded.role;

  insert into public.organization_members(org_id, user_id, role)
    values (v_org, _operacao, 'operacao')
    on conflict (org_id, user_id) do update set role = excluded.role;

  insert into public.organization_members(org_id, user_id, role)
    values (v_org, _gestao, 'gestao')
    on conflict (org_id, user_id) do update set role = excluded.role;

  return v_org;
end;
$$;

revoke all on function public.ensure_demo_workspace(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.ensure_demo_workspace(uuid, uuid, uuid) to service_role;

commit;
