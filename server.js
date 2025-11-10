require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

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
    await casesCollection.createIndex({ createdAt: -1 });
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
    console.log("📥 GET /api/cases request received");
    
    let cases;
    if (useMongoDB) {
      cases = await casesCollection.find({}).sort({ createdAt: -1 }).toArray();
      console.log(`✅ Found ${cases.length} cases in MongoDB`);
    } else {
      cases = memoryStorage.cases;
      console.log(`✅ Found ${cases.length} cases in memory storage`);
    }
    res.json(cases);
  } catch (err) {
    console.error("❌ Error fetching cases:", err.message);
    res.json(memoryStorage.cases);
  }
});

/* ===========================
   ✅ GET CASE BY ID
=========================== */
app.get("/api/cases/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`📥 GET /api/cases/${id} request received`);
  
  try {
    let found;
    if (useMongoDB) {
      // ✅ FIX: Handle both string ID and ObjectId
      if (ObjectId.isValid(id)) {
        found = await casesCollection.findOne({ _id: new ObjectId(id) });
      } else {
        found = await casesCollection.findOne({ _id: id });
      }
    } else {
      found = memoryStorage.cases.find((c) => c._id === id);
    }
    
    if (!found) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({ message: "Case not found" });
    }
    
    console.log(`✅ Case found: ${found.caseId}`);
    res.json(found);
  } catch (err) {
    console.error("❌ Error fetching case:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   ✅ CREATE CASE
=========================== */
app.post("/api/cases", async (req, res) => {
  console.log("📝 POST /api/cases request received");
  console.log("📦 Request body:", req.body);
  
  try {
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
        status: req.body.fileUploadStatus?.status || "pending",
        lastUpdated: new Date(),
      },
    };

    console.log(`🔄 Creating case: ${data.caseId}`);

    if (useMongoDB) {
      await casesCollection.insertOne(data);
      console.log(`✅ Case created in MongoDB: ${data.caseId}`);
    } else {
      memoryStorage.cases.push(data);
      console.log(`✅ Case created in memory storage: ${data.caseId}`);
    }

    res.json({ 
      success: true, 
      case: data,
      message: "Case created successfully"
    });
  } catch (err) {
    console.error("❌ Error creating case:", err.message);
    res.status(500).json({ 
      success: false, 
      message: "Failed to create case" 
    });
  }
});

