const CLIENT_ID_KEY = 'amaze2p:clientId'
const NAME_KEY = 'amaze2p:name'

const isValidUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

const safeGetItem = (key: string) => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeSetItem = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // ignore storage errors (private mode)
  }
}

export const getClientId = () => {
  const stored = safeGetItem(CLIENT_ID_KEY)
  if (stored && isValidUuid(stored)) return stored
  const generated = window.crypto?.randomUUID ? window.crypto.randomUUID() : cryptoFallback()
  safeSetItem(CLIENT_ID_KEY, generated)
  return generated
}

export const setClientId = (clientId: string) => {
  if (isValidUuid(clientId)) {
    safeSetItem(CLIENT_ID_KEY, clientId)
  }
}

export const getPlayerName = () => {
  const stored = safeGetItem(NAME_KEY)
  if (stored && stored.trim().length > 0) return stored.trim().slice(0, 32)
  return ''
}

export const setPlayerName = (name: string) => {
  const trimmed = name.trim().slice(0, 32)
  if (trimmed.length === 0) return
  safeSetItem(NAME_KEY, trimmed)
}

const cryptoFallback = () => {
  const hex = []
  for (let i = 0; i < 32; i += 1) {
    hex.push(Math.floor(Math.random() * 16).toString(16))
  }
  return [
    hex.slice(0, 8).join(''),
    hex.slice(8, 12).join(''),
    '4' + hex.slice(13, 16).join(''),
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20).join(''),
    hex.slice(20, 32).join('')
  ].join('-')
}
