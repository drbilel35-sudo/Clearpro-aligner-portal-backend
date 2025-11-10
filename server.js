// server.js - CORRECT WORKFLOW: Doctor Pending Treatment → Admin Pending Upload → Doctor Pending Approval
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
    
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    
    await client.connect();
    db = client.db("clearpro-aligner");
    casesCollection = db.collection("cases");

    await db.command({ ping: 1 });
    console.log("✅ MongoDB connected successfully");

    // Create indexes
    await casesCollection.createIndex({ caseId: 1 }, { unique: true });
    await casesCollection.createIndex({ status: 1 });
    await casesCollection.createIndex({ createdAt: -1 });
    await casesCollection.createIndex({ doctor: 1 });
    
    console.log("✅ Database indexes created");
    return true;
    
  } catch (err) {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
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
   ✅ WORKFLOW STATUSES:
   1. Doctor creates case → "pending_treatment" (Doctor Portal: Pending Treatment Plan)
   2. Admin uploads treatment plan → "pending_approval" (Doctor Portal: Pending Approval)
   3. Doctor approves → "approved"
   4. Doctor requests revision → "revision_requested"
=========================== */

/* ===========================
   ✅ GET ALL CASES
=========================== */
app.get("/api/cases", async (req, res) => {
  try {
    console.log("📥 GET /api/cases - Fetching all cases");
    
    const { status, doctor, view } = req.query;
    
    let query = {};
    
    if (status) {
      query.status = status;
    }
    
    if (doctor) {
      query.doctor = decodeURIComponent(doctor);
    }
    
    const cases = await casesCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${cases.length} cases`);
    
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
      error: "Failed to fetch cases" 
    });
  }
});

/* ===========================
   ✅ DOCTOR: CREATE NEW CASE
=========================== */
app.post("/api/cases", async (req, res) => {
  try {
    console.log("👨‍⚕️ POST /api/cases - Doctor creating new case");
    
    const caseData = {
      ...req.body,
      _id: new ObjectId(),
      caseId: req.body.caseId || generateCaseId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "pending_treatment", // Shows in Doctor Portal as "Pending Treatment Plan"
      createdBy: "doctor",
      
      // Patient details
      patient: req.body.patient || { 
        name: "Unknown Patient",
        age: "",
        gender: "",
        contact: "" 
      },
      doctor: req.body.doctor || "Unknown Doctor",
      clinic: req.body.clinic || "",
      notes: req.body.notes || "",
      priority: req.body.priority || "normal",
      
      // Files uploaded by doctor
      doctorUploads: {
        stlFiles: req.body.stlFiles || [],
        prescription: req.body.prescription || null,
        photos: req.body.photos || [],
        uploadedAt: new Date(),
      },
      
      // Treatment plan (to be filled by admin)
      treatmentPlan: {
        status: "pending",
        files: [],
        notes: "",
        uploadedBy: "",
        uploadedAt: null
      }
    };

    console.log(`🔄 Doctor creating case: ${caseData.caseId}`);
    console.log(`📊 Status: ${caseData.status} (Pending Treatment Plan)`);

    const result = await casesCollection.insertOne(caseData);
    
    console.log(`✅ Case created: ${caseData.caseId} - Now waiting for admin treatment plan`);

    res.status(201).json({
      success: true,
      message: "Case created successfully - Waiting for treatment plan",
      case: caseData,
      insertedId: result.insertedId
    });
    
  } catch (err) {
    console.error("❌ Error creating case:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to create case"
    });
  }
});

/* ===========================
   ✅ ADMIN: UPLOAD TREATMENT PLAN
=========================== */
app.put("/api/cases/:id/treatment-plan", async (req, res) => {
  try {
    const { id } = req.params;
    const { files, notes, uploadedBy } = req.body;
    
    console.log(`📁 PUT /api/cases/${id}/treatment-plan - Admin uploading treatment plan`);

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Treatment plan files are required"
      });
    }

    const treatmentPlanUpdate = {
      treatmentPlan: {
        status: "uploaded",
        files: files,
        notes: notes || "",
        uploadedBy: uploadedBy || "Admin",
        uploadedAt: new Date()
      },
      status: "pending_approval", // Now shows in Doctor Portal as "Pending Approval"
      updatedAt: new Date()
    };

    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { caseId: id };
    
    const result = await casesCollection.findOneAndUpdate(
      query,
      { $set: treatmentPlanUpdate },
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
    
    console.log(`✅ Treatment plan uploaded: ${updatedCase.caseId}`);
    console.log(`📊 Status changed to: ${updatedCase.status} (Pending Approval)`);

    res.json({
      success: true,
      message: "Treatment plan uploaded - Waiting for doctor approval",
      case: updatedCase,
      status: updatedCase.status
    });
    
  } catch (err) {
    console.error("❌ Error uploading treatment plan:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to upload treatment plan"
    });
  }
});

/* ===========================
   ✅ DOCTOR: APPROVE TREATMENT PLAN
=========================== */
app.patch("/api/cases/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { approvedBy, notes } = req.body;
    
    console.log(`✅ PATCH /api/cases/${id}/approve - Doctor approving treatment plan`);

    const approvalUpdate = {
      "treatmentPlan.status": "approved",
      "treatmentPlan.approvedBy": approvedBy || "Doctor",
      "treatmentPlan.approvedAt": new Date(),
      "treatmentPlan.approvalNotes": notes || "",
      status: "approved", // Final approved status
      updatedAt: new Date()
    };

    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { caseId: id };
    
    const result = await casesCollection.findOneAndUpdate(
      query,
      { $set: approvalUpdate },
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
    
    console.log(`✅ Treatment plan approved: ${updatedCase.caseId}`);
    console.log(`🎉 Case completed: ${updatedCase.patient.name}`);

    res.json({
      success: true,
      message: "Treatment plan approved successfully",
      case: updatedCase,
      status: updatedCase.status
    });
    
  } catch (err) {
    console.error("❌ Error approving treatment plan:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to approve treatment plan"
    });
  }
});

/* ===========================
   ✅ DOCTOR: REQUEST REVISION
=========================== */
app.patch("/api/cases/:id/request-revision", async (req, res) => {
  try {
    const { id } = req.params;
    const { revisionNotes, requestedBy } = req.body;
    
    console.log(`🔄 PATCH /api/cases/${id}/request-revision - Doctor requesting revision`);

    if (!revisionNotes) {
      return res.status(400).json({
        success: false,
        error: "Revision notes are required"
      });
    }

    const revisionUpdate = {
      status: "revision_requested",
      "treatmentPlan.status": "revision_requested",
      "treatmentPlan.revisionNotes": revisionNotes,
      "treatmentPlan.revisionRequestedBy": requestedBy || "Doctor",
      "treatmentPlan.revisionRequestedAt": new Date(),
      updatedAt: new Date()
    };

    const query = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { caseId: id };
    
    const result = await casesCollection.findOneAndUpdate(
      query,
      { $set: revisionUpdate },
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
    
    console.log(`✅ Revision requested: ${updatedCase.caseId}`);

    res.json({
      success: true,
      message: "Revision requested successfully",
      case: updatedCase,
      status: updatedCase.status
    });
    
  } catch (err) {
    console.error("❌ Error requesting revision:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to request revision"
    });
  }
});

/* ===========================
   ✅ GET DOCTOR PORTAL CASES
=========================== */
app.get("/api/cases/doctor/:doctorId", async (req, res) => {
  try {
    const { doctorId } = req.params;
    
    console.log(`👨‍⚕️ GET /api/cases/doctor/${doctorId} - Fetching doctor portal cases`);
    
    const cases = await casesCollection
      .find({ doctor: decodeURIComponent(doctorId) })
      .sort({ updatedAt: -1 })
      .toArray();
    
    // Group by status for doctor portal
    const pendingTreatment = cases.filter(c => c.status === 'pending_treatment');
    const pendingApproval = cases.filter(c => c.status === 'pending_approval');
    const approved = cases.filter(c => c.status === 'approved');
    const revisionRequested = cases.filter(c => c.status === 'revision_requested');
    
    console.log(`✅ Doctor ${doctorId} cases:`, {
      pendingTreatment: pendingTreatment.length,
      pendingApproval: pendingApproval.length,
      approved: approved.length,
      revisionRequested: revisionRequested.length
    });
    
    res.json({
      success: true,
      cases: {
        pendingTreatment: pendingTreatment, // Waiting for admin to upload treatment
        pendingApproval: pendingApproval,   // Waiting for doctor to approve
        approved: approved,                 // Completed cases
        revisionRequested: revisionRequested // Needs admin revision
      },
      statistics: {
        pendingTreatment: pendingTreatment.length,
        pendingApproval: pendingApproval.length,
        approved: approved.length,
        revisionRequested: revisionRequested.length,
        total: cases.length
      },
      doctor: doctorId,
      timestamp: new Date().toISOString()
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
   ✅ GET ADMIN DASHBOARD CASES
=========================== */
app.get("/api/cases/admin/dashboard", async (req, res) => {
  try {
    console.log("👨‍💼 GET /api/cases/admin/dashboard - Fetching admin dashboard");
    
    const allCases = await casesCollection.find().sort({ createdAt: -1 }).toArray();
    
    // Admin dashboard views
    const pendingUpload = allCases.filter(c => c.status === 'pending_treatment');
    const pendingApproval = allCases.filter(c => c.status === 'pending_approval');
    const revisionRequested = allCases.filter(c => c.status === 'revision_requested');
    const approved = allCases.filter(c => c.status === 'approved');
    
    console.log(`📊 Admin dashboard stats:`, {
      pendingUpload: pendingUpload.length,     // Waiting for admin to upload treatment
      pendingApproval: pendingApproval.length, // Waiting for doctor approval
      revisionRequested: revisionRequested.length, // Needs admin action
      approved: approved.length               // Completed
    });
    
    res.json({
      success: true,
      cases: {
        pendingUpload: pendingUpload,        // Admin needs to upload treatment
        pendingApproval: pendingApproval,    // Waiting for doctor
        revisionRequested: revisionRequested, // Needs revision
        approved: approved                   // Completed
      },
      statistics: {
        pendingUpload: pendingUpload.length,
        pendingApproval: pendingApproval.length,
        revisionRequested: revisionRequested.length,
        approved: approved.length,
        total: allCases.length
      },
      recentActivity: allCases.slice(0, 10),
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    console.error("❌ Error fetching admin dashboard:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to fetch admin dashboard data"
    });
  }
});

/* ===========================
   ✅ GET CASES BY STATUS
=========================== */
app.get("/api/cases/status/:status", async (req, res) => {
  try {
    const { status } = req.params;
    console.log(`📊 GET /api/cases/status/${status} - Fetching cases by status`);
    
    const cases = await casesCollection
      .find({ status: status })
      .sort({ createdAt: -1 })
      .toArray();
    
    console.log(`✅ Found ${cases.length} cases with status: ${status}`);
    
    res.json({
      success: true,
      cases: cases,
      total: cases.length,
      status: status,
      timestamp: new Date().toISOString()
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
   ✅ REAL-TIME STATISTICS
=========================== */
app.get("/api/statistics", async (req, res) => {
  try {
    console.log("📈 GET /api/statistics - Generating real-time stats");
    
    const allCases = await casesCollection.find().toArray();
    
    const statistics = {
      total: allCases.length,
      pending_treatment: allCases.filter(c => c.status === 'pending_treatment').length,
      pending_approval: allCases.filter(c => c.status === 'pending_approval').length,
      revision_requested: allCases.filter(c => c.status === 'revision_requested').length,
      approved: allCases.filter(c => c.status === 'approved').length,
      
      // Portal specific counts
      doctorPortal: {
        pendingTreatment: allCases.filter(c => c.status === 'pending_treatment').length,
        pendingApproval: allCases.filter(c => c.status === 'pending_approval').length
      },
      adminDashboard: {
        pendingUpload: allCases.filter(c => c.status === 'pending_treatment').length,
        pendingApproval: allCases.filter(c => c.status === 'pending_approval').length
      },
      
      timestamp: new Date().toISOString()
    };

    console.log("📊 Portal statistics:", statistics);
    
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
   ✅ HEALTH CHECK
=========================== */
app.get("/api/health", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    const totalCases = await casesCollection.countDocuments();
    const pendingTreatment = await casesCollection.countDocuments({ status: 'pending_treatment' });
    const pendingApproval = await casesCollection.countDocuments({ status: 'pending_approval' });
    
    res.json({
      status: "OK",
      message: "ClearPro Aligner API is running",
      timestamp: new Date().toISOString(),
      database: "MongoDB Connected",
      workflow: "Doctor → Admin → Doctor Approval",
      statistics: {
        totalCases: totalCases,
        pendingTreatment: pendingTreatment,
        pendingApproval: pendingApproval
      },
      environment: process.env.NODE_ENV || "development",
      port: PORT
    });
    
  } catch (err) {
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
    message: "ClearPro Aligner Backend API - CORRECT WORKFLOW",
    version: "6.0.0",
    status: "Running",
    database: "MongoDB Real-time",
    workflow: [
      "1. Doctor creates case → Status: 'pending_treatment'",
      "2. Admin uploads treatment → Status: 'pending_approval'", 
      "3. Doctor approves → Status: 'approved'"
    ],
    portalViews: {
      doctorPortal: {
        "Pending Treatment Plan": "pending_treatment cases",
        "Pending Approval": "pending_approval cases",
        "Approved Cases": "approved cases"
      },
      adminDashboard: {
        "Pending Upload": "pending_treatment cases", 
        "Pending Approval": "pending_approval cases",
        "Revision Requested": "revision_requested cases"
      }
    },
    endpoints: {
      // Doctor endpoints
      "Create Case": "POST /api/cases",
      "Doctor Portal": "GET /api/cases/doctor/:doctorId",
      "Approve Plan": "PATCH /api/cases/:id/approve",
      "Request Revision": "PATCH /api/cases/:id/request-revision",
      
      // Admin endpoints
      "Admin Dashboard": "GET /api/cases/admin/dashboard", 
      "Upload Treatment": "PUT /api/cases/:id/treatment-plan",
      
      // General
      "All Cases": "GET /api/cases",
      "Statistics": "GET /api/statistics",
      "Health": "GET /api/health"
    }
  });
});

/* ===========================
   ✅ START SERVER
=========================== */
async function startServer() {
  try {
    console.log("🚀 Starting ClearPro Aligner Backend - CORRECT WORKFLOW");
    console.log("💼 Workflow: Doctor → Admin → Doctor");
    
    await connectToMongoDB();
    
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log("🎯 PORTAL VIEWS:");
      console.log("   👨‍⚕️ DOCTOR PORTAL:");
      console.log("      📋 Pending Treatment Plan → waiting for admin upload");
      console.log("      ⏳ Pending Approval → waiting for doctor approval"); 
      console.log("      ✅ Approved Cases → completed");
      console.log("   👨‍💼 ADMIN DASHBOARD:");
      console.log("      📤 Pending Upload → need to upload treatment");
      console.log("      ⏳ Pending Approval → waiting for doctor");
      console.log("      🔄 Revision Requested → need to revise");
    });
    
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
}

// Start the server
startServer();
