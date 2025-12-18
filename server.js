import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import path from "path";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================
   BASIC MIDDLEWARE
========================= */
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

/* =========================
   CONFIG & ENV
========================= */
const ROOT_DIR = process.cwd();
const USERS_FILE = "./line_users.json";
const GEMINI_MODEL = "gemini-2.0-flash"; 
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// ✅ 1. STATIC FILE SERVING (SECURE)
// Only files in /public (like index.html, styles.css) are accessible to the web
app.use(express.static(path.join(ROOT_DIR, "public")));

if (!GEMINI_API_KEY) console.error("❌ GEMINI_API_KEY is missing");
if (!LINE_TOKEN) console.error("❌ LINE_CHANNEL_ACCESS_TOKEN is missing");

/* =========================
   LINE HELPERS
========================= */
async function sendLineMessage(userId, text) {
  if (!LINE_TOKEN || !userId) return;
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text }]
      })
    });
  } catch (err) {
    console.error("❌ LINE Send Error:", err);
  }
}

/* =========================
   API ROUTES
========================= */

// AI Chat
app.post("/api/chat", async (req, res) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// LINE Webhook
app.post("/api/line-webhook", (req, res) => {
  const events = req.body.events || [];
  let data = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) : {};

  for (const event of events) {
    const userId = event.source?.userId;
    if (userId) {
      data["_unlinked"] = data["_unlinked"] || [];
data["_unlinked"].push(userId);

      console.log("📩 Captured userId in _unlinked:", userId);
    }
  }

  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  res.sendStatus(200);
});

// ✅ 2. SECURE LINKING API
app.post("/api/link-line", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  let data = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) : {};

  // Check if this student is already registered
  if (data[email]) {
    return res.status(400).json({ error: "This email is already linked to a LINE account" });
  }

  if (!data["_unlinked"]) {
    return res.status(400).json({ error: "No LINE user to link. Please message the bot first." });
  }
  const userId = data["_unlinked"].pop();
data[email] = userId;

if (data["_unlinked"].length === 0) {
  delete data["_unlinked"];
}


  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
  console.log(`🔗 Linked ${email} ↔ LINE`);
  res.json({ success: true });
});

// Strict Lookup
app.get("/api/line-user", (req, res) => {
  const { email } = req.query;
  if (!email || !fs.existsSync(USERS_FILE)) return res.json({ lineUserId: null });

  const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  res.json({ lineUserId: data[email] || null });
});

// Reminder Trigger
app.post("/api/reminder", async (req, res) => {
  const { email, text, timeISO } = req.body;

  if (!email) {
    return res.status(400).json({ error: "email required" });
  }

  if (!fs.existsSync(USERS_FILE)) {
    return res.status(400).json({ error: "LINE not linked" });
  }

  const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  const lineUserId = data[email];

  if (!lineUserId) {
    return res.status(400).json({ error: "LINE not linked" });
  }

  await sendLineMessage(
    lineUserId,
    `🔔 Reminder:\n${text}\n⏰ ${new Date(timeISO).toLocaleString()}`
  );

  res.json({ success: true });
});

/* =========================
   START SERVER
========================= */
// Point to the index.html inside the /public folder
app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 SUZI secure server running on port ${PORT}`);
});