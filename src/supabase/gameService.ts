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
  // Upsert so refresh/reconnect with the same localId restores the same player row
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

export async function shuffleTeamsInRoom(roomId: string, numTeams: number) {
  const players = await getPlayers(roomId)
  const groups = shuffleIds(players.map((p) => p.id), numTeams)
  for (let i = 0; i < groups.length; i++) {
    const teamId = TEAM_NAMES[i]
    for (const playerId of groups[i]) {
      await supabase.from('players').update({ team_id: teamId, is_board_mover: false }).eq('id', playerId)
    }
    // Auto-assign first player in each team as Board-Mover
    if (groups[i].length > 0) {
      await supabase.from('players').update({ is_board_mover: true }).eq('id', groups[i][0])
    }
  }
}

export async function setBoardMover(roomId: string, teamId: string, playerId: string) {
  await supabase.from('players').update({ is_board_mover: false }).eq('room_id', roomId).eq('team_id', teamId)
  await supabase.from('players').update({ is_board_mover: true }).eq('id', playerId)
}

// ------------------------------------------------------------
// MATCH START
// ------------------------------------------------------------
export async function startMatch(roomId: string, mode: GameMode, config: MatchConfig) {
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .insert({ room_id: roomId, mode, config, status: 'ACTIVE' })
    .select()
    .single()
  if (matchErr) throw matchErr

  const players = await getPlayers(roomId)

  if (mode === 'BLIND_NAVIGATOR') {
    const teamIds = [...new Set(players.map((p) => p.team_id).filter(Boolean))] as string[]
    const sharedTarget = config.targetMode === 'IDENTICAL' ? generateTarget(config.gridSize, { x: Math.floor(config.gridSize / 2), y: Math.floor(config.gridSize / 2) }) : null

    for (const teamId of teamIds) {
      const roster = players.filter((p) => p.team_id === teamId)
      const boardMover = roster.find((p) => p.is_board_mover) ?? roster[0]
      const start = { x: Math.floor(config.gridSize / 2), y: Math.floor(config.gridSize / 2) }
      const target = sharedTarget ?? generateTarget(config.gridSize, start)
      const traps = config.stunTrapsEnabled ? generateTraps(config.gridSize, config.trapCount, start, target) : []
      const colorIdx = TEAM_NAMES.indexOf(teamId)

      await supabase.from('game_states').insert({
        match_id: match.id,
        team_id: teamId,
        color: TEAM_COLORS[colorIdx] ?? '#3B82F6',
        player_order: roster.map((p) => p.id),
        current_player_index: 0,
        board_mover_id: boardMover?.id ?? null,
        token: start,
        target,
        traps,
        start_position: start,
        stun_turns_remaining: 0,
        moves_remaining: config.moveEconomyLimit,
        status: 'ACTIVE',
      })
    }
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
export function subscribeToRoom(roomId: string, onChange: () => void) {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, onChange)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

export function subscribeToMatch(matchId: string, onStateChange: () => void, onEvent: () => void) {
  const channel = supabase
    .channel(`match:${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_states', filter: `match_id=eq.${matchId}` }, onStateChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_events', filter: `match_id=eq.${matchId}` }, onEvent)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, onStateChange)
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}