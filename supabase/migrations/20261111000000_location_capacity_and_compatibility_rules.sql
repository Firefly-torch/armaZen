-- Enforce location capacity and material compatibility at the database boundary.
-- Unknown capacity remains explicitly unknown; it is never reported as 0% free.
begin;

alter table public.locations
  add column if not exists allow_mixed_materials boolean not null default true,
  add column if not exists allowed_categories text[] not null default '{}'::text[];

comment on column public.locations.allow_mixed_materials is
  'Whether a storage position may contain balances for more than one material.';
comment on column public.locations.allowed_categories is
  'Allowed material categories; an empty array means all categories are accepted.';

-- Reject a capacity configuration that cannot be measured.
create or replace function public.validate_location_allocation_configuration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity_unit text;
  v_current_quantity numeric := 0;
begin
  v_capacity_unit := lower(nullif(trim(new.capacity_unit), ''));

  if new.allowed_categories is null then
    new.allowed_categories := '{}'::text[];
  end if;

  if new.capacity is not null then
    if not exists (
      select 1
        from public.location_levels lv
       where lv.id = new.level_id
         and lv.org_id = new.org_id
         and lv.warehouse_id = new.warehouse_id
         and lv.is_storage
    ) or exists (
      select 1
        from public.locations child
       where child.parent_id = new.id
    ) then
      raise exception 'A capacidade deve ser configurada em uma posição final de armazenagem, não em um endereço estrutural.';
    end if;

    if new.capacity <= 0 then
      raise exception 'A capacidade máxima precisa ser maior que zero.';
    end if;
    if v_capacity_unit is null then
      raise exception 'Informe a unidade da capacidade para que o limite possa ser validado.';
    end if;
  end if;

  if not new.allow_mixed_materials and exists (
    select 1
      from public.inventory_balances b
     where b.org_id = new.org_id
       and b.location_id = new.id
       and b.quantity > 0
     group by b.location_id
    having count(distinct b.material_id) > 1
  ) then
    raise exception 'O endereço já contém mais de um material. Regularize os saldos antes de proibir materiais mistos.';
  end if;

  if cardinality(new.allowed_categories) > 0 and exists (
    select 1
      from public.inventory_balances b
      join public.materials m
        on m.id = b.material_id
       and m.org_id = b.org_id
     where b.org_id = new.org_id
       and b.location_id = new.id
       and b.quantity > 0
       and not exists (
         select 1
           from unnest(new.allowed_categories) as allowed(category)
          where lower(trim(allowed.category)) = lower(trim(m.category))
       )
  ) then
    raise exception 'O endereço contém saldo de uma categoria que não está na nova lista de categorias permitidas.';
  end if;

  if new.capacity is not null then
    if exists (
      select 1
        from public.inventory_balances b
        join public.materials m
          on m.id = b.material_id
         and m.org_id = b.org_id
       where b.org_id = new.org_id
         and b.location_id = new.id
         and b.quantity > 0
         and lower(trim(m.unit)) <> v_capacity_unit
    ) then
      raise exception 'Há saldo com unidade incompatível. A capacidade não pode ser aplicada até os saldos serem conferidos.';
    end if;

    select coalesce(sum(b.quantity), 0)
      into v_current_quantity
      from public.inventory_balances b
     where b.org_id = new.org_id
       and b.location_id = new.id
       and b.quantity > 0;

    if v_current_quantity > new.capacity then
      raise exception 'A capacidade informada é menor que o saldo atual (% %). Ajuste a capacidade ou regularize o estoque antes de salvar.',
        v_current_quantity, new.capacity_unit;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists locations_allocation_configuration_guard on public.locations;
create trigger locations_allocation_configuration_guard
before insert or update of capacity, capacity_unit, allow_mixed_materials, allowed_categories
on public.locations
for each row
execute function public.validate_location_allocation_configuration();

-- Serialize new allocations per destination row, then validate the projected
-- position total. This avoids two simultaneous receipts consuming the same
-- remaining capacity.
create or replace function public.enforce_inventory_location_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location record;
  v_material record;
  v_capacity_unit text;
  v_other_quantity numeric := 0;
  v_incompatible_unit boolean := false;
  v_other_material boolean := false;
