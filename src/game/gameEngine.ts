import type { Direction, Position } from './gameTypes'

export function isReverseGlitchActive(matchStartedAtMs: number, nowMs: number): boolean {
  const elapsed = Math.floor((nowMs - matchStartedAtMs) / 1000)
  const cyclePos = elapsed % 45
  return cyclePos >= 30 // last 15s of each 45s cycle
}

// Seconds remaining until the current glitch/normal phase flips — useful for TV countdown UI
export function glitchPhaseSecondsRemaining(matchStartedAtMs: number, nowMs: number): number {
  const elapsed = Math.floor((nowMs - matchStartedAtMs) / 1000)
  const cyclePos = elapsed % 45
  return cyclePos >= 30 ? 45 - cyclePos : 30 - cyclePos
}

export function effectiveDirection(dir: Direction, glitchActive: boolean): Direction {
  if (!glitchActive) return dir
  const flip: Record<Direction, Direction> = {
    UP: 'DOWN', DOWN: 'UP', LEFT: 'RIGHT', RIGHT: 'LEFT',
  }
  return flip[dir]
}

export function nextPosition(pos: Position, dir: Direction): Position {
  switch (dir) {
    case 'UP': return { x: pos.x, y: pos.y - 1 }
    case 'DOWN': return { x: pos.x, y: pos.y + 1 }
    case 'LEFT': return { x: pos.x - 1, y: pos.y }
    case 'RIGHT': return { x: pos.x + 1, y: pos.y }
  }
}

export function inBounds(pos: Position, gridSize: number): boolean {
  return pos.x >= 0 && pos.x < gridSize && pos.y >= 0 && pos.y < gridSize
}

export function posEquals(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y
}

export function isTrap(pos: Position, traps: Position[]): boolean {
  return traps.some((t) => posEquals(t, pos))
}

export function randomPosition(gridSize: number): Position {
  return { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) }
}

export function generateTarget(gridSize: number, start: Position): Position {
  let target = randomPosition(gridSize)
  while (posEquals(target, start)) target = randomPosition(gridSize)
  return target
}

export function generateTraps(gridSize: number, count: number, start: Position, target: Position): Position[] {
  const traps: Position[] = []
  let attempts = 0
  while (traps.length < count && attempts < count * 50) {
    attempts++
    const p = randomPosition(gridSize)
    if (posEquals(p, start) || posEquals(p, target)) continue
    if (traps.some((t) => posEquals(t, p))) continue
    traps.push(p)
  }
  return traps
}

export interface MoveResult {
  positionBefore: Position
  positionAfter: Position
  effectiveDir: Direction
  result: 'MOVED' | 'BOUNDARY_STRIKE' | 'TRAP_TRIGGERED' | 'STUNNED_NO_MOVE' | 'TARGET_REACHED'
  trapTriggered: boolean
  boundaryStrike: boolean
  stunned: boolean
  newStunTurnsRemaining: number
}

// Pure, deterministic single-move resolution. Mirrored exactly in the Postgres RPC (see supabase/schema.sql)
// so the authoritative server-side result always matches what this function would compute given the same inputs.
export function resolveMove(params: {
  currentPosition: Position
  direction: Direction
  gridSize: number
  traps: Position[]
  target: Position
  stunTurnsRemaining: number
  glitchActive: boolean
}): MoveResult {
  const { currentPosition, direction, gridSize, traps, target, stunTurnsRemaining, glitchActive } = params
  const effDir = effectiveDirection(direction, glitchActive)

  if (stunTurnsRemaining > 0) {
    return {
      positionBefore: currentPosition,
      positionAfter: currentPosition,
      effectiveDir: effDir,
      result: 'STUNNED_NO_MOVE',
      trapTriggered: false,
      boundaryStrike: false,
      stunned: true,
      newStunTurnsRemaining: stunTurnsRemaining - 1,
    }
  }

  const proposed = nextPosition(currentPosition, effDir)

  if (!inBounds(proposed, gridSize)) {
    return {
      positionBefore: currentPosition,
      positionAfter: currentPosition,
      effectiveDir: effDir,
      result: 'BOUNDARY_STRIKE',
      trapTriggered: false,
      boundaryStrike: true,
      stunned: false,
      newStunTurnsRemaining: 0,
    }
  }

  if (posEquals(proposed, target)) {
    return {
      positionBefore: currentPosition,
      positionAfter: proposed,
      effectiveDir: effDir,
      result: 'TARGET_REACHED',
      trapTriggered: false,
      boundaryStrike: false,
      stunned: false,
      newStunTurnsRemaining: 0,
    }
  }

  if (isTrap(proposed, traps)) {
    return {
      positionBefore: currentPosition,
      positionAfter: proposed,
      effectiveDir: effDir,
      result: 'TRAP_TRIGGERED',
      trapTriggered: true,
      boundaryStrike: false,
      stunned: false,
      newStunTurnsRemaining: 3,
    }
  }

  return {
    positionBefore: currentPosition,
    positionAfter: proposed,
    effectiveDir: effDir,
    result: 'MOVED',
    trapTriggered: false,
    boundaryStrike: false,
    stunned: false,
    newStunTurnsRemaining: 0,
  }
}

export function nextTurnIndex(currentIndex: number, rosterLength: number): number {
  return (currentIndex + 1) % rosterLength
}

export function shuffleTeams(playerIds: string[], numTeams: number): string[][] {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5)
  const teams: string[][] = Array.from({ length: numTeams }, () => [])
  shuffled.forEach((id, i) => teams[i % numTeams].push(id))
  return teams
}