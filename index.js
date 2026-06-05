import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import WebSocket from "ws"; // Native WebSockets for Heat

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
const TWITCH_CHANNEL_ID = "YOUR_NUMERIC_TWITCH_ID_HERE"; 

// ==========================================
// GAME STATE
// ==========================================
let currentTurd = null;

function spawnTurd() {
  // 🎯 FIX: Generate base percentage coordinates between 10 and 90
  const turd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };

  currentTurd = turd;
  
  // Send the 0-100 scaled numbers to your React frontend
  io.emit("turd", turd);

  console.log("💩 NEW TURD SPAWNED AT PERCENTAGES:", turd);
  return turd;
}

function startGameCooldown() {
  console.log("⏳ Cooldown started...");

  currentTurd = null;
  io.emit("turd", null);

  setTimeout(() => {
    console.log("🔥 Respawning turd...");
    spawnTurd();
  }, 120000); // 2 minutes
}

// ==========================================
// HEAT WEBSOCKET PIPELINE
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
      
      // Only process standard click event frames
      if (parsedData.type !== "click") return;
      if (!currentTurd) return;

      const username = parsedData.id || "Anonymous";
      
      // 🎯 FIX: Convert raw Heat decimals (0.0 - 1.0) into matching 0-100 percentages
      let x = parseFloat(parsedData.x) * 100;
      let y = parseFloat(parsedData.y) * 100;

      if (isNaN(x) || isNaN(y)) return;

      // Send the matching 0-100 percentage bubble down to your React frontend
      io.emit("bubble", { x, y });

      // ==========================================
      // HIT DETECTION (Now comparing 0-100 vs 0-100!)
      // ==========================================
      // Increased slightly to 2.5 pixels/percent to compensate for raw pixel densities
      const threshold = 2.5; 

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
      // Safely consume background parsing frames
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

app.get("/", (req, res) => {
  res.send("Turd Hunt backend running");
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
  connectToHeat();
  
  // Delay the very first spawn by 5 seconds so your Vercel client can load up completely
  setTimeout(spawnTurd, 5000);
});
