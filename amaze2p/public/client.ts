import { getClientId, setClientId, getPlayerName, setPlayerName } from './storage.ts'

export type Packet = {
  action: string
  data?: any
}

type Listener = (payload: any, packet: Packet) => void
type ConnectionListener = (status: 'connecting' | 'open' | 'closed') => void

const WS_PATH = '/ws'

class WebSocketClient {
  socket: WebSocket | null = null
  listeners = new Map<string, Set<Listener>>()
  connectionListeners = new Set<ConnectionListener>()
  queue: Packet[] = []
  reconnectDelay = 1000
  maxDelay = 30_000
  connecting = false
  identified = false

  connect() {
    if (this.connecting) return
    this.connecting = true
    this.notifyConnection('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const url = `${protocol}://${window.location.host}${WS_PATH}`
    const socket = new WebSocket(url)
    this.socket = socket
    this.identified = false

    socket.addEventListener('open', () => {
      this.reconnectDelay = 1000
      this.connecting = false
      this.identified = false
      this.notifyConnection('open')
      this.flushIdentify()
      this.flushQueue()
    })

    socket.addEventListener('message', event => {
      this.handleMessage(event)
    })

    socket.addEventListener('close', () => {
      this.socket = null
      this.connecting = false
      this.notifyConnection('closed')
      this.scheduleReconnect()
    })

    socket.addEventListener('error', () => {
      socket.close()
    })
  }

  notifyConnection(status: 'connecting' | 'open' | 'closed') {
    this.connectionListeners.forEach(listener => {
      try {
        listener(status)
      } catch {
        // ignore listener errors
      }
    })
  }

  scheduleReconnect() {
    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay)
    setTimeout(() => this.connect(), delay)
  }

  flushIdentify() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    const clientId = getClientId()
    let name = getPlayerName()
    if (!name) {
      name = `Player ${clientId.slice(0, 4).toUpperCase()}`
      setPlayerName(name)
    }
    this.sendPacket({ action: 'IDENTIFY', data: { clientId, name } })
  }

  flushQueue() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return
    while (this.queue.length > 0) {
      const packet = this.queue.shift()
      if (packet) this.sendPacket(packet)
    }
  }

  handleMessage(event: MessageEvent) {
    let packet: Packet
    try {
      packet = JSON.parse(event.data)
    } catch {
      console.warn('Invalid packet received', event.data)
      return
    }

    if (packet.action === 'IDENTIFY' && packet.data?.clientId) {
      this.identified = true
      setClientId(packet.data.clientId)
      if (packet.data.name) setPlayerName(packet.data.name)
    }

    if (packet.action === 'ERROR') {
      console.error('Server error', packet.data)
    }

    const listeners = this.listeners.get(packet.action)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(packet.data, packet)
        } catch (error) {
          console.error('Listener error', error)
        }
      })
    }
  }

  sendPacket(packet: Packet) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.queue.push(packet)
      return
    }
    this.socket.send(JSON.stringify(packet))
  }

  send(action: string, data?: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.queue.push({ action, data })
      if (!this.connecting) this.connect()
      return
    }
    if (!this.identified && action !== 'IDENTIFY') {
      this.queue.push({ action, data })
      this.flushIdentify()
      return
    }
    this.sendPacket({ action, data })
  }

  on(action: string, listener: Listener) {
    if (!this.listeners.has(action)) {
      this.listeners.set(action, new Set())
    }
    this.listeners.get(action)?.add(listener)
    return () => {
      this.listeners.get(action)?.delete(listener)
    }
  }

  onConnection(listener: ConnectionListener) {
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }
}

export const client = new WebSocketClient()

client.connect()

import './menu.ts'
import './lobby.ts'
import './game.ts'
