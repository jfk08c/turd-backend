import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
let twitchAppAccessToken = "";

// 🎮 GLOBAL GAME STATE
let currentTurd = {
  x: Math.floor(Math.random() * 80) + 10,
  y: Math.floor(Math.random() * 70) + 15
};

// 🔔 NEW: Helper function to poke your local Firebot app
async function pokeFirebot(eventStatus) {
  try {
    // Note: If using the cloud, replace localhost with your public IP or ngrok URL
    await fetch("http://localhost:5000/api/v1/effects", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_FIREBOT_API_KEY" // We will get this in Step 2
      },
      body: JSON.stringify({
        effect: {
          type: "firebot:custom-trigger",
          triggerName: eventStatus === "spawn" ? "TurdSpawn" : "TurdCooldown"
        }
      })
    });
    console.log(`📡 Signaled Firebot: Game status is [${eventStatus}]`);
  } catch (err) {
    console.log("⚠️ Could not reach Firebot desktop app (likely offline or booting).");
  }
}

function startGameCooldown() {
  console.log("🙈 Target found! Starting 2-minute global cooldown clock...");
  currentTurd = null;
  io.emit("turd", null); 
  
  pokeFirebot("cooldown"); // 1. Tell Firebot to hide the overlay instantly

  setTimeout(() => {
    currentTurd = {
      x: Math.floor(Math.random() * 80) + 10,
      y: Math.floor(Math.random() * 70) + 15
    };
    console.log(`⏰ Cooldown Finished: New target spawned.`);
    io.emit("turd", currentTurd);
    
    pokeFirebot("spawn"); // 2. Tell Firebot to show the overlay instantly
  }, 120000); // 2 Minutes
}

// 🎯 INCOMING CLICKS FROM FIREBOT
app.post("/api/clicks", (req, res) => {
  const { username, x, y } = req.body;
  const clickX = parseFloat(x);
  const clickY = parseFloat(y);

  // 🛑 COOLDOWN PROTECTOR: Only process if game is active
  if (currentTurd) {
    // Send bubble animation to Vercel
    io.emit("bubble", { x: clickX, y: clickY });

    const distanceThreshold = 0.9; 
    const dx = Math.abs(clickX - currentTurd.x);
    const dy = Math.abs(clickY - currentTurd.y);

    if (dx < distanceThreshold && dy < distanceThreshold) {
      console.log(`🎯 HIT CONFIRMED! Winner: ${username}`);
      let cleanUsername = username || "Anonymous Viewer";
      io.emit("winner", { user: cleanUsername });
      startGameCooldown();
    }
  } else {
    console.log(`🔒 Click from ${username} ignored. Game is on cooldown.`);
  }

  res.status(200).json({ status: "success" });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend server listening on port ${PORT}`);
  // Force a spawn signal on startup to ensure OBS syncs
  setTimeout(() => pokeFirebot("spawn"), 5000);
});