begin
  -- This transaction-local flag is set only by trusted security-definer
  -- routines for physical counts, reversals, and ledger reconstruction.
  if current_setting('armazen.skip_location_allocation_rules', true) = 'on' then
    return new;
  end if;

  if new.quantity <= 0 then
    return new;
  end if;

  -- Decreases do not consume capacity. Moving a row or changing its material
  -- still requires full validation at the new destination.
  if tg_op = 'UPDATE'
     and new.location_id = old.location_id
     and new.material_id = old.material_id
     and new.quantity <= old.quantity then
    return new;
  end if;

  select l.id, l.org_id, l.capacity, l.capacity_unit,
         l.allow_mixed_materials, l.allowed_categories, l.status
    into v_location
    from public.locations l
   where l.id = new.location_id
     and l.org_id = new.org_id
   for update;

  if v_location.id is null then
    raise exception 'O endereço de destino não pertence à organização informada.';
  end if;

  select m.id, m.category, m.unit
    into v_material
    from public.materials m
   where m.id = new.material_id
     and m.org_id = new.org_id;

  if v_material.id is null then
    raise exception 'O material não pertence à organização informada.';
  end if;

  if v_location.status = 'bloqueado' then
    raise exception 'O endereço "%" está bloqueado para novas alocações.', v_location.id;
  end if;

  if cardinality(coalesce(v_location.allowed_categories, '{}'::text[])) > 0
     and not exists (
       select 1
         from unnest(v_location.allowed_categories) as allowed(category)
        where lower(trim(allowed.category)) = lower(trim(v_material.category))
     ) then
    raise exception 'A categoria "%" não é permitida no endereço de destino.', v_material.category;
  end if;

  v_capacity_unit := lower(nullif(trim(v_location.capacity_unit), ''));

  if not coalesce(v_location.allow_mixed_materials, true) then
    if tg_op = 'UPDATE' then
      if old.location_id = new.location_id then
        select exists (
          select 1
            from public.inventory_balances b
           where b.org_id = new.org_id
             and b.location_id = new.location_id
             and b.quantity > 0
             and b.material_id <> new.material_id
             and not (b.material_id = old.material_id and b.lot = old.lot)
        ) into v_other_material;
      else
        select exists (
          select 1
            from public.inventory_balances b
           where b.org_id = new.org_id
             and b.location_id = new.location_id
             and b.quantity > 0
             and b.material_id <> new.material_id
        ) into v_other_material;
      end if;
    else
      select exists (
        select 1
          from public.inventory_balances b
         where b.org_id = new.org_id
           and b.location_id = new.location_id
           and b.quantity > 0
           and b.material_id <> new.material_id
      ) into v_other_material;
    end if;

    if v_other_material then
      raise exception 'O endereço está configurado para armazenar um único material e já contém outro material.';
    end if;
  end if;

  -- No configured maximum means unknown capacity, not an empty/free slot.
  -- The movement may proceed, but the map must keep occupancy indeterminate.
  if v_location.capacity is null then
    return new;
  end if;

  if v_capacity_unit is null then
    raise exception 'A capacidade deste endereço não possui unidade cadastrada. Corrija o cadastro antes de alocar estoque.';
  end if;

  if lower(trim(v_material.unit)) <> v_capacity_unit then
    raise exception 'Unidade incompatível: o endereço mede capacidade em "%" e o material utiliza "%". Não há conversão automática.',
      v_location.capacity_unit, v_material.unit;
  end if;

  if tg_op = 'UPDATE' then
    if old.location_id = new.location_id then
      -- Exclude the row being replaced, including when the material/lot changes.
      select
        coalesce(sum(b.quantity), 0),
        coalesce(bool_or(lower(trim(m.unit)) <> v_capacity_unit), false)
        into v_other_quantity, v_incompatible_unit
        from public.inventory_balances b
        join public.materials m
          on m.id = b.material_id
         and m.org_id = b.org_id
       where b.org_id = new.org_id
         and b.location_id = new.location_id
         and b.quantity > 0
         and not (b.material_id = old.material_id and b.lot = old.lot);
    else
      select
        coalesce(sum(b.quantity), 0),
        coalesce(bool_or(lower(trim(m.unit)) <> v_capacity_unit), false)
        into v_other_quantity, v_incompatible_unit
        from public.inventory_balances b
        join public.materials m
          on m.id = b.material_id
         and m.org_id = b.org_id
       where b.org_id = new.org_id
         and b.location_id = new.location_id
         and b.quantity > 0;
    end if;
  else
    -- _apply_movement uses INSERT ... ON CONFLICT DO UPDATE. The BEFORE
    -- INSERT trigger must exclude the conflicting key because NEW.quantity
    -- represents the incoming delta, not the final accumulated row.
    select
      coalesce(sum(b.quantity), 0),
      coalesce(bool_or(lower(trim(m.unit)) <> v_capacity_unit), false)
      into v_other_quantity, v_incompatible_unit
      from public.inventory_balances b
      join public.materials m
        on m.id = b.material_id
       and m.org_id = b.org_id
     where b.org_id = new.org_id
       and b.location_id = new.location_id
       and b.quantity > 0
       and not (b.material_id = new.material_id and b.lot = new.lot);
  end if;

  if v_incompatible_unit then
    raise exception 'O endereço já possui saldo em unidade incompatível com sua capacidade. Confira os saldos antes de receber mais materiais.';
  end if;

  if v_other_quantity + new.quantity > v_location.capacity then
    raise exception 'Capacidade excedida no endereço: ocupação projetada % % para um limite de % %.',
      v_other_quantity + new.quantity, v_location.capacity_unit,
      v_location.capacity, v_location.capacity_unit;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_balances_location_rules_guard on public.inventory_balances;
