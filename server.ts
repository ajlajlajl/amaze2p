import { config } from 'dotenv'
config()

import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { upgradeWebSocket } from 'hono/websocket'

import { ensureClientId, markDisconnected, upsertPlayer, assignLobby as assignPlayerLobby, assignGame as assignPlayerGame } from './src/player.ts'
import { createLobby, getLobby, joinLobby, leaveLobby, setMazeSize, markAcceptGame, resetAcceptances, startGame, finishGame } from './src/lobby.ts'
import { beginGame, createGame, getGame, handleMove, markPlayerDisconnected, restartGame, startCountdown } from './src/game.ts'
import type {
  CountdownState,
  PacketI,
  LobbyState,
  GameState,
  MoveRequest,
  ErrorPacketData,
  MazeSize
} from './src/types.ts'

type ServerPacket<T = unknown> = PacketI<T>

interface ConnectionContext {
  socket: WebSocket
  clientId: string | null
  name: string | null
  lobbyCode: string | null
}

const app = new Hono()

app.use(
  '/*',
  serveStatic({
    root: './public',
    rewriteRequestPath: path => (path === '/' ? '/index.html' : path)
  })
)

const connections = new Map<WebSocket, ConnectionContext>()
const lobbySockets = new Map<string, Set<WebSocket>>()
const countdownTimers = new Map<string, ReturnType<typeof setInterval>>()

const IDENTIFY_TIMEOUT_MS = 10_000
const COUNTDOWN_SECONDS = 5

const sendPacket = (socket: WebSocket, packet: ServerPacket) => {
  try {
    socket.send(JSON.stringify(packet))
  } catch (error) {
    console.error('Failed to send packet', error)
  }
}

const broadcastToLobby = (lobbyCode: string, packet: ServerPacket) => {
  const sockets = lobbySockets.get(lobbyCode)
  if (!sockets) return
  for (const socket of sockets) {
    sendPacket(socket, packet)
  }
}

const addSocketToLobby = (socket: WebSocket, lobbyCode: string) => {
  let sockets = lobbySockets.get(lobbyCode)
  if (!sockets) {
    sockets = new Set()
    lobbySockets.set(lobbyCode, sockets)
  }
  sockets.add(socket)
}

const removeSocketFromLobby = (socket: WebSocket, lobbyCode: string | null) => {
  if (!lobbyCode) return
  const sockets = lobbySockets.get(lobbyCode)
  if (!sockets) return
  sockets.delete(socket)
  if (sockets.size === 0) {
    lobbySockets.delete(lobbyCode)
  }
}

const sendError = (socket: WebSocket, message: string, code?: string) => {
  const packet: ServerPacket<ErrorPacketData> = {
    action: 'ERROR',
    data: { message, code }
  }
  sendPacket(socket, packet)
}

const sanitizeLobby = (lobby: LobbyState) => ({
  ...lobby,
  players: lobby.players.map(player => ({
    ...player
  }))
})

const sanitizeGame = (game: GameState) => ({
  lobbyCode: game.lobbyCode,
  phase: game.phase,
  maze: game.maze,
  players: Object.values(game.players),
  winnerId: game.winnerId,
  startedAt: game.startedAt
})

const scheduleCountdown = (lobby: LobbyState) => {
  const lobbyCode = lobby.code
  const game = getGame(lobbyCode)
  if (!game) return

  const existingTimer = countdownTimers.get(lobbyCode)
  if (existingTimer) {
    clearInterval(existingTimer)
  }

  let remaining = COUNTDOWN_SECONDS
  const packet: ServerPacket<CountdownState> = {
    action: 'COUNTDOWN',
    data: { lobbyCode, secondsRemaining: remaining }
  }
  broadcastToLobby(lobbyCode, packet)

  const timer = setInterval(() => {
    remaining -= 1
    if (remaining <= 0) {
      clearInterval(timer)
      countdownTimers.delete(lobbyCode)
      beginGame(lobbyCode)
      finishGame(lobbyCode)
      broadcastToLobby(lobbyCode, {
        action: 'GAME_UPDATE',
        data: sanitizeGame(getGame(lobbyCode) as GameState)
      })
      const lobby = getLobby(lobbyCode)
      if (lobby) {
        broadcastToLobby(lobbyCode, {
          action: 'LOBBY_UPDATE',
          data: sanitizeLobby(lobby)
        })
      }
      return
    }
    broadcastToLobby(lobbyCode, {
      action: 'COUNTDOWN',
      data: { lobbyCode, secondsRemaining: remaining }
    })
  }, 1000)

  countdownTimers.set(lobbyCode, timer)
}

