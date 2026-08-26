import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import * as gameService from '../supabase/gameService'
import { getOrCreateLocalId } from '../lib/useLocalIdentity'
import type { Direction, GameMode, MatchConfig } from '../game/gameTypes'

interface Room {
  id: string
  code: string
  mode: GameMode
  status: 'LOBBY' | 'ACTIVE' | 'ENDED'
  config: Partial<MatchConfig>
}

interface Player {
  id: string
  room_id: string
  local_id: string
  name: string
  team_id: string | null
  is_board_mover: boolean
  connected: boolean
}

interface Match {
  id: string
  room_id: string
  mode: GameMode
  config: MatchConfig
  status: 'ACTIVE' | 'COMPLETED'
  saboteur_player_id: string | null
  target_revealed: boolean
  started_at: string
}

interface GameState {
  id: string
  match_id: string
  team_id: string
  color: string
  player_order: string[]
  current_player_index: number
  board_mover_id: string | null
  token: { x: number; y: number }
  target: { x: number; y: number }
  traps: { x: number; y: number }[]
  start_position: { x: number; y: number }
  stun_turns_remaining: number
  moves_remaining: number
  status: 'ACTIVE' | 'TARGET_FOUND' | 'TIMEOUT' | 'MOVE_DEPLETED'
}

/**
 * Central hook: owns local identity, subscribes to room/match/game-state
 * realtime changes, exposes actions. Screens stay thin and just read
 * from this + call actions.
 */
export function useGame(roomCode: string | null) {
  const localId = getOrCreateLocalId()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [match, setMatch] = useState<Match | null>(null)
  const [gameStates, setGameStates] = useState<GameState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const me = players.find((p) => p.local_id === localId) ?? null

  /**
   * Used by realtime subscriptions and manual refresh actions.
   */
  const refreshAll = useCallback(async () => {
    if (!roomCode) return

    try {
      const r = await gameService.getRoomByCode(roomCode)

      if (!r) {
        setError('Room not found')
        setLoading(false)
        return
      }

      setRoom(r as Room)

      const p = await gameService.getPlayers(r.id)
      setPlayers(p as Player[])

      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .eq('room_id', r.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (matches) {
        setMatch(matches as Match)

        const states = await gameService.getGameStates(matches.id)
        setGameStates(states as GameState[])
      } else {
        setMatch(null)
        setGameStates([])
      }

      setLoading(false)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load room')
      setLoading(false)
    }
  }, [roomCode])

  /**
   * Initial load.
   *
   * This is intentionally separate from refreshAll because the React
   * hooks lint rule warns when an effect synchronously invokes a function
   * that performs setState operations.
   */
  useEffect(() => {
  if (!roomCode) return

  let cancelled = false

  const initialLoad = async () => {
    try {
      const r = await gameService.getRoomByCode(roomCode)

      if (cancelled) return

      if (!r) {
        setError('Room not found')
        setLoading(false)
        return
      }

      setRoom(r as Room)

      const p = await gameService.getPlayers(r.id)

      if (cancelled) return

      setPlayers(p as Player[])

      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .eq('room_id', r.id)
        .eq('status', 'ACTIVE')
        .maybeSingle()

      if (cancelled) return

      if (matches) {
        setMatch(matches as Match)

        const states = await gameService.getGameStates(matches.id)

        if (cancelled) return

        setGameStates(states as GameState[])
      } else {
        setMatch(null)
        setGameStates([])
      }

      setError(null)
      setLoading(false)
    } catch (e) {
      if (cancelled) return

      setError(
        e instanceof Error
          ? e.message
          : 'Failed to load room',
      )

      setLoading(false)
    }
  }

  initialLoad()

  return () => {
    cancelled = true
  }
}, [roomCode])

  // realtime: room + players
  useEffect(() => {
    if (!room) return

    const unsub = gameService.subscribeToRoom(room.id, refreshAll)
    return unsub
  }, [room, refreshAll])

  // realtime: match state + events
  useEffect(() => {
    if (!match) return

    const unsub = gameService.subscribeToMatch(match.id, refreshAll, () => {})
    return unsub
  }, [match, refreshAll])

  // --- actions ---

  const createRoom = useCallback(async (mode: GameMode) => {
    const r = await gameService.createRoom(mode)
    return r.code as string
  }, [])

  const joinRoom = useCallback(
    async (code: string, name: string) => {
      const r = await gameService.getRoomByCode(code)

      if (!r) {
        throw new Error('Room not found')
      }

      await gameService.joinRoom(r.id, name, localId)

      return r
    },
    [localId],
  )

  const move = useCallback(
    async (teamId: string, direction: Direction) => {
      if (!match || !me) return null

      return await gameService.makeMove(
        match.id,
        teamId,
        me.id,
        direction,
      )
    },
    [match, me],
  )

  return {
    localId,
    room,
    players,
    match,
    gameStates,
    me,
    loading,
    error,
    createRoom,
    joinRoom,
    move,
    refresh: refreshAll,
  }
}