create trigger inventory_balances_location_rules_guard
before insert or update of material_id, location_id, lot, quantity
on public.inventory_balances
for each row
execute function public.enforce_inventory_location_rules();

-- Prevent editing a material's unit/category so that its existing stored
-- balances silently violate a location's capacity or category policy.
create or replace function public.validate_material_location_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unit is distinct from old.unit and exists (
    select 1
      from public.inventory_balances b
      join public.locations l
        on l.id = b.location_id
       and l.org_id = b.org_id
     where b.org_id = new.org_id
       and b.material_id = new.id
       and b.quantity > 0
       and l.capacity is not null
       and lower(trim(new.unit)) <> lower(trim(l.capacity_unit))
  ) then
    raise exception 'A unidade não pode ser alterada: há saldo em endereços cuja capacidade depende da unidade atual.';
  end if;

  if new.category is distinct from old.category and exists (
    select 1
      from public.inventory_balances b
      join public.locations l
        on l.id = b.location_id
       and l.org_id = b.org_id
     where b.org_id = new.org_id
       and b.material_id = new.id
       and b.quantity > 0
       and cardinality(coalesce(l.allowed_categories, '{}'::text[])) > 0
       and not exists (
         select 1
           from unnest(l.allowed_categories) as allowed(category)
          where lower(trim(allowed.category)) = lower(trim(new.category))
       )
  ) then
    raise exception 'A categoria não pode ser alterada: há saldo em endereços que não permitem a nova categoria.';
  end if;

  return new;
end;
$$;

drop trigger if exists materials_location_rules_guard on public.materials;
create trigger materials_location_rules_guard
before update of unit, category on public.materials
for each row
execute function public.validate_material_location_rules();


-- Physical counts record observed reality, even when the current stock is
-- over capacity or violates a newly configured storage preference. This
-- bypass is transaction-local and is reachable only through trusted RPCs.
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
as $
declare
  v_previous_bypass text := coalesce(current_setting('armazen.skip_location_allocation_rules', true), '');
  v_result uuid;
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

  perform set_config('armazen.skip_location_allocation_rules', 'on', true);
  v_result := public._apply_adjustment(
    _org, auth.uid(), _material, _location, _lot, _counted, _reason, _count
  );
  perform set_config('armazen.skip_location_allocation_rules', v_previous_bypass, true);

  return v_result;
