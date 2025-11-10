// server.js - COMPLETE WORKING VERSION
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://bilsheikh5_db_user:QHxl4ahWv0FE2Lps@cluster0.r2hta0h.mongodb.net/clearpro-aligner?retryWrites=true&w=majority";
const PORT = process.env.PORT || 3001;

let db, casesCollection;

// Connect to MongoDB
async function connectDB() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('clearpro-aligner');
        casesCollection = db.collection('cases');
        console.log('✅ Connected to MongoDB');
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        process.exit(1);
    }
}

// Generate Case ID
function generateCaseId() {
    return `CP-${Date.now()}`;
}

// Routes

// Test route
app.get('/', (req, res) => {
    res.json({ 
        message: 'ClearPro Aligner API is running!',
        endpoints: {
            health: '/api/health',
            cases: '/api/cases',
            createCase: '/api/cases',
            updateStatus: '/api/cases/:id/status'
        }
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await db.command({ ping: 1 });
        res.json({ 
            status: 'OK', 
            database: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'Error', 
            database: 'Disconnected',
            error: error.message 
        });
    }
});

// Debug endpoint
app.get('/api/debug/database', async (req, res) => {
    try {
        const count = await casesCollection.countDocuments();
        const cases = await casesCollection.find().limit(5).toArray();
        
        res.json({
            success: true,
            totalCases: count,
            sampleCases: cases,
            database: 'Connected'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all cases
app.get('/api/cases', async (req, res) => {
    try {
        const cases = await casesCollection.find().sort({ createdAt: -1 }).toArray();
        res.json({
            success: true,
            cases: cases,
            total: cases.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create new case
app.post('/api/cases', async (req, res) => {
    try {
        const caseData = {
            ...req.body,
            _id: new ObjectId(),
            caseId: generateCaseId(),
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'pending_treatment',
            patient: req.body.patient || { name: 'Unknown Patient' },
            doctor: req.body.doctor || 'Unknown Doctor'
        };

        const result = await casesCollection.insertOne(caseData);
        
        res.json({
            success: true,
            message: 'Case created successfully',
            case: caseData,
            caseId: caseData.caseId
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Update case status
app.patch('/api/cases/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            return res.status(400).json({
                success: false,
                error: 'Status is required'
            });
        }

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const updateData = {
            $set: {
                status: status,
                updatedAt: new Date()
            }
        };

        const result = await casesCollection.findOneAndUpdate(
            query,
            updateData,
            { returnDocument: 'after' }
        );

        if (!result.value) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        res.json({
            success: true,
            message: 'Status updated successfully',
            case: result.value
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Upload treatment plan
app.put('/api/cases/:id/treatment-plan', async (req, res) => {
    try {
        const { id } = req.params;
        const { files, uploadedBy } = req.body;

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const updateData = {
            $set: {
                status: 'pending_approval',
                treatmentPlan: {
                    files: files || [],
                    uploadedBy: uploadedBy || 'Admin',
                    uploadedAt: new Date()
                },
                updatedAt: new Date()
            }
        };

        const result = await casesCollection.findOneAndUpdate(
            query,
            updateData,
            { returnDocument: 'after' }
        );

        if (!result.value) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        res.json({
            success: true,
            message: 'Treatment plan uploaded successfully',
            case: result.value
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Approve treatment plan
app.patch('/api/cases/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { approvedBy } = req.body;

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const updateData = {
            $set: {
                status: 'approved',
                'treatmentPlan.approved': true,
                'treatmentPlan.approvedBy': approvedBy || 'Doctor',
                'treatmentPlan.approvedAt': new Date(),
                updatedAt: new Date()
            }
        };

        const result = await casesCollection.findOneAndUpdate(
            query,
            updateData,
            { returnDocument: 'after' }
        );

        if (!result.value) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        res.json({
            success: true,
            message: 'Treatment plan approved successfully',
            case: result.value
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get cases by status
app.get('/api/cases/status/:status', async (req, res) => {
    try {
        const { status } = req.params;
        const cases = await casesCollection.find({ status }).toArray();
        
        res.json({
            success: true,
            cases: cases,
            total: cases.length,
            status: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
async function startServer() {
    await connectDB();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
        console.log(`📍 Debug: http://localhost:${PORT}/api/debug/database`);
    });
}

startServer().catch(console.error);
