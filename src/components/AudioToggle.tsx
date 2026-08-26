import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { AudioManager } from '../lib/AudioManager'

/**
 * Small floating control. First tap also unlocks audio for autoplay policies.
 * Drop this into Host and PlayerScreen — it's the only place unlock() is called from.
 */
export function AudioToggle() {
  const [muted, setMuted] = useState(AudioManager.isMuted())
  const [unlocked, setUnlocked] = useState(false)

  const handleClick = () => {
    if (!unlocked) {
      AudioManager.unlock()
      setUnlocked(true)
    }
    const next = !muted
    AudioManager.setMuted(next)
    setMuted(next)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={muted ? 'Unmute audio' : 'Mute audio'}
      className="fixed bottom-4 right-4 z-40 p-3 rounded-full bg-white/10 border border-white/20 text-white backdrop-blur active:scale-90 transition-transform"
    >
      {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
    </button>
  )
}