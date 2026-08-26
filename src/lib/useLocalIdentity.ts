const LOCAL_ID_KEY = 'icebreaker_local_id'
const PLAYER_NAME_KEY = 'icebreaker_player_name'
const ROOM_CODE_KEY = 'icebreaker_room_code'

export function getOrCreateLocalId(): string {
  let id = localStorage.getItem(LOCAL_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(LOCAL_ID_KEY, id)
  }
  return id
}

export function saveSession(name: string, roomCode: string) {
  localStorage.setItem(PLAYER_NAME_KEY, name)
  localStorage.setItem(ROOM_CODE_KEY, roomCode)
}

export function getSavedSession() {
  return {
    name: localStorage.getItem(PLAYER_NAME_KEY),
    roomCode: localStorage.getItem(ROOM_CODE_KEY),
  }
}

export function clearSession() {
  localStorage.removeItem(PLAYER_NAME_KEY)
  localStorage.removeItem(ROOM_CODE_KEY)
}