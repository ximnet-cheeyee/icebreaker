import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase/client'
import * as gameService from '../supabase/gameService'
import type { MatchEvent } from '../supabase/gameService'
import { getOrCreateLocalId } from '../lib/useLocalIdentity'
import type {
  Direction,
  GameMode,
  MatchConfig,
} from '../game/gameTypes'

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
  status:
    | 'ACTIVE'
    | 'TARGET_FOUND'
    | 'TIMEOUT'
    | 'MOVE_DEPLETED'
}

/**
 * Central hook:
 * - owns local identity
 * - loads room / players / match / game state
 * - subscribes to realtime changes
 * - exposes game actions
 *
 * Screens stay thin and just read from this hook + call actions.
 */
export function useGame(roomCode: string | null) {
  const localId = getOrCreateLocalId()

  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [match, setMatch] = useState<Match | null>(null)
  const [gameStates, setGameStates] = useState<GameState[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentEvents, setRecentEvents] = useState<MatchEvent[]>([])

  const me =
    players.find((player) => player.local_id === localId) ?? null

  /**
   * Refresh room, players, active match and game states.
   *
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

      const { data: activeMatch, error: matchError } =
        await supabase
          .from('matches')
          .select('*')
          .eq('room_id', r.id)
          .eq('status', 'ACTIVE')
          .maybeSingle()

      if (matchError) {
        throw matchError
      }

      if (activeMatch) {
        setMatch(activeMatch as Match)

        const states =
          await gameService.getGameStates(activeMatch.id)

        setGameStates(states as GameState[])
      } else {
        const { data: lastCompleted } = await supabase
          .from('matches')
          .select('*')
          .eq('room_id', r.id)
          .eq('status', 'COMPLETED')
          .order('ended_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (lastCompleted) {
          setMatch(lastCompleted as Match)
          const states = await gameService.getGameStates(lastCompleted.id)
          setGameStates(states as GameState[])
        } else {
          setMatch(null)
          setGameStates([])
        }
      }

      setLoading(false)
      setError(null)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Failed to load room',
      )

      setLoading(false)
    }
  }, [roomCode])

  /**
   * Initial load.
   *
   * Kept separate from refreshAll because the React hooks lint rule
   * warns when an effect synchronously invokes a function that performs
   * setState operations.
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

        const {
          data: activeMatch,
          error: matchError,
        } = await supabase
          .from('matches')
          .select('*')
          .eq('room_id', r.id)
          .eq('status', 'ACTIVE')
          .maybeSingle()

        if (cancelled) return

        if (matchError) {
          throw matchError
        }

        if (activeMatch) {
          setMatch(activeMatch as Match)

          const states =
            await gameService.getGameStates(
              activeMatch.id,
            )

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

  /**
   * Realtime:
   * room + players
   */
  useEffect(() => {
    if (!room) return

    const unsubscribe =
      gameService.subscribeToRoom(
        room.id,
        refreshAll,
      )

    return unsubscribe
  }, [room, refreshAll])

  /**
   * Realtime:
   * match state + events
   */
  useEffect(() => {
    if (!match) return

    const unsubscribe =
      gameService.subscribeToMatch(
        match.id,
        refreshAll,
        (event: MatchEvent) => {
          setRecentEvents((previous) =>
            [event, ...previous].slice(0, 5),
          )
        },
      )

    return unsubscribe
  }, [match, refreshAll])

  // ------------------------------------------------------------
  // ACTIONS
  // ------------------------------------------------------------

  /**
   * Create a new room.
   */
  const createRoom = useCallback(
    async (mode: GameMode) => {
      const r =
        await gameService.createRoom(mode)

      return r.code as string
    },
    [],
  )

  /**
   * Join an existing room.
   */
  const joinRoom = useCallback(
    async (code: string, name: string) => {
      const r =
        await gameService.getRoomByCode(code)

      if (!r) {
        throw new Error('Room not found')
      }

      await gameService.joinRoom(
        r.id,
        name,
        localId,
      )

      return r
    },
    [localId],
  )

  /**
   * Make a board move.
   */
  const move = useCallback(
    async (
      teamId: string,
      direction: Direction,
    ) => {
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

    recentEvents,
  }
}