type Track = 'lobby' | 'gameplay' | 'suspense' | 'victory'
type Sfx =
  | 'button' | 'move' | 'boundary' | 'trap' | 'stun' | 'glitch'
  | 'target-found' | 'countdown' | 'reveal' | 'saboteur-reveal'

class AudioManagerImpl {
  private musicEl: HTMLAudioElement | null = null
  private currentTrack: Track | null = null
  private sfxCache = new Map<Sfx, HTMLAudioElement>()
  private muted = false
  private volume = 0.6
  private unlocked = false

  constructor() {
    const savedMute = localStorage.getItem('icebreaker_muted')
    const savedVol = localStorage.getItem('icebreaker_volume')
    if (savedMute) this.muted = savedMute === 'true'
    if (savedVol) this.volume = parseFloat(savedVol)
  }

  /** Call this from a user gesture (e.g. "Enable Game Audio" button) to satisfy autoplay policies. */
  unlock() {
    if (this.unlocked) return
    this.unlocked = true
    const silent = new Audio()
    silent.play().catch(() => {})
  }

  private musicSrc(track: Track) {
    return `/audio/bgm/${track === 'gameplay' ? 'gameplay' : track}.ogg`
  }
  private sfxSrc(sfx: Sfx) {
    return `/audio/sfx/${sfx}.ogg`
  }

  playMusic(track: Track, opts: { loop?: boolean; fadeMs?: number } = {}) {
    if (this.currentTrack === track && this.musicEl && !this.musicEl.paused) return
    const { loop = true, fadeMs = 400 } = opts
    const prev = this.musicEl

    const next = new Audio(this.musicSrc(track))
    next.loop = loop
    next.volume = 0
    next.muted = this.muted
    next.play().catch(() => {
      /* autoplay blocked until unlock() runs from a user gesture — game remains playable */
    })

    const targetVol = this.volume
    const steps = 12
    let i = 0
    const fadeInterval = setInterval(() => {
      i++
      next.volume = Math.min(targetVol, (targetVol * i) / steps)
      if (prev) prev.volume = Math.max(0, prev.volume - targetVol / steps)
      if (i >= steps) {
        clearInterval(fadeInterval)
        if (prev) { prev.pause(); prev.src = '' }
      }
    }, fadeMs / steps)

    this.musicEl = next
    this.currentTrack = track
  }

  stopMusic() {
    if (this.musicEl) { this.musicEl.pause(); this.musicEl.src = '' }
    this.musicEl = null
    this.currentTrack = null
  }

  playSfx(sfx: Sfx) {
    if (this.muted) return
    let el = this.sfxCache.get(sfx)
    if (!el) {
      el = new Audio(this.sfxSrc(sfx))
      this.sfxCache.set(sfx, el)
    }
    el.currentTime = 0
    el.volume = this.volume
    el.play().catch(() => {})
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.musicEl) this.musicEl.muted = muted
    localStorage.setItem('icebreaker_muted', String(muted))
  }
  isMuted() { return this.muted }

  setVolume(vol: number) {
    this.volume = vol
    if (this.musicEl) this.musicEl.volume = vol
    localStorage.setItem('icebreaker_volume', String(vol))
  }
  getVolume() { return this.volume }
}

export const AudioManager = new AudioManagerImpl()

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try { navigator.vibrate(pattern) } catch { /* unsupported, ignore */ }
  }
}