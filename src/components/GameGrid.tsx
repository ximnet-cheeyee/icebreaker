import { useMemo } from 'react'
import type { Position } from '../game/gameTypes'

interface GameGridProps {
  gridSize: number
  token: Position
  target?: Position | null
  traps?: Position[]
  showTarget?: boolean
  showTraps?: boolean
  color?: string
  path?: Position[]
}

export function GameGrid({
  gridSize,
  token,
  target = null,
  traps = [],
  showTarget = false,
  showTraps = false,
  color = '#3B82F6',
  path = [],
}: GameGridProps) {
  const cells = useMemo(
    () => Array.from({ length: gridSize * gridSize }, (_, i) => ({ x: i % gridSize, y: Math.floor(i / gridSize) })),
    [gridSize],
  )

  const isTrap = (x: number, y: number) => showTraps && traps.some((t) => t.x === x && t.y === y)
  const isTarget = (x: number, y: number) => showTarget && target && target.x === x && target.y === y
  const isToken = (x: number, y: number) => token.x === x && token.y === y
  const isPath = (x: number, y: number) => path.some((p) => p.x === x && p.y === y)

  return (
    <div
      className="grid aspect-square w-full max-w-[min(90vw,520px)] mx-auto rounded-xl overflow-hidden border-2 border-white/10 bg-black/30"
      style={{ gridTemplateColumns: `repeat(${gridSize}, 1fr)` }}
    >
      {cells.map(({ x, y }) => (
        <div
          key={`${x}-${y}`}
          className={`relative border border-white/5 ${isPath(x, y) ? 'bg-white/5' : ''}`}
        >
          {isTrap(x, y) && (
            <span className="absolute inset-0 flex items-center justify-center text-lg">💥</span>
          )}
          {isTarget(x, y) && (
            <span className="absolute inset-0 flex items-center justify-center text-lg animate-pulse">🎯</span>
          )}
          {isToken(x, y) && (
            <div
              className="absolute inset-1 rounded-full shadow-lg transition-all duration-300 ease-out"
              style={{ background: color, boxShadow: `0 0 12px ${color}` }}
            />
          )}
        </div>
      ))}
    </div>
  )
}