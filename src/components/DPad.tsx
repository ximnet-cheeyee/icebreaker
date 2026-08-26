import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Direction } from '../game/gameTypes'
import { AudioManager, vibrate } from '../lib/AudioManager'
interface DPadProps {
  onMove: (dir: Direction) => void
  disabled?: boolean
}

export function DPad({ onMove, disabled = false }: DPadProps) {
  const press = (dir: Direction) => {
    if (disabled) return
    vibrate(15)
    AudioManager.playSfx('button')
    onMove(dir)
  }

  const btnBase =
    'flex items-center justify-center rounded-2xl border-2 transition-all active:scale-90 select-none touch-none'
  const enabled =
    'bg-white/10 border-white/20 text-white active:bg-white/25 active:border-white/40'
  const disabledCls = 'bg-white/5 border-white/5 text-white/20 cursor-not-allowed'

  return (
    <div
      className="grid gap-3 mx-auto"
      style={{
        gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
        gridTemplateRows: 'repeat(3, minmax(0,1fr))',
        width: 'min(80vw, 280px)',
        height: 'min(80vw, 280px)',
      }}
    >
      <div />
      <button
        type="button"
        aria-label="Move up"
        disabled={disabled}
        onClick={() => press('UP')}
        className={`${btnBase} ${disabled ? disabledCls : enabled} col-start-2 row-start-1`}
      >
        <ChevronUp size={40} strokeWidth={3} />
      </button>
      <div />

      <button
        type="button"
        aria-label="Move left"
        disabled={disabled}
        onClick={() => press('LEFT')}
        className={`${btnBase} ${disabled ? disabledCls : enabled} col-start-1 row-start-2`}
      >
        <ChevronLeft size={40} strokeWidth={3} />
      </button>
      <div className="col-start-2 row-start-2 flex items-center justify-center">
        <div className="w-4 h-4 rounded-full bg-white/30" />
      </div>
      <button
        type="button"
        aria-label="Move right"
        disabled={disabled}
        onClick={() => press('RIGHT')}
        className={`${btnBase} ${disabled ? disabledCls : enabled} col-start-3 row-start-2`}
      >
        <ChevronRight size={40} strokeWidth={3} />
      </button>

      <div />
      <button
        type="button"
        aria-label="Move down"
        disabled={disabled}
        onClick={() => press('DOWN')}
        className={`${btnBase} ${disabled ? disabledCls : enabled} col-start-2 row-start-3`}
      >
        <ChevronDown size={40} strokeWidth={3} />
      </button>
      <div />
    </div>
  )
}