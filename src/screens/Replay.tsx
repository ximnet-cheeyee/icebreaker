import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase/client'
import * as gameService from '../supabase/gameService'
import { GameGrid } from '../components/GameGrid'
import { pathUpTo, directionArrow, type ReplayEvent } from '../game/gameUtils'
import type { MatchConfig, Position } from '../game/gameTypes'

interface MatchRow {
  id: string
  mode: string
  config: MatchConfig
  saboteur_player_id: string | null
}

interface GameStateRow {
  id: string
  team_id: string
  color: string
  start_position: Position
  target: Position
  traps: Position[]
}

const SPEEDS = [0.5, 1, 2, 4]

export function Replay() {
  const { matchId } = useParams<{ matchId: string }>()
  const [match, setMatch] = useState<MatchRow | null>(null)
  const [states, setStates] = useState<GameStateRow[]>([])
  const [eventsByTeam, setEventsByTeam] = useState<Record<string, ReplayEvent[]>>({})
  const [activeTeam, setActiveTeam] = useState<string | null>(null)
  const [index, setIndex] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [saboteurName, setSaboteurName] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!matchId) return
    ;(async () => {
      const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single()
      setMatch(m as MatchRow)

      const gs = await gameService.getGameStates(matchId)
      setStates(gs as GameStateRow[])
      setActiveTeam((gs as GameStateRow[])[0]?.team_id ?? null)

      const byTeam: Record<string, ReplayEvent[]> = {}
      for (const g of gs as GameStateRow[]) {
        byTeam[g.team_id] = (await gameService.getEvents(matchId, g.team_id)) as ReplayEvent[]
      }
      setEventsByTeam(byTeam)

      if (m?.saboteur_player_id) {
        const { data: p } = await supabase.from('players').select('name').eq('id', m.saboteur_player_id).single()
        setSaboteurName(p?.name ?? null)
      }
    })()
  }, [matchId])

  const activeState = states.find((s) => s.team_id === activeTeam) ?? null
  const events = activeTeam ? eventsByTeam[activeTeam] ?? [] : []

  useEffect(() => {
    if (!playing) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setIndex((i) => {
        if (i >= events.length - 1) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, 800 / speed)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [playing, speed, events.length])

  const path = useMemo(
    () => (activeState ? pathUpTo(activeState.start_position, events, index) : []),
    [activeState, events, index],
  )
  const currentEvent = index >= 0 ? events[index] : null
  const tokenNow = currentEvent ? currentEvent.position_after : activeState?.start_position ?? { x: 0, y: 0 }

  if (!match || !activeState) return <Centered>Loading replay…</Centered>

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-black text-white p-6">
      <div className="max-w-3xl mx-auto flex flex-col items-center gap-6">
        <h1 className="text-3xl font-black">Reminisce</h1>

        {states.length > 1 && (
          <div className="flex gap-2 flex-wrap justify-center">
            {states.map((s) => (
              <button
                key={s.team_id}
                type="button"
                onClick={() => {
                  setActiveTeam(s.team_id)
                  setIndex(-1)
                  setPlaying(false)
                }}
                className={`px-4 py-2 rounded-xl border font-bold text-sm ${
                  activeTeam === s.team_id ? 'border-white text-white' : 'border-white/20 text-white/50'
                }`}
                style={activeTeam === s.team_id ? { background: `${s.color}30`, borderColor: s.color } : {}}
              >
                {s.team_id}
              </button>
            ))}
          </div>
        )}

        <GameGrid
          gridSize={match.config.gridSize}
          token={tokenNow}
          target={activeState.target}
          traps={activeState.traps}
          showTarget
          showTraps
          color={activeState.color}
          path={path}
        />

        {currentEvent && (
          <div className="text-center">
            <p className="font-black text-lg">
              {currentEvent.player_name} {directionArrow(currentEvent.direction)}
              {currentEvent.effective_direction !== currentEvent.direction && (
                <span className="text-red-400"> (glitched → {directionArrow(currentEvent.effective_direction)})</span>
              )}
            </p>
            <p className="text-sm text-white/50 uppercase tracking-widest">
              {currentEvent.result.replace('_', ' ')}
              {saboteurName && currentEvent.player_name === saboteurName && (
                <span className="ml-2 text-purple-400 font-black">⚠ SABOTEUR MOVE</span>
              )}
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => { setIndex(-1); setPlaying(false) }} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20">
            ⏮ Restart
          </button>
          <button type="button" onClick={() => setIndex((i) => Math.max(-1, i - 1))} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20">
            ◀
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="px-6 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold"
          >
            {playing ? '⏸ Pause' : '▶ Animate Path'}
          </button>
          <button type="button" onClick={() => setIndex((i) => Math.min(events.length - 1, i + 1))} className="px-4 py-2 rounded-xl bg-white/10 border border-white/20">
            ▶
          </button>
          <select
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-white/10 border border-white/20"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </div>

        <input
          type="range"
          min={-1}
          max={events.length - 1}
          value={index}
          onChange={(e) => { setPlaying(false); setIndex(Number(e.target.value)) }}
          className="w-full"
        />

        {saboteurName && index === events.length - 1 && (
          <div className="mt-4 text-center animate-pulse">
            <p className="text-white/50 uppercase tracking-widest text-sm">The Saboteur was...</p>
            <p className="text-4xl font-black text-purple-400">{saboteurName}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black text-white flex items-center justify-center">{children}</div>
}