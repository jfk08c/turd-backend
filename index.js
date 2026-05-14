const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID
const TWITCH_APP_TOKEN = process.env.TWITCH_APP_TOKEN

async function getUsername(userId) {
  // Guard clause against empty ids or Opaque viewer tokens (starts with U)
  if (!userId || userId === "anonymous" || userId.startsWith("U")) {
    return "Someone anonymous";
  }

  try {
    const res = await fetch(
      `twitch.tv{userId}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${TWITCH_APP_TOKEN}`
        }
      }
    );

    // If your Render env token is broken/expired, catch it early
    if (res.status === 401) {
      console.error("❌ Twitch Helix API Error: Unauthorized! Your TWITCH_APP_TOKEN is invalid or expired.");
      return "An authenticated viewer";
    }

    const json = await res.json();
    
    // ✅ CORRECT HOOK: Extracts index [0] from data array safely
    if (json && json.data && json.data.length > 0) {
      return json.data[0].display_name;
    }
    
    return "Someone anonymous";
  } catch (err) {
    console.error("Twitch API fetch execution failure:", err);
    return "Someone anonymous";
  }
}


const app = express()
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

const server = http.createServer(app)

// =========================
// SOCKET SERVER
// =========================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// =========================
// GAME STATE
// =========================

const SPAWN_INTERVAL = process.env.TEST_MODE
  ? 10 * 1000   // 10 seconds for testing
  : 30 * 60 * 1000

let turd = null
let turdActive = false
let spawnTimer = null

function generateTurd() {
  const margin = 10 // safe Twitch/OBS margin

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

  io.emit("turd", null)
}

// =========================
// SOCKET LOGIC
// =========================

io.on("connection", (socket) => {

  console.log("viewer connected")

  // send current state immediately
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

    // 🔥 THIS is the important fix
    const username = await getUsername(data.user)

    io.emit("winner", {
      user: username,
      x: turd.x,
      y: turd.y
    })

    console.log("turd found by:", username)

    removeTurd()
  }
})
})

// =========================
// START SERVER (RENDER FIX)
// =========================

const PORT = process.env.PORT || 3001

server.listen(PORT, () => {
  console.log("Backend running on port", PORT)

  // start first spawn immediately
  spawnTurd()
})
