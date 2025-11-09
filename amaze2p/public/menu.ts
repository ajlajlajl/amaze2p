import { client } from './client.ts'
import { getClientId, getPlayerName, setPlayerName } from './storage.ts'

const screens = new Map<string, HTMLElement>()

export const showScreen = (id: string) => {
  screens.forEach((element, key) => {
    if (key === id) {
      element.classList.add('active')
    } else {
      element.classList.remove('active')
    }
  })
}

const initMenu = () => {
  const menuScreen = document.getElementById('menu-screen')
  const lobbyScreen = document.getElementById('lobby-screen')
  const gameScreen = document.getElementById('game-screen')

  if (menuScreen) screens.set('menu', menuScreen)
  if (lobbyScreen) screens.set('lobby', lobbyScreen)
  if (gameScreen) screens.set('game', gameScreen)

  const nameInput = document.getElementById('player-name') as HTMLInputElement | null
  const createButton = document.getElementById('create-lobby') as HTMLButtonElement | null
  const joinForm = document.getElementById('join-form') as HTMLFormElement | null
  const joinCodeInput = document.getElementById('join-code') as HTMLInputElement | null
  const connectionStatus = document.getElementById('connection-status')

  if (nameInput) {
    nameInput.value = getPlayerName()
    nameInput.addEventListener('change', () => {
      const value = nameInput.value.trim()
      if (value.length === 0) return
      setPlayerName(value)
      client.send('IDENTIFY', {
        clientId: getClientId(),
        name: value
      })
    })
  }

  if (createButton) {
    createButton.addEventListener('click', () => {
      const name = nameInput?.value.trim()
      if (name && name.length > 0) setPlayerName(name)
      client.send('CREATE_LOBBY', {
        clientId: getClientId(),
        name: nameInput?.value.trim()
      })
    })
  }

  if (joinForm && joinCodeInput) {
    joinForm.addEventListener('submit', event => {
      event.preventDefault()
      const code = joinCodeInput.value.trim()
      if (!/^\d{4}$/.test(code)) {
        joinCodeInput.classList.add('input-error')
        return
      }
      joinCodeInput.classList.remove('input-error')
      const name = nameInput?.value.trim()
      if (name && name.length > 0) setPlayerName(name)
      client.send('JOIN_LOBBY', {
        clientId: getClientId(),
        code,
        name
      })
    })
  }

  client.onConnection(status => {
    if (!connectionStatus) return
    connectionStatus.textContent = status === 'open' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'
    connectionStatus.dataset.status = status
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMenu)
} else {
  initMenu()
}
