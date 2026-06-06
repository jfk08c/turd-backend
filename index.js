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

  heatSocket.on("message",
