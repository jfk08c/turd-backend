const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const app = express()

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}))

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
})

// =========================
// GAME STATE
// =========================

const SPAWN_INTERVAL = process.env.TEST_MODE
  ? 10 * 1000
  : 30 * 60 * 1000

let turd = null
let turdActive = false
let spawnTimer = null

function generateTurd() {
  const margin = 10

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

  spawnTimer = setTimeout(spawnTurd, SPAWN_INTERVAL)
}

function removeTurd() {
  turd = null
  turdActive = false

  console.log("TURD REMOVED")

  io.emit("turd", null)
}

// =========================
// SOCKET LOGIC
// =========================

io.on("connection", (socket) => {
  console.log("viewer connected")

  socket.emit("turd", turd)

  socket.on("click", async (data) => {
    if (!turd || !turdActive) return

    // DEBUG (IMPORTANT)
    console.log("CLICK RECEIVED:", data)

    const userId = data.user

    io.emit("bubble", {
      x: data.x,
      y: data.y,
      user: userId
    })

    const dx = data.x - turd.x
    const dy = data.y - turd.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < turd.radius && turdActive) {
      turdActive = false

      const winnerUser = userId || "Anonymous"

      io.emit("winner", {
        user: winnerUser,
        x: turd.x,
        y: turd.y
      })

      console.log("TURD FOUND BY:", winnerUser)

      removeTurd()
    }
  })
})

// =========================
// START SERVER
// =========================

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log("Backend running on port", PORT)
  spawnTurd()
})
