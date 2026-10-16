
-- ============ ENUMS ============
create type public.app_role as enum ('consulta','operacao','gestao');
create type public.location_status as enum ('disponivel','bloqueado','reservado');
create type public.movement_type as enum ('entrada','saida','transferencia','ajuste','estorno');
create type public.task_type as enum ('recebimento','conferencia','armazenagem','separacao','transferencia','inventario','expedicao');
create type public.task_priority as enum ('baixa','media','alta','urgente');
create type public.task_status as enum ('a_fazer','em_andamento','aguardando','concluida');

-- ============ CORE ============
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  role public.app_role not null default 'consulta',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.organization_members(user_id);

-- helper functions (security definer avoids RLS recursion)
create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members where org_id=_org and user_id=auth.uid())
$$;
create or replace function public.has_org_role(_org uuid, _min public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.organization_members where org_id=_org and user_id=auth.uid() and role >= _min)
$$;

-- ============ WAREHOUSE STRUCTURE ============
create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 30),
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table public.location_levels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  sort_order int not null default 1,
  is_storage boolean not null default false,
  created_at timestamptz not null default now(),
  unique (warehouse_id, name)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  parent_id uuid references public.locations(id) on delete restrict,
  level_id uuid not null references public.location_levels(id) on delete restrict,
  code text not null check (length(trim(code)) between 1 and 60),
  name text not null check (length(trim(name)) between 1 and 120),
  status public.location_status not null default 'disponivel',
  active boolean not null default true,
  capacity numeric(14,3) check (capacity is null or capacity > 0),
  capacity_unit text,
  pos_x int not null default 0,
  pos_y int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (warehouse_id, code),
  check (parent_id is null or parent_id <> id)
);
create index on public.locations(parent_id);
create index on public.locations(org_id);

-- ============ MATERIALS ============
create table public.material_attributes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null,
  data_type text not null default 'text' check (data_type in ('text','number','date','boolean')),
  required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (length(trim(code)) between 1 and 40),
  description text not null check (length(trim(description)) between 2 and 200),
  category text not null,
  unit text not null check (length(trim(unit)) between 1 and 10),
  barcode text,
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  status text not null default 'ativo' check (status in ('ativo','inativo')),
  tracks_lot boolean not null default false,
  attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);
create unique index materials_barcode_uq on public.materials(org_id, barcode) where barcode is not null and barcode <> '';

