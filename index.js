import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import WebSocket from "ws"; // 🔌 Native WebSockets for the Heat stream

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ==========================================
// CONFIGURATION
// ==========================================
// 💡 Replace with your numeric Twitch ID (Use a tool like twitchid.info to find it)
const TWITCH_CHANNEL_ID = "148802278"; 

// ==========================================
// GAME STATE ENGINE
// ==========================================
let currentTurd = null;

function spawnTurd() {
  // Generates percentage coordinates matching a 0-100 layout scale
  const turd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };

  currentTurd = turd;
  
  // Broadcast the new coordinates to all connected frontend clients
  io.emit("turd", turd);

  console.log("💩 NEW TURD SPAWNED AT PERCENTAGES:", turd);
  return turd;
}

function startGameCooldown() {
  console.log("⏳ Hit confirmed. Cooldown started...");

  currentTurd = null;
  io.emit("turd", null);

  setTimeout(() => {
    console.log("🔥 Respawning turd...");
    spawnTurd();
  }, 120000); // 2 minutes
}

// ==========================================
// 🔌 SOCKET.IO HANDSHAKE (CATCH LATE-JOINERS)
// ==========================================
io.on("connection", (socket) => {
  console.log(`🔌 Vercel frontend connected: ${socket.id}`);

  // If the webpage loads AFTER a turd has spawned, sync it immediately
  if (currentTurd) {
    socket.emit("turd", currentTurd);
    console.log(`📬 Synced active target position with new client [${socket.id}]`);
  }
});

// ==========================================
// 🗺️ RAW TWITCH HEAT WEBSOCKET PIPELINE
// ==========================================
function connectToHeat() {
  const heatUrl = `wss://heat-api.j38.net/channel/${TWITCH_CHANNEL_ID}`;
  console.log(`🔗 Connecting directly to Heat WebSocket: ${heatUrl}`);
  
  const heatSocket = new WebSocket(heatUrl);

  heatSocket.on("open", () => {
    console.log("🔥 Connected successfully to Heat click stream!");
  });

  heatSocket.on("message", (rawData) => {
    try {
      const parsedData = JSON.parse(rawData.toString());
      
      // Only process standard click coordinates
      if (parsedData.type !== "click") return;
      
      // COOLDOWN LOCKOUT: Ignore clicks if a game isn't actively running
      if (!currentTurd) return;

      const username = parsedData.id || "Anonymous";
      
      // 🎯 Convert raw Heat decimals (0.0 - 1.0) into matching 0-100 percentages
      let x = parseFloat(parsedData.x) * 100;
      let y = parseFloat(parsedData.y) * 100;

      if (isNaN(x) || isNaN(y)) return;

      // Broadcast click burst location to the Vercel frontend immediately
      io.emit("bubble", { x, y });

      // ==========================================
      // HIT DETECTION MATRIX (0-100 vs 0-100)
      // ==========================================
      const threshold = 2.5; // Hitbox radius on the percentage map

      const dx = Math.abs(x - currentTurd.x);
      const dy = Math.abs(y - currentTurd.y);

      if (dx < threshold && dy < threshold) {
        console.log(`🎯 HIT REGISTERED! User: ${username}`);

        io.emit("winner", {
          user: username,
          x: currentTurd.x,
          y: currentTurd.y
        });

        startGameCooldown();
      }
    } catch (err) {
      // Safely consume background parsing / keepalive frames
    }
  });

  heatSocket.on("close", () => {
    console.log("⚠️ Heat connection lost. Reconnecting in 5 seconds...");
    setTimeout(connectToHeat, 5000);
  });

  heatSocket.on("error", (err) => {
    console.error("❌ Heat WebSocket error:", err.message);
  });
}

// ==========================================
// HEALTH PROBE & PORT ROUTING
// ==========================================
app.get("/", (req, res) => {
  res.send("Turd Hunt Backend Engine Live");
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  
  // Initialize the Heat pipeline
  connectToHeat();
  
  // Spawn the first target 5 seconds after boot so the web client can stabilize
  setTimeout(spawnTurd, 5000);
});
