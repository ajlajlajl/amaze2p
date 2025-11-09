import { MazeSize, mazeSizeValues, type LobbyPlayer, type LobbyState } from './types.ts'

const LOBBY_CODE_LENGTH = 4
const MAX_PLAYERS = 2
const LOBBY_TTL_MS = 60 * 60 * 1000

const lobbies = new Map<string, LobbyState>()

const randomDigit = () => Math.floor(Math.random() * 10)

const generateLobbyCode = () => {
  let attempts = 0
  while (attempts < 10000) {
    const code = Array.from({ length: LOBBY_CODE_LENGTH }, randomDigit).join('')
    if (!lobbies.has(code)) return code
    attempts += 1
  }
  throw new Error('Failed to generate unique lobby code')
}

export const getLobby = (code: string) => lobbies.get(code) ?? null

export const createLobby = (leaderId: string, leaderName: string) => {
  const code = generateLobbyCode()
  const player: LobbyPlayer = {
    clientId: leaderId,
    name: leaderName,
    acceptedGame: false
  }

  const lobby: LobbyState = {
    code,
    leaderId,
    createdAt: Date.now(),
    players: [player],
    selectedMazeSize: MazeSize.TenByTen,
    status: 'OPEN'
  }

  lobbies.set(code, lobby)
  return lobby
}

export const joinLobby = (code: string, clientId: string, name: string) => {
  const lobby = lobbies.get(code)
  if (!lobby) throw new Error('LOBBY_NOT_FOUND')
  if (lobby.players.find(p => p.clientId === clientId)) {
    throw new Error('ALREADY_IN_LOBBY')
  }
  if (lobby.players.length >= MAX_PLAYERS) {
    throw new Error('LOBBY_FULL')
  }

  const player: LobbyPlayer = {
    clientId,
    name,
    acceptedGame: false
  }

  lobby.players.push(player)
  lobby.status = lobby.players.length === MAX_PLAYERS ? 'OPEN' : lobby.status
  return lobby
}

export const leaveLobby = (code: string, clientId: string) => {
  const lobby = lobbies.get(code)
  if (!lobby) return null

  lobby.players = lobby.players.filter(player => player.clientId !== clientId)

  if (lobby.players.length === 0) {
    lobbies.delete(code)
    return null
  }

  if (!lobby.players.find(player => player.clientId === lobby.leaderId)) {
    lobby.leaderId = lobby.players[0].clientId
  }

  lobby.status = 'OPEN'
  return lobby
}

export const setMazeSize = (code: string, leaderId: string, size: MazeSize) => {
  const lobby = lobbies.get(code)
  if (!lobby) throw new Error('LOBBY_NOT_FOUND')
  if (lobby.leaderId !== leaderId) throw new Error('NOT_LEADER')
  if (!mazeSizeValues.includes(size)) throw new Error('INVALID_SIZE')
  lobby.selectedMazeSize = size
  return lobby
}

export const markAcceptGame = (code: string, clientId: string, accepted: boolean) => {
  const lobby = lobbies.get(code)
  if (!lobby) throw new Error('LOBBY_NOT_FOUND')
  const player = lobby.players.find(p => p.clientId === clientId)
  if (!player) throw new Error('NOT_IN_LOBBY')
  player.acceptedGame = accepted
  return lobby
}

export const resetAcceptances = (code: string) => {
  const lobby = lobbies.get(code)
  if (!lobby) return null
  lobby.players.forEach(player => {
    player.acceptedGame = false
  })
  return lobby
}

export const startGame = (code: string) => {
  const lobby = lobbies.get(code)
  if (!lobby) throw new Error('LOBBY_NOT_FOUND')
  lobby.status = 'STARTING'
  return lobby
}

export const finishGame = (code: string) => {
  const lobby = lobbies.get(code)
  if (!lobby) return null
  lobby.status = 'IN_GAME'
  return lobby
}

export const endGame = (code: string) => {
  const lobby = lobbies.get(code)
  if (!lobby) return null
  lobby.status = 'OPEN'
  resetAcceptances(code)
  return lobby
}

export const cleanupStaleLobbies = () => {
  const now = Date.now()
  for (const [code, lobby] of lobbies.entries()) {
    if (now - lobby.createdAt > LOBBY_TTL_MS || lobby.players.length === 0) {
      lobbies.delete(code)
    }
  }
}

export const listLobbies = () => Array.from(lobbies.values())
