// EMBER signaling relay (Node `ws` server). The relay only forwards SDP
// offers/answers and ICE candidates between two devices in a room; it never
// sees app data. A socket's room is bound at connect time via `?room=` in the
// URL and can also be switched with the wire `join` message.
// Run locally: `npm run relay` (ws://127.0.0.1:8787).
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.RELAY_PORT ?? 8787)
const server = new WebSocketServer({ port: PORT })

const rooms = new Map()

server.on('connection', (socket, request) => {
  const url = new URL(request.url, 'http://localhost')
  let room = url.searchParams.get('room')
  if (room) {
    join(room, socket)
  } else {
    socket.send(JSON.stringify({ type: 'error', message: 'Missing ?room=' }))
    socket.close()
    return
  }

  socket.on('message', (raw) => {
    let message
    try {
      message = JSON.parse(String(raw))
    } catch {
      return
    }
    if (!message || typeof message.type !== 'string') return
    if (message.type === 'signal' && message.payload) {
      broadcast(room, { type: 'signal', payload: message.payload }, socket)
    } else if (message.type === 'join' && message.room) {
      if (message.room === room) return
      leave(room, socket)
      room = message.room
      join(room, socket)
    } else if (message.type === 'leave') {
      leave(room, socket)
      room = null
    }
  })

  socket.on('close', () => leave(room, socket))
  socket.on('error', () => leave(room, socket))
})

function join(room, socket) {
  let members = rooms.get(room)
  if (!members) {
    members = new Set()
    rooms.set(room, members)
  }
  members.add(socket)
  const peers = members.size
  socket.send(JSON.stringify({ type: 'room', room, peers }))
  for (const member of members) {
    if (member !== socket) {
      member.send(JSON.stringify({ type: 'peer', delta: 'joined' }))
      member.send(JSON.stringify({ type: 'room', room, peers }))
    }
  }
}

function leave(room, socket) {
  if (!room) return
  const members = rooms.get(room)
  if (!members) return
  members.delete(socket)
  if (members.size === 0) {
    rooms.delete(room)
  } else {
    for (const member of members) {
      member.send(JSON.stringify({ type: 'peer', delta: 'left' }))
      member.send(JSON.stringify({ type: 'room', room, peers: members.size }))
    }
  }
}

function broadcast(room, message, except) {
  const members = rooms.get(room)
  if (!members) return
  const json = JSON.stringify(message)
  for (const member of members) {
    if (member !== except && member.readyState === 1) member.send(json)
  }
}

server.on('listening', () => {
  console.log(`[relay] ws://127.0.0.1:${PORT}`)
})