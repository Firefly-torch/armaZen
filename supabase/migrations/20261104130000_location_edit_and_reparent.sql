-- Allow routine edits to legacy structural addresses and support safe reparenting.
-- Direct legacy balances remain classified for review; they do not block hierarchy changes.

begin;

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
  hierarchy_changed boolean;
  level_changed boolean;
begin
  if tg_op = 'INSERT' then
    hierarchy_changed := true;
    level_changed := true;
  else
    hierarchy_changed := new.parent_id is distinct from old.parent_id;
    level_changed := new.level_id is distinct from old.level_id;
  end if;

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
    if hierarchy_changed then
      if not p.parent_active or not p.warehouse_active then
        raise exception 'O endereço pai e seu armazém precisam estar ativos.';
      end if;

      if p.is_storage then
        raise exception 'Uma posição de armazenagem não pode receber subendereços. Use um nível estrutural como endereço pai.';
      end if;

      -- Existing direct balances remain visible as legacy stock for review.
      -- They do not turn a structural parent into an allocatable position and
      -- must not prevent an operator from correcting the address hierarchy.
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

  if has_children and level_changed and exists (
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
