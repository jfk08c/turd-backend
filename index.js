import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import WebSocket from "ws"; // 🔌 Native WebSockets for Heat stream

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
const TWITCH_CHANNEL_ID = "162027318"; 

// ==========================================
// LOCAL USERNAME MAP CACHE
// ==========================================
const nameCache = new Map();

// Official Heat translation handler derived from Heat.js
async function fetchHeatUsername(id) {
  const idString = id.toString();

  // 1. Check local server memory first
  if (nameCache.has(idString)) {
    return nameCache.get(idString);
  }

  // 2. Handle Heat's native anonymity checks
  if (idString.startsWith("A")) return "Anonymous";
  if (idString.startsWith("U")) return "Unverified";

  // 3. Query Heat's official server lookup endpoint
  try {
    const url = `https://heat-api.j38.net/user/${idString}`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.display_name) {
        // Save to cache so we never look up this specific ID again
        nameCache.set(idString, data.display_name);
        console.log(`📋 Cache assigned: ${idString} -> ${data.display_name}`);
        return data.display_name;
      }
    }
  } catch (err) {
    console.log(`⚠️ Heat API lookup request failed for ID: ${idString}`);
  }

  // Fallback label if user profile cannot be found
  return `Viewer #${idString.substring(0, 4)}`;
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
  io.emit("turd", turd);

  console.log("💩 NEW TURD SPAWNED AT PERCENTAGES:", turd);
  return turd;
}

function startGameCooldown() {
  console.log("⏳ Hit confirmed. 14.5-minute cooldown started...");

  currentTurd = null;
  io.emit("turd", null);

  setTimeout(() => {
    console.log("🔥 Respawning turd...");
    spawnTurd();
  }, 870000); // 14 minutes, 30 seconds (Keeps Render alive)
}

// ==========================================
// 🔌 SOCKET.IO HANDSHAKE (CATCH LATE-JOINERS)
// ==========================================
io.on("connection", (socket) => {
  console.log(`🔌 Vercel frontend connected: ${socket.id}`);

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
      
      if (parsedData.type !== "click") return;
      if (!currentTurd) return;

      // Convert vectors to 0-100 percentage parameters
      let x = parseFloat(parsedData.x) * 100;
      let y = parseFloat(parsedData.y) * 100;

      if (isNaN(x) || isNaN(y)) return;

      // Trigger standard bubble burst animation instantly over the network
      io.emit("bubble", { x, y });

      // ==========================================
      // HIT DETECTION MATRIX (0-100 vs 0-100)
      // ==========================================
      const threshold = 2.5; 

      const dx = Math.abs(x - currentTurd.x);
      const dy = Math.abs(y - currentTurd.y);

      if (dx < threshold && dy < threshold) {
        const userIdString = parsedData.id.toString();
        
        // 1. Save the exact target position BEFORE clearing currentTurd
        const winningX = currentTurd.x;
        const winningY = currentTurd.y;

        // 2. Lock down the game loop instantly so duplicate clicks can't trigger double wins
        startGameCooldown();

        console.log(`🎯 HIT REGISTERED! Resolving identity for ID: ${userIdString}...`);

        let realUsername = nameCache.get(userIdString);

        // 3. Force the server to wait for the clean username lookup from the API
        if (!realUsername) {
          try {
            realUsername = await fetchHeatUsername(parsedData.id);
          } catch (fetchError) {
            realUsername = "A Viewer"; // Emergency fallback if the API fails entirely
          }
        }
        
        // 4. Fallback check to guarantee realUsername is a valid string
        if (!realUsername || typeof realUsername !== "string") {
          realUsername = `Viewer #${userIdString.substring(0, 4)}`;
        }

        console.log(`🏆 Broadcast verified victory banner: ${realUsername}`);

        // 5. Send the completed dataset down to OBS with valid coordinates
        io.emit("winner", {
          user: realUsername,
          x: winningX,
          y: winningY
        });
      }
    } catch (err) {
      console.error("❌ Error inside message handler:", err);
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
  setTimeout(spawnTurd, 5000);
});
