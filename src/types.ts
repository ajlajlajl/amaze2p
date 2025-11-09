export type PacketAction =
  | 'JOIN_LOBBY'
  | 'CREATE_LOBBY'
  | 'START_GAME'
  | 'ACCEPT_GAME'
  | 'MOVE'
  | 'GAME_UPDATE'
  | 'COUNTDOWN'
  | 'WIN'
  | 'RESTART_GAME'
  | 'ERROR'
  | 'PLAYER_DISCONNECTED'
  | 'SET_MAZE_SIZE'
  | 'LOBBY_UPDATE'
  | 'IDENTIFY'

export interface PacketI<T = unknown> {
  action: PacketAction
  data?: T
}

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

export interface Position {
  x: number
  y: number
}

export type MazeCell = 0 | 1 | 2

export type MazeGrid = MazeCell[][]

export enum MazeSize {
  TenByTen = 10,
  TwentyByTwenty = 20,
  ThirtyByThirty = 30,
  FortyByForty = 40,
  FiftyByFifty = 50
}

export const mazeSizeValues = [
  MazeSize.TenByTen,
  MazeSize.TwentyByTwenty,
  MazeSize.ThirtyByThirty,
  MazeSize.FortyByForty,
  MazeSize.FiftyByFifty
] as const

export type GamePhase = 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED'

export interface PlayerIdentity {
  clientId: string
  name: string
  connected: boolean
  lastSeen: number
}

export interface LobbyPlayer {
  clientId: string
  name: string
  acceptedGame: boolean
}

export interface LobbyState {
  code: string
  leaderId: string
  createdAt: number
  players: LobbyPlayer[]
  selectedMazeSize: MazeSize
  status: 'OPEN' | 'STARTING' | 'IN_GAME'
}

export interface MazeMetadata {
  grid: MazeGrid
  width: number
  height: number
  start: Position
  exit: Position
}

export interface PlayerGameState {
  clientId: string
  name: string
  position: Position
  targetPosition: Position | null
  movementEndsAt: number | null
}

export interface GameState {
  lobbyCode: string
  maze: MazeMetadata
  phase: GamePhase
  players: Record<string, PlayerGameState>
  startedAt: number | null
  winnerId: string | null
  allowReconnectUntil: number | null
}

export interface CountdownState {
  lobbyCode: string
  secondsRemaining: number
}

export interface MoveRequest {
  direction: Direction
}

export interface MoveResult {
  position: Position
  durationMs: number
}

export type LobbyError =
  | 'LOBBY_NOT_FOUND'
  | 'LOBBY_FULL'
  | 'NOT_LEADER'
  | 'INVALID_CODE'
  | 'ALREADY_IN_LOBBY'

export type GameError =
  | 'GAME_NOT_FOUND'
  | 'GAME_NOT_READY'
  | 'INVALID_MOVE'
  | 'GAME_ALREADY_FINISHED'

export interface ErrorPacketData {
  message: string
  code?: LobbyError | GameError | string
}
