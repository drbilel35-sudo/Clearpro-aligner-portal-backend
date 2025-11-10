require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();

/* ===========================
   ✅ CORS
=========================== */
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5500",
      "http://127.0.0.1:5500",
      "https://clearproaligner-portal1.onrender.com",
      "https://clearproaligner-portal.onrender.com",
      "https://admin-portal-9lu8.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: false,
  })
);

app.options("*", cors());
app.use(express.json());

/* ===========================
   ✅ DB CONFIG
=========================== */
const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb+srv://bilsheikh5_db_user:QHxl4ahWv0FE2Lps@cluster0.r2hta0h.mongodb.net/clearpro-aligner?retryWrites=true&w=majority";

const PORT = process.env.PORT || 3001;

let db, client, casesCollection;
let useMongoDB = false;

/* ===========================
   ✅ Memory fallback
=========================== */
const memoryStorage = { cases: [] };
const { ObjectId } = require("mongodb");

function generateId() {
  return new ObjectId().toString();
}

/* ===========================
   ✅ Mongo Connect
=========================== */
async function connectToMongoDB() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db("clearpro-aligner");
    casesCollection = db.collection("cases");

    useMongoDB = true;
    console.log("✅ MongoDB connected");

    await casesCollection.createIndex({ caseId: 1 });
    await casesCollection.createIndex({ status: 1 });
  } catch (err) {
    console.error("❌ MongoDB connection failed → using memory fallback");
    useMongoDB = false;
  }
}

/* ===========================
   ✅ GET ALL CASES
=========================== */
app.get("/api/cases", async (req, res) => {
  try {
    let cases;
    if (useMongoDB) {
      cases = await casesCollection.find({}).sort({ createdAt: -1 }).toArray();
    } else {
      cases = memoryStorage.cases;
    }
    res.json(cases);
  } catch (err) {
    res.json(memoryStorage.cases);
  }
});

/* ===========================
   ✅ GET CASE BY ID
=========================== */
app.get("/api/cases/:id", async (req, res) => {
  const { id } = req.params;
  let found;
  if (useMongoDB) {
    found = await casesCollection.findOne({ _id: id });
  } else {
    found = memoryStorage.cases.find((c) => c._id === id);
  }
  if (!found) return res.status(404).json({ message: "Case not found" });
  res.json(found);
});

/* ===========================
   ✅ CREATE CASE
=========================== */
app.post("/api/cases", async (req, res) => {
  const data = {
    ...req.body,
    _id: generateId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    status: req.body.status || "pending",
    fileUploadStatus: {
      stlFiles: req.body.stlFiles || [],
      prescription: req.body.prescription || null,
      photos: req.body.photos || [],
      status: "pending",
      lastUpdated: new Date(),
    },
  };

  if (useMongoDB) {
    await casesCollection.insertOne(data);
  } else {
    memoryStorage.cases.push(data);
  }

  res.json({ success: true, case: data });
});

/* ===========================
   ✅ UPDATE CASE (PUT) 
=========================== */
app.put("/api/cases/:id", async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body, updatedAt: new Date() };

  delete updateData._id; // avoid id overwrite

  let updated;
  if (useMongoDB) {
    updated = await casesCollection.findOneAndUpdate(
      { _id: id }, // ✅ FIXED — use string ID
      { $set: updateData },
      { returnDocument: "after" }
    );
    if (!updated.value)
      return res.status(404).json({ message: "Case not found" });
    return res.json({ success: true, case: updated.value });
  }

  const index = memoryStorage.cases.findIndex((c) => c._id === id);
  if (index === -1) return res.status(404).json({ message: "Case not found" });

  memoryStorage.cases[index] = {
    ...memoryStorage.cases[index],
    ...updateData,
  };

  res.json({ success: true, case: memoryStorage.cases[index] });
});

/* ===========================
   ✅ PATCH STATUS ONLY
=========================== */
app.patch("/api/cases/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) return res.status(400).json({ message: "Status required" });

  const update = {
    status,
    updatedAt: new Date(),
  };

  let updated;
  if (useMongoDB) {
    updated = await casesCollection.findOneAndUpdate(
      { _id: id },
      { $set: update },
      { returnDocument: "after" }
    );
    if (!updated.value)
      return res.status(404).json({ message: "Case not found" });
    return res.json({ success: true, status });
  }

  const index = memoryStorage.cases.findIndex((c) => c._id === id);
  if (index === -1) return res.status(404).json({ message: "Case not found" });

  memoryStorage.cases[index].status = status;
  memoryStorage.cases[index].updatedAt = new Date();
  res.json({ success: true, status });
});

/* ===========================
   ✅ UPDATE FILE UPLOAD
=========================== */
app.put("/api/cases/:id/file-upload", async (req, res) => {
  const { id } = req.params;

  const fileUpdate = {
    fileUploadStatus: {
      stlFiles: req.body.stlFiles || [],
      prescription: req.body.prescription || null,
      photos: req.body.photos || [],
      status: req.body.status || "uploaded",
      lastUpdated: new Date(),
    },
    updatedAt: new Date(),
  };

  let updated;
  if (useMongoDB) {
    updated = await casesCollection.findOneAndUpdate(
      { _id: id },
      { $set: fileUpdate },
      { returnDocument: "after" }
    );
    if (!updated.value)
      return res.status(404).json({ message: "Case not found" });
    return res.json({ success: true, case: updated.value });
  }

  const index = memoryStorage.cases.findIndex((c) => c._id === id);
  if (index === -1) return res.status(404).json({ message: "Case not found" });

  memoryStorage.cases[index] = {
    ...memoryStorage.cases[index],
    ...fileUpdate,
  };

  res.json({ success: true, case: memoryStorage.cases[index] });
});

/* ===========================
   ✅ STATS
=========================== */
app.get("/api/statistics", async (req, res) => {
  let cases = useMongoDB
    ? await casesCollection.find().toArray()
    : memoryStorage.cases;

  res.json({
    total: cases.length,
    pending: cases.filter(
      (c) => c.status?.toLowerCase().includes("pending") || !c.status
    ).length,
    revision: cases.filter((c) => c.status?.toLowerCase().includes("revision"))
      .length,
    hold: cases.filter((c) => c.status?.toLowerCase().includes("hold")).length,
    cancelled: cases.filter((c) =>
      c.status?.toLowerCase().includes("cancel")
    ).length,
    fileUploads: {
      pending: cases.filter(
        (c) => c.fileUploadStatus?.status === "pending"
      ).length,
      uploaded: cases.filter(
        (c) => c.fileUploadStatus?.status === "uploaded"
      ).length,
      completed: cases.filter(
        (c) => c.fileUploadStatus?.status === "completed"
      ).length,
    },
  });
});

/* ===========================
   ✅ HEALTH
=========================== */
app.get("/api/health", async (req, res) => {
  res.json({
    status: "OK",
    db: useMongoDB ? "MongoDB Connected" : "Memory Fallback",
    timestamp: new Date(),
  });
});

/* ===========================
   ✅ START SERVER
=========================== */
async function startServer() {
  await connectToMongoDB();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}

startServer();