const handleIdentify = (
  context: ConnectionContext,
  socket: WebSocket,
  packet: PacketI<Record<string, unknown>>
) => {
  const clientIdRaw = typeof packet.data?.clientId === 'string' ? packet.data.clientId : undefined
  const nameRaw = typeof packet.data?.name === 'string' ? packet.data.name : undefined

  if (!nameRaw || nameRaw.trim().length === 0) {
    sendError(socket, 'Name is required')
    return null
  }

  const clientId = ensureClientId(clientIdRaw)
  const name = nameRaw.trim().slice(0, 32)

  context.clientId = clientId
  context.name = name
  upsertPlayer(clientId, name)

  sendPacket(socket, {
    action: 'IDENTIFY',
    data: { clientId, name }
  })

  return { clientId, name }
}

const ensureIdentified = (
  context: ConnectionContext,
  socket: WebSocket,
  packet: PacketI<Record<string, unknown>>
) => {
  if (context.clientId && context.name) {
    return { clientId: context.clientId, name: context.name }
  }
  return handleIdentify(context, socket, packet)
}

const handleCreateLobby = (
  context: ConnectionContext,
  socket: WebSocket,
  packet: PacketI<Record<string, unknown>>
) => {
  const identity = ensureIdentified(context, socket, packet)
  if (!identity) return

  const requestedSize = Number(packet.data?.size ?? packet.data?.mazeSize ?? 10)
  const size = Number.isFinite(requestedSize) ? (requestedSize as MazeSize) : (10 as MazeSize)
  const lobby = createLobby(identity.clientId, identity.name)
  try {
    setMazeSize(lobby.code, identity.clientId, size)
  } catch {
    // ignore invalid size, default remains
  }

  context.lobbyCode = lobby.code
  addSocketToLobby(socket, lobby.code)
  assignPlayerLobby(identity.clientId, lobby.code)

  sendPacket(socket, {
    action: 'CREATE_LOBBY',
    data: sanitizeLobby(lobby)
  })
}

