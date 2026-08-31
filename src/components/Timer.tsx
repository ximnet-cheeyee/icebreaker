import { useEffect, useRef, useState } from 'react'
import { AudioManager, vibrate } from '../lib/AudioManager'
interface TimerProps {
  startedAtMs: number
  durationSeconds: number
  onExpire?: () => void
  className?: string
}

export function Timer({ startedAtMs, durationSeconds, onExpire, className = '' }: TimerProps) {
  const [remaining, setRemaining] = useState(durationSeconds)
  const lastSecondRef = useRef<number | null>(null)
  const expiredRef = useRef(false)

  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startedAtMs) / 1000)
      const rem = Math.max(0, durationSeconds - elapsed)
      setRemaining(rem)

      if (lastSecondRef.current !== rem) {
        lastSecondRef.current = rem
        if (rem <= 10 && rem > 0) {
          AudioManager.playSfx('countdown')
          vibrate(10)
        }
      }
      if (rem === 0 && !expiredRef.current) {
        expiredRef.current = true
        onExpire?.()
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [startedAtMs, durationSeconds, onExpire])

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const urgent = remaining <= 10

  return (
    <div
      className={`font-mono font-black tabular-nums transition-colors duration-300 ${urgent ? 'text-red-400 animate-pulse drop-shadow-[0_0_20px_rgba(248,113,113,0.6)]' : 'text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]'} ${className}`}
    >
      {mins}:{secs.toString().padStart(2, '0')}
    </div>
  )
}