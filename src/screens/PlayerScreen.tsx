import { useEffect, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useGame } from '../hooks/useGame'
import { DPad } from '../components/DPad'
import { GameGrid } from '../components/GameGrid'
import { saveSession } from '../lib/useLocalIdentity'
import type { Direction } from '../game/gameTypes'
import { GlitchBanner } from '../components/GlitchBanner'
import { AudioToggle } from '../components/AudioToggle'
import { AudioManager, vibrate } from '../lib/AudioManager'

export function PlayerScreen() {
  const { code } = useParams<{ code: string }>()
  const [params] = useSearchParams()
  const nameFromUrl = params.get('name') ?? ''
  const { room, players, match, gameStates, me, loading, error, joinRoom, move } = useGame(code ?? null)
  const [joining, setJoining] = useState(!me)
  const [name, setName] = useState(nameFromUrl)
  const lastStatusRef = useRef<string | null>(null)

  // --- ALL hooks live above any early return, so hook order never changes between renders ---

  useEffect(() => {
    if (me) setJoining(false)
  }, [me])

  useEffect(() => {
    if (!room) return
    if (room.status === 'LOBBY') AudioManager.playMusic('lobby')
    else if (room.status === 'ACTIVE' && match) AudioManager.playMusic('gameplay')
  }, [room, match])

  const myGameState =
    match && match.mode === 'HIDDEN_SABOTEUR'
      ? gameStates[0]
      : gameStates.find((gs) => gs.team_id === me?.team_id)

  useEffect(() => {
    if (!myGameState) return
    if (lastStatusRef.current === null) {
      lastStatusRef.current = myGameState.status
      return
    }
    if (lastStatusRef.current === myGameState.status) return
    lastStatusRef.current = myGameState.status
    if (myGameState.status === 'TARGET_FOUND') {
      AudioManager.playSfx('target-found')
      AudioManager.playMusic('victory')
      vibrate([30, 40, 30, 40, 80])
    } else if (myGameState.status === 'TIMEOUT' || myGameState.status === 'MOVE_DEPLETED') {
      vibrate(200)
    }
  }, [myGameState])

  const handleJoin = async () => {
    if (!code || !name.trim()) return
    await joinRoom(code, name.trim())
    saveSession(name.trim(), code)
    setJoining(false)
  }

  const handleMove = async (dir: Direction) => {
    if (!myGameState) return
    const res = await move(myGameState.team_id, dir)
    if (!res) return
    switch (res.result) {
      case 'BOUNDARY_STRIKE':
        AudioManager.playSfx('boundary')
        vibrate(60)
        break
      case 'TRAP_TRIGGERED':
        AudioManager.playSfx('trap')
        vibrate([50, 30, 50])
        break
      case 'STUNNED_NO_MOVE':
        AudioManager.playSfx('stun')
        break
      case 'MOVED':
        AudioManager.playSfx('move')
        break
      default:
        break
    }
  }

  // --- early returns below this point; no hooks after this line ---

  if (loading) return <Centered>Loading…</Centered>
  if (error || !room) return <Centered>{error ?? 'Room not found'}</Centered>

  if (joining || !me) {
    return (
      <Centered>
        <div className="w-full max-w-sm flex flex-col gap-4 px-6">
          <h1 className="text-3xl font-black text-center mb-4">Join Room {room.code}</h1>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            className="py-4 px-5 rounded-xl bg-white/10 border border-white/20 text-lg placeholder-white/30 outline-none focus:border-cyan-400"
          />
          <button
            type="button"
            onClick={handleJoin}
            disabled={!name.trim()}
            className="py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-lg disabled:opacity-40"
          >
            JOIN
          </button>
        </div>
      </Centered>
    )
  }

  if (room.status === 'LOBBY') {
    return (
      <Centered>
        <div className="text-center">
          <p className="text-2xl font-black">Hey {me.name} 👋</p>
          <p className="text-white/50 mt-2">
            {me.team_id ? `You're on ${me.team_id}` : "You're in — waiting for the host to set up teams"}
          </p>
          <p className="text-white/30 mt-6 text-sm animate-pulse">Waiting for host to start…</p>
        </div>
      </Centered>
    )
  }

  if (room.status === 'ACTIVE' && !myGameState) {
    return (
      <Centered>
        <div className="text-center px-6">
          <p className="text-2xl font-black">Game already in progress</p>
          <p className="text-white/50 mt-2">Hang tight — you'll join the next match.</p>
        </div>
      </Centered>
    )
  }

  if (!match) return <Centered>Match ended.</Centered>
  if (!myGameState) return <Centered>Waiting for game state…</Centered>

  const isSaboteur = match.mode === 'HIDDEN_SABOTEUR' && match.saboteur_player_id === me.id
  const isBoardMover = match.mode === 'BLIND_NAVIGATOR' && myGameState.board_mover_id === me.id
  const currentPlayerId = myGameState.player_order[myGameState.current_player_index]
  const isMyTurn = currentPlayerId === me.id
  const currentPlayerName = players.find((p) => p.id === currentPlayerId)?.name ?? '…'
  const finished = myGameState.status !== 'ACTIVE'

  // ---------- HIDDEN SABOTEUR ----------
  if (match.mode === 'HIDDEN_SABOTEUR') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-black text-white flex flex-col items-center justify-center gap-6 p-6">
        <AudioToggle />
        <GlitchBanner matchStartedAtMs={new Date(match.started_at).getTime()} enabled={match.config.reverseGlitchEnabled} />
        {finished ? (
          <p className="text-2xl font-black">{myGameState.status.replace('_', ' ')}</p>
        ) : isMyTurn ? (
          <>
            <p className="text-2xl font-black text-cyan-400">YOUR TURN</p>
            <DPad onMove={handleMove} />
          </>
        ) : (
          <>
            <p className="text-white/50 uppercase tracking-widest text-sm">Waiting for</p>
            <p className="text-3xl font-black">{currentPlayerName}</p>
          </>
        )}

        {isSaboteur && (
          <div className="mt-8 opacity-90">
            <p className="text-center text-xs uppercase tracking-widest text-purple-300/70 mb-2">Secret Map</p>
            <GameGrid
              gridSize={match.config.gridSize}
              token={myGameState.token}
              target={myGameState.target}
              traps={myGameState.traps}
              showTarget
              showTraps
              color="#8B5CF6"
            />
          </div>
        )}
      </div>
    )
  }

  // ---------- BLIND NAVIGATOR ----------
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-black text-white flex flex-col items-center justify-center gap-6 p-6">
      <AudioToggle />
      <GlitchBanner matchStartedAtMs={new Date(match.started_at).getTime()} enabled={match.config.reverseGlitchEnabled} />
      <p className="text-lg font-black" style={{ color: myGameState.color }}>
        TEAM {myGameState.team_id}
      </p>

      {finished ? (
        <p className="text-2xl font-black">{myGameState.status.replace('_', ' ')}</p>
      ) : isBoardMover ? (
        <>
          <p className="text-cyan-400 font-bold uppercase tracking-widest text-sm">You are the Board-Mover</p>
          <p className="text-white/60 text-sm mb-2">
            Current instruction: <span className="font-black text-white">{currentPlayerName}</span>
          </p>
          <GameGrid
            gridSize={match.config.gridSize}
            token={myGameState.token}
            target={myGameState.target}
            traps={myGameState.traps}
            showTarget
            showTraps
            color={myGameState.color}
          />
          <DPad onMove={handleMove} />
        </>
      ) : isMyTurn ? (
        <>
          <p className="text-2xl font-black text-cyan-400">YOUR TURN</p>
          <p className="text-white/60">Tell your Board-Mover where to move.</p>
        </>
      ) : (
        <>
          <p className="text-white/50 uppercase tracking-widest text-sm">Waiting for</p>
          <p className="text-3xl font-black">{currentPlayerName}</p>
        </>
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-black text-white flex items-center justify-center">{children}</div>
}