/* ===========================
   ✅ UPDATE CASE (PUT) 
=========================== */
app.put("/api/cases/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`🔄 PUT /api/cases/${id} request received`);
  console.log("📦 Update data:", req.body);
  
  try {
    const updateData = { ...req.body, updatedAt: new Date() };
    delete updateData._id; // avoid id overwrite

    let updated;
    if (useMongoDB) {
      // ✅ FIX: Handle both string ID and ObjectId
      const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
      
      updated = await casesCollection.findOneAndUpdate(
        query,
        { $set: updateData },
        { returnDocument: "after" }
      );
      
      if (!updated.value) {
        console.log(`❌ Case not found: ${id}`);
        return res.status(404).json({ message: "Case not found" });
      }
      
      console.log(`✅ Case updated in MongoDB: ${id}`);
      return res.json({ 
        success: true, 
        case: updated.value,
        message: "Case updated successfully"
      });
    }

    const index = memoryStorage.cases.findIndex((c) => c._id === id);
    if (index === -1) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({ message: "Case not found" });
    }

    memoryStorage.cases[index] = {
      ...memoryStorage.cases[index],
      ...updateData,
    };

    console.log(`✅ Case updated in memory storage: ${id}`);
    res.json({ 
      success: true, 
      case: memoryStorage.cases[index],
      message: "Case updated successfully"
    });
  } catch (err) {
    console.error("❌ Error updating case:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   ✅ PATCH STATUS ONLY
=========================== */
app.patch("/api/cases/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  console.log(`🔄 PATCH /api/cases/${id}/status request received`);
  console.log(`📦 New status: ${status}`);

  if (!status) return res.status(400).json({ message: "Status required" });

  try {
    const update = {
      status,
      updatedAt: new Date(),
    };

    let updated;
    if (useMongoDB) {
      // ✅ FIX: Handle both string ID and ObjectId
      const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
      
      updated = await casesCollection.findOneAndUpdate(
        query,
        { $set: update },
        { returnDocument: "after" }
      );
      
      if (!updated.value) {
        console.log(`❌ Case not found: ${id}`);
        return res.status(404).json({ message: "Case not found" });
      }
      
      console.log(`✅ Status updated to '${status}' for case: ${id}`);
      return res.json({ 
        success: true, 
        status,
        case: updated.value,
        message: "Status updated successfully"
      });
    }

    const index = memoryStorage.cases.findIndex((c) => c._id === id);
    if (index === -1) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({ message: "Case not found" });
    }

    memoryStorage.cases[index].status = status;
    memoryStorage.cases[index].updatedAt = new Date();
    
    console.log(`✅ Status updated to '${status}' for case: ${id}`);
    res.json({ 
      success: true, 
      status,
      case: memoryStorage.cases[index],
      message: "Status updated successfully"
    });
  } catch (err) {
    console.error("❌ Error updating status:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   ✅ UPDATE FILE UPLOAD
=========================== */
app.put("/api/cases/:id/file-upload", async (req, res) => {
  const { id } = req.params;
  
  console.log(`📁 PUT /api/cases/${id}/file-upload request received`);
  console.log("📦 File upload data:", req.body);

  try {
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
      // ✅ FIX: Handle both string ID and ObjectId
      const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
      
      updated = await casesCollection.findOneAndUpdate(
        query,
        { $set: fileUpdate },
        { returnDocument: "after" }
      );
      
      if (!updated.value) {
        console.log(`❌ Case not found: ${id}`);
        return res.status(404).json({ message: "Case not found" });
      }
      
      console.log(`✅ File upload status updated for case: ${id}`);
      console.log(`📊 New file status: ${fileUpdate.fileUploadStatus.status}`);
      return res.json({ 
        success: true, 
        case: updated.value,
        message: "File upload status updated successfully"
      });
    }

    const index = memoryStorage.cases.findIndex((c) => c._id === id);
    if (index === -1) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({ message: "Case not found" });
    }

    memoryStorage.cases[index] = {
      ...memoryStorage.cases[index],
      ...fileUpdate,
    };

    console.log(`✅ File upload status updated for case: ${id}`);
    res.json({ 
      success: true, 
      case: memoryStorage.cases[index],
      message: "File upload status updated successfully"
    });
  } catch (err) {
    console.error("❌ Error updating file upload:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   ✅ DELETE CASE
=========================== */
app.delete("/api/cases/:id", async (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ DELETE /api/cases/${id} request received`);
  
  try {
    let deleted;
    if (useMongoDB) {
      // ✅ FIX: Handle both string ID and ObjectId
      const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id };
      
      deleted = await casesCollection.findOneAndDelete(query);
      if (!updated.value) {
        console.log(`❌ Case not found: ${id}`);
        return res.status(404).json({ message: "Case not found" });
      }
      
      console.log(`✅ Case deleted from MongoDB: ${id}`);
      return res.json({ 
        success: true, 
        message: "Case deleted successfully" 
      });
    }

    const index = memoryStorage.cases.findIndex((c) => c._id === id);
    if (index === -1) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({ message: "Case not found" });
    }

    memoryStorage.cases.splice(index, 1);
    console.log(`✅ Case deleted from memory storage: ${id}`);
    res.json({ 
      success: true, 
      message: "Case deleted successfully" 
    });
  } catch (err) {
    console.error("❌ Error deleting case:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   ✅ STATS
=========================== */
app.get("/api/statistics", async (req, res) => {
  console.log("📊 GET /api/statistics request received");
  
  try {
    let cases = useMongoDB
      ? await casesCollection.find().toArray()
      : memoryStorage.cases;

    const stats = {
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
    };

    console.log("📈 Statistics calculated:", stats);
    res.json(stats);
  } catch (err) {
    console.error("❌ Error fetching statistics:", err.message);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========================
   ✅ HEALTH
=========================== */
app.get("/api/health", async (req, res) => {
  const healthInfo = {
    status: "OK",
    message: "ClearPro Aligner API is running",
    timestamp: new Date().toISOString(),
    database: useMongoDB ? "MongoDB" : "Memory Storage",
    environment: process.env.NODE_ENV || "development",
    memoryCasesCount: memoryStorage.cases.length,
    port: PORT,
    frontend: "https://clearproaligner-portal1.onrender.com"
  };

  if (useMongoDB && db) {
    try {
      await db.command({ ping: 1 });
      healthInfo.database = 'MongoDB (Connected)';
      healthInfo.mongoDBCasesCount = await casesCollection.countDocuments();
    } catch (error) {
      healthInfo.database = 'MongoDB (Connection Failed)';
      healthInfo.databaseError = error.message;
    }
  }

  res.json(healthInfo);
});

/* ===========================
   ✅ ROOT ENDPOINT
=========================== */
app.get("/", (req, res) => {
  res.json({ 
    message: "ClearPro Aligner Backend API",
    version: "1.0.0",
    status: "Running",
    environment: process.env.NODE_ENV || "development",
    frontend: "https://clearproaligner-portal1.onrender.com",
    endpoints: {
      health: "GET /api/health",
      cases: "GET /api/cases",
      caseById: "GET /api/cases/:id",
      statistics: "GET /api/statistics",
      createCase: "POST /api/cases",
      updateCase: "PUT /api/cases/:id",
      updateStatus: "PATCH /api/cases/:id/status",
      updateFileUpload: "PUT /api/cases/:id/file-upload",
      deleteCase: "DELETE /api/cases/:id"
    },
    database: useMongoDB ? "MongoDB" : "Memory Storage"
  });
});

/* ===========================
   ✅ START SERVER
=========================== */
async function startServer() {
  console.log("🚀 Starting ClearPro Aligner Backend...");
  console.log("🌐 Frontend URL: https://clearproaligner-portal1.onrender.com");
  console.log("🔌 Port:", PORT);
  console.log("📝 Environment:", process.env.NODE_ENV || "development");
  
  await connectToMongoDB();
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔗 Health check: http://0.0.0.0:${PORT}/api/health`);
    console.log(`📋 Cases endpoint: http://0.0.0.0:${PORT}/api/cases`);
    console.log(`💾 Storage: ${useMongoDB ? 'MongoDB' : 'Memory Storage'}`);
    console.log("🎯 Features enabled:");
    console.log("   ✅ File upload status tracking");
    console.log("   ✅ Real-time case updates");
    console.log("   ✅ Doctor portal integration");
    console.log("   ✅ Statistics dashboard");
  });
}

// Error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer().catch(console.error);
