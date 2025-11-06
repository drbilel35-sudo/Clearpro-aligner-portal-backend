// ✅ ClearPro Aligner — Backend API
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

// ====== CONFIG ======
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI;

// ====== MIDDLEWARE ======
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5500",
      "https://clearproaligner-portal.onrender.com",
      "https://clearproaligner-portal1.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ====== DB INIT ======
let db;
let casesCollection;

async function initDB() {
  try {
    console.log("🔗 Connecting MongoDB...");
    const client = new MongoClient(MONGODB_URI);
    await client.connect();

    db = client.db("clearpro-aligner");
    casesCollection = db.collection("cases");

    await casesCollection.createIndex({ caseId: 1 }, { unique: true });
    await casesCollection.createIndex({ createdAt: -1 });

    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Error:", err.message);
  }
}
initDB();

// ====== HELPERS ======
function generateCaseId() {
  const year = new Date().getFullYear();
  return "CP-" + year + "-" + Math.floor(Math.random() * 9000 + 1000);
}

// ====== ROUTES ======

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.json({
    status: "Running",
    service: "ClearPro Aligner API",
    version: "1.0.0",
  });
});

// ✅ HEALTH CHECK
app.get("/api/health", async (req, res) => {
  try {
    const count = await casesCollection.countDocuments();
    res.json({
      status: "OK",
      mongo: "Connected",
      cases: count,
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.json({
      status: "ERROR",
      message: err.message,
      time: new Date().toISOString(),
    });
  }
});

// ✅ GET all cases
app.get("/api/cases", async (req, res) => {
  try {
    const result = await casesCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json(result);
  } catch (err) {
    console.error("GET error:", err.message);
    res.status(500).json({ error: "Failed to fetch cases" });
  }
});

// ✅ GET single case
app.get("/api/cases/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await casesCollection.findOne({ _id: new ObjectId(id) });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Invalid ID" });
  }
});

// ✅ CREATE case
app.post("/api/cases", async (req, res) => {
  try {
    const caseData = {
      ...req.body,
      caseId: generateCaseId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await casesCollection.insertOne(caseData);
    res.json({ id: result.insertedId, case: caseData });
  } catch (err) {
    console.error("POST error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ UPDATE case
app.put("/api/cases/:id", async (req, res) => {
  try {
    const id = req.params.id;

    await casesCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          ...req.body,
          updatedAt: new Date(),
        },
      }
    );

    res.json({ message: "Updated successfully" });
  } catch (err) {
    console.error("PUT error:", err.message);
    res.status(500).json({ error: "Failed to update case" });
  }
});

// ✅ DELETE case
app.delete("/api/cases/:id", async (req, res) => {
  try {
    const id = req.params.id;
    await casesCollection.deleteOne({ _id: new ObjectId(id) });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE error:", err.message);
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ====== START SERVER ======
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
