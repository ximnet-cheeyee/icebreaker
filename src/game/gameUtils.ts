import type { Direction, Position } from './gameTypes'
import { nextPosition } from './gameEngine'

export interface ReplayEvent {
  event_id: string
  sequence_number: number
  player_name: string
  direction: Direction
  effective_direction: Direction
  position_before: Position
  position_after: Position
  result: string
  trap_triggered: boolean
  boundary_strike: boolean
  stunned: boolean
}

/** Builds the cumulative path (list of visited cells) up to and including a given event index. */
export function pathUpTo(startPosition: Position, events: ReplayEvent[], uptoIndex: number): Position[] {
  const path: Position[] = [startPosition]
  for (let i = 0; i <= uptoIndex && i < events.length; i++) {
    path.push(events[i].position_after)
  }
  return path
}

/** Re-derives the token position after N events, purely from the event log (sanity/replay use). */
export function tokenAfter(startPosition: Position, events: ReplayEvent[], uptoIndex: number): Position {
  if (uptoIndex < 0) return startPosition
  return events[Math.min(uptoIndex, events.length - 1)]?.position_after ?? startPosition
}

export function directionArrow(dir: Direction): string {
  return { UP: '↑', DOWN: '↓', LEFT: '←', RIGHT: '→' }[dir]
}

// re-exported for convenience in replay UIs that want to preview the "would-be" cell
export { nextPosition }