const handleJoinLobbyPacket = (
  context: ConnectionContext,
  socket: WebSocket,
  packet: PacketI<Record<string, unknown>>
) => {
  const identity = ensureIdentified(context, socket, packet)
  if (!identity) return

  const codeRaw = packet.data?.code
  if (typeof codeRaw !== 'string' || !/^\d{4}$/.test(codeRaw)) {
    sendError(socket, 'Invalid lobby code', 'INVALID_CODE')
    return
  }

  try {
    const lobby = joinLobby(codeRaw, identity.clientId, identity.name)
    context.lobbyCode = lobby.code
    addSocketToLobby(socket, lobby.code)
    assignPlayerLobby(identity.clientId, lobby.code)

    broadcastToLobby(lobby.code, {
      action: 'LOBBY_UPDATE',
      data: sanitizeLobby(lobby)
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    sendError(socket, 'Failed to join lobby', code)
  }
}

const handleSetMazeSize = (
  context: ConnectionContext,
  socket: WebSocket,
  packet: PacketI<Record<string, unknown>>
) => {
  const lobbyCode = context.lobbyCode
  if (!lobbyCode) {
    sendError(socket, 'No active lobby')
    return
  }
  const sizeRaw = Number(packet.data?.size ?? packet.data?.mazeSize)
  if (!Number.isFinite(sizeRaw)) {
    sendError(socket, 'Invalid maze size')
    return
  }
  try {
    const lobby = setMazeSize(lobbyCode, context.clientId as string, sizeRaw as MazeSize)
    broadcastToLobby(lobby.code, {
      action: 'LOBBY_UPDATE',
      data: sanitizeLobby(lobby)
    })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    sendError(socket, 'Failed to set maze size', code)
  }
}

const ensureGame = (lobbyCode: string, lobby: LobbyState) => {
  let game = getGame(lobbyCode)
  if (!game) {
    game = createGame(
      lobbyCode,
      lobby.selectedMazeSize,
      lobby.players.map(player => ({
        clientId: player.clientId,
        name: player.name
      }))
    )
    lobby.players.forEach(player => assignPlayerGame(player.clientId, lobbyCode))
  }
  return game
}

const handleStartGame = (
  context: ConnectionContext,
  socket: WebSocket
) => {
  const lobbyCode = context.lobbyCode
  if (!lobbyCode) {
    sendError(socket, 'Not in a lobby')
    return
  }
  const lobby = getLobby(lobbyCode)
  if (!lobby) {
    sendError(socket, 'Lobby not found', 'LOBBY_NOT_FOUND')
    return
  }
  if (lobby.leaderId !== context.clientId) {
    sendError(socket, 'Only leader can start game', 'NOT_LEADER')
    return
  }
  if (lobby.players.length < 2) {
    sendError(socket, 'Need two players to start')
    return
  }

  startGame(lobby.code)
  resetAcceptances(lobby.code)
  const leader = lobby.players.find(player => player.clientId === lobby.leaderId)
  if (leader) leader.acceptedGame = true

  broadcastToLobby(lobby.code, {
    action: 'START_GAME',
    data: sanitizeLobby(lobby)
  })
  broadcastToLobby(lobby.code, {
    action: 'LOBBY_UPDATE',
    data: sanitizeLobby(lobby)
  })
}

const handleAcceptGamePacket = (
  context: ConnectionContext,
  socket: WebSocket,
  packet: PacketI<Record<string, unknown>>
) => {
  const lobbyCode = context.lobbyCode
  if (!lobbyCode) {
    sendError(socket, 'Not in a lobby')
    return
  }
  const accepted = Boolean(packet.data?.accepted ?? packet.data?.accept)

  try {
    const lobby = markAcceptGame(lobbyCode, context.clientId as string, accepted)
    broadcastToLobby(lobby.code, {
      action: 'LOBBY_UPDATE',
      data: sanitizeLobby(lobby)
    })

    if (!accepted) {
      resetAcceptances(lobby.code)
      lobby.status = 'OPEN'
      broadcastToLobby(lobby.code, {
        action: 'LOBBY_UPDATE',
        data: sanitizeLobby(lobby)
      })
      return
    }

    const allReady = lobby.players.length === 2 && lobby.players.every(player => player.acceptedGame)
    if (allReady) {
      ensureGame(lobby.code, lobby)
      startCountdown(lobby.code, COUNTDOWN_SECONDS)
      broadcastToLobby(lobby.code, {
        action: 'GAME_UPDATE',
        data: sanitizeGame(getGame(lobby.code) as GameState)
      })
      scheduleCountdown(lobby)
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    sendError(socket, 'Failed to accept game', code)
  }
}

const handleMovePacket = (
  context: ConnectionContext,
  socket: WebSocket,
  packet: PacketI<MoveRequest>
) => {
  const lobbyCode = context.lobbyCode
  if (!lobbyCode) {
    sendError(socket, 'Not in a game')
    return
  }

  try {
    const result = handleMove(lobbyCode, context.clientId as string, packet.data as MoveRequest)
    const game = getGame(lobbyCode)
    if (!game) throw new Error('GAME_NOT_FOUND')

    broadcastToLobby(lobbyCode, {
      action: 'GAME_UPDATE',
      data: {
        ...sanitizeGame(game),
        lastMove: {
          clientId: context.clientId,
          result
        }
      }
    })

    if (game.phase === 'FINISHED' && game.winnerId) {
      broadcastToLobby(lobbyCode, {
        action: 'WIN',
        data: {
          winnerId: game.winnerId,
          game: sanitizeGame(game)
        }
      })
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN'
    sendError(socket, 'Move rejected', code)
  }
}

const handleRestart = (
  context: ConnectionContext,
  socket: WebSocket
) => {
  const lobbyCode = context.lobbyCode
  if (!lobbyCode) {
    sendError(socket, 'Not in a lobby')
    return
  }
  const lobby = getLobby(lobbyCode)
  if (!lobby) {
    sendError(socket, 'Lobby not found', 'LOBBY_NOT_FOUND')
    return
  }
  if (lobby.leaderId !== context.clientId) {
    sendError(socket, 'Only leader can restart', 'NOT_LEADER')
    return
  }

  const players = lobby.players.map(player => ({
    clientId: player.clientId,
    name: player.name
  }))

  restartGame(lobbyCode, lobby.selectedMazeSize, players)
  lobby.status = 'OPEN'
  lobby.players.forEach(player => assignPlayerGame(player.clientId, lobbyCode))
  resetAcceptances(lobbyCode)
  const leader = lobby.players.find(player => player.clientId === lobby.leaderId)
  if (leader) leader.acceptedGame = true

  broadcastToLobby(lobbyCode, {
    action: 'RESTART_GAME',
    data: sanitizeLobby(lobby)
  })
  broadcastToLobby(lobbyCode, {
    action: 'LOBBY_UPDATE',
    data: sanitizeLobby(lobby)
  })
}

app.get(
  '/ws',
  upgradeWebSocket(c => ({
    onOpen: (_event, socket) => {
      const context: ConnectionContext = {
        socket,
        clientId: null,
        name: null,
        lobbyCode: null
      }
      connections.set(socket, context)

      setTimeout(() => {
        if (!context.clientId) {
          sendError(socket, 'Identification timed out')
          socket.close()
        }
      }, IDENTIFY_TIMEOUT_MS)
    },
    onMessage: event => {
      const socket = event.target as WebSocket
      const context = connections.get(socket)
      if (!context) return

        let packet: PacketI
        try {
          packet = JSON.parse(event.data.toString())
        } catch {
          sendError(socket, 'Invalid packet format')
          return
        }

        if (!packet || typeof packet.action !== 'string') {
          sendError(socket, 'Invalid packet')
          return
        }

        switch (packet.action) {
          case 'IDENTIFY':
            handleIdentify(context, socket, packet)
            break
          case 'CREATE_LOBBY':
            handleCreateLobby(context, socket, packet)
            break
          case 'JOIN_LOBBY':
            handleJoinLobbyPacket(context, socket, packet)
            break
          case 'SET_MAZE_SIZE':
            handleSetMazeSize(context, socket, packet)
            break
          case 'START_GAME':
            handleStartGame(context, socket)
            break
          case 'ACCEPT_GAME':
            handleAcceptGamePacket(context, socket, packet)
            break
          case 'MOVE':
            handleMovePacket(context, socket, packet)
            break
          case 'RESTART_GAME':
            handleRestart(context, socket)
            break
          default:
            sendError(socket, `Unhandled action ${packet.action}`)
            break
        }
    },
    onClose: (_event, socket) => {
      const context = connections.get(socket)
      if (!context) return

      if (context.lobbyCode) {
        removeSocketFromLobby(socket, context.lobbyCode)

        const timer = countdownTimers.get(context.lobbyCode)
        if (timer) {
          clearInterval(timer)
          countdownTimers.delete(context.lobbyCode)
        }

        const lobby = leaveLobby(context.lobbyCode, context.clientId as string)
        if (lobby) {
          broadcastToLobby(lobby.code, {
            action: 'PLAYER_DISCONNECTED',
            data: {
              clientId: context.clientId,
              lobby: sanitizeLobby(lobby)
            }
          })
          broadcastToLobby(lobby.code, {
            action: 'LOBBY_UPDATE',
            data: sanitizeLobby(lobby)
          })
        }
        const game = markPlayerDisconnected(context.lobbyCode, context.clientId as string)
        if (game) {
          broadcastToLobby(context.lobbyCode, {
            action: 'PLAYER_DISCONNECTED',
            data: {
              clientId: context.clientId,
              game: sanitizeGame(game)
            }
          })
        }
      }

      if (context.clientId) {
        markDisconnected(context.clientId)
        assignPlayerLobby(context.clientId, null)
        assignPlayerGame(context.clientId, null)
      }

      connections.delete(socket)
    }
  }))
)

Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.PORT ?? 3000),
  websocket: {
    message() {},
    open() {},
    close() {}
  }
})

console.log(`Server listening on http://localhost:${process.env.PORT ?? 3000}`)
