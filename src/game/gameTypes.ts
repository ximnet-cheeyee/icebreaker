export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
export type GameMode = 'BLIND_NAVIGATOR' | 'HIDDEN_SABOTEUR'
export type VictoryType = 'TIME_ATTACK' | 'MOVE_ECONOMY'
export type TargetMode = 'IDENTICAL' | 'UNIQUE'

export interface Position {
  x: number
  y: number
}

export interface Player {
  id: string
  name: string
  teamId: string | null
  isBoardMover: boolean
}

export interface TeamState {
  teamId: string
  color: string
  playerOrder: string[] // player ids in turn order
  currentPlayerIndex: number
  boardMoverId: string | null
  token: Position
  target: Position
  traps: Position[]
  startPosition: Position
  stunTurnsRemaining: number
  movesRemaining: number
  status: 'ACTIVE' | 'TARGET_FOUND' | 'TIMEOUT' | 'MOVE_DEPLETED'
  finishedAtMs: number | null
}

export interface SaboteurState {
  playerOrder: string[]
  currentPlayerIndex: number
  saboteurPlayerId: string
  token: Position
  target: Position
  traps: Position[]
  startPosition: Position
  stunTurnsRemaining: number
  movesRemaining: number
  status: 'ACTIVE' | 'TARGET_FOUND' | 'TIMEOUT' | 'MOVE_DEPLETED'
}

export interface MatchConfig {
  mode: GameMode
  gridSize: 8 | 10 | 12
  victoryType: VictoryType
  timeAttackSeconds: number
  moveEconomyLimit: number
  stunTrapsEnabled: boolean
  trapCount: number
  reverseGlitchEnabled: boolean
  targetMode: TargetMode // Blind Navigator only
  numTeams: 2 | 3 | 4 // Blind Navigator only
}

export interface GameEvent {
  eventId: string
  matchId: string
  sequenceNumber: number
  timestampMs: number
  playerId: string
  playerName: string
  teamId: string | null
  direction: Direction
  effectiveDirection: Direction
  positionBefore: Position
  positionAfter: Position
  result: 'MOVED' | 'BOUNDARY_STRIKE' | 'TRAP_TRIGGERED' | 'STUNNED_NO_MOVE' | 'TARGET_REACHED'
  trapTriggered: boolean
  boundaryStrike: boolean
  stunned: boolean
  moveConsumed: boolean
}

export const TEAM_COLORS = ['#FF4757', '#3B82F6', '#22C55E', '#F5A623']
export const TEAM_NAMES = ['RED', 'BLUE', 'GREEN', 'GOLD']