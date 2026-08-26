-- ============================================================
-- ICEBREAKER GAME — SCHEMA
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ROOMS
-- ------------------------------------------------------------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  mode text not null check (mode in ('BLIND_NAVIGATOR', 'HIDDEN_SABOTEUR')),
  status text not null default 'LOBBY' check (status in ('LOBBY', 'ACTIVE', 'ENDED')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PLAYERS
-- ------------------------------------------------------------
create table players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  local_id text not null,
  name text not null,
  team_id text,
  is_board_mover boolean not null default false,
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (room_id, local_id)
);

-- ------------------------------------------------------------
-- MATCHES
-- ------------------------------------------------------------
create table matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  mode text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'COMPLETED')),
  saboteur_player_id uuid references players(id),
  target_revealed boolean not null default false,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- ------------------------------------------------------------
-- GAME STATES (one row per team in Blind Navigator, one row for Saboteur)
-- ------------------------------------------------------------
create table game_states (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id text not null, -- 'RED' | 'BLUE' | 'GREEN' | 'GOLD' | 'ALL'
  color text not null,
  player_order uuid[] not null default '{}',
  current_player_index int not null default 0,
  board_mover_id uuid references players(id),
  token jsonb not null,          -- {x,y}
  target jsonb not null,         -- {x,y}
  traps jsonb not null default '[]'::jsonb, -- [{x,y}, ...]
  start_position jsonb not null,
  stun_turns_remaining int not null default 0,
  moves_remaining int not null default 50,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','TARGET_FOUND','TIMEOUT','MOVE_DEPLETED')),
  finished_at_ms bigint,
  unique (match_id, team_id)
);

-- ------------------------------------------------------------
-- GAME EVENTS (immutable log, replay source of truth)
-- ------------------------------------------------------------
create table game_events (
  event_id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id text not null,
  sequence_number int not null,
  timestamp_ms bigint not null,
  player_id uuid not null references players(id),
  player_name text not null,
  direction text not null,
  effective_direction text not null,
  position_before jsonb not null,
  position_after jsonb not null,
  result text not null,
  trap_triggered boolean not null default false,
  boundary_strike boolean not null default false,
  stunned boolean not null default false,
  move_consumed boolean not null default true,
  unique (match_id, team_id, sequence_number)
);

create index idx_players_room on players(room_id);
create index idx_matches_room on matches(room_id);
create index idx_game_states_match on game_states(match_id);
create index idx_game_events_match on game_events(match_id, team_id);

-- ------------------------------------------------------------
-- RLS — internal game, so permissive policies (no auth)
-- ------------------------------------------------------------
alter table rooms enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table game_states enable row level security;
alter table game_events enable row level security;

create policy "public read rooms" on rooms for select using (true);
create policy "public write rooms" on rooms for insert with check (true);
create policy "public update rooms" on rooms for update using (true);

create policy "public read players" on players for select using (true);
create policy "public write players" on players for insert with check (true);
create policy "public update players" on players for update using (true);

create policy "public read matches" on matches for select using (true);
create policy "public write matches" on matches for insert with check (true);
create policy "public update matches" on matches for update using (true);

create policy "public read game_states" on game_states for select using (true);
create policy "public write game_states" on game_states for insert with check (true);
create policy "public update game_states" on game_states for update using (true);

create policy "public read game_events" on game_events for select using (true);
create policy "public write game_events" on game_events for insert with check (true);

