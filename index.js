import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import WebSocket from "ws"; // 🔌 FIX: Use the standard native WebSocket library

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ==========================================
// CONFIGURATION: Replace with your numeric ID
// ==========================================
// 💡 Note: You can find your numeric Twitch ID using tools like twitchid.info
const TWITCH_CHANNEL_ID = "148802278"; 

// ==========================================
// GAME STATE
// ==========================================
let currentTurd = null;

function spawnTurd() {
  const turd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };

  currentTurd = turd;
  io.emit("turd", turd);
  
  // 🔔 Tell the Vercel Frontend to smoothly fade IN
  io.emit("toggleOverlay", { visible: true });

  console.log("💩 NEW TURD SPAWNED:", turd);
  return turd;
}

function startGameCooldown() {
  console.log("⏳ Cooldown started...");

  currentTurd = null;
  io.emit("turd", null);
  
  // 🔔 Tell the Vercel Frontend to smoothly fade OUT
  io.emit("toggleOverlay", { visible: false });

  setTimeout(() => {
    console.log("🔥 Respawning turd...");
    spawnTurd();
  }, 120000); // 2 minutes
}

// ==========================================
// RAW HEAT WEBSOCKET PIPELINE
// ==========================================
function connectToHeat() {
  const heatUrl = `wss://heat-api.j38.net/channel/${TWITCH_CHANNEL_ID}`;
  console.log(`🔗 Connecting directly to Heat WebSocket: ${heatUrl}`);
  
  const heatSocket = new WebSocket(heatUrl);

  heatSocket.on("open", () => {
    console.log("🔥 Connected successfully to Heat click stream!");
  });

  heatSocket.on("message", (rawData) => {
    // Heat sends data packages as strings, so we parse it to JSON first
    try {
      const parsedData = JSON.parse(rawData.toString());
      
      // Heat streams different message types. We only want 'click' events.
      if (parsedData.type !== "click") return;
      
      // COOLDOWN LOCKOUT: Drop the math instantly if the game isn't live
      if (!currentTurd) return;

      // Extract details based on Heat's public API format
      const username = parsedData.id || "Anonymous";
      
      // 💡 Heat delivers coordinates as multipliers (0.0 to 1.0).
      // We multiply by 100 to map neatly onto a standard fluid grid layout.
      let x = parseFloat(parsedData.x) * 100;
      let y = parseFloat(parsedData.y) * 100;

      if (isNaN(x) || isNaN(y)) return;

      // Fire bubble burst animation directly to Vercel via Socket.io
      io.emit("bubble", { x, y });

      // =========================
      // HIT DETECTION
      // =========================
      // Adjust this threshold based on your asset hitbox size on a 100x100 space
      const threshold = 2.5; 

      const dx = Math.abs(x - currentTurd.x);
      const dy = Math.abs(y - currentTurd.y);

      if (dx < threshold && dy < threshold) {
        console.log("🎯 HIT BY:", username);

        io.emit("winner", {
          user: username,
          x: currentTurd.x,
          y: currentTurd.y
        });

        startGameCooldown();
      }
    } catch (err) {
      // Catch empty keep-alive pings safely
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

// =========================
// OPTIONAL DEBUG ROUTE
// =========================
app.get("/", (req, res) => {
  res.send("Turd Hunt backend running");
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  
  // Kickstart connections
  connectToHeat();
  // Spawn the very first target 5 seconds after boot to give Vercel time to load
  setTimeout(spawnTurd, 5000);
});
