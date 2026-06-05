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
const TWITCH_CHANNEL_ID = "148802278"; 

// ==========================================
// LOCAL USERNAME MEMORY CACHE
// ==========================================
// Temporarily saves lookups so we don't spam Twitch APIs on every single click
const nameCache = {
 // Pre-caches your ID to ensure your personal tests match instantly
};

// Helper function to turn numeric IDs into readable Twitch names
async function fetchTwitchUsername(userId) {
  if (nameCache[userId]) return nameCache[userId];

  try {
    // Queries Twitch's public unauthenticated passport service
    const response = await fetch(`https://passport.twitch.tv/api/users/${userId}`);
    if (!response.ok) throw new Error("User profile not found");
    
    const data = await response.json();
    
    if (data && data.display_name) {
      nameCache[userId] = data.display_name; // Store to memory
      return data.display_name;
    }
  } catch (err) {
    console.log(`⚠️ Username lookup failed for ID ${userId}. Falling back to generic label.`);
  }

  // Fallback visual label if account data is hidden or restricted
  return `Viewer #${userId.substring(0, 4)}`;
}

// ==========================================
// GAME STATE ENGINE
// ==========================================
let currentTurd = null;

function spawnTurd() {
  const turd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };

  currentTurd = turd;
  
  // Broadcast coordinates to all active frontend browsers
  io.emit("turd", turd);

  console.log("💩 NEW TURD SPAWNED AT PERCENTAGES:", turd);
  return turd;
}

function startGameCooldown() {
  console.log("⏳ Hit confirmed. 2-minute cooldown started...");

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

  // Instantly hands coordinates over if a browser refreshes while a game is live
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

  heatSocket.on("message", async (rawData) => {
    try {
      const parsedData = JSON.parse(rawData.toString());
      
      // Filter out non-click telemetry frames
      if (parsedData.type !== "click") return;
      if (!currentTurd) return;

      const userIdString = parsedData.id.toString();

      // Convert Heat decimal vectors (0.0 - 1.0) into 0-100 percentage parameters
      let x = parseFloat(parsedData.x) * 100;
      let y = parseFloat(parsedData.y) * 100;

      if (isNaN(x) || isNaN(y)) return;

      // Broadcast interactive popping bubble straight to Vercel canvas layout
      io.emit("bubble", { x, y });

      // ==========================================
      // HIT DETECTION MATRIX (0-100 vs 0-100)
      // ==========================================
      const threshold = 2.5; 

      const dx = Math.abs(x - currentTurd.x);
      const dy = Math.abs(y - currentTurd.y);

      if (dx < threshold && dy < threshold) {
        // Resolve the numeric ID into a real name only when someone actually wins
        const realUsername = await fetchTwitchUsername(userIdString);
        
        console.log(`🎯 HIT REGISTERED! User: ${realUsername}`);

        io.emit("winner", {
          user: realUsername,
          x: currentTurd.x,
          y: currentTurd.y
        });

        startGameCooldown();
      }
    } catch (err) {
      // Safely catch backend parsing or structural schema issues
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
// HEALTH PROBE & ROUTING LISTENER
// ==========================================
app.get("/", (req, res) => {
  res.send("Turd Hunt Backend Engine Live");
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  
  connectToHeat();
  
  // 5-second stabilization timeout before spawning the very first round asset
  setTimeout(spawnTurd, 5000);
});
