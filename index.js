const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const app = express()
app.use(cors())

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "*"
  }
})

// =========================
// SETTINGS
// =========================

const SPAWN_INTERVAL = 30 * 60 * 1000

let turd = null
let turdActive = false
let spawnTimer = null

function generateTurd() {
  const margin = 10 // % safe zone from edges

  return {
    x: margin + Math.random() * (100 - margin * 2),
    y: margin + Math.random() * (100 - margin * 2),
    radius: 2.5
  }
}

function spawnTurd() {
  turd = generateTurd()
  turdActive = true

  console.log("NEW TURD SPAWNED:", turd)

  io.emit("turd", turd)

  if (spawnTimer) clearTimeout(spawnTimer)

  spawnTimer = setTimeout(() => {
    spawnTurd()
  }, SPAWN_INTERVAL)
}

function removeTurd() {
  turd = null
  turdActive = false

  console.log("TURD REMOVED")

  // 🔥 tell frontend to hide it
  io.emit("turd", null)
}

// =========================
// SOCKET HANDLERS
// =========================

io.on("connection", (socket) => {

  console.log("viewer connected")

  // send current state
  socket.emit("turd", turd)

  socket.on("click", (data) => {

    if (!turd || !turdActive) return

    io.emit("bubble", {
      x: data.x,
      y: data.y,
      user: data.user
    })

    const dx = data.x - turd.x
    const dy = data.y - turd.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    // WIN CONDITION
    if (distance < turd.radius && turdActive) {

      turdActive = false

      io.emit("winner", {
        user: data.user,
        x: turd.x,
        y: turd.y
      })

      console.log("turd found by:", data.user)

      // 💥 REMOVE TURD IMMEDIATELY
      removeTurd()
    }
  })
})

// =========================
// START SERVER
// =========================

server.listen(3001, () => {
  console.log("Backend running on port 3001")

  spawnTurd()
})