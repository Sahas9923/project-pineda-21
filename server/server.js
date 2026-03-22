import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("Server is working ✅");
});

// AUDIO ROUTE (no Whisper yet)
app.post("/audio", express.raw({ type: "*/*" }), (req, res) => {

  console.log("✅ Audio received! Size:", req.body.length);

  const fakeResult = {
    speech: "test",
    correct: true
  };

  // send to React later
  io.emit("speech-result", fakeResult);

  res.json(fakeResult);
});

server.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});