-- Keep demo seed movements compatible with storage capacity rules.
-- Make fictitious inventory accuracy deterministic: never create a phantom balance
-- on whichever material happens to sort first.
begin;

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
      insert into public.locations(org_id,warehouse_id,parent_id,level_id,code,name,capacity,capacity_unit,pos_x,pos_y) values (_org,wh,e,lv_pos,'INT-FAB-E0'||i||'-N0'||j,'Nível 0'||j,200,case when i = 2 and j = 1 then 'cx' else 'L' end,j-1,0) returning id into c; locs := locs || c;
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
      select m.id as material_id,
             m.code as material_code,
             l.id as location_id,
             l.code as location_code,
             coalesce(
               pl.lot,
               case when m.tracks_lot then
                 'DEMO-' || replace(m.code, '-', '') || '-' || replace(l.code, '-', '')
               else '' end
             ) as lot,
             case
               when m.code = 'MP-001' and l.code = 'EXT-C01-P01' then 0
               else 1
             end as fixture_priority
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
         and m.code in ('MP-001','MP-002','QM-010','QM-011','EM-100','EM-101','MC-200')
         and l.org_id = _org and l.warehouse_id = v_warehouse and l.active
         and not exists (select 1 from public.locations child where child.parent_id = l.id)
       order by fixture_priority, m.code, l.code
       limit 40
    )
    select material_id, material_code, location_id, location_code, lot
      from candidates
     order by fixture_priority, material_code, location_code
  loop
    select coalesce((
      select b.quantity from public.inventory_balances b
       where b.org_id = _org
         and b.material_id = v_item.material_id
         and b.location_id = v_item.location_id
         and b.lot = v_item.lot
    ), 0) into v_expected;

    v_counted := v_expected;
    if v_item.material_code = 'MP-001'
       and v_item.location_code = 'EXT-C01-P01'
       and v_item.lot = 'L2401' then
      if v_expected <= 0 then
        raise exception 'A posição demonstrativa MP-001 / EXT-C01-P01 / L2401 precisa ter saldo positivo; a divergência não foi criada.';
      end if;
      v_counted := v_expected - 1;
      v_divergence_created := true;
    end if;

    perform public._apply_adjustment(
      _org, _user, v_item.material_id, v_item.location_id, v_item.lot,
      v_counted,
      case when v_counted <> v_expected
        then 'Divergência demonstrativa fictícia de 1 unidade'
        else 'Conferência demonstrativa sem divergência'
      end,
      v_count, now()
    );
  end loop;

  select count(*) into v_line_count
    from public.inventory_count_items where count_id = v_count;
  if v_line_count <> 40 or not v_divergence_created then
    raise exception 'Não foi possível gerar o inventário demonstrativo: linhas geradas %, divergência-alvo encontrada %.',
      v_line_count, v_divergence_created;
  end if;

  update public.inventory_counts
     set status = 'concluido', completed_at = now()
   where id = v_count;
end;
$$;

