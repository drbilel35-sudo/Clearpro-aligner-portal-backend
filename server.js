// server.js - COMPLETE REAL-TIME MONGODB VERSION
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

/* ===========================
   ✅ CORS - ALL FRONTEND URLS
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
app.use(express.json({ limit: '10mb' }));

/* ===========================
   ✅ MONGODB CONFIGURATION
=========================== */
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://bilsheikh5_db_user:QHxl4ahWv0FE2Lps@cluster0.r2hta0h.mongodb.net/clearpro-aligner?retryWrites=true&w=majority";
const PORT = process.env.PORT || 3001;

let db, client, casesCollection;

/* ===========================
   ✅ MONGODB CONNECTION
=========================== */
async function connectToMongoDB() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    
    if (!MONGODB_URI) {
      throw new Error("❌ MONGODB_URI is not defined");
    }
    
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 5
    });
    
    await client.connect();
    db = client.db("clearpro-aligner");
    casesCollection = db.collection("cases");

    // Test connection
    await db.command({ ping: 1 });
    console.log("✅ MongoDB ping successful");

    // Create indexes for better performance
    await casesCollection.createIndex({ caseId: 1 }, { unique: true });
    await casesCollection.createIndex({ status: 1 });
    await casesCollection.createIndex({ createdAt: -1 });
    await casesCollection.createIndex({ doctor: 1 });
    await casesCollection.createIndex({ "patient.name": 1 });
    await casesCollection.createIndex({ "fileUploadStatus.status": 1 });
    
    console.log("✅ MongoDB connected and indexes created");
    return true;
    
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1); // Exit if MongoDB fails
  }
}

/* ===========================
   ✅ GENERATE CASE ID
=========================== */
function generateCaseId() {
  const timestamp = Date.now().toString().slice(-6);
  return `CP-${timestamp}`;
}

