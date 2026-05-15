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

// 🔴 CONFIGURATION: Pulls from your Twitch Application profile inside Render env variables
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
let twitchAppAccessToken = "";

// 🔄 Helper function to secure App Access Token credentials from Helix endpoint
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

// 🆔 Converts numerical Twitch user IDs to display names smoothly
async function getTwitchUsername(userId) {
  const cleanId = String(userId).trim();

  // STOPS 400 ERROR: If string contains any letters, reject before hitting Helix
  const isPureNumber = /^\d+$/.test(cleanId);

  if (!isPureNumber) {
    console.log(`ℹ️ Skipping Helix lookup for Opaque/Anonymous ID format: "${cleanId}"`);
    return "Opaque Viewer";
  }

  try {
    if (!twitchAppAccessToken) {
      const tokenCheck = await getTwitchToken();
      if (!tokenCheck) return `Viewer (${cleanId.substring(0, 5)}...)`;
    }

    console.log(`📡 Requesting Helix profile data for valid numerical ID: ${cleanId}`);

    const response = await fetch(`https://api.twitch.tv/helix/users?id=${cleanId}`, {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${twitchAppAccessToken}`
      }
    });

    if (response.status === 401) {
      console.log("🔄 Token expired. Refreshing...");
      const renewedToken = await getTwitchToken();
      if (!renewedToken) return `Viewer (${cleanId.substring(0, 5)}...)`;
      return getTwitchUsername(cleanId); 
    }

    if (!response.ok) {
      const errorResponse = await response.text();
      console.error(`❌ Helix API error status ${response.status}:`, errorResponse);
      return `Viewer (${cleanId.substring(0, 5)}...)`;
    }

    const data = await response.json();
    if (data.data && data.data.length > 0) {
      return data.data[0].display_name; 
    }
    return "Unknown Viewer";
  } catch (err) {
    console.error("❌ Twitch API Lookup crash bypassed:", err.message);
    return `Viewer (${cleanId.substring(0, 5)}...)`;
  }
}

// 🎮 GAME STATE
let currentTurd = { x: 50, y: 50 };

setInterval(() => {
  currentTurd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };
  io.emit("turd", currentTurd);
}, 5000);

// 🔌 CONNECTION ROUTER
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.emit("turd", currentTurd);

  socket.on("click", async (data) => {
    io.emit("bubble", { x: data.x, y: data.y });

    if (!currentTurd) return;

    const distanceThreshold = 15.0; 
    const dx = Math.abs(data.x - currentTurd.x);
    const dy = Math.abs(data.y - currentTurd.y);

    console.log(`Click at (${data.x.toFixed(1)}, ${data.y.toFixed(1)}). Turd at (${currentTurd.x}, ${currentTurd.y}). Distance: dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);

    if (dx < distanceThreshold && dy < distanceThreshold) {
      console.log(`🎯 HIT CONFIRMED! User raw ID payload:`, data.user);
      
      let cleanUsername = "Opaque Viewer"; 
      if (data.user && !data.user.startsWith("A") && data.user !== "Anonymous Viewer") {
        cleanUsername = `Viewer (${data.user.substring(0, 6)}...)`;
      }

      // Execute username lookup asynchronously
      if (data.user && data.user !== "Anonymous Viewer" && /^\d+$/.test(String(data.user).trim())) {
        try {
          if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
            cleanUsername = await getTwitchUsername(data.user);
          }
        } catch (twitchError) {
          console.error("❌ Problem looking up username. Continuing.", twitchError.message);
        }
      }

      console.log(`🏆 Sending winner event to frontend: ${cleanUsername}`);
      io.emit("winner", { user: cleanUsername });

      currentTurd = {
        x: Math.floor(Math.random() * 80) + 10,
        y: Math.floor(Math.random() * 70) + 15
      };
      io.emit("turd", currentTurd);
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