-- Retain the same invariant in the retired shared-demo helper. It remains
-- service_role-only and is not used by isolated visitor workspaces.
create or replace function public.ensure_demo_inventory_accuracy(_org uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role_claim text;
  v_warehouse uuid;
  v_user uuid;
  v_count uuid;
  v_line_count integer;
  v_item record;
  v_expected numeric;
  v_counted numeric;
  v_divergence_created boolean := false;
  v_description text := 'Inventário demonstrativo — conferência inicial (dados fictícios)';
begin
  v_role_claim := coalesce(
    auth.jwt() ->> 'role',
    current_setting('request.jwt.claim.role', true),
    ''
  );
  if v_role_claim <> 'service_role' then
    raise exception 'Esta função está disponível apenas para o serviço de provisionamento.';
  end if;

  perform pg_advisory_xact_lock(hashtext(_org::text)::bigint);

  if not exists (
    select 1
      from public.demo_workspace_registry
     where singleton = true
       and org_id = _org
  ) then
    raise exception 'A organização informada não é o ambiente oficial de demonstração.';
  end if;

  select w.id
    into v_warehouse
    from public.warehouses w
   where w.org_id = _org
     and w.active
   order by (w.code = 'CD01') desc, w.created_at
   limit 1;

  if v_warehouse is null then
    raise exception 'O ambiente demonstrativo ainda não possui um armazém ativo.';
  end if;

  select om.user_id
    into v_user
    from public.organization_members om
   where om.org_id = _org
     and om.role = 'gestao'
   order by om.created_at
   limit 1;

  if v_user is null then
    raise exception 'O ambiente demonstrativo ainda não possui um perfil de Gestão.';
  end if;

  select ic.id
    into v_count
    from public.inventory_counts ic
   where ic.org_id = _org
     and (
       ic.description = v_description
       or ic.description like v_description || ' — revisão%'
     )
     and ic.status = 'concluido'
   order by ic.completed_at desc nulls last, ic.created_at desc
   limit 1;

  if v_count is not null then
    select count(*)
      into v_line_count
      from public.inventory_count_items
     where count_id = v_count;

    if v_line_count = 40 then
      return;
    end if;
  end if;

  -- Use a new versioned label if a previous incomplete demonstration attempt
  -- exists; historical rows are never deleted or overwritten.
  if exists (
    select 1
      from public.inventory_counts
     where org_id = _org
       and description = v_description
  ) then
    v_description := v_description || ' — revisão';
  end if;

  insert into public.inventory_counts(
    org_id, warehouse_id, description, created_by, status, completed_at
  )
  values (
    _org, v_warehouse, v_description, v_user, 'em_andamento', null
  )
  returning id into v_count;

  for v_item in
    with position_lots as (
      select b.material_id, b.location_id,
             (array_agg(b.lot order by b.quantity desc, b.lot))[1] as lot
        from public.inventory_balances b
       where b.org_id = _org
         and b.quantity > 0
       group by b.material_id, b.location_id
    ),
    candidates as (
      select m.id as material_id,
             m.code as material_code,
             l.id as location_id,
             l.code as location_code,
             coalesce(
               pl.lot,
               case
                 when m.tracks_lot then 'DEMO-' || replace(m.code, '-', '') || '-' || replace(l.code, '-', '')
                 else ''
               end
             ) as lot
        from public.materials m
        cross join public.locations l
        join public.location_levels lv
          on lv.id = l.level_id
         and lv.org_id = l.org_id
         and lv.warehouse_id = l.warehouse_id
         and lv.is_storage
        join public.warehouses wh
          on wh.id = l.warehouse_id
         and wh.org_id = l.org_id
         and wh.active
        left join position_lots pl
          on pl.material_id = m.id
         and pl.location_id = l.id
       where m.org_id = _org
         and m.status = 'ativo'
         and l.org_id = _org
         and l.warehouse_id = v_warehouse
         and l.active
         and not exists (
           select 1
             from public.locations child
            where child.parent_id = l.id
         )
       order by case when m.code = 'MP-001' and l.code = 'EXT-C01-P01' then 0 else 1 end, m.code, l.code
       limit 40
    )
    select material_id, material_code, location_id, location_code, lot
      from candidates
     order by material_code, location_code
  loop
    select coalesce((
      select b.quantity
        from public.inventory_balances b
       where b.org_id = _org
         and b.material_id = v_item.material_id
         and b.location_id = v_item.location_id
         and b.lot = v_item.lot
    ), 0)
    into v_expected;

    v_counted := v_expected;
    if v_item.material_code = 'MP-001'
       and v_item.location_code = 'EXT-C01-P01'
       and v_item.lot = 'L2401' then
      if v_expected <= 0 then
        raise exception 'A posição demonstrativa MP-001 / EXT-C01-P01 / L2401 precisa ter saldo positivo; a divergência não foi criada.';
      end if;
      v_counted := v_expected - 1;
      v_divergence_created := true;
    end if;

    perform public._apply_adjustment(
      _org,
      v_user,
      v_item.material_id,
      v_item.location_id,
      v_item.lot,
      v_counted,
      case
        when v_counted <> v_expected then 'Divergência demonstrativa fictícia'
        else 'Conferência demonstrativa sem divergência'
      end,
      v_count,
      now()
    );
  end loop;

  select count(*)
    into v_line_count
    from public.inventory_count_items
   where count_id = v_count;

  if v_line_count <> 40 or not v_divergence_created then
    raise exception 'Não foi possível gerar o inventário demonstrativo: linhas geradas %, divergência-alvo encontrada %.', v_line_count, v_divergence_created;
  end if;

  update public.inventory_counts
     set status = 'concluido',
         completed_at = now()
   where id = v_count;
end;
$$;

revoke all on function public.ensure_demo_inventory_accuracy(uuid)
  from public, anon, authenticated;
grant execute on function public.ensure_demo_inventory_accuracy(uuid)
  to service_role;

commit;
