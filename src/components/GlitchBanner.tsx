import { useEffect, useRef, useState } from 'react'
import { isReverseGlitchActive, glitchPhaseSecondsRemaining } from '../game/gameEngine'
import { AudioManager, vibrate } from '../lib/AudioManager'

interface GlitchBannerProps {
  matchStartedAtMs: number
  enabled: boolean
}

/**
 * Polls the same authoritative glitch-cycle math as the server RPC and
 * renders a full-bleed warning banner while active. Also fires the
 * warning/glitch SFX exactly once per transition (not every render).
 */
export function GlitchBanner({ matchStartedAtMs, enabled }: GlitchBannerProps) {
  const [active, setActive] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const prevActiveRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const now = Date.now()
      const isActive = isReverseGlitchActive(matchStartedAtMs, now)
      setActive(isActive)
      setSecondsLeft(glitchPhaseSecondsRemaining(matchStartedAtMs, now))

      if (isActive && !prevActiveRef.current) {
        AudioManager.playSfx('glitch')
        vibrate([40, 60, 40])
      }
      prevActiveRef.current = isActive
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [matchStartedAtMs, enabled])

  if (!enabled || !active) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-start justify-center pt-8">
      <div className="animate-pulse bg-red-600/90 border-2 border-red-300 rounded-2xl px-8 py-4 shadow-2xl shadow-red-900/50">
        <p className="text-2xl md:text-4xl font-black tracking-widest text-white text-center">
          ⚠ REVERSE GLITCH ⚠
        </p>
        <p className="text-center text-red-100 text-sm mt-1">{secondsLeft}s</p>
      </div>
    </div>
  )
}