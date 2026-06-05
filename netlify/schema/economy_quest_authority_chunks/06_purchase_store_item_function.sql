create or replace function public.gridwild_purchase_store_item(
  p_player_id uuid,
  p_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item public.gridwild_store_items%rowtype;
  v_player public.players%rowtype;
  v_inventory public.player_inventory%rowtype;
begin
  select *
  into v_item
  from public.gridwild_store_items
  where item_id = p_item_id
    and is_active = true;

  if not found then
    raise exception 'Store item is not available.';
  end if;

  select *
  into v_player
  from public.players
  where id = p_player_id
  for update;

  if not found then
    raise exception 'Player not found.';
  end if;

  select *
  into v_inventory
  from public.player_inventory
  where player_id = p_player_id
    and item_id = p_item_id;

  if found then
    return jsonb_build_object(
      'already_owned', true,
      'price_paid', 0,
      'player', to_jsonb(v_player),
      'inventory_item', to_jsonb(v_inventory)
    );
  end if;

  if v_item.requires_achievement is not null and not exists (
    select 1
    from public.gridwild_verified_achievements
    where player_id = p_player_id
      and achievement_id = v_item.requires_achievement
      and unlocked = true
  ) then
    raise exception 'Required achievement is not unlocked.';
  end if;

  if coalesce(v_player.wildpoints, 0) < v_item.price then
    raise exception 'Not enough Wild Points.';
  end if;

  update public.players
  set wildpoints = coalesce(wildpoints, 0) - v_item.price
  where id = p_player_id
  returning * into v_player;

  insert into public.player_inventory (player_id, item_id)
  values (p_player_id, p_item_id)
  returning * into v_inventory;

  insert into public.gridwild_economy_ledger (
    player_id,
    wildpoints_delta,
    reason,
    reference_id,
    balance_after,
    metadata
  )
  values (
    p_player_id,
    -v_item.price,
    'store_purchase',
    p_item_id,
    coalesce(v_player.wildpoints, 0),
    jsonb_build_object('item_id', p_item_id)
  );

  return jsonb_build_object(
    'already_owned', false,
    'price_paid', v_item.price,
    'player', to_jsonb(v_player),
    'inventory_item', to_jsonb(v_inventory)
  );
end;
$$;

