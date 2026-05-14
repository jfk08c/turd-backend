const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

// =========================
// ENV VARS
// =========================
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

// =========================
// EXPRESS
// =========================
const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const server = http.createServer(app);

// =========================
// SOCKET.IO
// =========================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
  }
});

// =========================
// TWITCH TOKEN + CACHE
// =========================
let twitchToken = null;
let tokenExpiresAt = 0;

const usernameCache = new Map();

async function getAppToken() {
  const now = Date.now();

  // reuse token if still valid
  if (twitchToken && now < tokenExpiresAt) {
    return twitchToken;
  }

  try {
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body:
        "client_id=" + encodeURIComponent(TWITCH_CLIENT_ID) +
        "&client_secret=" + encodeURIComponent(TWITCH_CLIENT_SECRET) +
        "&grant_type=client_credentials"
    });

    const json = await res.json();

    twitchToken = json.access_token;

    // refresh slightly early
    tokenExpiresAt = Date.now() + ((json.expires_in - 60) * 1000);

    console.log("✅ New Twitch App Token acquired");

    return twitchToken;
  } catch (err) {
    console.error("❌ Failed to get Twitch token:", err);
    return null;
  }
}

async function getUsername(userId) {
  if (!userId) return "Anonymous";

  if (usernameCache.has(userId)) {
    return usernameCache.get(userId);
  }

  try {
    const token = await getAppToken();
    if (!token) return userId;

    // Remove leading U if present
    const cleanId = userId.startsWith("U")
      ? userId.substring(1)
      : userId;

    const res = await fetch(
      "https://api.twitch.tv/helix/users?id=" + cleanId,
      {
        headers: {
          "Client-ID": TWITCH_CLIENT_ID,
          "Authorization": "Bearer " + token
        }
      }
    );

    const json = await res.json();

    const username =
      json?.data?.[0]?.display_name || userId;

    usernameCache.set(userId, username);

    console.log("Resolved:", userId, "->", username);

    return username;

  } catch (err) {
    console.error("Lookup failed:", err);
    return userId;
  }
}

// =========================
// GAME STATE
// =========================
const SPAWN_INTERVAL = process.env.TEST_MODE
  ? 10 * 1000
  : 30 * 60 * 1000;

let turd = null;
let turdActive = false;
let spawnTimer = null;

function generateTurd() {
  const margin = 10;

  return {
    x: margin + Math.random() * (100 - margin * 2),
    y: margin + Math.random() * (100 - margin * 2),
    radius: 2.5
  };
}

function spawnTurd() {
  turd = generateTurd();
  turdActive = true;

  console.log("💩 NEW TURD SPAWNED:", turd);

  io.emit("turd", turd);

  if (spawnTimer) clearTimeout(spawnTimer);

  spawnTimer = setTimeout(spawnTurd, SPAWN_INTERVAL);
}

function removeTurd() {
  turd = null;
  turdActive = false;

  io.emit("turd", null);

  console.log("💨 TURD REMOVED");
}

// =========================
// SOCKET LOGIC
// =========================
io.on("connection", (socket) => {
  console.log("viewer connected");

  socket.emit("turd", turd);

  socket.on("click", async (data) => {
    if (!turd || !turdActive) return;

    io.emit("bubble", {
      x: data.x,
      y: data.y,
      user: data.user
    });

    const dx = data.x - turd.x;
    const dy = data.y - turd.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < turd.radius && turdActive) {
      turdActive = false;

      const username = await getUsername(data.user);

      io.emit("winner", {
        user: username,
        x: turd.x,
        y: turd.y
      });

      console.log("🏆 TURD FOUND BY:", username);

      removeTurd();
    }
  });
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log("🚀 Backend running on port", PORT);

  spawnTurd();
});