/* ===========================
   ✅ GET ALL CASES - REAL TIME
=========================== */
app.get("/api/cases", async (req, res) => {
  try {
    console.log("📥 GET /api/cases - Fetching all cases");
    
    const cases = await casesCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${cases.length} cases in database`);
    
    res.json({
      success: true,
      cases: cases,
      total: cases.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ Error fetching cases:", err.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch cases from database" 
    });
  }
});

/* ===========================
   ✅ GET CASE BY ID
=========================== */
app.get("/api/cases/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`📥 GET /api/cases/${id} - Fetching case`);
    
    let caseData;
    if (ObjectId.isValid(id)) {
      caseData = await casesCollection.findOne({ _id: new ObjectId(id) });
    } else {
      caseData = await casesCollection.findOne({ caseId: id });
    }
    
    if (!caseData) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({ 
        success: false,
        message: "Case not found" 
      });
    }
    
    console.log(`✅ Case found: ${caseData.caseId}`);
    res.json({
      success: true,
      case: caseData
    });
    
  } catch (err) {
    console.error("❌ Error fetching case:", err.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to fetch case" 
    });
  }
});

/* ===========================
   ✅ CREATE NEW CASE - REAL TIME
=========================== */
app.post("/api/cases", async (req, res) => {
  try {
    console.log("📝 POST /api/cases - Creating new case");
    console.log("📦 Request data:", {
      patient: req.body.patient,
      doctor: req.body.doctor,
      files: req.body.stlFiles?.length || 0
    });
    
    const caseData = {
      ...req.body,
      _id: new ObjectId(),
      caseId: req.body.caseId || generateCaseId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: req.body.status || "pending",
      fileUploadStatus: {
        stlFiles: req.body.stlFiles || [],
        prescription: req.body.prescription || null,
        photos: req.body.photos || [],
        status: req.body.fileUploadStatus?.status || "pending",
        uploadedAt: new Date(),
        lastUpdated: new Date(),
      },
      // Ensure required fields
      patient: req.body.patient || { name: "Unknown Patient" },
      doctor: req.body.doctor || "Unknown Doctor",
      notes: req.body.notes || "",
      priority: req.body.priority || "normal"
    };

    console.log(`🔄 Creating case: ${caseData.caseId}`);

    const result = await casesCollection.insertOne(caseData);
    
    console.log(`✅ Case created successfully: ${caseData.caseId}`);
    console.log(`📊 Case details:`, {
      caseId: caseData.caseId,
      patient: caseData.patient.name,
      doctor: caseData.doctor,
      status: caseData.status,
      files: caseData.fileUploadStatus.stlFiles.length
    });

    res.status(201).json({
      success: true,
      message: "Case created successfully",
      case: caseData,
      insertedId: result.insertedId
    });
    
  } catch (err) {
    console.error("❌ Error creating case:", err.message);
    
    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        error: "Case ID already exists"
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Failed to create case in database"
    });
  }
});

/* ===========================
   ✅ UPDATE CASE STATUS - REAL TIME
=========================== */
app.patch("/api/cases/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    console.log(`🔄 PATCH /api/cases/${id}/status - Updating status`);
    console.log(`📦 New status: ${status}, Notes: ${notes || 'None'}`);

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required"
      });
    }

    const updateData = {
      status,
      updatedAt: new Date(),
      ...(notes && { notes })
    };

    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { caseId: id };
    
    const result = await casesCollection.findOneAndUpdate(
      query,
      { $set: updateData },
      { returnDocument: "after" }
    );
    
    if (!result.value) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: "Case not found"
      });
    }
    
    const updatedCase = result.value;
    
    console.log(`✅ Status updated successfully: ${updatedCase.caseId} -> ${status}`);
    console.log(`📊 Case update:`, {
      caseId: updatedCase.caseId,
      patient: updatedCase.patient.name,
      oldStatus: updatedCase.status,
      newStatus: status,
      updatedAt: updatedCase.updatedAt
    });

    res.json({
      success: true,
      message: "Case status updated successfully",
      case: updatedCase,
      status: status
    });
    
  } catch (err) {
    console.error("❌ Error updating status:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to update case status"
    });
  }
});

/* ===========================
   ✅ UPDATE FILE UPLOAD STATUS - REAL TIME
=========================== */
app.put("/api/cases/:id/file-upload", async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`📁 PUT /api/cases/${id}/file-upload - Updating file status`);
    console.log("📦 File data:", {
      stlFiles: req.body.stlFiles?.length || 0,
      photos: req.body.photos?.length || 0,
      status: req.body.status
    });

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

    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { caseId: id };
    
    const result = await casesCollection.findOneAndUpdate(
      query,
      { $set: fileUpdate },
      { returnDocument: "after" }
    );
    
    if (!result.value) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: "Case not found"
      });
    }
    
    const updatedCase = result.value;
    
    console.log(`✅ File upload status updated: ${updatedCase.caseId}`);
    console.log(`📊 File status: ${fileUpdate.fileUploadStatus.status}`);
    console.log(`📁 Files: ${fileUpdate.fileUploadStatus.stlFiles.length} STL, ${fileUpdate.fileUploadStatus.photos.length} photos`);

    res.json({
      success: true,
      message: "File upload status updated successfully",
      case: updatedCase,
      fileStatus: fileUpdate.fileUploadStatus.status
    });
    
  } catch (err) {
    console.error("❌ Error updating file upload:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to update file upload status"
    });
  }
});

/* ===========================
   ✅ COMPLETE CASE UPDATE - REAL TIME
=========================== */
app.put("/api/cases/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`🔄 PUT /api/cases/${id} - Full case update`);
    console.log("📦 Update data:", Object.keys(req.body));

    const updateData = {
      ...req.body,
      updatedAt: new Date()
    };

    // Remove _id to prevent modification
    delete updateData._id;

    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { caseId: id };
    
    const result = await casesCollection.findOneAndUpdate(
      query,
      { $set: updateData },
      { returnDocument: "after" }
    );
    
    if (!result.value) {
      console.log(`❌ Case not found: ${id}`);
      return res.status(404).json({
        success: false,
        error: "Case not found"
      });
    }
    
    const updatedCase = result.value;
    
    console.log(`✅ Case updated successfully: ${updatedCase.caseId}`);
    console.log(`📊 Updated fields:`, Object.keys(req.body));

    res.json({
      success: true,
      message: "Case updated successfully",
      case: updatedCase
    });
    
  } catch (err) {
    console.error("❌ Error updating case:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to update case"
    });
  }
});

/* ===========================
   ✅ GET CASES BY DOCTOR - REAL TIME
=========================== */
app.get("/api/cases/doctor/:doctor", async (req, res) => {
  try {
    const { doctor } = req.params;
    console.log(`👨‍⚕️ GET /api/cases/doctor/${doctor} - Fetching doctor cases`);
    
    const cases = await casesCollection
      .find({ doctor: decodeURIComponent(doctor) })
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${cases.length} cases for doctor: ${doctor}`);
    
    res.json({
      success: true,
      cases: cases,
      total: cases.length,
      doctor: doctor
    });
    
  } catch (err) {
    console.error("❌ Error fetching doctor cases:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch doctor cases"
    });
  }
});

