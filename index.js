const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID
const TWITCH_APP_TOKEN = process.env.TWITCH_APP_TOKEN

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

/* =========================
   USERNAME CACHE (IMPORTANT)
========================= */
const userCache = new Map()

async function getUsername(userId) {
  if (!userId) return "Anonymous"

  // ✅ return cached name instantly
  if (userCache.has(userId)) {
    return userCache.get(userId)
  }

  try {
    const res = await fetch(
      `https://api.twitch.tv/helix/users?id=${userId}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${TWITCH_APP_TOKEN}`
        }
      }
    )

    const json = await res.json()

    const name = json?.data?.[0]?.display_name || userId

    // store in cache
    userCache.set(userId, name)

    console.log("RESOLVED USER:", userId, "->", name)

    return name
  } catch (err) {
    console.log("Twitch lookup failed:", err)
    return userId
  }
}

/* =========================
   GAME STATE
========================= */

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

  io.emit("turd", null)
}

/* =========================
   SOCKET LOGIC
========================= */

io.on("connection", (socket) => {
  console.log("viewer connected")

  socket.emit("turd", turd)

  socket.on("click", async (data) => {
    if (!turd || !turdActive) return

    io.emit("bubble", {
      x: data.x,
      y: data.y,
      user: data.user
    })

    const dx = data.x - turd.x
    const dy = data.y - turd.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < turd.radius && turdActive) {
      turdActive = false

      // 🔥 REAL USERNAME RESOLUTION
      const username = await getUsername(data.user)

      io.emit("winner", {
        user: username,
        x: turd.x,
        y: turd.y
      })

      console.log("TURD FOUND BY:", username)

      removeTurd()
    }
  })
})

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log("Backend running on port", PORT)
  spawnTurd()
})