-- ============ STOCK ============
create table public.inventory_balances (
  org_id uuid not null references public.organizations(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  lot text not null default '',
  expiry_date date,
  quantity numeric(14,3) not null check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (material_id, location_id, lot)
);
create index on public.inventory_balances(location_id);
create index on public.inventory_balances(org_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  org_id uuid not null references public.organizations(id) on delete cascade,
  type public.movement_type not null,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  from_location_id uuid references public.locations(id) on delete restrict,
  to_location_id uuid references public.locations(id) on delete restrict,
  lot text not null default '',
  reference text,
  notes text,
  reason text,
  expected_qty numeric(14,3),
  counted_qty numeric(14,3),
  reversal_of uuid references public.stock_movements(id) on delete restrict,
  reversed_by uuid references public.stock_movements(id) on delete restrict,
  request_id uuid unique,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index on public.stock_movements(org_id, created_at desc);
create index on public.stock_movements(material_id);
create index on public.stock_movements(from_location_id);
create index on public.stock_movements(to_location_id);

create table public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  description text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  count_id uuid not null references public.inventory_counts(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  lot text not null default '',
  expected_qty numeric(14,3) not null,
  counted_qty numeric(14,3) not null check (counted_qty >= 0),
  difference numeric(14,3) not null,
  reason text not null,
  movement_id uuid references public.stock_movements(id) on delete restrict,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
create index on public.inventory_count_items(org_id, created_at);

-- ============ TASKS ============
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 160),
  description text,
  type public.task_type not null,
  priority public.task_priority not null default 'media',
  status public.task_status not null default 'a_fazer',
  assignee_id uuid,
  due_at timestamptz,
  material_id uuid references public.materials(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  movement_id uuid references public.stock_movements(id) on delete set null,
  created_by uuid not null default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tasks(org_id, status);

-- ============ EXPORT ============
create table public.export_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  dataset text not null,
  config jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table public.export_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.export_templates(id) on delete set null,
  template_name text,
  dataset text not null,
  format text not null check (format in ('csv','xlsx','json')),
  filters jsonb not null default '{}'::jsonb,
  record_count int not null default 0,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

-- ============ AUDIT ============
create table public.audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_logs(org_id, created_at desc);

-- ============ GRANTS ============
grant select, update on public.organizations to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.warehouses, public.location_levels, public.locations, public.material_attributes, public.materials, public.tasks, public.export_templates to authenticated;
grant select on public.inventory_balances, public.stock_movements, public.inventory_counts, public.inventory_count_items, public.audit_logs to authenticated;
grant select, insert on public.export_history to authenticated;
grant all on all tables in schema public to service_role;

-- ============ RLS ============
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.warehouses enable row level security;
alter table public.location_levels enable row level security;
alter table public.locations enable row level security;
alter table public.material_attributes enable row level security;
alter table public.materials enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_items enable row level security;
alter table public.tasks enable row level security;
alter table public.export_templates enable row level security;
alter table public.export_history enable row level security;
alter table public.audit_logs enable row level security;

create policy "members read org" on public.organizations for select to authenticated using (public.is_org_member(id));
create policy "gestao updates org" on public.organizations for update to authenticated using (public.has_org_role(id,'gestao')) with check (public.has_org_role(id,'gestao'));

create policy "read own or co-member profile" on public.profiles for select to authenticated using (
  id = auth.uid() or exists (select 1 from public.organization_members m1 join public.organization_members m2 on m1.org_id=m2.org_id where m1.user_id=auth.uid() and m2.user_id=profiles.id));
create policy "update own profile" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "members read members" on public.organization_members for select to authenticated using (public.is_org_member(org_id));

-- generic: read = member, write = gestao
do $$ declare t text; begin
  foreach t in array array['warehouses','location_levels','locations','material_attributes','materials','export_templates'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t);
    execute format('create policy "gestao insert" on public.%I for insert to authenticated with check (public.has_org_role(org_id,''gestao''))', t);
    execute format('create policy "gestao update" on public.%I for update to authenticated using (public.has_org_role(org_id,''gestao'')) with check (public.has_org_role(org_id,''gestao''))', t);
    execute format('create policy "gestao delete" on public.%I for delete to authenticated using (public.has_org_role(org_id,''gestao''))', t);
  end loop;
  foreach t in array array['inventory_balances','stock_movements','inventory_counts','inventory_count_items'] loop
    execute format('create policy "members read" on public.%I for select to authenticated using (public.is_org_member(org_id))', t);
  end loop;
end $$;

create policy "members read" on public.tasks for select to authenticated using (public.is_org_member(org_id));
create policy "operacao insert" on public.tasks for insert to authenticated with check (public.has_org_role(org_id,'operacao') and created_by = auth.uid());
create policy "operacao update" on public.tasks for update to authenticated using (public.has_org_role(org_id,'operacao')) with check (public.has_org_role(org_id,'operacao'));
create policy "gestao delete" on public.tasks for delete to authenticated using (public.has_org_role(org_id,'gestao'));

create policy "gestao read" on public.export_history for select to authenticated using (public.has_org_role(org_id,'gestao'));
create policy "gestao insert" on public.export_history for insert to authenticated with check (public.has_org_role(org_id,'gestao') and user_id = auth.uid());

create policy "gestao read audit" on public.audit_logs for select to authenticated using (org_id is not null and public.has_org_role(org_id,'gestao'));

-- ============ TRIGGERS ============
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path=public as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_upd before update on public.warehouses for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.locations for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.materials for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.tasks for each row execute function public.touch_updated_at();
create trigger t_upd before update on public.export_templates for each row execute function public.touch_updated_at();

create or replace function public.tasks_completed_at() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status = 'concluida' and (tg_op='INSERT' or old.status <> 'concluida') then new.completed_at = now();
  elsif new.status <> 'concluida' then new.completed_at = null; end if;
  return new; end $$;
create trigger t_done before insert or update on public.tasks for each row execute function public.tasks_completed_at();

-- location: parent must be same warehouse, no cycles
create or replace function public.locations_validate() returns trigger language plpgsql set search_path=public as $$
declare p record; cur uuid; depth int := 0;
begin
  if new.parent_id is not null then
    select warehouse_id, org_id into p from public.locations where id = new.parent_id;
    if p.warehouse_id is distinct from new.warehouse_id then raise exception 'O nível superior deve pertencer ao mesmo armazém.'; end if;
    cur := new.parent_id;
    while cur is not null loop
      if cur = new.id then raise exception 'Hierarquia inválida: referência circular.'; end if;
      select parent_id into cur from public.locations where id = cur;
      depth := depth + 1; if depth > 20 then raise exception 'Hierarquia muito profunda (máx. 20 níveis).'; end if;
    end loop;
  end if;
  if not exists (select 1 from public.location_levels where id=new.level_id and warehouse_id=new.warehouse_id) then
    raise exception 'Tipo de nível inválido para este armazém.'; end if;
  if not exists (select 1 from public.warehouses where id=new.warehouse_id and org_id=new.org_id) then
    raise exception 'Armazém inválido.'; end if;
  return new; end $$;
create trigger t_valid before insert or update on public.locations for each row execute function public.locations_validate();

-- audit
create or replace function public.audit_trigger() returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; begin
  r := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_logs(org_id,user_id,action,entity,entity_id,details)
  values ((r->>'org_id')::uuid, auth.uid(), lower(tg_op), tg_table_name, r->>'id',
    case when tg_op='UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', r) else r end);
  return null; end $$;
do $$ declare t text; begin
  foreach t in array array['warehouses','location_levels','locations','materials','material_attributes','tasks','organization_members','stock_movements','inventory_count_items','export_templates','export_history'] loop
    execute format('create trigger t_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t);
  end loop; end $$;

-- profile on signup
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name, email) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email)
  on conflict (id) do nothing;
  return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ============ STOCK FUNCTIONS ============
create or replace function public._check_location(_org uuid, _loc uuid, _for_allocation boolean) returns void
language plpgsql security definer set search_path=public as $$
declare l record; begin
  select l1.*, w.active as wh_active into l from public.locations l1 join public.warehouses w on w.id=l1.warehouse_id where l1.id=_loc;
  if l.id is null or l.org_id <> _org then raise exception 'Endereço inexistente.'; end if;
  if not l.active or not l.wh_active then raise exception 'Endereço % está inativo.', l.code; end if;
  if _for_allocation and l.status = 'bloqueado' then raise exception 'Endereço % está bloqueado para novas alocações.', l.code; end if;
end $$;

create or replace function public._apply_movement(_org uuid, _user uuid, _type public.movement_type, _material uuid, _qty numeric,
  _from uuid, _to uuid, _lot text, _reference text, _notes text, _reason text, _request uuid, _at timestamptz default now(), _reversal_of uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare m record; bal numeric; mid uuid; lot text := coalesce(trim(_lot),'');
begin
  if _request is not null then
    select id into mid from public.stock_movements where request_id=_request;
    if mid is not null then return mid; end if;
  end if;
  if _qty is null or _qty <= 0 then raise exception 'A quantidade deve ser maior que zero.'; end if;
  select * into m from public.materials where id=_material;
  if m.id is null or m.org_id <> _org then raise exception 'Material inexistente.'; end if;
  if m.status <> 'ativo' and _type <> 'estorno' then raise exception 'Material % está inativo.', m.code; end if;
  if _type in ('saida','transferencia') or (_type='estorno' and _from is not null) then
    if _from is null then raise exception 'Informe o endereço de origem.'; end if;
    perform public._check_location(_org,_from,false);
    select quantity into bal from public.inventory_balances where material_id=_material and location_id=_from and inventory_balances.lot=lot for update;
    if coalesce(bal,0) < _qty then raise exception 'Quantidade insuficiente: saldo disponível % %.', coalesce(bal,0), m.unit; end if;
    update public.inventory_balances set quantity=quantity-_qty, updated_at=now() where material_id=_material and location_id=_from and inventory_balances.lot=lot;
    delete from public.inventory_balances where material_id=_material and location_id=_from and inventory_balances.lot=lot and quantity=0;
  end if;
  if _type in ('entrada','transferencia') or (_type='estorno' and _to is not null) then
    if _to is null then raise exception 'Informe o endereço de destino.'; end if;
    if _type='transferencia' and _to=_from then raise exception 'Origem e destino devem ser diferentes.'; end if;
    perform public._check_location(_org,_to,true);
    insert into public.inventory_balances(org_id,material_id,location_id,lot,quantity) values (_org,_material,_to,lot,_qty)
    on conflict (material_id,location_id,lot) do update set quantity=public.inventory_balances.quantity+excluded.quantity, updated_at=now();
  end if;
  insert into public.stock_movements(org_id,type,material_id,quantity,from_location_id,to_location_id,lot,reference,notes,reason,request_id,user_id,created_at,reversal_of)
  values (_org,_type,_material,_qty,_from,_to,lot,nullif(trim(_reference),''),nullif(trim(_notes),''),nullif(trim(_reason),''),_request,_user,_at,_reversal_of)
  returning id into mid;
  return mid;
end $$;

create or replace function public.register_movement(_org uuid, _type public.movement_type, _material uuid, _qty numeric,
  _from uuid default null, _to uuid default null, _lot text default '', _reference text default null, _notes text default null, _request uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.has_org_role(_org,'operacao') then raise exception 'Sem permissão para registrar movimentações.'; end if;
  if _type not in ('entrada','saida','transferencia') then raise exception 'Tipo de movimentação inválido.'; end if;
  if _type = 'saida' and coalesce(trim(_reference),'') = '' and coalesce(trim(_notes),'') = '' then raise exception 'Informe o motivo ou a referência da saída.'; end if;
  return public._apply_movement(_org, auth.uid(), _type, _material, _qty,
    case when _type='entrada' then null else _from end, case when _type='saida' then null else _to end,
    _lot, _reference, _notes, null, _request);
end $$;

create or replace function public.reverse_movement(_movement uuid, _reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare mv record; nid uuid; begin
  select * into mv from public.stock_movements where id=_movement for update;
  if mv.id is null then raise exception 'Movimentação inexistente.'; end if;
  if not public.has_org_role(mv.org_id,'operacao') then raise exception 'Sem permissão para estornar.'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  if mv.reversed_by is not null then raise exception 'Esta movimentação já foi estornada.'; end if;
  if mv.type = 'estorno' then raise exception 'Não é possível estornar um estorno.'; end if;
  nid := public._apply_movement(mv.org_id, auth.uid(), 'estorno', mv.material_id, mv.quantity, mv.to_location_id, mv.from_location_id,
    mv.lot, 'Estorno #'||mv.number, null, _reason, null, now(), mv.id);
  update public.stock_movements set reversed_by = nid where id = mv.id;
  return nid;
end $$;

create or replace function public._apply_adjustment(_org uuid, _user uuid, _material uuid, _location uuid, _lot text, _counted numeric, _reason text, _count uuid, _at timestamptz default now())
returns uuid language plpgsql security definer set search_path=public as $$
declare bal numeric; diff numeric; mid uuid; lot text := coalesce(trim(_lot),''); m record; iid uuid;
begin
  if _counted is null or _counted < 0 then raise exception 'A quantidade contada não pode ser negativa.'; end if;
  if coalesce(trim(_reason),'') = '' then raise exception 'Informe o motivo do ajuste.'; end if;
  select * into m from public.materials where id=_material and org_id=_org;
  if m.id is null then raise exception 'Material inexistente.'; end if;
  perform public._check_location(_org,_location,false);
  if _count is null then
    insert into public.inventory_counts(org_id, description, created_by, created_at) values (_org, 'Contagem avulsa', _user, _at) returning id into _count;
  elsif not exists (select 1 from public.inventory_counts where id=_count and org_id=_org) then raise exception 'Inventário inexistente.'; end if;
  insert into public.inventory_balances(org_id,material_id,location_id,lot,quantity) values (_org,_material,_location,lot,0) on conflict do nothing;
  select quantity into bal from public.inventory_balances where material_id=_material and location_id=_location and inventory_balances.lot=lot for update;
  diff := _counted - bal;
  if diff <> 0 then
    update public.inventory_balances set quantity=_counted, updated_at=now() where material_id=_material and location_id=_location and inventory_balances.lot=lot;
    insert into public.stock_movements(org_id,type,material_id,quantity,from_location_id,to_location_id,lot,reason,expected_qty,counted_qty,user_id,created_at,reference)
    values (_org,'ajuste',_material,abs(diff), case when diff<0 then _location end, case when diff>0 then _location end, lot, trim(_reason), bal, _counted, _user, _at, 'Inventário')
    returning id into mid;
  end if;
  delete from public.inventory_balances where material_id=_material and location_id=_location and inventory_balances.lot=lot and quantity=0;
  insert into public.inventory_count_items(org_id,count_id,material_id,location_id,lot,expected_qty,counted_qty,difference,reason,movement_id,user_id,created_at)
  values (_org,_count,_material,_location,lot,bal,_counted,diff,trim(_reason),mid,_user,_at) returning id into iid;
  return iid;
end $$;

create or replace function public.register_adjustment(_org uuid, _material uuid, _location uuid, _lot text, _counted numeric, _reason text, _count uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
begin
  if not public.has_org_role(_org,'operacao') then raise exception 'Sem permissão para registrar ajustes.'; end if;
  return public._apply_adjustment(_org, auth.uid(), _material, _location, _lot, _counted, _reason, _count);
end $$;

-- ============ ORG / MEMBERS ============
create or replace function public.add_member_by_email(_org uuid, _email text, _role public.app_role)
returns void language plpgsql security definer set search_path=public as $$
declare uid uuid; begin
  if not public.has_org_role(_org,'gestao') then raise exception 'Sem permissão para gerenciar usuários.'; end if;
  select id into uid from public.profiles where lower(email)=lower(trim(_email));
  if uid is null then raise exception 'Nenhum usuário cadastrado com este e-mail. Peça para a pessoa criar a conta primeiro.'; end if;
  insert into public.organization_members(org_id,user_id,role) values (_org,uid,_role)
  on conflict (org_id,user_id) do update set role = excluded.role;
end $$;

create or replace function public.set_member_role(_member uuid, _role public.app_role)
returns void language plpgsql security definer set search_path=public as $$
declare mm record; begin
  select * into mm from public.organization_members where id=_member;
  if mm.id is null or not public.has_org_role(mm.org_id,'gestao') then raise exception 'Sem permissão.'; end if;
  if mm.role='gestao' and _role<>'gestao' and (select count(*) from public.organization_members where org_id=mm.org_id and role='gestao')<=1 then
    raise exception 'A organização precisa ter ao menos um usuário de gestão.'; end if;
  update public.organization_members set role=_role where id=_member;
end $$;

create or replace function public.remove_member(_member uuid)
returns void language plpgsql security definer set search_path=public as $$
declare mm record; begin
  select * into mm from public.organization_members where id=_member;
  if mm.id is null or not public.has_org_role(mm.org_id,'gestao') then raise exception 'Sem permissão.'; end if;
  if mm.role='gestao' and (select count(*) from public.organization_members where org_id=mm.org_id and role='gestao')<=1 then
    raise exception 'A organização precisa ter ao menos um usuário de gestão.'; end if;
  delete from public.organization_members where id=_member;
end $$;

-- ============ DEMO SEED (fictitious data, explicit user action only) ============
create or replace function public._seed_demo(_org uuid, _user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare wh uuid; lv_area uuid; lv_unid uuid; lv_est uuid; lv_pos uuid;
  a_ext uuid; a_int uuid; c uuid; e uuid; pat uuid; fab uuid; i int; j int;
  locs uuid[] := '{}'; m uuid[] := '{}'; cnt uuid; d timestamptz;
begin
  insert into public.warehouses(org_id,code,name,description) values (_org,'CD01','Centro de Distribuição DEMO','Dados fictícios para demonstração — editáveis.') returning id into wh;
  insert into public.location_levels(org_id,warehouse_id,name,sort_order,is_storage) values (_org,wh,'Área',1,false) returning id into lv_area;
  insert into public.location_levels(org_id,warehouse_id,name,sort_order,is_storage) values (_org,wh,'Unidade',2,false) returning id into lv_unid;
  insert into public.location_levels(org_id,warehouse_id,name,sort_order,is_storage) values (_org,wh,'Estante',3,false) returning id into lv_est;
  insert into public.location_levels(org_id,warehouse_id,name,sort_order,is_storage) values (_org,wh,'Posição',4,true) returning id into lv_pos;

  insert into public.locations(org_id,warehouse_id,level_id,code,name,pos_x,pos_y) values (_org,wh,lv_area,'EXT','Área Externa',0,0) returning id into a_ext;
  insert into public.locations(org_id,warehouse_id,level_id,code,name,pos_x,pos_y) values (_org,wh,lv_area,'INT','Área Interna',1,0) returning id into a_int;
  for i in 1..4 loop
    insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,pos_x,pos_y) values (_org,wh,a_ext,lv_unid,'EXT-C0'||i,'Container 0'||i,i-1,0) returning id into c;
    for j in 1..3 loop
      insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,capacity,capacity_unit,pos_x,pos_y,status)
      values (_org,wh,c,lv_pos,'EXT-C0'||i||'-P0'||j,'Posição 0'||j,500,'kg',j-1,0, case when i=4 and j=3 then 'bloqueado'::location_status when i=4 and j=2 then 'reservado'::location_status else 'disponivel'::location_status end)
      returning id into e; locs := locs || e;
    end loop;
  end loop;
  insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,pos_x,pos_y) values (_org,wh,a_ext,lv_unid,'EXT-PAT','Pátio',4,0) returning id into pat;
  for j in 1..3 loop
    insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,capacity,capacity_unit,pos_x,pos_y) values (_org,wh,pat,lv_pos,'EXT-PAT-B0'||j,'Baia 0'||j,20,'un',j-1,0) returning id into e; locs := locs || e;
  end loop;
  insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,pos_x,pos_y) values (_org,wh,a_int,lv_unid,'INT-FAB','Fábrica',0,0) returning id into fab;
  for i in 1..2 loop
    insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,pos_x,pos_y) values (_org,wh,fab,lv_est,'INT-FAB-E0'||i,'Estante 0'||i,i-1,0) returning id into e;
    for j in 1..3 loop
      insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,capacity,capacity_unit,pos_x,pos_y) values (_org,wh,e,lv_pos,'INT-FAB-E0'||i||'-N0'||j,'Nível 0'||j,200,'L',j-1,0) returning id into c; locs := locs || c;
    end loop;
  end loop;
  -- locs: 1..12 containers (kg), 13..15 pátio (un), 16..21 fábrica (L)

  insert into public.material_attributes(org_id,key,label,data_type) values (_org,'fornecedor','Fornecedor','text'),(_org,'classe_risco','Classe de risco','text');

  insert into public.materials(org_id,code,description,category,unit,barcode,min_stock,tracks_lot,attributes) values
   (_org,'MP-001','Resina acrílica base água (DEMO)','Matéria-prima','kg','7890000000011',300,true,'{"fornecedor":"Fornecedor Fictício A"}') returning id into e; m := m||e;
  insert into public.materials(org_id,code,description,category,unit,min_stock,tracks_lot) values (_org,'MP-002','Carbonato de cálcio (DEMO)','Matéria-prima','kg',500,false) returning id into e; m := m||e;
  insert into public.materials(org_id,code,description,category,unit,min_stock,tracks_lot,attributes) values (_org,'QM-010','Solvente industrial (DEMO)','Químicos','L',150,true,'{"classe_risco":"3"}') returning id into e; m := m||e;
  insert into public.materials(org_id,code,description,category,unit,min_stock) values (_org,'QM-011','Aditivo dispersante (DEMO)','Químicos','L',80) returning id into e; m := m||e;
  insert into public.materials(org_id,code,description,category,unit,min_stock) values (_org,'EM-100','Bombona plástica 50 L (DEMO)','Embalagens','un',40) returning id into e; m := m||e;
  insert into public.materials(org_id,code,description,category,unit,min_stock) values (_org,'EM-101','Palete de madeira PBR (DEMO)','Embalagens','un',10) returning id into e; m := m||e;
  insert into public.materials(org_id,code,description,category,unit,min_stock) values (_org,'MC-200','Luva nitrílica (caixa) (DEMO)','EPI','cx',20) returning id into e; m := m||e;
  insert into public.materials(org_id,code,description,category,unit,min_stock,status) values (_org,'MC-201','Fita de arquear (DEMO)','Consumo','rl',5,'inativo') returning id into e; m := m||e;

  d := now() - interval '28 days';
  perform public._apply_movement(_org,_user,'entrada',m[1],400,null,locs[1],'L2401','NF 1001 (fictícia)',null,null,null,d);
  perform public._apply_movement(_org,_user,'entrada',m[1],250,null,locs[2],'L2402','NF 1002 (fictícia)',null,null,null,d+interval '2 days');
  perform public._apply_movement(_org,_user,'entrada',m[2],350,null,locs[4],'','NF 1003 (fictícia)',null,null,null,d+interval '3 days');
  perform public._apply_movement(_org,_user,'entrada',m[3],180,null,locs[16],'S-77','NF 1004 (fictícia)',null,null,null,d+interval '5 days');
  perform public._apply_movement(_org,_user,'entrada',m[4],60,null,locs[17],'','NF 1005 (fictícia)',null,null,null,d+interval '6 days');
  perform public._apply_movement(_org,_user,'entrada',m[5],15,null,locs[13],'','NF 1006 (fictícia)',null,null,null,d+interval '8 days');
  perform public._apply_movement(_org,_user,'entrada',m[6],12,null,locs[14],'','NF 1007 (fictícia)',null,null,null,d+interval '9 days');
  perform public._apply_movement(_org,_user,'entrada',m[7],8,null,locs[19],'','NF 1008 (fictícia)',null,null,null,d+interval '10 days');
  perform public._apply_movement(_org,_user,'saida',m[1],120,locs[1],null,'L2401','OP 501 (fictícia)','Consumo produção',null,null,d+interval '12 days');
  perform public._apply_movement(_org,_user,'saida',m[2],80,locs[4],null,'','OP 502 (fictícia)','Consumo produção',null,null,d+interval '14 days');
  perform public._apply_movement(_org,_user,'transferencia',m[1],100,locs[2],locs[3],'L2402',null,'Reorganização',null,null,d+interval '16 days');
  perform public._apply_movement(_org,_user,'transferencia',m[3],40,locs[16],locs[18],'S-77',null,'Abastecimento linha',null,null,d+interval '18 days');
  perform public._apply_movement(_org,_user,'saida',m[3],30,locs[18],null,'S-77','OP 503 (fictícia)','Consumo produção',null,null,d+interval '21 days');
  perform public._apply_movement(_org,_user,'entrada',m[2],150,null,locs[5],'','NF 1009 (fictícia)',null,null,null,d+interval '23 days');
  perform public._apply_movement(_org,_user,'saida',m[5],6,locs[13],null,'','Pedido 7001 (fictício)','Expedição',null,null,d+interval '25 days');

  insert into public.inventory_counts(org_id,warehouse_id,description,created_by,created_at) values (_org,wh,'Inventário cíclico semanal (DEMO)',_user,d+interval '20 days') returning id into cnt;
  perform public._apply_adjustment(_org,_user,m[2],locs[4],'',265,'Divergência em contagem cíclica',cnt,d+interval '20 days');
  perform public._apply_adjustment(_org,_user,m[6],locs[14],'',12,'Contagem confere',cnt,d+interval '20 days');
  perform public._apply_adjustment(_org,_user,m[4],locs[17],'',57,'Avaria identificada',cnt,d+interval '26 days');

  insert into public.tasks(org_id,title,description,type,priority,status,assignee_id,due_at,material_id,location_id,created_by) values
   (_org,'Receber carga de resina','Conferir NF e lotes (fictício).','recebimento','alta','a_fazer',_user,now()+interval '1 day',m[1],locs[1],_user),
   (_org,'Separar pedido 7002','Separação para expedição (fictício).','separacao','urgente','em_andamento',_user,now()-interval '1 day',m[5],locs[13],_user),
   (_org,'Inventário Container 02','Contagem cíclica.','inventario','media','aguardando',null,now()+interval '3 days',null,locs[4],_user),
   (_org,'Transferir solvente para Estante 02','Abastecimento da linha.','transferencia','baixa','concluida',_user,now()-interval '2 days',m[3],locs[18],_user),
   (_org,'Conferir aditivo avariado','Verificar embalagens danificadas.','conferencia','alta','a_fazer',null,now()-interval '3 days',m[4],locs[17],_user);