/* ===========================
   ✅ GET CASES BY STATUS - REAL TIME
=========================== */
app.get("/api/cases/status/:status", async (req, res) => {
  try {
    const { status } = req.params;
    console.log(`📊 GET /api/cases/status/${status} - Fetching cases by status`);
    
    const cases = await casesCollection
      .find({ status: new RegExp(status, 'i') })
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${cases.length} cases with status: ${status}`);
    
    res.json({
      success: true,
      cases: cases,
      total: cases.length,
      status: status
    });
    
  } catch (err) {
    console.error("❌ Error fetching cases by status:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch cases by status"
    });
  }
});

/* ===========================
   ✅ REAL-TIME STATISTICS - ADMIN DASHBOARD
=========================== */
app.get("/api/statistics", async (req, res) => {
  try {
    console.log("📈 GET /api/statistics - Generating real-time stats");
    
    const allCases = await casesCollection.find().toArray();
    
    const statistics = {
      total: allCases.length,
      pending: allCases.filter(c => c.status?.toLowerCase().includes("pending")).length,
      inReview: allCases.filter(c => c.status?.toLowerCase().includes("review")).length,
      approved: allCases.filter(c => c.status?.toLowerCase().includes("approved")).length,
      revision: allCases.filter(c => c.status?.toLowerCase().includes("revision")).length,
      hold: allCases.filter(c => c.status?.toLowerCase().includes("hold")).length,
      cancelled: allCases.filter(c => c.status?.toLowerCase().includes("cancelled")).length,
      completed: allCases.filter(c => c.status?.toLowerCase().includes("completed")).length,
      
      fileUploads: {
        pending: allCases.filter(c => c.fileUploadStatus?.status === "pending").length,
        uploaded: allCases.filter(c => c.fileUploadStatus?.status === "uploaded").length,
        completed: allCases.filter(c => c.fileUploadStatus?.status === "completed").length,
      },
      
      doctors: {},
      recentActivity: allCases
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 10)
        .map(caseItem => ({
          caseId: caseItem.caseId,
          patient: caseItem.patient?.name,
          status: caseItem.status,
          updatedAt: caseItem.updatedAt
        })),
      
      timestamp: new Date().toISOString()
    };

    // Calculate doctor-specific stats
    allCases.forEach(caseItem => {
      const doctor = caseItem.doctor || "Unknown";
      if (!statistics.doctors[doctor]) {
        statistics.doctors[doctor] = 0;
      }
      statistics.doctors[doctor]++;
    });

    console.log("📊 Real-time statistics generated:", {
      total: statistics.total,
      pending: statistics.pending,
      doctors: Object.keys(statistics.doctors).length
    });

    res.json({
      success: true,
      statistics: statistics
    });
    
  } catch (err) {
    console.error("❌ Error generating statistics:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate statistics"
    });
  }
});

/* ===========================
   ✅ HEALTH CHECK WITH DB STATUS
=========================== */
app.get("/api/health", async (req, res) => {
  try {
    const healthInfo = {
      status: "OK",
      message: "ClearPro Aligner API is running",
      timestamp: new Date().toISOString(),
      database: "MongoDB",
      environment: process.env.NODE_ENV || "development",
      port: PORT,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      frontend: "https://clearproaligner-portal1.onrender.com"
    };

    // Test database connection
    await db.command({ ping: 1 });
    healthInfo.database = "MongoDB (Connected)";
    
    // Get database stats
    healthInfo.casesCount = await casesCollection.countDocuments();
    healthInfo.databaseStats = await db.stats();

    console.log("🏥 Health check - System OK");
    
    res.json(healthInfo);
    
  } catch (err) {
    console.error("❌ Health check failed:", err.message);
    res.status(500).json({
      status: "ERROR",
      message: "Database connection failed",
      error: err.message
    });
  }
});

/* ===========================
   ✅ ROOT ENDPOINT
=========================== */
app.get("/", (req, res) => {
  res.json({
    message: "ClearPro Aligner Backend API - REAL TIME",
    version: "3.0.0",
    status: "Running",
    environment: process.env.NODE_ENV || "development",
    database: "MongoDB Real-time",
    frontend: "https://clearproaligner-portal1.onrender.com",
    endpoints: {
      health: "GET /api/health",
      allCases: "GET /api/cases",
      caseById: "GET /api/cases/:id",
      doctorCases: "GET /api/cases/doctor/:doctor",
      statusCases: "GET /api/cases/status/:status",
      statistics: "GET /api/statistics",
      createCase: "POST /api/cases",
      updateCase: "PUT /api/cases/:id",
      updateStatus: "PATCH /api/cases/:id/status",
      updateFiles: "PUT /api/cases/:id/file-upload"
    },
    features: [
      "Real-time MongoDB connection",
      "Live case status updates",
      "File upload tracking",
      "Doctor portal integration",
      "Admin dashboard with statistics",
      "Automatic case ID generation"
    ]
  });
});

/* ===========================
   ✅ START SERVER WITH MONGODB
=========================== */
async function startServer() {
  try {
    console.log("🚀 Starting ClearPro Aligner Backend - REAL TIME");
    console.log("🌐 Frontend URL: https://clearproaligner-portal1.onrender.com");
    console.log("🔌 Port:", PORT);
    console.log("📝 Environment:", process.env.NODE_ENV || "development");
    console.log("💾 Database: MongoDB Real-time");
    
    // Connect to MongoDB - REQUIRED
    await connectToMongoDB();
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`🔗 Health check: https://your-app.onrender.com/api/health`);
      console.log(`📋 Cases API: https://your-app.onrender.com/api/cases`);
      console.log(`📊 Statistics: https://your-app.onrender.com/api/statistics`);
      console.log("🎯 REAL-TIME FEATURES ENABLED:");
      console.log("   ✅ MongoDB Live Database Connection");
      console.log("   ✅ Real-time Case Status Updates");
      console.log("   ✅ Live File Upload Tracking");
      console.log("   ✅ Admin Dashboard Statistics");
      console.log("   ✅ Doctor Portal Integration");
      console.log("   ✅ Automatic Case ID Generation");
    });
    
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
}

// Error handlers for robust operation
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer();
