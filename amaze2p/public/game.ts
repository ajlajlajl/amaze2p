import { client } from './client.ts'
import { showScreen } from './menu.ts'
import { getClientId } from './storage.ts'

type Position = {
  x: number
  y: number
}

type PlayerState = {
  clientId: string
  name: string
  position: Position
  targetPosition: Position | null
  movementEndsAt: number | null
}

type MazeMetadata = {
  grid: number[][]
  width: number
  height: number
  start: Position
  exit: Position
}

type GameState = {
  lobbyCode: string
  phase: 'WAITING' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED'
  maze: MazeMetadata
  players: PlayerState[]
  winnerId: string | null
  startedAt: number | null
}

const PIXI = (window as any).PIXI

let app: any = null
let mazeGraphics: any = null
const playerSprites = new Map<string, any>()
const animations = new Map<
  string,
  {
    from: Position
    to: Position
    start: number
    duration: number
  }
>()

let cellSize = 20
let offsetX = 0
let offsetY = 0

let currentGame: GameState | null = null
const localClientId = getClientId()
let lastInputAt = 0
let inputDisabledUntil = 0

const gameContainer = document.getElementById('game-canvas')
const countdownOverlay = document.getElementById('countdown-overlay')
const winOverlay = document.getElementById('win-overlay')
const winMessage = document.getElementById('win-message')
const restartButton = document.getElementById('restart-game') as HTMLButtonElement | null

const setupPixi = (maze: MazeMetadata) => {
  if (!gameContainer || !PIXI) return

  if (app) {
    app.destroy(true)
    playerSprites.clear()
    animations.clear()
  }

  const maxCells = Math.max(maze.width, maze.height)
  const canvasSize = Math.min(window.innerWidth * 0.8, window.innerHeight * 0.8)
  cellSize = Math.floor(canvasSize / maxCells)
  const width = maze.width * cellSize
  const height = maze.height * cellSize

  app = new PIXI.Application({
    width,
    height,
    backgroundColor: 0x1e1e1e,
    antialias: true
  })

  gameContainer.innerHTML = ''
  gameContainer.appendChild(app.view)

  offsetX = 0
  offsetY = 0

  mazeGraphics = new PIXI.Graphics()
  app.stage.addChild(mazeGraphics)

  app.ticker.add(updateAnimations)

  drawMaze(maze)
}

const drawMaze = (maze: MazeMetadata) => {
  if (!mazeGraphics) return
  mazeGraphics.clear()

  for (let y = 0; y < maze.height; y += 1) {
    for (let x = 0; x < maze.width; x += 1) {
      const value = maze.grid[y][x]
      const color = value === 0 ? 0x111111 : value === 2 ? 0x4caf50 : 0xffffff
      mazeGraphics.beginFill(color)
      mazeGraphics.drawRect(offsetX + x * cellSize, offsetY + y * cellSize, cellSize, cellSize)
      mazeGraphics.endFill()
    }
  }
}

const ensurePlayerSprite = (player: PlayerState, index: number) => {
  if (!app || !PIXI) return null
  let sprite = playerSprites.get(player.clientId)
  if (sprite) return sprite

  sprite = new PIXI.Graphics()
  sprite.beginFill(player.clientId === localClientId ? 0xff5252 : index === 0 ? 0x9e9e9e : 0x607d8b)
  sprite.drawCircle(0, 0, cellSize * 0.35)
  sprite.endFill()
  app.stage.addChild(sprite)
  playerSprites.set(player.clientId, sprite)
  return sprite
}

const toPixel = (position: Position) => ({
  x: offsetX + position.x * cellSize + cellSize / 2,
  y: offsetY + position.y * cellSize + cellSize / 2
})

const updatePlayers = (game: GameState) => {
  game.players.forEach((player, index) => {
    const sprite = ensurePlayerSprite(player, index) as any
    if (!sprite) return
    if (animations.has(player.clientId)) return
    const pixel = toPixel(player.position)
    sprite.position.set(pixel.x, pixel.y)
  })
}

