import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { io as Client } from "socket.io-client";

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// =========================
// GAME STATE
// =========================
let currentTurd = spawnTurd();

function spawnTurd() {
  const turd = {
    x: Math.floor(Math.random() * 80) + 10,
    y: Math.floor(Math.random() * 70) + 15
  };

  currentTurd = turd;
  io.emit("turd", turd);

  console.log("💩 NEW TURD:", turd);
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

// =========================
// HEAT CONNECTION
// =========================
// NOTE: channel name must match Heat config
const heatSocket = Client("wss://heat-api.j38.net/channel/itskerbs");

heatSocket.on("connect", () => {
  console.log("🔥 Connected to Heat click stream");
});

heatSocket.on("click", (data) => {
  console.log("🔥 Heat click:", data);

  if (!currentTurd) return;

  // =========================
  // NORMALIZE HEAT DATA
  // =========================
  const username =
    data.username ||
    data.user ||
    data.displayName ||
    "Anonymous";

  let x = parseFloat(data.x);
  let y = parseFloat(data.y);

  if (isNaN(x) || isNaN(y)) return;

  io.emit("bubble", { x, y });

  // =========================
  // HIT DETECTION
  // =========================
  const threshold = 0.9;

  const dx = Math.abs(x - currentTurd.x);
  const dy = Math.abs(y - currentTurd.y);

  if (dx < threshold && dy < threshold) {
    console.log("🎯 HIT by:", username);

    io.emit("winner", {
      user: username,
      x: currentTurd.x,
      y: currentTurd.y
    });

    startGameCooldown();
  }
});

// =========================
// OPTIONAL DEBUG ROUTE
// =========================
app.get("/", (req, res) => {
  res.send("Turd Hunt backend running");
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

httpServer.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
