import { supabase } from './client'
import type { GameMode, MatchConfig, Direction } from '../game/gameTypes'
import { generateTarget, generateTraps, shuffleTeams as shuffleIds } from '../game/gameEngine'
import { TEAM_NAMES, TEAM_COLORS } from '../game/gameTypes'

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no ambiguous chars
  let code = ''
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

export async function createRoom(mode: GameMode) {
  let code = randomCode()
  // Try a few times in case of collision
  for (let i = 0; i < 5; i++) {
    const { data: existing } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle()
    if (!existing) break
    code = randomCode()
  }
  const { data, error } = await supabase
    .from('rooms')
    .insert({ code, mode, status: 'LOBBY', config: {} })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getRoomByCode(code: string) {
  const { data, error } = await supabase.from('rooms').select('*').eq('code', code.toUpperCase()).maybeSingle()
  if (error) throw error
  return data
}

export async function joinRoom(roomId: string, name: string, localId: string) {
  // Block duplicate names from *other* players (allow same local_id to rejoin as themselves)
  const { data: existing } = await supabase
    .from('players')
    .select('id, local_id')
    .eq('room_id', roomId)
    .ilike('name', name)
  if (existing?.some((p) => p.local_id !== localId)) {
    throw new Error('DUPLICATE_NAME')
  }

  const { data, error } = await supabase
    .from('players')
    .upsert({ room_id: roomId, name, local_id: localId, connected: true }, { onConflict: 'room_id,local_id' })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getPlayers(roomId: string) {
  const { data, error } = await supabase.from('players').select('*').eq('room_id', roomId).order('joined_at')
  if (error) throw error
  return data
}

export async function updateRoomConfig(roomId: string, config: Partial<MatchConfig>) {
  const { error } = await supabase.from('rooms').update({ config }).eq('id', roomId)
  if (error) throw error
}

export async function updateRoomMode(roomId: string, mode: GameMode) {
  const { error } = await supabase.from('rooms').update({ mode }).eq('id', roomId)
  if (error) throw error
}

/**
 * OPTIMIZATION: previously issued two sequential `update` requests per
 * player (2N round trips for N players). Now batches all team-id updates
 * per team into a single request and only issues one extra request per
 * team for the board-mover flag, cutting round trips roughly in half and
 * making shuffling noticeably snappier on slow/mobile connections.
 */
export async function shuffleTeamsInRoom(roomId: string, numTeams: number) {
  const players = await getPlayers(roomId)
  const groups = shuffleIds(players.map((p) => p.id), numTeams)

  await Promise.all(
    groups.map(async (playerIds, i) => {
      if (playerIds.length === 0) return
      const teamId = TEAM_NAMES[i]

      // Assign every player in this team's group in one request.
      const { error: teamErr } = await supabase
        .from('players')
        .update({ team_id: teamId, is_board_mover: false })
        .in('id', playerIds)
      if (teamErr) throw teamErr

      // Auto-assign the first player in each team as Board-Mover.
      const { error: bmErr } = await supabase
        .from('players')
        .update({ is_board_mover: true })
        .eq('id', playerIds[0])
      if (bmErr) throw bmErr
    }),
  )
}

export async function setBoardMover(roomId: string, teamId: string, playerId: string) {
  await supabase.from('players').update({ is_board_mover: false }).eq('room_id', roomId).eq('team_id', teamId)
  await supabase.from('players').update({ is_board_mover: true }).eq('id', playerId)
}

// ------------------------------------------------------------
// MATCH START
// ------------------------------------------------------------
export async function startMatch(roomId: string, mode: GameMode, config: MatchConfig) {
  const players = await getPlayers(roomId)

  if (players.length === 0) {
    throw new Error('No players have joined yet.')
  }

  if (mode === 'BLIND_NAVIGATOR') {
    const teamIds = [...new Set(players.map((p) => p.team_id).filter(Boolean))] as string[]

    // BUG FIX: this used to be silent. If nobody had pressed "Shuffle Teams"
    // yet, team_id was null for every player, teamIds ended up empty, and
    // startMatch() would happily create a match + flip the room to ACTIVE
    // with ZERO game_states rows — producing a completely blank, unstartable
    // board with no way to move or recover short of ending the match.
    // We now fail loudly *before* touching the database so the Host UI can
    // show a clear error instead of a stuck game.
    if (teamIds.length === 0) {
      throw new Error('No teams assigned yet — shuffle teams before starting.')
    }
    if (teamIds.length !== config.numTeams) {
      throw new Error(
        `Expected ${config.numTeams} teams but found ${teamIds.length} — reshuffle teams before starting.`,
      )
    }
    if (players.some((p) => !p.team_id)) {
      throw new Error('Some players have no team assigned — reshuffle teams before starting.')
    }
  }

  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .insert({ room_id: roomId, mode, config, status: 'ACTIVE' })
    .select()
    .single()
  if (matchErr) throw matchErr

  if (mode === 'BLIND_NAVIGATOR') {
    const teamIds = [...new Set(players.map((p) => p.team_id).filter(Boolean))] as string[]
    const start = { x: Math.floor(config.gridSize / 2), y: Math.floor(config.gridSize / 2) }
    const sharedTarget =
      config.targetMode === 'IDENTICAL' ? generateTarget(config.gridSize, start) : null

    const inserts = teamIds.map((teamId) => {
      const roster = players.filter((p) => p.team_id === teamId)
      const boardMover = roster.find((p) => p.is_board_mover) ?? roster[0]
      const target = sharedTarget ?? generateTarget(config.gridSize, start)
      const traps = config.stunTrapsEnabled ? generateTraps(config.gridSize, config.trapCount, start, target) : []
      const colorIdx = TEAM_NAMES.indexOf(teamId)

      // Instructors = everyone except the Board-Mover.
      // Fallback to full roster if the team is just the Board-Mover alone
      // (1-player team), otherwise player_order would be empty and the
      // modulo in make_move() would divide by zero.
      const instructors = roster.filter((p) => p.id !== boardMover?.id)
      const playerOrder = instructors.length > 0 ? instructors : roster

      return {
        match_id: match.id,
        team_id: teamId,
        color: TEAM_COLORS[colorIdx] ?? '#3B82F6',
        player_order: playerOrder.map((p) => p.id),
        current_player_index: 0,
        board_mover_id: boardMover?.id ?? null,
        token: start,
        target,
        traps,
        start_position: start,
        stun_turns_remaining: 0,
        moves_remaining: config.moveEconomyLimit,
        status: 'ACTIVE',
      }
    })

    // OPTIMIZATION: single bulk insert instead of one insert per team.
    const { error: gsErr } = await supabase.from('game_states').insert(inserts)
    if (gsErr) throw gsErr
  } else {
    // HIDDEN_SABOTEUR
    const saboteur = players[Math.floor(Math.random() * players.length)]
    const start = { x: Math.floor(config.gridSize / 2), y: Math.floor(config.gridSize / 2) }
    const target = generateTarget(config.gridSize, start)
    const traps = config.stunTrapsEnabled ? generateTraps(config.gridSize, config.trapCount, start, target) : []

    await supabase.from('matches').update({ saboteur_player_id: saboteur.id }).eq('id', match.id)
    await supabase.from('game_states').insert({
      match_id: match.id,
      team_id: 'ALL',
      color: '#8B5CF6',
      player_order: players.map((p) => p.id),
      current_player_index: 0,
      board_mover_id: null,
      token: start,
      target,
      traps,
      start_position: start,
      stun_turns_remaining: 0,
      moves_remaining: config.moveEconomyLimit,
      status: 'ACTIVE',
    })
  }

  await supabase.from('rooms').update({ status: 'ACTIVE' }).eq('id', roomId)
  return match
}

export async function makeMove(matchId: string, teamId: string, playerId: string, direction: Direction) {
  const { data, error } = await supabase.rpc('make_move', {
    p_match_id: matchId,
    p_team_id: teamId,
    p_player_id: playerId,
    p_direction: direction,
  })
  if (error) throw error
  return data
}

export async function revealTarget(matchId: string) {
  await supabase.from('matches').update({ target_revealed: true }).eq('id', matchId)
}

export async function endMatch(matchId: string) {
  await supabase.from('matches').update({ status: 'COMPLETED', ended_at: new Date().toISOString() }).eq('id', matchId)
}

export async function getGameStates(matchId: string) {
  const { data, error } = await supabase.from('game_states').select('*').eq('match_id', matchId)
  if (error) throw error
  return data
}

export async function getEvents(matchId: string, teamId?: string) {
  let q = supabase.from('game_events').select('*').eq('match_id', matchId).order('sequence_number')
  if (teamId) q = q.eq('team_id', teamId)
  const { data, error } = await q
  if (error) throw error
  return data
}

export async function getMatchHistory(roomId: string) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('room_id', roomId)
    .eq('status', 'COMPLETED')
    .order('started_at', { ascending: false })
  if (error) throw error
  return data
}

// ------------------------------------------------------------
// REALTIME SUBSCRIPTIONS
// ------------------------------------------------------------

export interface MatchEvent {
  event_id: string
  match_id: string
  team_id: string
  player_id: string
  player_name: string
  direction: Direction
  result: string
  sequence_number: number
  created_at?: string
}

export function subscribeToRoom(
  roomId: string,
  onChange: () => void,
) {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `room_id=eq.${roomId}`,
      },
      onChange,
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      },
      onChange,
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

export function subscribeToMatch(
  matchId: string,
  onStateChange: () => void,
  onEvent: (event: MatchEvent) => void,
) {
  const channel = supabase
    .channel(`match:${matchId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'game_states',
        filter: `match_id=eq.${matchId}`,
      },
      () => {
        onStateChange()
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'game_events',
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        onEvent(payload.new as MatchEvent)
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'matches',
        filter: `id=eq.${matchId}`,
      },
      () => {
        onStateChange()
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
export async function skipTurn(matchId: string, teamId: string) {
  const { error } = await supabase.rpc('skip_turn', { p_match_id: matchId, p_team_id: teamId })
  if (error) throw error
}