const updateAnimations = (delta: number) => {
  if (!currentGame) return
  const now = performance.now()
  for (const [clientId, anim] of animations.entries()) {
    const progress = Math.min(1, (now - anim.start) / anim.duration)
    const sprite = playerSprites.get(clientId)
    if (!sprite) continue
    const fromPixel = toPixel(anim.from)
    const toPixelPos = toPixel(anim.to)
    const x = fromPixel.x + (toPixelPos.x - fromPixel.x) * progress
    const y = fromPixel.y + (toPixelPos.y - fromPixel.y) * progress
    sprite.position.set(x, y)

    if (progress >= 1) {
      animations.delete(clientId)
      sprite.position.set(toPixelPos.x, toPixelPos.y)
    }
  }
}

const scheduleAnimation = (clientId: string, from: Position, to: Position, duration: number) => {
  animations.set(clientId, {
    from,
    to,
    start: performance.now(),
    duration: Math.max(duration, 50)
  })
  if (clientId === localClientId) {
    inputDisabledUntil = performance.now() + duration
  }
}

const handleGameUpdate = (data: any) => {
  const priorPositions = new Map<string, Position>()
  if (currentGame) {
    currentGame.players.forEach(player => {
      priorPositions.set(player.clientId, { ...player.position })
    })
  }

  const game = data as GameState & { lastMove?: { clientId: string; result: { position: Position; durationMs: number } } }
  currentGame = game

  if (!app || !mazeGraphics || !currentGame || !currentGame.maze) {
    setupPixi(game.maze)
  } else if (currentGame.maze.width !== game.maze.width || currentGame.maze.height !== game.maze.height) {
    setupPixi(game.maze)
  } else {
    drawMaze(game.maze)
  }

  updatePlayers(game)

  if (data?.lastMove) {
    const { clientId, result } = data.lastMove
    const player = game.players.find(p => p.clientId === clientId)
    if (player) {
      const from = priorPositions.get(clientId) ?? player.position
      scheduleAnimation(clientId, from, result.position, result.durationMs)
    }
  }

  if (game.phase === 'COUNTDOWN' || game.phase === 'PLAYING' || game.phase === 'FINISHED') {
    showScreen('game')
  }

  if (game.phase === 'PLAYING') hideCountdown()

  if (game.phase === 'FINISHED' && game.winnerId) {
    showWin(game.winnerId)
  } else if (game.phase !== 'FINISHED') {
    hideWin()
  }
}

const showCountdown = (seconds: number) => {
  if (!countdownOverlay) return
  countdownOverlay.classList.add('show')
  countdownOverlay.textContent = String(seconds)
}

const showWin = (winnerId: string) => {
  if (!winOverlay || !winMessage || !currentGame) return
  const winner = currentGame.players.find(player => player.clientId === winnerId)
  winMessage.textContent = winner ? `${winner.name} wins!` : 'Winner!'
  winOverlay.classList.add('show')
}

const hideWin = () => {
  winOverlay?.classList.remove('show')
}

const sendMove = (direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
  const now = performance.now()
  if (!currentGame || currentGame.phase !== 'PLAYING') return
  if (now - lastInputAt < 100) return
  if (now < inputDisabledUntil) return
  if (animations.has(localClientId)) return
  lastInputAt = now
  client.send('MOVE', { direction })
}

window.addEventListener('keydown', event => {
  const key = event.key
  if (key === 'ArrowUp') {
    sendMove('UP')
  } else if (key === 'ArrowDown') {
    sendMove('DOWN')
  } else if (key === 'ArrowLeft') {
    sendMove('LEFT')
  } else if (key === 'ArrowRight') {
    sendMove('RIGHT')
  } else {
    return
  }
  event.preventDefault()
})

if (restartButton) {
  restartButton.addEventListener('click', () => {
    client.send('RESTART_GAME', {})
    hideWin()
  })
}

client.on('GAME_UPDATE', data => {
  handleGameUpdate(data)
})

client.on('COUNTDOWN', data => {
  if (typeof data?.secondsRemaining === 'number') showCountdown(data.secondsRemaining)
})

client.on('WIN', data => {
  if (data?.winnerId) showWin(data.winnerId as string)
})

client.on('RESTART_GAME', () => {
  hideWin()
  hideCountdown()
})
