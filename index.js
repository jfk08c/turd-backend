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
    origin: "*", // Allows any frontend to connect. Secure this to your extension URI later.
    methods: ["GET", "POST"]
  }
});

// 🔴 CONFIGURATION: Reads directly from Render's Environment Variables panel
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || "";
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || "";
let twitchAppAccessToken = "";

// 🔄 Helper function to get an App Access Token from Twitch safely
async function getTwitchToken() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    console.error("❌ Twitch credentials missing from Render Environment Variables!");
    return null;
  }

  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
     headers: {
    "Content-Type": "application/x-www-form-urlencoded" // 👈 Add this line to be safe
  },
  body: new URLSearchParams({
    client_id: TWITCH_CLIENT_ID,
    client_secret: TWITCH_CLIENT_SECRET,
    grant_type: "client_credentials"
  })
});

    // 🛑 CRITICAL PROTECTION: Read response as text if status code isn't 200 OK
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

// 🆔 Safe Username Lookup with Strict Validation
async function getTwitchUsername(userId) {
  // 1. Strict input validation
  if (!userId || 
      userId === "undefined" || 
      userId === "null" ||
      userId === "Anonymous Viewer" || 
      userId.startsWith("A")) {
    console.log(`ℹ️ Skipping Helix lookup for anonymous/opaque identifier: ${userId}`);
    return "Anonymous Viewer";
  }

  try {
    if (!twitchAppAccessToken) {
      const tokenCheck = await getTwitchToken();
      if (!tokenCheck) return `Viewer (${userId.substring(0, 5)}...)`;
    }

    // 2. Clear out any potential hidden spaces or linebreaks in the ID string
    const cleanId = String(userId).trim();

    console.log(`📡 Requesting Helix profile data for validated ID: ${cleanId}`);

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

    // If Twitch still rejects the request body, print the actual reason to the logs
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
    return `Viewer (${userId.substring(0, 5)}...)`;
  }
}

// 🎮 GAME STATE
let currentTurd = { x: 50, y: 50 }; // Default starting spot

// Move the turd automatically every 5 seconds to keep things active
setInterval(() => {
  currentTurd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };
  io.emit("turd", currentTurd);
}, 5000);

// 🔌 SOCKET CONNECTION HANDLER
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Push target coordinates to users the second they connect
  socket.emit("turd", currentTurd);

  // Process incoming click vectors
  socket.on("click", async (data) => {
    // 1. Instantly fire click animation (bubbles) back out to everyone
    io.emit("bubble", { x: data.x, y: data.y });

    if (!currentTurd) return;

    // 2. Wide Testing Hitbox (15% coordinate distance tolerance)
    const distanceThreshold = 15.0; 
    const dx = Math.abs(data.x - currentTurd.x);
    const dy = Math.abs(data.y - currentTurd.y);

    console.log(`Click at (${data.x.toFixed(1)}, ${data.y.toFixed(1)}). Turd at (${currentTurd.x}, ${currentTurd.y}). Distance: dx=${dx.toFixed(1)}, dy=${dy.toFixed(1)}`);

    if (dx < distanceThreshold && dy < distanceThreshold) {
      console.log(`🎯 HIT CONFIRMED! User raw ID payload:`, data.user);
      
      // Default fallback name structure
      let cleanUsername = "Opaque Viewer"; 
      if (data.user && !data.user.startsWith("A") && data.user !== "Anonymous Viewer") {
        cleanUsername = `Viewer (${data.user.substring(0, 6)}...)`;
      }

      // 3. Isolated Username Retrieval Block
      if (data.user && data.user !== "Anonymous Viewer" && !data.user.startsWith("A")) {
        try {
          if (TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET) {
            cleanUsername = await getTwitchUsername(data.user);
          } else {
            console.log("⚠️ Twitch environment credentials missing. Falling back to ID string.");
          }
        } catch (twitchError) {
          console.error("❌ Non-fatal problem looking up username. Continuing.", twitchError.message);
        }
      } else if (data.user && data.user.startsWith("A")) {
        cleanUsername = "Opaque Viewer";
      }

      // 4. Safely broadcast winner payload (Guaranteed to execute even if Twitch fails)
      console.log(`🏆 Sending winner event to frontend: ${cleanUsername}`);
      io.emit("winner", { user: cleanUsername });

      // 5. Shift target location immediately
      currentTurd = {
        x: Math.floor(Math.random() * 80) + 10,
        y: Math.floor(Math.random() * 70) + 15
      };
      io.emit("turd", currentTurd);
      console.log(`💩 Turd relocated to: (${currentTurd.x}, ${currentTurd.y})`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Seed an initial call for token configuration on server launch
getTwitchToken();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend server listening on port ${PORT}`);
});
