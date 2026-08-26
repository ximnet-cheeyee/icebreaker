import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as gameService from '../supabase/gameService'

interface MatchRow {
  id: string
  mode: string
  started_at: string
  ended_at: string | null
  config: { gridSize: number }
}

export function MatchHistory() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!roomId) return
    gameService.getMatchHistory(roomId).then((m) => {
      setMatches(m as MatchRow[])
      setLoading(false)
    })
  }, [roomId])

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-950 to-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-black mb-6">Match History</h1>
        {loading && <p className="text-white/40">Loading…</p>}
        {!loading && matches.length === 0 && <p className="text-white/40">No completed matches yet.</p>}
        <div className="space-y-3">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => navigate(`/replay/${m.id}`)}
              className="w-full text-left px-5 py-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400 transition-colors"
            >
              <p className="font-black">{m.mode.replace('_', ' ')}</p>
              <p className="text-sm text-white/50">
                {new Date(m.started_at).toLocaleString()} · {m.config.gridSize}×{m.config.gridSize}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}