import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../hooks/useGame'
import * as gameService from '../supabase/gameService'
import { QRJoin } from '../components/QRJoin'
import { GameGrid } from '../components/GameGrid'
import { Timer } from '../components/Timer'
import type { GameMode, MatchConfig, TargetMode } from '../game/gameTypes'
import { GlitchBanner } from '../components/GlitchBanner'
import { AudioManager } from '../lib/AudioManager'
import { AudioToggle } from '../components/AudioToggle'
import { directionArrow as directionArrowFor } from '../game/gameUtils'
const DEFAULT_CONFIG: MatchConfig = {
  mode: 'BLIND_NAVIGATOR',
  gridSize: 10,
  victoryType: 'TIME_ATTACK',
  timeAttackSeconds: 180,
  moveEconomyLimit: 50,
  stunTrapsEnabled: true,
  trapCount: 6,
  reverseGlitchEnabled: false,
  targetMode: 'IDENTICAL',
  numTeams: 3,
}

export function Host() {
  const { code } = useParams<{ code: string }>()

  const { room, players, match, gameStates, loading, error, refresh, recentEvents } = useGame(code ?? null)

  const [config, setConfig] = useState<MatchConfig>(DEFAULT_CONFIG)
  const [busy, setBusy] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const navigate = useNavigate()

  // Teams currently assigned on players (only meaningful for Blind Navigator)
  const teamsPresent = [
    ...new Set(players.map((p) => p.team_id).filter(Boolean)),
  ] as string[]

  const notEnoughPlayers =
    config.mode === 'BLIND_NAVIGATOR' && players.length < config.numTeams

  // BUG FIX: previously the Host could press START GAME before ever
  // pressing "Shuffle Teams". team_id was null for every player, so
  // startMatch() created zero game_states rows and the game looked
  // completely stuck (blank board, no D-pad, nothing to interact with).
  // We now require every player to have a team assigned, and that the
  // number of distinct teams matches the configured team count, before
  // Start is allowed for Blind Navigator.
  const teamsNotReady =
    config.mode === 'BLIND_NAVIGATOR' &&
    (teamsPresent.length !== config.numTeams ||
      players.some((p) => !p.team_id))

  const canStart =
    !busy && players.length > 0 && !notEnoughPlayers && !teamsNotReady

  useEffect(() => {
    if (!room) return

    if (room.status === 'LOBBY') {
      AudioManager.playMusic('lobby')
    } else if (room.status === 'ACTIVE' && match) {
      AudioManager.playMusic('gameplay')
    } else if (room.status === 'ACTIVE' && !match) {
      AudioManager.playMusic('victory')
    }
  }, [room, match])

  useEffect(() => {
    if (!match || gameStates.length === 0) return
    const allDone = gameStates.every((gs) => gs.status !== 'ACTIVE')
    if (allDone) {
      gameService.endMatch(match.id).then(refresh)
    }
  }, [gameStates, match, refresh])

  if (loading) {
    return <Centered>Loading room…</Centered>
  }

  if (error || !room) {
    return <Centered>{error ?? 'Room not found'}</Centered>
  }

  const setMode = async (mode: GameMode) => {
    setConfig((c) => ({ ...c, mode }))
    setStartError(null)
    await gameService.updateRoomMode(room.id, mode)
  }

  const handleShuffle = async () => {
    setBusy(true)
    setStartError(null)

    try {
      await gameService.shuffleTeamsInRoom(room.id, config.numTeams)
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleAssignBoardMover = async (
    teamId: string,
    playerId: string,
  ) => {
    await gameService.setBoardMover(room.id, teamId, playerId)
    await refresh()
  }

  const handleStart = async () => {
    if (!canStart) return

    setBusy(true)
    setStartError(null)

    try {
      await gameService.startMatch(room.id, config.mode, config)
      AudioManager.playSfx('reveal')
      await refresh()
    } catch (e) {
      setStartError(
        e instanceof Error ? e.message : 'Could not start the game. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handleEnd = async () => {
    if (!match) return

    await gameService.endMatch(match.id)
    await refresh()
  }

  // ---------- LOBBY ----------

  if (room.status === 'LOBBY') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-950 via-slate-950 to-black text-white p-6">
        <AudioToggle />

        <div className="max-w-6xl mx-auto grid md:grid-cols-[1fr_320px] gap-8">
          <div className="space-y-8">
            <h1 className="text-3xl font-black">
              Configure Game
            </h1>

            <Section title="Game Mode">
              <div className="flex gap-3">
                <ModeButton
                  active={config.mode === 'BLIND_NAVIGATOR'}
                  onClick={() => setMode('BLIND_NAVIGATOR')}
                >
                  Blind Navigator
                </ModeButton>

                <ModeButton
                  active={config.mode === 'HIDDEN_SABOTEUR'}
                  onClick={() => setMode('HIDDEN_SABOTEUR')}
                >
                  Hidden Saboteur
                </ModeButton>
              </div>
            </Section>

            <Section title="Grid Size">
              <div className="flex gap-3">
                {[8, 10, 12].map((g) => (
                  <ModeButton
                    key={g}
                    active={config.gridSize === g}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        gridSize: g as 8 | 10 | 12,
                      }))
                    }
                  >
                    {g} × {g}
                  </ModeButton>
                ))}
              </div>
            </Section>

            <Section title="Victory Condition">
              <div className="flex gap-3">
                <ModeButton
                  active={config.victoryType === 'TIME_ATTACK'}
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      victoryType: 'TIME_ATTACK',
                    }))
                  }
                >
                  Time Attack (3:00)
                </ModeButton>

                <ModeButton
                  active={config.victoryType === 'MOVE_ECONOMY'}
                  onClick={() =>
                    setConfig((c) => ({
                      ...c,
                      victoryType: 'MOVE_ECONOMY',
                    }))
                  }
                >
                  Move Economy (50)
                </ModeButton>
              </div>
            </Section>

            <Section title="Modifiers">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={config.stunTrapsEnabled}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      stunTrapsEnabled: e.target.checked,
                    }))
                  }
                />
                Stun Traps
              </label>

              <label className="flex items-center gap-3 mt-2">
                <input
                  type="checkbox"
                  checked={config.reverseGlitchEnabled}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      reverseGlitchEnabled: e.target.checked,
                    }))
                  }
                />
                Reverse Glitch
              </label>
            </Section>

            {config.mode === 'BLIND_NAVIGATOR' && (
              <>
                <Section title="Teams">
                  <div className="flex gap-3">
                    {[2, 3, 4].map((n) => (
                      <ModeButton
                        key={n}
                        active={config.numTeams === n}
                        onClick={() => {
                          setConfig((c) => ({
                            ...c,
                            numTeams: n as 2 | 3 | 4,
                          }))
                          setStartError(null)
                        }}
                      >
                        {n} Teams
                      </ModeButton>
                    ))}
                  </div>
                </Section>

                <Section title="Target Mode">
                  <div className="flex gap-3">
                    {(['IDENTICAL', 'UNIQUE'] as TargetMode[]).map(
                      (t) => (
                        <ModeButton
                          key={t}
                          active={config.targetMode === t}
                          onClick={() =>
                            setConfig((c) => ({
                              ...c,
                              targetMode: t,
                            }))
                          }
                        >
                          {t}
                        </ModeButton>
                      ),
                    )}
                  </div>
                </Section>

                <Section title="Teams & Board-Movers">
                  <button
                    type="button"
                    onClick={handleShuffle}
                    disabled={busy || players.length === 0 || notEnoughPlayers}
                    className="mb-4 px-5 py-2 rounded-xl bg-white/10 border border-white/20 font-bold disabled:opacity-40"
                  >
                    Shuffle Teams
                  </button>

                  {teamsPresent.length === 0 && !notEnoughPlayers && (
                    <p className="text-amber-400 text-sm mb-3">
                      Press "Shuffle Teams" before starting — nobody has a team yet.
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {teamsPresent.map((teamId) => (
                      <div
                        key={teamId}
                        className="rounded-xl bg-white/5 border border-white/10 p-4"
                      >
                        <p className="font-black mb-2">
                          {teamId}
                        </p>

                        {players
                          .filter(
                            (p) => p.team_id === teamId,
                          )
                          .map((p) => (
                            <label
                              key={p.id}
                              className="flex items-center gap-2 text-sm py-1"
                            >
                              <input
                                type="radio"
                                name={`bm-${teamId}`}
                                checked={p.is_board_mover}
                                onChange={() =>
                                  handleAssignBoardMover(
                                    teamId,
                                    p.id,
                                  )
                                }
                              />

                              {p.name}{' '}
                              {p.is_board_mover && (
                                <span className="text-cyan-400">
                                  (Board-Mover)
                                </span>
                              )}
                            </label>
                          ))}
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {notEnoughPlayers && (
              <p className="text-amber-400 text-sm text-center -mt-2">
                Need at least {config.numTeams} players for {config.numTeams} teams.
              </p>
            )}

            {!notEnoughPlayers && teamsNotReady && (
              <p className="text-amber-400 text-sm text-center -mt-2">
                Shuffle teams so every player has a team before starting.
              </p>
            )}

            {startError && (
              <p className="text-red-400 text-sm text-center -mt-2">
                {startError}
              </p>
            )}

            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart}
              className="w-full py-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 font-black text-xl disabled:opacity-40"
            >
              START GAME
            </button>
          </div>

          <div className="space-y-6">
            <QRJoin roomCode={room.code} />

            <Section
              title={`Players (${players.length})`}
            >
              {players.length === 0 && (
                <p className="text-white/40 text-sm">
                  Waiting for players to join…
                </p>
              )}

              {players.map((p) => (
                <p
                  key={p.id}
                  className="py-1 text-sm"
                >
                  {p.name}{' '}
                  {p.team_id && (
                    <span className="text-white/40">
                      — {p.team_id}
                    </span>
                  )}
                </p>
              ))}
            </Section>
          </div>
        </div>
      </div>
    )
  }

  // ---------- ACTIVE (TV / spectator) ----------

  if (room.status === 'ACTIVE' && match) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-amber-950/20 to-black text-white p-8 flex flex-col items-center gap-8">
        <AudioToggle />

        <GlitchBanner
          matchStartedAtMs={
            new Date(match.started_at).getTime()
          }
          enabled={match.config.reverseGlitchEnabled}
        />

        <h1 className="text-5xl font-black tracking-wide bg-gradient-to-r from-cyan-300 via-white to-purple-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">
          FIND THE TARGET
        </h1>

        {match.config.victoryType === 'TIME_ATTACK' && (
          <Timer
            startedAtMs={new Date(match.started_at).getTime()}
            durationSeconds={match.config.timeAttackSeconds}
            onExpire={handleEnd}
            className="text-6xl"
          />
        )}

        <div className="w-full max-w-3xl flex flex-col gap-1 min-h-[32px]">
          {recentEvents.slice(0, 3).map((e) => (
            <div
              key={e.event_id}
              className="animate-fade-in-fast text-sm md:text-base text-white/80 bg-white/5 border border-white/10 rounded-lg px-4 py-1.5"
            >
              <span className="font-bold">{e.team_id !== 'ALL' ? `${e.team_id} — ` : ''}</span>
              {e.player_name} {directionArrowFor(e.direction)} {e.result.replace('_', ' ')}
            </div>
          ))}
        </div>

        {gameStates.length === 0 ? (
          <div className="text-center text-white/50">
            <p className="font-bold">No teams found for this match.</p>
            <p className="text-sm mt-1">End the match and start again after shuffling teams.</p>
          </div>
        ) : (
          <div
            className={`grid gap-6 w-full ${
              gameStates.length > 2
                ? 'grid-cols-2 md:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {gameStates.map((gs) => (
              <div
                key={gs.id}
                className="rounded-2xl border-2 p-4"
                style={{ borderColor: gs.color }}
              >
                <p
                  className="font-black text-xl mb-2"
                  style={{ color: gs.color }}
                >
                  {gs.team_id === 'ALL'
                    ? 'BOARD'
                    : gs.team_id}

                  {gs.status !== 'ACTIVE' && (
                    <span className="ml-2 text-sm text-white/60">
                      ({gs.status})
                    </span>
                  )}
                </p>

                <GameGrid
                  gridSize={match.config.gridSize}
                  token={gs.token}
                  target={gs.target}
                  traps={gs.traps}
                  showTarget={match.target_revealed}
                  showTraps={false}
                  color={gs.color}
                />

                <p className="text-sm text-white/50 mt-2">
                  Moves left: {gs.moves_remaining}
                </p>

                {gs.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={() => gameService.skipTurn(match.id, gs.team_id).then(refresh)}
                    className="mt-2 text-xs px-3 py-1 rounded-lg bg-white/10 border border-white/20 text-white/60 hover:text-white"
                  >
                    ⏭ Skip stuck turn
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-4">
          <button
            type="button"
            onClick={() =>
              gameService
                .revealTarget(match.id)
                .then(refresh)
            }
            className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 font-bold"
          >
            Reveal Target
          </button>

          <button
            type="button"
            onClick={handleEnd}
            className="px-6 py-3 rounded-xl bg-red-500/20 border border-red-400/40 font-bold text-red-300"
          >
            End Match
          </button>
        </div>
      </div>
    )
  }

  // ---------- no active match yet ----------

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-4">
      <AudioToggle />

      <p className="text-2xl font-black">
        Match ended
      </p>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() =>
            navigate(`/history/${room.id}`)
          }
          className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 font-bold"
        >
          View History
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold"
        >
          New Match
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-white/40 mb-2">
        {title}
      </p>
      {children}
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-xl border font-bold text-sm transition-colors ${
        active
          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
          : 'bg-white/5 border-white/15 text-white/60'
      }`}
    >
      {children}
    </button>
  )
}

function Centered({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      {children}
    </div>
  )
}