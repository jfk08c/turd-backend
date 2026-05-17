import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());

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


// 🎯 THE RELIABLE FIX: Global Reset Function
// This function sits outside connection scopes, meaning it speaks to the entire server framework!
function startGameCooldown() {
  console.log("🙈 Target found! Game cleared. Starting 2-minute global cooldown clock...");
  
  // 1. Instantly clear out the coordinates global variable and tell everyone to hide the target
  currentTurd = null;
  io.emit("turd", null); 

  // 2. Set a clean, top-level timer to wake the game back up
  setTimeout(() => {
    currentTurd = {
      x: Math.floor(Math.random() * 80) + 10,
      y: Math.floor(Math.random() * 70) + 15
    };
    console.log(`⏰ Cooldown Finished: A fresh target has spawned at X:${currentTurd.x}, Y:${currentTurd.y}`);
    
    // Broadcast cleanly using the root io framework down to ALL active sockets
    io.emit("turd", currentTurd);
  }, 120000); // 120000 ms = Exactly 2 minutes for testing (Change to 1800000 for 30 mins later!)
}


// 🔌 CONNECTION ROUTER
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  // Immediately give the connecting user the current state (either a location or null)
  socket.emit("turd", currentTurd);

  socket.on("click", async (data) => {
    // Let click bubbles process instantly across the stream overlay
    io.emit("bubble", { x: data.x, y: data.y });

    // Core validation guard: If the target is null (game is in cooldown), drop the execution branch
    if (!currentTurd) return;

    const distanceThreshold = 15.0; 
    const dx = Math.abs(data.x - currentTurd.x);
    const dy = Math.abs(data.y - currentTurd.y);

    if (dx < distanceThreshold && dy < distanceThreshold) {
      console.log(`🎯 HIT CONFIRMED! User raw payload incoming:`, data.user);
      
      let cleanUsername = "Anonymous Viewer";
      if (data.user && data.user !== "Anonymous Viewer" && data.user !== "Opaque Viewer") {
        cleanUsername = data.user;
      }

      // Shaking hands over the socket framework to display the winner banner
      io.emit("winner", { user: cleanUsername });

      // 🎯 Call our new global reset routine safely
      startGameCooldown();
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

getTwitchToken();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend server listening on port ${PORT}`);
});
