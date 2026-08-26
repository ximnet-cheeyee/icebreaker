import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Gamepad2, Users } from 'lucide-react'
import { getSavedSession } from '../lib/useLocalIdentity'
import * as gameService from '../supabase/gameService'
export function Home() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'menu' | 'join'>('menu')
  const [name, setName] = useState(getSavedSession().name ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleCreate = async () => {
    setBusy(true)
    setErr(null)
    try {
      const room = await gameService.createRoom('BLIND_NAVIGATOR')
      navigate(`/host/${room.code}`)
    } catch {
      setErr('Could not create room. Check your connection.')
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!name.trim() || code.trim().length < 4) {
      setErr('Enter your name and the 4-letter room code.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      navigate(`/play/${code.toUpperCase()}?name=${encodeURIComponent(name.trim())}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-indigo-950 via-slate-950 to-black text-white px-6">
      <div className="text-center mb-10">
        <h1 className="text-5xl font-black tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
          ICEBREAKER
        </h1>
        <p className="text-white/50 mt-2 tracking-widest text-sm uppercase">Find the target. Trust no one.</p>
      </div>

      {mode === 'menu' && (
        <div className="w-full max-w-sm flex flex-col gap-4">
          <button
            type="button"
            disabled={busy}
            onClick={handleCreate}
            className="flex items-center justify-center gap-3 py-5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-lg shadow-lg shadow-blue-900/50 active:scale-95 transition-transform disabled:opacity-50"
          >
            <Gamepad2 size={24} /> CREATE GAME
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className="flex items-center justify-center gap-3 py-5 rounded-2xl bg-white/10 border border-white/20 font-bold text-lg active:scale-95 transition-transform"
          >
            <Users size={24} /> JOIN GAME
          </button>
        </div>
      )}

      {mode === 'join' && (
        <div className="w-full max-w-sm flex flex-col gap-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            maxLength={20}
            className="py-4 px-5 rounded-xl bg-white/10 border border-white/20 text-lg placeholder-white/30 outline-none focus:border-cyan-400"
          />
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={4}
            className="py-4 px-5 rounded-xl bg-white/10 border border-white/20 text-lg tracking-[0.3em] text-center placeholder-white/30 outline-none focus:border-cyan-400"
          />
          {err && <p className="text-red-400 text-sm text-center">{err}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={handleJoin}
            className="py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            JOIN
          </button>
          <button type="button" onClick={() => setMode('menu')} className="text-white/50 text-sm">
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}