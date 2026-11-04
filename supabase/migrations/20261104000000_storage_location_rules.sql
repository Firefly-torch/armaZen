-- Enforce final storage positions for new stock allocations while preserving
-- legacy balances and allowing controlled withdrawals / reversals.

begin;

create or replace function public.is_storage_location(_org uuid, _loc uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.locations l
    join public.location_levels lv
      on lv.id = l.level_id
     and lv.warehouse_id = l.warehouse_id
     and lv.org_id = l.org_id
    join public.warehouses w
      on w.id = l.warehouse_id
     and w.org_id = l.org_id
    where l.id = _loc
      and l.org_id = _org
      and l.active
      and w.active
      and lv.is_storage
      and not exists (
        select 1
        from public.locations child
        where child.parent_id = l.id
      )
  );
$$;

revoke all on function public.is_storage_location(uuid, uuid) from public, anon, authenticated;

create or replace function public._check_location(
  _org uuid,
  _loc uuid,
  _for_allocation boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  select l1.*, w.active as wh_active
    into l
    from public.locations l1
    join public.warehouses w on w.id = l1.warehouse_id
   where l1.id = _loc;

  if l.id is null or l.org_id <> _org then
    raise exception 'Endereço inexistente.';
  end if;

  if not l.active or not l.wh_active then
    raise exception 'Endereço % está inativo.', l.code;
  end if;

  if _for_allocation then
    if l.status = 'bloqueado' then
      raise exception 'Endereço % está bloqueado para novas alocações.', l.code;
    end if;

    if not public.is_storage_location(_org, _loc) then
      raise exception 'Endereço % não é uma posição final de armazenagem válida.', l.code;
    end if;
  end if;
end;
$$;

-- Replace the movement routine so that new destinations must be valid storage
-- positions. Estornos are allowed to restore stock to the original address,
-- even if that legacy address is now classified as structural.
create or replace function public._apply_movement(
  _org uuid,
  _user uuid,
  _type public.movement_type,
  _material uuid,
  _qty numeric,
  _from uuid,
  _to uuid,
  _lot text,
  _reference text,
  _notes text,
  _reason text,
  _request uuid,
  _at timestamptz default now(),
  _reversal_of uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  bal numeric;
  mid uuid;
  v_lot text := coalesce(trim(_lot), '');
begin
  if _request is not null then
    select id into mid
      from public.stock_movements
     where request_id = _request;
    if mid is not null then
      return mid;
    end if;
  end if;

  if _qty is null or _qty <= 0 then
    raise exception 'A quantidade deve ser maior que zero.';
  end if;

  select * into m
    from public.materials
   where id = _material;

  if m.id is null or m.org_id <> _org then
    raise exception 'Material inexistente.';
  end if;
  if m.status <> 'ativo' and _type <> 'estorno' then
    raise exception 'Material % está inativo.', m.code;
  end if;
  if m.tracks_lot and v_lot = '' and _type <> 'estorno' and (
    _type not in ('saida', 'transferencia')
    or _from is null
    or not exists (
      select 1
        from public.inventory_balances legacy_balance
       where legacy_balance.material_id = _material
         and legacy_balance.location_id = _from
         and legacy_balance.lot = ''
         and legacy_balance.quantity >= _qty
    )
  ) then
    raise exception 'O material % exige identificação de lote para novas entradas. Estoque legado sem lote pode ser retirado ou transferido a partir de sua posição atual.', m.code;
  end if;

  if _type in ('saida', 'transferencia')
     or (_type = 'estorno' and _from is not null) then
    if _from is null then
      raise exception 'Informe o endereço de origem.';
    end if;

    perform public._check_location(_org, _from, false);

    select quantity into bal
      from public.inventory_balances
     where material_id = _material
       and location_id = _from
       and inventory_balances.lot = v_lot
     for update;

    if coalesce(bal, 0) < _qty then
      raise exception 'Quantidade insuficiente: saldo disponível % %.', coalesce(bal, 0), m.unit;
    end if;

    update public.inventory_balances
       set quantity = quantity - _qty,
           updated_at = now()
     where material_id = _material
       and location_id = _from
       and inventory_balances.lot = v_lot;

    delete from public.inventory_balances
     where material_id = _material
       and location_id = _from
       and inventory_balances.lot = v_lot
       and quantity = 0;
  end if;

  if _type in ('entrada', 'transferencia')
     or (_type = 'estorno' and _to is not null) then
    if _to is null then
      raise exception 'Informe o endereço de destino.';
    end if;
    if _type = 'transferencia' and _to = _from then
      raise exception 'Origem e destino devem ser diferentes.';
    end if;

    perform public._check_location(_org, _to, _type <> 'estorno');

    insert into public.inventory_balances(
      org_id, material_id, location_id, lot, quantity
    )
    values (_org, _material, _to, v_lot, _qty)
    on conflict (material_id, location_id, lot)
    do update
      set quantity = public.inventory_balances.quantity + excluded.quantity,
          updated_at = now();
  end if;

  insert into public.stock_movements(
    org_id, type, material_id, quantity, from_location_id, to_location_id,
    lot, reference, notes, reason, request_id, user_id, created_at, reversal_of
  )
  values (
    _org, _type, _material, _qty, _from, _to, v_lot,
    nullif(trim(_reference), ''), nullif(trim(_notes), ''),
    nullif(trim(_reason), ''), _request, _user, _at, _reversal_of
  )
  returning id into mid;

  return mid;
end;
$$;

-- Counts can still inspect a blocked final position, but may not create or
-- adjust balances on parent/non-storage/inactive locations.
create or replace function public.register_adjustment(
  _org uuid,
  _material uuid,
  _location uuid,
  _lot text,
  _counted numeric,
  _reason text,
  _count uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_org_role(_org, 'operacao') then
    raise exception 'Sem permissão para registrar ajustes.';
  end if;

  if exists (
    select 1
      from public.materials m
     where m.id = _material
       and m.org_id = _org
       and m.tracks_lot
  ) and coalesce(trim(_lot), '') = '' and not exists (
    select 1
      from public.inventory_balances legacy_balance
     where legacy_balance.material_id = _material
       and legacy_balance.location_id = _location
       and legacy_balance.lot = ''
       and legacy_balance.quantity > 0
  ) then
    raise exception 'Este material exige identificação de lote. Saldo legado sem lote pode ser contado na posição em que já está registrado.';
  end if;

  if not public.is_storage_location(_org, _location) then
    raise exception 'A contagem deve ser registrada em uma posição final de armazenagem ativa.';
  end if;

  return public._apply_adjustment(
    _org, auth.uid(), _material, _location, _lot, _counted, _reason, _count
  );
end;
$$;

-- A parent must be structural (non-storage), belong to the same organization,
-- and must not contain a balance before it becomes a parent.
create or replace function public.locations_validate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p record;
  parent_cursor uuid;
  depth int := 0;
  has_children boolean;
begin
  if new.parent_id is not null then
    select l.warehouse_id, l.org_id, lv.is_storage,
           l.active as parent_active, w.active as warehouse_active
      into p
      from public.locations l
      join public.location_levels lv
        on lv.id = l.level_id
       and lv.warehouse_id = l.warehouse_id
       and lv.org_id = l.org_id
      join public.warehouses w
        on w.id = l.warehouse_id
       and w.org_id = l.org_id
     where l.id = new.parent_id;

    if p.warehouse_id is null
       or p.warehouse_id is distinct from new.warehouse_id
       or p.org_id is distinct from new.org_id then
      raise exception 'O endereço pai deve pertencer à mesma organização e ao mesmo armazém.';
    end if;

    -- Validate active/structural parent and direct stock only when the
    -- hierarchy is created or changed. This avoids blocking routine edits to
    -- legacy child locations whose parent needs later cleanup.
    if tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id then
      if not p.parent_active or not p.warehouse_active then
        raise exception 'O endereço pai e seu armazém precisam estar ativos.';
      end if;

      if p.is_storage then
        raise exception 'Uma posição de armazenagem não pode receber subendereços. Use um nível estrutural como endereço pai.';
      end if;

      if exists (
        select 1
          from public.inventory_balances b
         where b.location_id = new.parent_id
           and b.org_id = new.org_id
           and b.quantity > 0
      ) then
        raise exception 'O endereço pai possui saldo direto. Transfira o estoque para uma posição final antes de criar subendereços.';
      end if;
    end if;

    parent_cursor := new.parent_id;
    while parent_cursor is not null loop
      if parent_cursor = new.id then
        raise exception 'Hierarquia inválida: referência circular.';
      end if;
      select parent_id into parent_cursor
        from public.locations
       where id = parent_cursor;
      depth := depth + 1;
      if depth > 20 then
        raise exception 'Hierarquia muito profunda (máx. 20 níveis).';
      end if;
    end loop;
  end if;

  select exists (
    select 1 from public.locations child where child.parent_id = new.id
  ) into has_children;

  if has_children and exists (
    select 1
      from public.location_levels lv
     where lv.id = new.level_id
       and lv.is_storage
  ) then
    raise exception 'Um endereço com subendereços deve usar um nível estrutural, não um nível de armazenagem.';
  end if;

  if not exists (
    select 1
      from public.location_levels
     where id = new.level_id
       and warehouse_id = new.warehouse_id
       and org_id = new.org_id
  ) then
    raise exception 'Tipo de nível inválido para este armazém.';
  end if;

  if not exists (
    select 1
      from public.warehouses
     where id = new.warehouse_id
       and org_id = new.org_id
       and active
  ) then
    raise exception 'Armazém inválido ou inativo.';
  end if;

  return new;
end;
$$;

commit;
