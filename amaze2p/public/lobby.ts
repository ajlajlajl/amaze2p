import { client } from './client.ts'
import { showScreen } from './menu.ts'
import { getClientId } from './storage.ts'

type LobbyPlayer = {
  clientId: string
  name: string
  acceptedGame: boolean
}

type LobbyState = {
  code: string
  leaderId: string
  players: LobbyPlayer[]
  selectedMazeSize: number
  status: 'OPEN' | 'STARTING' | 'IN_GAME'
}

let currentLobby: LobbyState | null = null
const localClientId = getClientId()

const lobbyCodeEl = document.getElementById('lobby-code')
const playerListEl = document.getElementById('player-list')
const mazeSelectEl = document.getElementById('maze-size') as HTMLSelectElement | null
const startButton = document.getElementById('start-game') as HTMLButtonElement | null
const acceptModal = document.getElementById('accept-modal')
const acceptButton = document.getElementById('accept-game') as HTMLButtonElement | null
const declineButton = document.getElementById('decline-game') as HTMLButtonElement | null
const lobbyStatusEl = document.getElementById('lobby-status')

const isLeader = (lobby: LobbyState) => lobby.leaderId === localClientId

const updateLobbyView = (lobby: LobbyState) => {
  currentLobby = lobby
  if (lobbyCodeEl) lobbyCodeEl.textContent = lobby.code

  if (playerListEl) {
    playerListEl.innerHTML = ''
    lobby.players.forEach(player => {
      const li = document.createElement('li')
      li.textContent = `${player.name}${player.clientId === lobby.leaderId ? ' ⭐' : ''}`
      if (player.acceptedGame) li.classList.add('accepted')
      playerListEl.appendChild(li)
    })
  }

  if (mazeSelectEl) {
    mazeSelectEl.value = String(lobby.selectedMazeSize)
    mazeSelectEl.disabled = !isLeader(lobby)
  }

  if (startButton) {
    startButton.disabled = !isLeader(lobby) || lobby.players.length < 2
    startButton.textContent = lobby.status === 'STARTING' ? 'Waiting for accept...' : 'Start Game'
  }

  if (lobbyStatusEl) {
    lobbyStatusEl.textContent =
      lobby.status === 'STARTING'
        ? 'Waiting for ready'
        : lobby.status === 'IN_GAME'
          ? 'Game in progress'
          : 'Lobby open'
  }

  updateAcceptModal(lobby)
}

const updateAcceptModal = (lobby: LobbyState) => {
  if (!acceptModal) return
  const localPlayer = lobby.players.find(player => player.clientId === localClientId)
  if (!localPlayer) {
    acceptModal.classList.remove('show')
    return
  }

  if (lobby.status === 'STARTING' && !localPlayer.acceptedGame && !isLeader(lobby)) {
    acceptModal.classList.add('show')
  } else {
    acceptModal.classList.remove('show')
  }
}

const handleCreate = (lobby: LobbyState) => {
  showScreen('lobby')
  updateLobbyView(lobby)
}

const handleLobbyUpdate = (lobby: LobbyState) => {
  if (!currentLobby) showScreen('lobby')
  updateLobbyView(lobby)
}

if (mazeSelectEl) {
  mazeSelectEl.addEventListener('change', () => {
    if (!currentLobby) return
    const value = Number(mazeSelectEl.value)
    client.send('SET_MAZE_SIZE', { size: value })
  })
}

if (startButton) {
  startButton.addEventListener('click', () => {
    client.send('START_GAME', {})
  })
}

if (acceptButton) {
  acceptButton.addEventListener('click', () => {
    client.send('ACCEPT_GAME', { accepted: true })
    acceptModal?.classList.remove('show')
  })
}

if (declineButton) {
  declineButton.addEventListener('click', () => {
    client.send('ACCEPT_GAME', { accepted: false })
    acceptModal?.classList.remove('show')
  })
}

client.on('CREATE_LOBBY', data => {
  if (data) handleCreate(data as LobbyState)
})

client.on('LOBBY_UPDATE', data => {
  if (data) handleLobbyUpdate(data as LobbyState)
})

client.on('START_GAME', data => {
  if (data) handleLobbyUpdate(data as LobbyState)
})

client.on('PLAYER_DISCONNECTED', data => {
  if (data?.lobby) handleLobbyUpdate(data.lobby as LobbyState)
})

client.on('RESTART_GAME', data => {
  if (data) handleLobbyUpdate(data as LobbyState)
})
