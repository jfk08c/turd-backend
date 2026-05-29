import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json()); // 🔔 REQUIRED: Allows your server to parse JSON payloads from SAMMI

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 🔴 CONFIGURATION
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
let twitchAppAccessToken = "";

async function getTwitchToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error("❌ Twitch credentials missing from Render Environment Variables!");
    return null;
  }

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });

    if (!response.ok) {
      const errorText = await response.text(); 
      console.error(`❌ Twitch Token API returned status ${response.status}:`, errorText);
      return null;
    }

    const data = await response.json();
    twitchAppAccessToken = data.access_token;
    console.log("✅ Successfully fetched fresh Twitch API token.");
    return twitchAppAccessToken;
  } catch (err) {
    console.error("❌ Failed to parse or fetch Twitch token:", err.message);
    return null;
  }
}

// 🎮 GLOBAL GAME STATE
let currentTurd = {
  x: Math.floor(Math.random() * 80) + 10,
  y: Math.floor(Math.random() * 70) + 15
};
console.log(`🎲 Initial target hidden at random starting position: X:${currentTurd.x}, Y:${currentTurd.y}`);


// 🎯 GLOBAL COOLDOWN ROUTINE
function startGameCooldown() {
  console.log("🙈 Target found! Game cleared. Starting 2-minute global cooldown clock...");
  
  currentTurd = null;
  io.emit("turd", null); 

  setTimeout(() => {
    currentTurd = {
      x: Math.floor(Math.random() * 80) + 10,
      y: Math.floor(Math.random() * 70) + 15
    };
    console.log(`⏰ Cooldown Finished: A fresh target has spawned at X:${currentTurd.x}, Y:${currentTurd.y}`);
    
    io.emit("turd", currentTurd);
  }, 120000); // 120000 ms = 2 Minutes (Change back to 1800000 for 30 mins later!)
}


// 🔔 SAMMI HTTP ENDPOINT (Processes incoming clicks forwarded from SAMMI Core)
app.post("/api/clicks", (req, res) => {
  const { username, x, y } = req.body;

  // Convert incoming string coordinates from SAMMI to float calculations
  const clickX = parseFloat(x);
  const clickY = parseFloat(y);

  console.log(`📥 SAMMI Webhook Received -> User: ${username} | X: ${clickX}, Y: ${clickY}`);

  // 1. Emit the bubble pop animation instantly to your Vercel frontend canvas
  io.emit("bubble", { x: clickX, y: clickY });

  // 2. Evaluate target boundary calculations
  if (currentTurd) {
    const distanceThreshold = 0.9; 
    const dx = Math.abs(clickX - currentTurd.x);
    const dy = Math.abs(