-- ------------------------------------------------------------
-- AUTHORITATIVE MOVE RPC
-- Mirrors game/gameEngine.ts resolveMove() exactly.
-- ------------------------------------------------------------
create or replace function make_move(
  p_match_id uuid,
  p_team_id text,
  p_player_id uuid,
  p_direction text
) returns jsonb
language plpgsql
security definer
as $$
declare
  v_state game_states%rowtype;
  v_match matches%rowtype;
  v_player players%rowtype;
  v_grid_size int;
  v_glitch_active boolean;
  v_elapsed_s bigint;
  v_cycle_pos bigint;
  v_eff_dir text;
  v_flip jsonb := '{"UP":"DOWN","DOWN":"UP","LEFT":"RIGHT","RIGHT":"LEFT"}'::jsonb;
  v_pos_before jsonb;
  v_proposed jsonb;
  v_result text;
  v_trap_triggered boolean := false;
  v_boundary boolean := false;
  v_stunned boolean := false;
  v_new_stun int := 0;
  v_traps jsonb;
  v_trap jsonb;
  v_seq int;
  v_now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into v_match from matches where id = p_match_id and status = 'ACTIVE';
  if not found then
    raise exception 'Match not active';
  end if;

  select * into v_player from players where id = p_player_id;
  if not found then
    raise exception 'Player not found';
  end if;

  select * into v_state from game_states where match_id = p_match_id and team_id = p_team_id
    for update; -- lock this team's row only; other teams unaffected
  if not found then
    raise exception 'Game state not found';
  end if;

  if v_state.status != 'ACTIVE' then
    raise exception 'Team already finished';
  end if;

  -- verify authority to move: Hidden Saboteur = current turn-holder moves themselves;
  -- Blind Navigator = the team's Board-Mover always executes (current_player_index is
  -- display-only, tracking whose *instruction* turn it is)
  if v_state.team_id = 'ALL' then
    if v_state.player_order[v_state.current_player_index + 1] != p_player_id then
      raise exception 'Not your turn';
    end if;
  else
    if v_state.board_mover_id is distinct from p_player_id then
      raise exception 'Not your turn';
    end if;
  end if;

  v_grid_size := (v_match.config->>'gridSize')::int;

  -- reverse glitch check
  if coalesce((v_match.config->>'reverseGlitchEnabled')::boolean, false) then
    v_elapsed_s := floor((v_now_ms - (extract(epoch from v_match.started_at) * 1000)::bigint) / 1000.0);
    v_cycle_pos := v_elapsed_s % 45;
    v_glitch_active := v_cycle_pos >= 30;
  else
    v_glitch_active := false;
  end if;

  v_eff_dir := case when v_glitch_active then v_flip->>p_direction else p_direction end;
  v_pos_before := v_state.token;

  if v_state.stun_turns_remaining > 0 then
    v_result := 'STUNNED_NO_MOVE';
    v_stunned := true;
    v_new_stun := v_state.stun_turns_remaining - 1;
    v_proposed := v_pos_before;
  else
    v_proposed := case v_eff_dir
      when 'UP' then jsonb_build_object('x', (v_pos_before->>'x')::int, 'y', (v_pos_before->>'y')::int - 1)
      when 'DOWN' then jsonb_build_object('x', (v_pos_before->>'x')::int, 'y', (v_pos_before->>'y')::int + 1)
      when 'LEFT' then jsonb_build_object('x', (v_pos_before->>'x')::int - 1, 'y', (v_pos_before->>'y')::int)
      when 'RIGHT' then jsonb_build_object('x', (v_pos_before->>'x')::int + 1, 'y', (v_pos_before->>'y')::int)
    end;

    if (v_proposed->>'x')::int < 0 or (v_proposed->>'x')::int >= v_grid_size
       or (v_proposed->>'y')::int < 0 or (v_proposed->>'y')::int >= v_grid_size then
      v_result := 'BOUNDARY_STRIKE';
      v_boundary := true;
      v_proposed := v_pos_before;
    elsif v_proposed = v_state.target then
      v_result := 'TARGET_REACHED';
    else
      v_trap_triggered := false;
      for v_trap in select * from jsonb_array_elements(v_state.traps) loop
        if v_trap = v_proposed then
          v_trap_triggered := true;
          exit;
        end if;
      end loop;

      if v_trap_triggered then
        v_result := 'TRAP_TRIGGERED';
        v_new_stun := 3;
      else
        v_result := 'MOVED';
      end if;
    end if;
  end if;

  -- append event
  select coalesce(max(sequence_number), 0) + 1 into v_seq
    from game_events where match_id = p_match_id and team_id = p_team_id;

  insert into game_events (
    match_id, team_id, sequence_number, timestamp_ms, player_id, player_name,
    direction, effective_direction, position_before, position_after, result,
    trap_triggered, boundary_strike, stunned, move_consumed
  ) values (
    p_match_id, p_team_id, v_seq, v_now_ms, p_player_id, v_player.name,
    p_direction, v_eff_dir, v_pos_before, v_proposed, v_result,
    v_trap_triggered, v_boundary, v_stunned, true
  );

  -- update state
  update game_states set
    token = v_proposed,
    stun_turns_remaining = v_new_stun,
    moves_remaining = greatest(0, v_state.moves_remaining - 1),
    current_player_index = (v_state.current_player_index + 1) % array_length(v_state.player_order, 1),
    status = case
      when v_result = 'TARGET_REACHED' then 'TARGET_FOUND'
      when greatest(0, v_state.moves_remaining - 1) = 0 then 'MOVE_DEPLETED'
      else 'ACTIVE'
    end,
    finished_at_ms = case when v_result = 'TARGET_REACHED' then v_now_ms else finished_at_ms end
  where id = v_state.id;

  return jsonb_build_object('result', v_result, 'position', v_proposed);
end;
$$;

-- ------------------------------------------------------------
-- REALTIME
-- Run in SQL editor, or enable via Dashboard > Database > Replication
-- ------------------------------------------------------------
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table game_states;
alter publication supabase_realtime add table game_events;