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

// 🎮 GAME STATE
// 🎯 UPDATE: Initialized with a random coordinate instead of fixed (50, 50) center
let currentTurd = {
  x: Math.floor(Math.random() * 80) + 10,
  y: Math.floor(Math.random() * 70) + 15
};
console.log(`🎲 Initial target hidden at random starting position: X:${currentTurd.x}, Y:${currentTurd.y}`);

// Automatically generate a new target position every 30 minutes
setInterval(() => {
  currentTurd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };
  console.log("⏰ 30-Minute Interval Triggered: A fresh target has been hidden on screen.");
  io.emit("turd", currentTurd);
}, 1800000); // 30 minutes in milliseconds

// 🔌 CONNECTION ROUTER
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);
  // Sends either the active hidden position or 'null' depending on game state
  socket.emit("turd", currentTurd);

  socket.on("click", async (data) => {
    io.emit("bubble", { x: data.x, y: data.y });

    // If the target has already been found and is null, block further click checks
    if (!currentTurd) return;

    const distanceThreshold = 15.0; 
    const dx = Math.abs(data.x - currentTurd.x);
    const dy = Math.abs(data.y - currentTurd.y);

    console.log(`Click at (${data.x.toFixed(1)}, ${data.y.toFixed(1)}). Turd at (${currentTurd.x}, ${currentTurd.y}). Distance: dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);

    if (dx < distanceThreshold && dy < distanceThreshold) {
      console.log(`🎯 HIT CONFIRMED! User raw payload incoming:`, data.user);
      
      // Determine final display name
      let cleanUsername = "Anonymous Viewer";

      if (data.user && data.user !== "Anonymous Viewer" && data.user !== "Opaque Viewer") {
        cleanUsername = data.user;
      }

      console.log(`🏆 Sending winner event to frontend: ${cleanUsername}`);
      
      // Emits exactly the string payload without "Viewer" modifications
      io.emit("winner", { user: cleanUsername });

      // 🎯 UPDATE: Clear out the active coordinates entirely so it vanishes instantly
      currentTurd = null;
      io.emit("turd", null); 
      console.log("🙈 Target found! Game clearing out. Waiting for next 30-minute window interval reset...");
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
