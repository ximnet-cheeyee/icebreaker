import { useNavigate } from 'react-router-dom'

interface GameStateRow {
  id: string
  team_id: string
  color: string
  status: 'ACTIVE' | 'TARGET_FOUND' | 'TIMEOUT' | 'MOVE_DEPLETED'
  finished_at_ms: number | null
}

const MEDALS = ['🥇', '🥈', '🥉']

export function ResultsPodium({
  gameStates,
  roomId,
  matchId,
  onNewMatch,
}: {
  gameStates: GameStateRow[]
  roomId: string
  matchId: string
  onNewMatch: () => void
}) {
  const navigate = useNavigate()

  const ranked = [...gameStates].sort((a, b) => {
    if (a.status === 'TARGET_FOUND' && b.status !== 'TARGET_FOUND') return -1
    if (b.status === 'TARGET_FOUND' && a.status !== 'TARGET_FOUND') return 1
    if (a.finished_at_ms && b.finished_at_ms) return a.finished_at_ms - b.finished_at_ms
    return 0
  })

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-black text-white flex flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-4xl md:text-5xl font-black tracking-tight animate-fade-rise">
        FINAL RESULTS
      </h1>

      <div className="flex flex-col gap-4 w-full max-w-lg">
        {ranked.map((gs, i) => (
          <div
            key={gs.id}
            style={{ animationDelay: `${i * 0.15}s`, borderColor: gs.color }}
            className="animate-celebrate flex items-center gap-4 rounded-2xl border-2 px-6 py-4 bg-white/5"
          >
            <span className="text-3xl">{MEDALS[i] ?? '🎮'}</span>
            <div className="flex-1">
              <p className="font-black text-xl" style={{ color: gs.color }}>
                {gs.team_id}
              </p>
              <p className="text-sm text-white/50 uppercase tracking-widest">
                {gs.status === 'TARGET_FOUND' ? 'Target Found' : gs.status.replace('_', ' ')}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => navigate(`/replay/${matchId}`)}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold"
        >
          ▶ Watch Replay
        </button>
        <button
          type="button"
          onClick={() => navigate(`/history/${roomId}`)}
          className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 font-bold"
        >
          Match History
        </button>
        <button
          type="button"
          onClick={onNewMatch}
          className="px-6 py-3 rounded-xl bg-white/10 border border-white/20 font-bold"
        >
          New Match
        </button>
      </div>
    </div>
  )
}