const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const db = require("./db-setup");
const http = require("http");
const { Server } = require("socket.io");


const app = express();
app.use(cors());
app.use(express.json());
app.use("/static", express.static(path.join(__dirname, "uploads")));

// websocket
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = {};

io.on("connection", (socket) => {

  socket.on("join",async ({ roomId }) => {
    socket.roomId = roomId;
    rooms[roomId] = rooms[roomId] || new Set();
    rooms[roomId].add(socket.id);

    const candidateName = roomId?.split("-")[0];
    const sessionId = roomId?.split("-")[1] || "sessionid";
    const now = Date.now()
    if (candidateName) {
      let isExist = await checkSessionExists(sessionId)
      console.log("value isExist ", isExist, candidateName,sessionId)
      if (!isExist) {
        const stmt = db.prepare(`INSERT INTO distractions (session_id, candidate_name, event_name, start_time) VALUES (?, ?, ?, ?)`);
        stmt.run(sessionId, candidateName, "JOINED", now, function (err) {
          if (err) {
            console.error("Insert error:", err);
          }
        });
        stmt.finalize();
      }
    }

    socket.join(roomId);
    console.log(`${candidateName || "User"} joined room ${roomId}, count: ${rooms[roomId].size}`);

    // notify others
    socket.to(roomId).emit("peer-joined", { id: socket.id, candidateName });
  });


  socket.on("signal", ({ roomId, payload }) => {
    if (payload.target) {
      io.to(payload.target).emit("signal", { from: socket.id, payload });
    } else {
      socket.to(roomId).emit("signal", { from: socket.id, payload });
    }
  });

  socket.on("test", (data)=>{
    io.emit("test", {test : data.test})
  })

  socket.on("submitted", ({roomId}) =>{
    socket.to(roomId).emit("submitted", {roomId})
  })


  socket.on("request-offers", ({ roomId }) => {
    socket.to(roomId).emit("send-offer-to-late-joiner", { newPeerId: socket.id });
  });


  socket.on("disconnect", () => {
    const { roomId } = socket;
    if (roomId && rooms[roomId]) {
      rooms[roomId].delete(socket.id);
      if (rooms[roomId].size === 0) delete rooms[roomId];
      socket.to(roomId).emit("peer-left", { id: socket.id });
    }
  });
});


// Storage dir
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// ***************** REST APIS ******************

app.get("/", (req,res)=>{
  res.send("working...")
})

// Upload video
app.post("/upload/chunk", express.raw({ type: "video/webm", limit: "100mb" }), (req, res) => {
  const sessionId = req.query.sessionId || "session_unknown";
  const seq = req.query.seq || "0";
  const candidateName = req.query.candidate_name || "unknown"
  const filename = path.join(UPLOAD_DIR, `${candidateName}-${sessionId}.webm`);

  try {
    fs.appendFileSync(filename, req.body); // synchronous append is simple; use streams in production
    console.log(`Appended chunk seq=${seq} to ${filename}`);
    res.status(200).json({ ok: true, seq });
  } catch (err) {
    console.error("Append error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/video/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.filename);
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  const range = req.headers.range;
  if (!range) {
    // send whole file if no range is requested
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4"
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": "video/mp4"
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
  }
});


// Uploading finish
app.post("/upload/finish", (req, res) => {
  const sessionId = req.query.sessionId || "session_unknown";
  console.log("Upload finished for", sessionId);
  res.json({ ok: true });
});

// Insert distraction event
app.post("/api/events", (req, res) => {
  const { sessionId, candidateName, eventName, startTime, endTime, duration } = req.body;
  if (!sessionId || !candidateName) {
    return res.status(400).json({ ok: false, error: "missing fields" });
  }
  const stmt = db.prepare(`INSERT INTO distractions (session_id, candidate_name, event_name, start_time, end_time, duration_sec) VALUES (?, ?, ?, ?, ?,?)`);
  stmt.run(sessionId, candidateName, eventName, startTime, endTime, duration, function (err) {
    if (err) {
      console.error("Insert error:", err);
      res.status(500).json({ ok: false, error: err.message });
    } else {
      res.json({ ok: true, id: this.lastID });
    }
  });
  stmt.finalize();
});

// Get all events for a candidate
app.get("/api/events/:session_id", (req, res) => {
  const sessionId = req.params.session_id;
  db.all("SELECT session_id,candidate_name,event_name,start_time,end_time,duration_sec,is_submit FROM distractions WHERE session_id = ? ORDER BY start_time", [sessionId], (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message })
    res.json({ ok: true, rows })
  })
})

app.get("/api/submitted/:session_id", (req, res) => {
  const sessionId = req.params.session_id;
  console.log("session id ", sessionId)
  const sql = `UPDATE distractions SET is_submit = TRUE WHERE session_id = ?`;

  db.run(sql, [sessionId], function (err) {
    if (err) {
      console.error(err.message);

      return res.status(500).json({ error: "Database error" });
    }

    if (this.changes === 0) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.json({ message: "Submission updated successfully", sessionId });
  });
});


// Get all candidates details
app.get("/api/candidates", (req, res) => {
  db.all("SELECT candidate_name, session_id,event_name, start_time,is_submit FROM distractions WHERE event_name = 'JOINED' ORDER BY start_time DESC", (err, rows) => {
    if (err) return res.status(500).json({ ok: false, error: err.message });
    res.json({ ok: true, rows });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Upload server listening on ${PORT}`));

function checkSessionExists(sessionId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 1 FROM distractions WHERE session_id = ? LIMIT 1`,
      [sessionId],
      (err, row) => {
        console.log("already existed candidate ", row)
        if (err) return reject(err);
        resolve(!!row);
      }
    );
  });
}

