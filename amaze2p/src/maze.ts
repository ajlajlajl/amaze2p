import { MazeSize, type MazeMetadata, type MazeGrid, type Position } from './types.ts'

const DIRECTIONS = [
  { dx: 0, dy: -2 },
  { dx: 2, dy: 0 },
  { dx: 0, dy: 2 },
  { dx: -2, dy: 0 }
] as const

const shuffle = <T>(input: T[]) => {
  for (let i = input.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = input[i]
    input[i] = input[j]
    input[j] = temp
  }
  return input
}

const carveMaze = (grid: MazeGrid, x: number, y: number) => {
  grid[y][x] = 1
  for (const { dx, dy } of shuffle([...DIRECTIONS])) {
    const nx = x + dx
    const ny = y + dy
    if (ny <= 0 || ny >= grid.length - 1 || nx <= 0 || nx >= grid[0].length - 1) continue
    if (grid[ny][nx] !== 0) continue
    grid[y + dy / 2][x + dx / 2] = 1
    carveMaze(grid, nx, ny)
  }
}

const isPath = (grid: MazeGrid, pos: Position) => {
  const value = grid[pos.y]?.[pos.x]
  return value === 1 || value === 2
}

const neighbors = (grid: MazeGrid, pos: Position) => {
  const result: Position[] = []
  const deltas = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 }
  ]

  for (const { dx, dy } of deltas) {
    const nx = pos.x + dx
    const ny = pos.y + dy
    if (ny < 0 || ny >= grid.length) continue
    if (nx < 0 || nx >= grid[0].length) continue
    if (!isPath(grid, { x: nx, y: ny })) continue
    result.push({ x: nx, y: ny })
  }

  return result
}

const findExit = (grid: MazeGrid) => {
  const exits: Position[] = []
  const maxY = grid.length - 1
  const maxX = grid[0].length - 1

  for (let x = 1; x < maxX; x += 1) {
    if (grid[1][x] === 1) exits.push({ x, y: 0 })
    if (grid[maxY - 1][x] === 1) exits.push({ x, y: maxY })
  }

  for (let y = 1; y < maxY; y += 1) {
    if (grid[y][1] === 1) exits.push({ x: 0, y })
    if (grid[y][maxX - 1] === 1) exits.push({ x: maxX, y })
  }

  if (exits.length === 0) {
    const fallback = { x: maxX, y: maxY - 1 }
    exits.push(fallback)
  }

  return exits[Math.floor(Math.random() * exits.length)]
}

const computeFarthestPosition = (grid: MazeGrid, start: Position) => {
  const visited = new Set<string>()
  const queue: Array<{ pos: Position; dist: number }> = [{ pos: start, dist: 0 }]
  let farthest = { pos: start, dist: 0 }

  const key = (p: Position) => `${p.x},${p.y}`

  while (queue.length > 0) {
    const next = queue.shift()
    if (!next) break
    if (visited.has(key(next.pos))) continue
    visited.add(key(next.pos))

    if (next.dist > farthest.dist) farthest = next

    for (const neighbor of neighbors(grid, next.pos)) {
      queue.push({ pos: neighbor, dist: next.dist + 1 })
    }
  }

  return farthest.pos
}

export const generateMaze = (size: MazeSize): MazeMetadata => {
  const width = size * 2 + 1
  const height = size * 2 + 1
  const grid: MazeGrid = Array.from({ length: height }, () => Array(width).fill(0))

  carveMaze(grid, 1, 1)

  const exit = findExit(grid)
  grid[exit.y][exit.x] = 2

  const start = computeFarthestPosition(grid, exit)

  return {
    grid,
    width,
    height,
    start,
    exit
  }
}
