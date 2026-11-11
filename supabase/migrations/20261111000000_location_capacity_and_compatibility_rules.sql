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
  v_capacity_unit text := lower(nullif(trim(new.capacity_unit), ''));
  v_current_quantity numeric := 0;
begin
  if new.allowed_categories is null then
    new.allowed_categories := '{}'::text[];
  end if;

  if new.capacity is not null then
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

  -- A blocked location may receive a traceable reversal to restore the
  -- original movement. Normal movement entry is already rejected by
  -- _check_location before this balance write.
  if v_location.status = 'bloqueado' then
    return new;
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
    if tg_op = 'UPDATE' and old.location_id = new.location_id then
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

  if tg_op = 'UPDATE' and old.location_id = new.location_id then
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

commit;
