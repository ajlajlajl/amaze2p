import { generateMaze } from './maze.ts'
import { MazeSize, type GameState, type MoveRequest, type MoveResult, type Position } from './types.ts'

interface PlayerInfo {
  clientId: string
  name: string
}

const games = new Map<string, GameState>()

const MOVEMENT_SPEED_MS_PER_STEP = Number(
  process.env.MOVEMENT_SPEED_MS_PER_STEP ?? '50'
)

const RECONNECT_WINDOW_MS = 30_000

const directionVectors = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 }
} as const

const isWalkable = (value: number) => value === 1 || value === 2

const countOpenNeighbors = (grid: number[][], position: Position) => {
  let count = 0
  for (const key of Object.keys(directionVectors) as Array<keyof typeof directionVectors>) {
    const { dx, dy } = directionVectors[key]
    const nx = position.x + dx
    const ny = position.y + dy
    if (ny < 0 || ny >= grid.length) continue
    if (nx < 0 || nx >= grid[0].length) continue
    if (isWalkable(grid[ny][nx])) count += 1
  }
  return count
}

const moveToNextJunction = (grid: number[][], start: Position, direction: keyof typeof directionVectors) => {
  const { dx, dy } = directionVectors[direction]
  let current = { ...start }
  let steps = 0

  while (steps < grid.length * grid[0].length) {
    const next = { x: current.x + dx, y: current.y + dy }

    if (next.y < 0 || next.y >= grid.length) break
    if (next.x < 0 || next.x >= grid[0].length) break
    if (!isWalkable(grid[next.y][next.x])) break

    current = next
    steps += 1

    if (grid[current.y][current.x] === 2) break

    const openNeighbors = countOpenNeighbors(grid, current)
    if (openNeighbors >= 3) break
  }

  if (steps === 0) {
    throw new Error('INVALID_MOVE')
  }

  return {
    position: current,
    steps
  }
}

export const createGame = (
  lobbyCode: string,
  size: MazeSize,
  players: PlayerInfo[]
) => {
  const maze = generateMaze(size)
  const now = Date.now()
  const playerStates = players.reduce<GameState['players']>((acc, player) => {
    acc[player.clientId] = {
      clientId: player.clientId,
      name: player.name,
      position: { ...maze.start },
      targetPosition: null,
      movementEndsAt: null
    }
    return acc
  }, {})

  const game: GameState = {
    lobbyCode,
    maze,
    phase: 'WAITING',
    players: playerStates,
    startedAt: null,
    winnerId: null,
    allowReconnectUntil: now + RECONNECT_WINDOW_MS
  }

  games.set(lobbyCode, game)
  return game
}

export const getGame = (lobbyCode: string) => games.get(lobbyCode) ?? null

export const removeGame = (lobbyCode: string) => {
  games.delete(lobbyCode)
}

export const startCountdown = (lobbyCode: string, countdownSeconds: number) => {
  const game = games.get(lobbyCode)
  if (!game) throw new Error('GAME_NOT_FOUND')
  game.phase = 'COUNTDOWN'
  game.startedAt = Date.now() + countdownSeconds * 1000
  return game
}

export const beginGame = (lobbyCode: string) => {
  const game = games.get(lobbyCode)
  if (!game) throw new Error('GAME_NOT_FOUND')
  game.phase = 'PLAYING'
  game.startedAt = Date.now()
  game.allowReconnectUntil = Date.now() + RECONNECT_WINDOW_MS
  return game
}

export const markPlayerDisconnected = (lobbyCode: string, clientId: string) => {
  const game = games.get(lobbyCode)
  if (!game) return null
  const player = game.players[clientId]
  if (!player) return game
  game.allowReconnectUntil = Date.now() + RECONNECT_WINDOW_MS
  return game
}

export const markPlayerReconnected = (lobbyCode: string, clientId: string) => {
  const game = games.get(lobbyCode)
  if (!game) return null
  const player = game.players[clientId]
  if (!player) return game
  game.allowReconnectUntil = Date.now() + RECONNECT_WINDOW_MS
  return game
}

export const handleMove = (
  lobbyCode: string,
  clientId: string,
  move: MoveRequest
): MoveResult => {
  const game = games.get(lobbyCode)
  if (!game) throw new Error('GAME_NOT_FOUND')
  if (game.phase !== 'PLAYING') throw new Error('GAME_NOT_READY')

  const player = game.players[clientId]
  if (!player) throw new Error('PLAYER_NOT_FOUND')

  const direction = move.direction.toUpperCase()
  if (!Object.hasOwn(directionVectors, direction)) {
    throw new Error('INVALID_MOVE')
  }

  const { position, steps } = moveToNextJunction(
    game.maze.grid,
    player.position,
    direction as keyof typeof directionVectors
  )

  const durationMs = steps * MOVEMENT_SPEED_MS_PER_STEP
  const movementEndsAt = Date.now() + durationMs

  player.position = position
  player.targetPosition = position
  player.movementEndsAt = movementEndsAt

  if (game.maze.grid[position.y][position.x] === 2) {
    game.phase = 'FINISHED'
    game.winnerId = clientId
  }

  return {
    position,
    durationMs
  }
}

export const restartGame = (
  lobbyCode: string,
  size: MazeSize,
  players: PlayerInfo[]
) => {
  games.delete(lobbyCode)
  return createGame(lobbyCode, size, players)
}

export const expireOldGames = () => {
  const now = Date.now()
  for (const [code, game] of games.entries()) {
    if (game.phase === 'FINISHED' && game.allowReconnectUntil && now > game.allowReconnectUntil) {
      games.delete(code)
    }
  }
}
