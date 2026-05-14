const express = require("express")
const http = require("http")
const { Server } = require("socket.io")
const cors = require("cors")

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID
const TWITCH_APP_TOKEN = process.env.TWITCH_APP_TOKEN

async function getUsername(userId) {
  // Clear any blank, placeholder, or Opaque tokens immediately
  if (!userId || userId === "anonymous" || userId.startsWith("U")) {
    console.log("ℹ️ Skipping API lookup: User is anonymous or opaque:", userId);
    return "Someone anonymous";
  }

  try {
    // ✅ FIXED: Corrected string template interpolation syntax
    const res = await fetch(
      `twitch.tv{userId}`,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          "Authorization": `Bearer ${TWITCH_APP_TOKEN}`
        }
      }
    );

    const json = await res.json();
    
    // 🔍 DEBUG LOG: Inspect this tracking profile inside your Render runtime dashboard
    console.log("➡️ Twitch API Raw Response Payload:", JSON.stringify(json));

    if (res.status !== 200) {
      console.error(`❌ Twitch API HTTP error code: ${res.status}`, json);
      return "An authenticated viewer";
    }

    // ✅ FIXED LOOKUP: Correctly targets array index item 0 for validation checks
    if (json && json.data && json.data.length > 0 && json.data[0].display_name) {
      return json.data[0].display_name;
    }
    
    return "Someone anonymous";
  } catch (err) {
    console.error("❌ Twitch API fetch network/execution failure:", err);
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

const PORT = process.env.PORT || 3001
server.listen(PORT, () => {
  console.log("Backend running on port", PORT)
  spawnTurd()
})