end;
$;

-- A reversal restores the original movement. It must remain possible when
-- the original destination is now blocked, full, or under different rules.
create or replace function public.reverse_movement(_movement uuid, _reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $
declare
  mv record;
  nid uuid;
  v_previous_bypass text := coalesce(current_setting('armazen.skip_location_allocation_rules', true), '');
begin
  select * into mv
    from public.stock_movements
   where id = _movement
   for update;

  if mv.id is null then raise exception 'Movimentação inexistente.'; end if;
  if not public.has_org_role(mv.org_id, 'operacao') then raise exception 'Sem permissão para estornar.'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  if mv.reversed_by is not null then raise exception 'Esta movimentação já foi estornada.'; end if;
  if mv.type = 'estorno' then raise exception 'Não é possível estornar um estorno.'; end if;

  perform set_config('armazen.skip_location_allocation_rules', 'on', true);
  nid := public._apply_movement(
    mv.org_id, auth.uid(), 'estorno', mv.material_id, mv.quantity,
    mv.to_location_id, mv.from_location_id, mv.lot,
    'Estorno #' || mv.number, null, _reason, null, now(), mv.id
  );
  perform set_config('armazen.skip_location_allocation_rules', v_previous_bypass, true);

  update public.stock_movements
     set reversed_by = nid
   where id = mv.id;

  return nid;
end;
$;

-- Rebuild is a historical reconstruction, not a new allocation. It is allowed
-- to restore balances exactly as the movement ledger records them; any
-- resulting over-capacity positions remain visible as exceptions on the map.
create or replace function public.reconcile_inventory_balances(
  _org uuid,
  _apply boolean default false
)
returns table (
  material_id uuid,
  location_id uuid,
  lot text,
  recorded_quantity numeric,
  ledger_quantity numeric,
  difference numeric
)
language plpgsql
security definer
set search_path = public
as $
declare
  v_previous_bypass text := coalesce(current_setting('armazen.skip_location_allocation_rules', true), '');
begin
  if not public.has_org_role(_org, 'gestao') then
    raise exception 'Somente Gestão pode conferir ou reconstruir saldos.';
  end if;

  perform pg_advisory_xact_lock(hashtext(_org::text)::bigint);

  if _apply then
    lock table public.inventory_balances in access exclusive mode;
  else
    lock table public.inventory_balances in share mode;
  end if;
  lock table public.stock_movements in share mode;

  if exists (
    select 1
      from public.inventory_balances b
      join public.materials m on m.id = b.material_id
      join public.locations l on l.id = b.location_id
     where b.org_id = _org
       and (m.org_id <> _org or l.org_id <> _org)
  ) then
    raise exception 'Há saldos vinculados a materiais ou endereços de outra organização. A reconstrução foi cancelada.';
  end if;

  if exists (
    select 1
      from public.stock_movements sm
     where sm.org_id = _org
       and (
         (sm.from_location_id is null and sm.to_location_id is null)
         or not exists (
           select 1 from public.materials m
            where m.id = sm.material_id and m.org_id = _org
         )
         or (
           sm.from_location_id is not null
           and not exists (
             select 1 from public.locations l
              where l.id = sm.from_location_id and l.org_id = _org
           )
         )
         or (
           sm.to_location_id is not null
           and not exists (
             select 1 from public.locations l
              where l.id = sm.to_location_id and l.org_id = _org
           )
         )
       )
  ) then
    raise exception 'Há movimentações com material ou endereço inválido. A reconstrução foi cancelada.';
  end if;

  if exists (
    with deltas as (
      select sm.material_id, sm.to_location_id as location_id,
             coalesce(sm.lot, '') as lot, sm.quantity as delta,
             sm.created_at, sm.number
        from public.stock_movements sm
       where sm.org_id = _org and sm.to_location_id is not null
      union all
      select sm.material_id, sm.from_location_id as location_id,
             coalesce(sm.lot, '') as lot, -sm.quantity as delta,
             sm.created_at, sm.number
        from public.stock_movements sm
       where sm.org_id = _org and sm.from_location_id is not null
    ),
    running as (
      select sum(delta) over (
        partition by material_id, location_id, lot
        order by created_at, number
        rows between unbounded preceding and current row
      ) as running_quantity
      from deltas
    )
    select 1 from running where running_quantity < 0
  ) then
    raise exception 'O histórico contém uma saída maior que o saldo acumulado em pelo menos uma posição/lote. Corrija o livro de movimentações antes de reconstruir.';
  end if;

  drop table if exists pg_temp.armazen_balance_reconcile_stage;

  create temporary table pg_temp.armazen_balance_reconcile_stage
  on commit drop
  as
  with deltas as (
    select sm.material_id, sm.to_location_id as location_id,
           coalesce(sm.lot, '') as lot, sm.quantity as delta
      from public.stock_movements sm
     where sm.org_id = _org and sm.to_location_id is not null
    union all
    select sm.material_id, sm.from_location_id as location_id,
           coalesce(sm.lot, '') as lot, -sm.quantity as delta
      from public.stock_movements sm
     where sm.org_id = _org and sm.from_location_id is not null
  ),
  ledger as (
    select d.material_id, d.location_id, d.lot,
           sum(d.delta) as ledger_quantity,
           count(*) as movement_count
      from deltas d
     group by d.material_id, d.location_id, d.lot
  ),
  all_keys as (
    select l.material_id, l.location_id, l.lot from ledger l
    union
    select b.material_id, b.location_id, b.lot
      from public.inventory_balances b
     where b.org_id = _org
  )
  select k.material_id,
         k.location_id,
         k.lot,
         coalesce(b.quantity, 0)::numeric as recorded_quantity,
         coalesce(l.ledger_quantity, 0)::numeric as ledger_quantity,
         (coalesce(l.ledger_quantity, 0) - coalesce(b.quantity, 0))::numeric as difference,
         b.expiry_date,
         coalesce(l.movement_count, 0) > 0 as has_movement
    from all_keys k
    left join public.inventory_balances b
      on b.org_id = _org
     and b.material_id = k.material_id
     and b.location_id = k.location_id
     and b.lot = k.lot
    left join ledger l
      on l.material_id = k.material_id
     and l.location_id = k.location_id
     and l.lot = k.lot;

  if _apply then
    if exists (
      select 1
        from pg_temp.armazen_balance_reconcile_stage s
       where s.recorded_quantity > 0
         and not s.has_movement
    ) then
      raise exception 'Existem saldos positivos sem movimentação correspondente. A reconstrução foi cancelada para evitar apagar estoque sem rastreabilidade.';
    end if;

    perform set_config('armazen.skip_location_allocation_rules', 'on', true);
    delete from public.inventory_balances
     where org_id = _org;

    insert into public.inventory_balances(
      org_id, material_id, location_id, lot, expiry_date, quantity
    )
    select _org, s.material_id, s.location_id, s.lot,
           s.expiry_date, s.ledger_quantity
      from pg_temp.armazen_balance_reconcile_stage s
     where s.ledger_quantity > 0;

    perform set_config('armazen.skip_location_allocation_rules', v_previous_bypass, true);
  end if;

  return query
  select s.material_id, s.location_id, s.lot,
         s.recorded_quantity, s.ledger_quantity, s.difference
    from pg_temp.armazen_balance_reconcile_stage s
   where abs(s.difference) > 0.0005
   order by s.material_id, s.location_id, s.lot;
end;
$;

revoke all on function public.reconcile_inventory_balances(uuid, boolean)
  from public, anon;
grant execute on function public.reconcile_inventory_balances(uuid, boolean)
  to authenticated;

revoke all on function public.reverse_movement(uuid, text)
  from public, anon;
grant execute on function public.reverse_movement(uuid, text)
  to authenticated;

revoke all on function public.register_adjustment(uuid, uuid, uuid, text, numeric, text, uuid)
  from public, anon;
grant execute on function public.register_adjustment(uuid, uuid, uuid, text, numeric, text, uuid)
  to authenticated;

commit;
