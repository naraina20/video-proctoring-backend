const sqlite3 = require("sqlite3").verbose();
const path = require("path");

// Database file path (creates proctoring.db in project root)
const dbPath = path.resolve(__dirname, "proctoring.db");

// Open connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Could not connect to SQLite database:", err.message);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

// Create distractions table if it doesn’t exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS distractions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      candidate_name TEXT NOT NULL,
      is_submit BOOL NOT NULL DEFAULT FALSE,
      event_name TEXT,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      duration_sec INTEGER
    )
  `, (err) => {
    if (err) {
      console.error("❌ Error creating table:", err.message);
    } else {
      console.log("✅ Distractions table ready");
    }
  });
});

module.exports = db;