end $$;

create or replace function public.create_organization(_name text, _with_demo boolean default false)
returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid; begin
  if auth.uid() is null then raise exception 'Não autenticado.'; end if;
  if (select count(*) from public.organization_members where user_id=auth.uid() and role='gestao') >= 5 then raise exception 'Limite de organizações atingido.'; end if;
  insert into public.organizations(name) values (trim(_name)) returning id into oid;
  insert into public.organization_members(org_id,user_id,role) values (oid,auth.uid(),'gestao');
  if _with_demo then perform public._seed_demo(oid, auth.uid()); end if;
  return oid;
end $$;

create or replace function public.load_demo_data(_org uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.has_org_role(_org,'gestao') then raise exception 'Sem permissão.'; end if;
  if exists (select 1 from public.warehouses where org_id=_org) or exists (select 1 from public.materials where org_id=_org) then
    raise exception 'A organização já possui dados. Dados demonstrativos só podem ser carregados em organizações vazias.'; end if;
  perform public._seed_demo(_org, auth.uid());
end $$;

-- ============ EXECUTE PRIVILEGES ============
revoke execute on all functions in schema public from public, anon;
revoke execute on function public._seed_demo(uuid,uuid), public._apply_movement(uuid,uuid,public.movement_type,uuid,numeric,uuid,uuid,text,text,text,text,uuid,timestamptz,uuid),
  public._apply_adjustment(uuid,uuid,uuid,uuid,text,numeric,text,uuid,timestamptz), public._check_location(uuid,uuid,boolean),
  public.audit_trigger(), public.handle_new_user() from authenticated;
grant execute on function public.is_org_member(uuid), public.has_org_role(uuid,public.app_role), public.register_movement(uuid,public.movement_type,uuid,numeric,uuid,uuid,text,text,text,uuid),
  public.reverse_movement(uuid,text), public.register_adjustment(uuid,uuid,uuid,text,numeric,text,uuid), public.add_member_by_email(uuid,text,public.app_role),
  public.set_member_role(uuid,public.app_role), public.remove_member(uuid), public.create_organization(text,boolean), public.load_demo_data(uuid) to authenticated;
