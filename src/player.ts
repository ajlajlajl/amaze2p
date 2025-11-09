import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid'
import type { PlayerIdentity } from './types.ts'

interface PlayerRecord extends PlayerIdentity {
  lobbyCode: string | null
  gameCode: string | null
  authenticatedAt: number
}

const players = new Map<string, PlayerRecord>()

const TEN_SECONDS = 10_000

export const isValidClientId = (value: string | undefined | null) => {
  if (!value) return false
  if (!uuidValidate(value)) return false
  return uuidVersion(value) === 4
}

export const ensureClientId = (proposed?: string) => {
  if (isValidClientId(proposed)) return proposed as string
  return uuidv4()
}

export const getPlayer = (clientId: string) => players.get(clientId) ?? null

export const upsertPlayer = (clientId: string, name: string) => {
  const now = Date.now()
  const existing = players.get(clientId)

  if (existing) {
    existing.name = name
    existing.connected = true
    existing.lastSeen = now
    return existing
  }

  const record: PlayerRecord = {
    clientId,
    name,
    connected: true,
    lastSeen: now,
    authenticatedAt: now,
    lobbyCode: null,
    gameCode: null
  }

  players.set(clientId, record)
  return record
}

export const markPlayerSeen = (clientId: string) => {
  const player = players.get(clientId)
  if (!player) return
  player.lastSeen = Date.now()
  player.connected = true
}

export const authenticatePlayer = (clientId: string) => {
  const player = players.get(clientId)
  if (!player) return false
  const now = Date.now()
  return now - player.authenticatedAt <= TEN_SECONDS
}

export const assignLobby = (clientId: string, lobbyCode: string | null) => {
  const player = players.get(clientId)
  if (!player) return
  player.lobbyCode = lobbyCode
}

export const assignGame = (clientId: string, gameCode: string | null) => {
  const player = players.get(clientId)
  if (!player) return
  player.gameCode = gameCode
}

export const markDisconnected = (clientId: string) => {
  const player = players.get(clientId)
  if (!player) return
  player.connected = false
  player.lastSeen = Date.now()
}

export const removePlayer = (clientId: string) => {
  players.delete(clientId)
}

export const getPlayersInLobby = (lobbyCode: string) => {
  const result: PlayerRecord[] = []
  for (const player of players.values()) {
    if (player.lobbyCode === lobbyCode) result.push(player)
  }
  return result
}

export const getPlayersInGame = (gameCode: string) => {
  const result: PlayerRecord[] = []
  for (const player of players.values()) {
    if (player.gameCode === gameCode) result.push(player)
  }
  return result
}

export const cleanupStalePlayers = (maxAgeMs: number) => {
  const now = Date.now()
  for (const [clientId, player] of players.entries()) {
    if (now - player.lastSeen > maxAgeMs) {
      players.delete(clientId)
    }
  }
}
