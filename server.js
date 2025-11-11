// server.js - COMPLETE WORKING VERSION WITH WEB VIEWER URL SUPPORT
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

// URL validation helper function
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

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
            reject: '/api/cases/:id/reject',
            casesByStatus: '/api/cases/status/:status',
            doctorCases: '/api/doctor/:doctor/cases',
            adminDashboard: '/api/admin/dashboard',
            statistics: '/api/statistics'
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
                createdAt: c.createdAt,
                treatmentPlan: c.treatmentPlan ? {
                    hasWebViewerUrl: !!c.treatmentPlan.webViewerUrl,
                    filesCount: c.treatmentPlan.files ? c.treatmentPlan.files.length : 0
                } : null
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
        const rejected = cases.filter(c => c.status === 'Rejected');
        
        res.json({
            success: true,
            cases: {
                pendingTreatment: pendingTreatment,
                pendingApproval: pendingApproval,
                approved: approved,
                rejected: rejected
            },
            statistics: {
                pendingTreatment: pendingTreatment.length,
                pendingApproval: pendingApproval.length,
                approved: approved.length,
                rejected: rejected.length,
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

// Get cases for specific doctor (enhanced)
app.get('/api/doctor/:doctorId/cases', async (req, res) => {
    try {
        const { doctorId } = req.params;
        
        const cases = await casesCollection.find({ 
            doctor: decodeURIComponent(doctorId) 
        }).sort({ createdAt: -1 }).toArray();

        // Organize by status for dashboard
        const pendingApproval = cases.filter(c => c.status === 'Pending Approval');
        const approved = cases.filter(c => c.status === 'Approved');
        const rejected = cases.filter(c => c.status === 'Rejected');
        const pendingTreatment = cases.filter(c => c.status === 'Pending Treatment Plan');

        res.json({
            success: true,
            cases: {
                pendingApproval,
                approved,
                rejected,
                pendingTreatment
            },
            statistics: {
                pendingApproval: pendingApproval.length,
                approved: approved.length,
                rejected: rejected.length,
                pendingTreatment: pendingTreatment.length,
                total: cases.length
            },
            doctor: doctorId
        });

    } catch (error) {
        console.error('❌ Error getting doctor cases:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get cases for admin dashboard
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const allCases = await casesCollection.find().sort({ createdAt: -1 }).toArray();
        
        const pendingUpload = allCases.filter(c => c.status === 'Pending Treatment Plan');
        const pendingApproval = allCases.filter(c => c.status === 'Pending Approval');
        const approved = allCases.filter(c => c.status === 'Approved');
        const rejected = allCases.filter(c => c.status === 'Rejected');

        res.json({
            success: true,
            cases: {
                pendingUpload: pendingUpload,    // Admin needs to upload treatment plans
                pendingApproval: pendingApproval,  // Waiting for doctor approval
                approved: approved,         // Completed cases
                rejected: rejected          // Needs revision
            },
            statistics: {
                pendingUpload: pendingUpload.length,
                pendingApproval: pendingApproval.length,
                approved: approved.length,
                rejected: rejected.length,
                total: allCases.length
            }
        });
    } catch (error) {
        console.error('❌ Error getting admin dashboard:', error);
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
            caseId: req.body.caseId || `CP-${new Date().getFullYear()}-${String(await casesCollection.countDocuments() + 1).padStart(3, '0')}`,
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

        // Check if case exists
        const existingCase = await casesCollection.findOne(query);
        if (!existingCase) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
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

// Upload treatment plan (Admin) - MOVES TO PENDING APPROVAL - FIXED WITH WEB VIEWER URL
app.put('/api/cases/:id/treatment-plan', async (req, res) => {
    try {
        const { id } = req.params;
        const { files, uploadedBy, notes, webViewerUrl } = req.body;

        console.log(`📁 Admin uploading treatment plan for case: ${id}`);
        console.log(`🔗 Web Viewer URL: ${webViewerUrl}`);

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        // Check if case exists and is in correct status
        const existingCase = await casesCollection.findOne(query);
        
        if (!existingCase) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        if (existingCase.status !== 'Pending Treatment Plan') {
            return res.status(400).json({
                success: false,
                error: `Case must be in 'Pending Treatment Plan' status. Current status: ${existingCase.status}`
            });
        }

        // Validate webViewerUrl if provided
        if (webViewerUrl && !isValidUrl(webViewerUrl)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Web Viewer URL format'
            });
        }

        const updateData = {
            $set: {
                status: 'Pending Approval', // Change status to wait for doctor approval
                updatedAt: new Date(),
                treatmentPlan: {
                    files: files || [],
                    uploadedBy: uploadedBy || 'Admin',
                    uploadedAt: new Date(),
                    notes: notes || '',
                    webViewerUrl: webViewerUrl || '', // STORE WEB VIEWER URL
                    status: 'submitted'
                }
            }
        };

        const result = await casesCollection.findOneAndUpdate(
            query,
            updateData,
            { returnDocument: 'after' }
        );

        console.log(`✅ Treatment plan uploaded by admin: ${result.value.caseId} → Pending Approval`);
        console.log(`🔗 Web Viewer URL stored: ${webViewerUrl}`);

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

// Approve treatment plan (Doctor) - MOVES TO APPROVED
app.patch('/api/cases/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { approvedBy, notes } = req.body;

        console.log(`✅ Doctor approving case: ${id}`);

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        // Check if case exists and is in correct status
        const existingCase = await casesCollection.findOne(query);
        
        if (!existingCase) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        if (existingCase.status !== 'Pending Approval') {
            return res.status(400).json({
                success: false,
                error: `Case must be in 'Pending Approval' status. Current status: ${existingCase.status}`
            });
        }

        const updateData = {
            $set: {
                status: 'Approved',
                updatedAt: new Date(),
                'treatmentPlan.approved': true,
                'treatmentPlan.approvedBy': approvedBy || 'Doctor',
                'treatmentPlan.approvedAt': new Date(),
                'treatmentPlan.doctorNotes': notes || ''
            }
        };

        const result = await casesCollection.findOneAndUpdate(
            query,
            updateData,
            { returnDocument: 'after' }
        );

        console.log(`✅ Treatment plan approved by doctor: ${result.value.caseId}`);

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

// Reject treatment plan (Doctor) - MOVES TO REJECTED
app.patch('/api/cases/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { rejectedBy, rejectionReason } = req.body;

        console.log(`❌ Doctor rejecting case: ${id}`);

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const existingCase = await casesCollection.findOne(query);
        
        if (!existingCase) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        if (existingCase.status !== 'Pending Approval') {
            return res.status(400).json({
                success: false,
                error: `Case must be in 'Pending Approval' status. Current status: ${existingCase.status}`
            });
        }

        const updateData = {
            $set: {
                status: 'Rejected',
                updatedAt: new Date(),
                'treatmentPlan.approved': false,
                'treatmentPlan.rejectedBy': rejectedBy || 'Doctor',
                'treatmentPlan.rejectedAt': new Date(),
                'treatmentPlan.rejectionReason': rejectionReason || '',
                'treatmentPlan.requiresRevision': true
            }
        };

        const result = await casesCollection.findOneAndUpdate(
            query,
            updateData,
            { returnDocument: 'after' }
        );

        console.log(`❌ Treatment plan rejected by doctor: ${result.value.caseId}`);

        res.json({
            success: true,
            message: 'Treatment plan rejected',
            case: result.value
        });

    } catch (error) {
        console.error('❌ Error rejecting treatment plan:', error);
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
            approved: allCases.filter(c => c.status === 'Approved').length,
            rejected: allCases.filter(c => c.status === 'Rejected').length
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

// Get case by ID
app.get('/api/cases/:id', async (req, res) => {
    try {
        const { id } = req.params;

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const caseItem = await casesCollection.findOne(query);

        if (!caseItem) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        res.json({
            success: true,
            case: caseItem
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete case (for testing)
app.delete('/api/cases/:id', async (req, res) => {
    try {
        const { id } = req.params;

        let query;
        if (ObjectId.isValid(id)) {
            query = { _id: new ObjectId(id) };
        } else {
            query = { caseId: id };
        }

        const result = await casesCollection.deleteOne(query);

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                error: 'Case not found'
            });
        }

        res.json({
            success: true,
            message: 'Case deleted successfully'
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
        console.log('🎯 Complete Status Workflow:');
        console.log('   1. Pending Treatment Plan → (Admin uploads treatment) → Pending Approval');
        console.log('   2. Pending Approval → (Doctor approves) → Approved ✅');
        console.log('   3. Pending Approval → (Doctor rejects) → Rejected ❌');
        console.log('\n📊 Key Endpoints:');
        console.log('   - Admin Dashboard: /api/admin/dashboard');
        console.log('   - Doctor Cases: /api/doctor/:doctorId/cases');
        console.log('   - Upload Treatment: PUT /api/cases/:id/treatment-plan');
        console.log('   - Approve: PATCH /api/cases/:id/approve');
        console.log('   - Reject: PATCH /api/cases/:id/reject');
        console.log('\n🔗 NEW FEATURE: Web Viewer URL Support');
        console.log('   - Web Viewer URLs are now accepted and stored with treatment plans');
        console.log('   - URL validation ensures proper format');
    });
}

startServer().catch(console.error);
