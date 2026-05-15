import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import fetch from "node-fetch"; // Ensure you run: npm install node-fetch

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Adjust this to your Twitch extension URI in production
    methods: ["GET", "POST"]
  }
});

// 🔴 CONFIGURATION: Replace these with your actual Twitch Developer credentials
const TWITCH_CLIENT_ID = "YOUR_EXTENSION_CLIENT_ID";
const TWITCH_CLIENT_SECRET = "YOUR_EXTENSION_CLIENT_SECRET";
let twitchAppAccessToken = "";

// 🔄 Helper function to get an App Access Token from Twitch
async function getTwitchToken() {
  try {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        grant_type: "client_credentials"
      })
    });
    const data = await response.json();
    twitchAppAccessToken = data.access_token;
    console.log("Successfully fetched fresh Twitch API token.");
  } catch (err) {
    console.error("Error fetching Twitch app token:", err);
  }
}

// 🆔 Helper function to convert numerical Twitch ID to a Display Name
async function getTwitchUsername(userId) {
  // If the user didn't share identity or is anonymous, don't ping Twitch
  if (!userId || userId.startsWith("A") || userId === "Anonymous Viewer") {
    return "Anonymous Viewer";
  }

  try {
    if (!twitchAppAccessToken) await getTwitchToken();

    const response = await fetch(`https://api.twitch.tv/helix/users?id=${userId}`, {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": `Bearer ${twitchAppAccessToken}`
      }
    });

    // Handle token expiration gracefully
    if (response.status === 401) {
      await getTwitchToken();
      return getTwitchUsername(userId); 
    }

    const data = await response.json();
    if (data.data && data.data.length > 0) {
      return data.data[0].display_name; // Returns readable name like "StreamerXYZ"
    }
    return "Unknown Viewer";
  } catch (err) {
    console.error("Twitch API look-up error:", err);
    return "Viewer (" + userId + ")";
  }
}

// 🎮 GAME STATE
let currentTurd = { x: 50, y: 50 }; // Initial position

// Auto-move the turd randomly every 5 seconds to keep the game alive
setInterval(() => {
  currentTurd = {
    x: Math.floor(Math.random() * 90) + 5,
    y: Math.floor(Math.random() * 80) + 10
  };
  io.emit("turd", currentTurd);
}, 5000);

// 🔌 SOCKET connection handling
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Send the current position of the turd immediately upon connecting
  socket.emit("turd", currentTurd);

  // Handle click attempts from the frontend
  socket.on("click", async (data) => {
    // 1. Broadcast click visual (bubbles) to everyone right away
    io.emit("bubble", { x: data.x, y: data.y });

    // 2. Check if the click hit box is close enough to the turd (Collision check)
    const distanceThreshold = 4.0; // Adjust this percentage to make it easier/harder
    const dx = Math.abs(data.x - currentTurd.x);
    const dy = Math.abs(data.y - currentTurd.y);

    if (dx < distanceThreshold && dy < distanceThreshold) {
      // 🏆 Winner found! Let's convert their ID to a real username
      const cleanUsername = await getTwitchUsername(data.user);

      io.emit("winner", { user: cleanUsername });

      // Move the turd to a new spot instantly since it was found
      currentTurd = {
        x: Math.floor(Math.random() * 90) + 5,
        y: Math.floor(Math.random() * 80) + 10
      };
      io.emit("turd", currentTurd);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Initialize the Twitch API integration setup on start
getTwitchToken();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
