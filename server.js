// server.js (Updated with Native MongoDB Driver)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// CORS configuration
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://clearpro-aligner-portal.netlify.app',
        'https://*.netlify.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
}));

app.use(express.json());

// Your MongoDB connection string (replace with your actual password)
const MONGODB_URI = 'mongodb+srv://bilsheikh5_db_user:QHxl4ahWv0FE2Lps@cluster0.r2hta0h.mongodb.net/clearpro-aligner?retryWrites=true&w=majority';
const PORT = process.env.PORT || 3001;

let db;
let client;

// Connect to MongoDB
async function connectToMongoDB() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('clearpro-aligner');
        console.log('✅ Successfully connected to MongoDB');
        
        // Create indexes
        await db.collection('cases').createIndex({ caseId: 1 }, { unique: true });
        await db.collection('cases').createIndex({ createdAt: -1 });
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        return false;
    }
}

// Memory storage fallback
let memoryStorage = {
    cases: []
};

function generateId() {
    return new ObjectId().toString();
}

// Initialize connection
let useMongoDB = false;

// Routes
app.get('/api/cases', async (req, res) => {
    try {
        if (useMongoDB && db) {
            const cases = await db.collection('cases').find({}).sort({ createdAt: -1 }).toArray();
            res.json(cases);
        } else {
            res.json(memoryStorage.cases);
        }
    } catch (error) {
        console.error('Error fetching cases:', error.message);
        res.json(memoryStorage.cases);
    }
});

app.post('/api/cases', async (req, res) => {
    try {
        const caseData = {
            ...req.body,
            _id: generateId(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (useMongoDB && db) {
            const result = await db.collection('cases').insertOne(caseData);
            console.log('✅ Case created in MongoDB:', caseData.caseId);
            res.json({ 
                insertedId: result.insertedId, 
                case: caseData,
                message: 'Case created successfully'
            });
        } else {
            memoryStorage.cases.push(caseData);
            console.log('✅ Case created in memory storage:', caseData.caseId);
            res.json({ 
                insertedId: caseData._id, 
                case: caseData,
                message: 'Case created successfully (memory storage)'
            });
        }
    } catch (error) {
        console.error('Error creating case:', error.message);
        const caseData = {
            ...req.body,
            _id: generateId(),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        memoryStorage.cases.push(caseData);
        res.json({ 
            insertedId: caseData._id, 
            case: caseData,
            message: 'Case created with fallback storage'
        });
    }
});

app.put('/api/cases/:id', async (req, res) => {
    try {
        const caseId = req.params.id;
        const updateData = {
            ...req.body,
            updatedAt: new Date()
        };

        if (useMongoDB && db) {
            const result = await db.collection('cases').updateOne(
                { _id: new ObjectId(caseId) },
                { $set: updateData }
            );
            
            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Case not found' });
            }
            
            res.json({ 
                modifiedCount: result.modifiedCount,
                message: 'Case updated successfully'
            });
        } else {
            const index = memoryStorage.cases.findIndex(c => c._id === caseId);
            if (index !== -1) {
                memoryStorage.cases[index] = { ...memoryStorage.cases[index], ...updateData };
                res.json({ modifiedCount: 1, message: 'Case updated successfully' });
            } else {
                res.status(404).json({ error: 'Case not found' });
            }
        }
    } catch (error) {
        console.error('Error updating case:', error.message);
        res.status(500).json({ error: 'Failed to update case' });
    }
});

app.delete('/api/cases/:id', async (req, res) => {
    try {
        const caseId = req.params.id;

        if (useMongoDB && db) {
            const result = await db.collection('cases').deleteOne(
                { _id: new ObjectId(caseId) }
            );
            
            res.json({ 
                deletedCount: result.deletedCount,
                message: 'Case deleted successfully'
            });
        } else {
            const initialLength = memoryStorage.cases.length;
            memoryStorage.cases = memoryStorage.cases.filter(c => c._id !== caseId);
            const deletedCount = initialLength - memoryStorage.cases.length;
            res.json({ 
                deletedCount,
                message: 'Case deleted successfully'
            });
        }
    } catch (error) {
        console.error('Error deleting case:', error.message);
        res.status(500).json({ error: 'Failed to delete case' });
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    const healthInfo = {
        status: 'OK',
        message: 'ClearPro Aligner API is running',
        timestamp: new Date().toISOString(),
        database: useMongoDB ? 'MongoDB' : 'Memory Storage',
        environment: process.env.NODE_ENV || 'development',
        memoryCasesCount: memoryStorage.cases.length
    };

    // Test MongoDB connection
    if (useMongoDB && db) {
        try {
            await db.command({ ping: 1 });
            healthInfo.database = 'MongoDB (Connected)';
            healthInfo.mongoDBCasesCount = await db.collection('cases').countDocuments();
        } catch (error) {
            healthInfo.database = 'MongoDB (Connection Failed)';
            healthInfo.databaseError = error.message;
        }
    }

    res.json(healthInfo);
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'ClearPro Aligner Backend API',
        version: '1.0.0',
        status: 'Running',
        endpoints: {
            health: 'GET /api/health',
            cases: 'GET /api/cases',
            createCase: 'POST /api/cases',
            updateCase: 'PUT /api/cases/:id',
            deleteCase: 'DELETE /api/cases/:id'
        },
        database: useMongoDB ? 'MongoDB' : 'Memory Storage'
    });
});

// Add sample data
app.post('/api/seed', async (req, res) => {
    const sampleCase = {
        _id: generateId(),
        caseId: 'CP-2024-001',
        patient: 'John Smith',
        age: 28,
        orderDate: '2024-01-15',
        doctor: 'Dr. Hilda Naeimi',
        status: 'Pending Treatment Plan',
        impressionType: 'physical',
        uploadType: 'stl',
        archSelection: 'both',
        selectedTeeth: ['11', '12', '21', '22'],
        instructions: 'Sample case - Backend is working with MongoDB!',
        submittedBy: 'dr.hilda',
        createdAt: new Date(),
        updatedAt: new Date()
    };

    if (useMongoDB && db) {
        await db.collection('cases').insertOne(sampleCase);
        res.json({ message: 'Sample data loaded to MongoDB', case: sampleCase });
    } else {
        memoryStorage.cases.push(sampleCase);
        res.json({ message: 'Sample data loaded to memory', case: sampleCase });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: error.message 
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: {
            health: 'GET /api/health',
            cases: 'GET /api/cases',
            createCase: 'POST /api/cases',
            updateCase: 'PUT /api/cases/:id',
            deleteCase: 'DELETE /api/cases/:id',
            seed: 'POST /api/seed'
        }
    });
});

// Initialize server
async function startServer() {
    useMongoDB = await connectToMongoDB();
    
    app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT}`);
        console.log(`📊 Health check: https://clearpro-aligner-portal-backend.onrender.com/api/health`);
        console.log(`🔗 API Base URL: https://clearpro-aligner-portal-backend.onrender.com/api`);
        console.log(`💾 Storage: ${useMongoDB ? 'MongoDB' : 'Memory (MongoDB not available)'}`);
        
        if (!useMongoDB) {
            console.log('⚠️  Running in fallback mode - data will be lost on server restart');
        }
    });
}

startServer().catch(console.error);
