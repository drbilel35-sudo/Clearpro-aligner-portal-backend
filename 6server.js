// server.js - COMPLETE WORKING VERSION WITH STATUS UPDATES
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

// Routes

// Test route
app.get('/', (req, res) => {
    res.json({ 
        message: 'ClearPro Aligner API is running!',
        endpoints: {
            health: '/api/health',
            debug: '/api/debug/database',
            cases: '/api/cases',
            createCase: '/api/cases',
            updateStatus: '/api/cases/:id/status',
            uploadTreatment: '/api/cases/:id/treatment-plan',
            approve: '/api/cases/:id/approve',
            casesByStatus: '/api/cases/status/:status'
        }
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        await db.command({ ping: 1 });
        const count = await casesCollection.countDocuments();
        res.json({ 
            status: 'OK', 
            database: 'Connected',
            totalCases: count,
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
        
        // Get status breakdown
        const statusCounts = {};
        const allCases = await casesCollection.find().toArray();
        allCases.forEach(caseItem => {
            const status = caseItem.status || 'unknown';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });
        
        res.json({
            success: true,
            totalCases: count,
            statusBreakdown: statusCounts,
            sampleCases: cases.map(c => ({
                _id: c._id,
                caseId: c.caseId,
                patient: c.patient,
                doctor: c.doctor,
                status: c.status,
                createdAt: c.createdAt
            })),
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

// Get cases for doctor portal
app.get('/api/cases/doctor/:doctor', async (req, res) => {
    try {
        const { doctor } = req.params;
        const cases = await casesCollection.find({ doctor: decodeURIComponent(doctor) }).sort({ createdAt: -1 }).toArray();
        
        const pendingTreatment = cases.filter(c => c.status === 'Pending Treatment Plan');
        const pendingApproval = cases.filter(c => c.status === 'Pending Approval');
        const approved = cases.filter(c => c.status === 'Approved');
        
        res.json({
            success: true,
            cases: {
                pendingTreatment: pendingTreatment,
                pendingApproval: pendingApproval,
                approved: approved
            },
            statistics: {
                pendingTreatment: pendingTreatment.length,
                pendingApproval: pendingApproval.length,
                approved: approved.length,
                total: cases.length
            },
            doctor: doctor
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get cases for admin dashboard
app.get('/api/cases/admin/dashboard', async (req, res) => {
    try {
        const allCases = await casesCollection.find().sort({ createdAt: -1 }).toArray();
        
        const pendingUpload = allCases.filter(c => c.status === 'Pending Treatment Plan');
        const pendingApproval = allCases.filter(c => c.status === 'Pending Approval');
        const approved = allCases.filter(c => c.status === 'Approved');
        
        res.json({
            success: true,
            cases: {
                pendingUpload: pendingUpload,
                pendingApproval: pendingApproval,
                approved: approved
            },
            statistics: {
                pendingUpload: pendingUpload.length,
                pendingApproval: pendingApproval.length,
                approved: approved.length,
                total: allCases.length
            }
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
            caseId: req.body.caseId || `CP-${Date.now()}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            status: 'Pending Treatment Plan', // Initial status
            patient: req.body.patient || { name: 'Unknown Patient' },
            doctor: req.body.doctor || 'Unknown Doctor'
        };

        const result = await casesCollection.insertOne(caseData);
        
        console.log(`✅ Case created: ${caseData.caseId} with status: ${caseData.status}`);
        
        res.json({
            success: true,
            message: 'Case created successfully',
            case: caseData,
            caseId: caseData.caseId
        });
    } catch (error) {
        console.error('❌ Error creating case:', error);
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

        console.log(`🔄 Updating status for ${id} to: ${status}`);

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
            console.log(`❌ Case not found: ${id}`);
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        console.log(`✅ Status updated: ${result.value.caseId} -> ${status}`);
        
        res.json({
            success: true,
            message: 'Status updated successfully',
            case: result.value
        });
    } catch (error) {
        console.error('❌ Error updating status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Upload treatment plan (Admin)
app.put('/api/cases/:id/treatment-plan', async (req, res) => {
    try {
        const { id } = req.params;
        const { files, uploadedBy } = req.body;

        console.log(`📁 Uploading treatment plan for case: ${id}`);

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const updateData = {
            $set: {
                status: 'Pending Approval', // Change status
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

        console.log(`✅ Treatment plan uploaded: ${result.value.caseId} -> Pending Approval`);
        
        res.json({
            success: true,
            message: 'Treatment plan uploaded successfully',
            case: result.value
        });
    } catch (error) {
        console.error('❌ Error uploading treatment plan:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Approve treatment plan (Doctor)
app.patch('/api/cases/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { approvedBy } = req.body;

        console.log(`✅ Approving treatment plan for case: ${id}`);

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const updateData = {
            $set: {
                status: 'Approved', // Final status
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

        console.log(`✅ Treatment plan approved: ${result.value.caseId} -> Approved`);
        
        res.json({
            success: true,
            message: 'Treatment plan approved successfully',
            case: result.value
        });
    } catch (error) {
        console.error('❌ Error approving treatment plan:', error);
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

// Statistics
app.get('/api/statistics', async (req, res) => {
    try {
        const allCases = await casesCollection.find().toArray();
        
        const statistics = {
            total: allCases.length,
            pendingTreatment: allCases.filter(c => c.status === 'Pending Treatment Plan').length,
            pendingApproval: allCases.filter(c => c.status === 'Pending Approval').length,
            approved: allCases.filter(c => c.status === 'Approved').length
        };
        
        res.json({
            success: true,
            statistics: statistics
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
    
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📍 Health: http://localhost:${PORT}/api/health`);
        console.log(`📍 Debug: http://localhost:${PORT}/api/debug/database`);
        console.log('🎯 Status workflow:');
        console.log('   Pending Treatment Plan → Pending Approval → Approved');
    });
}

startServer().catch(console.error);
