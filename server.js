// server.js (FIXED VERSION)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// CORS configuration - UPDATED
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://clearproaligner-portal1.onrender.com',
         // ADDED - Your actual frontend URL
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
}));

app.use(express.json());

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bilsheikh5_db_user:QHxl4ahWv0FE2Lps@cluster0.r2hta0h.mongodb.net/clearpro-aligner?retryWrites=true&w=majority';
const PORT = process.env.PORT || 3001;

let db;
let client;
let casesCollection; // ADDED - Store collection reference

// Connect to MongoDB
async function connectToMongoDB() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        
        if (!MONGODB_URI) {
            console.error('❌ MONGODB_URI is not defined');
            return false;
        }
        
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('clearpro-aligner');
        casesCollection = db.collection('cases'); // ADDED - Store collection
        
        console.log('✅ Successfully connected to MongoDB');
        
        // Create indexes
        await casesCollection.createIndex({ caseId: 1 }, { unique: true });
        await casesCollection.createIndex({ createdAt: -1 });
        await casesCollection.createIndex({ status: 1 }); // ADDED - For admin filtering
        await casesCollection.createIndex({ doctor: 1 }); // ADDED - For doctor filtering
        
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

// ✅ IMPROVED: GET all cases with better logging
app.get('/api/cases', async (req, res) => {
    try {
        console.log('📥 GET /api/cases request received');
        
        let cases;
        if (useMongoDB && casesCollection) {
            cases = await casesCollection.find({}).sort({ createdAt: -1 }).toArray();
            console.log(`✅ Found ${cases.length} cases in MongoDB`);
            
            // Log first case for debugging
            if (cases.length > 0) {
                console.log('📝 First case sample:', {
                    _id: cases[0]._id,
                    caseId: cases[0].caseId,
                    patient: cases[0].patient,
                    status: cases[0].status,
                    doctor: cases[0].doctor
                });
            }
        } else {
            cases = memoryStorage.cases;
            console.log(`✅ Found ${cases.length} cases in memory storage`);
        }
        
        res.json(cases);
    } catch (error) {
        console.error('❌ Error fetching cases:', error.message);
        res.json(memoryStorage.cases);
    }
});

// ✅ IMPROVED: CREATE case with better logging
app.post('/api/cases', async (req, res) => {
    try {
        console.log('📝 POST /api/cases request received');
        console.log('📦 Request body:', req.body);
        
        const caseData = {
            ...req.body,
            _id: generateId(),
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (useMongoDB && casesCollection) {
            const result = await casesCollection.insertOne(caseData);
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
        console.error('❌ Error creating case:', error.message);
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

// ✅ NEW: GET case by ID
app.get('/api/cases/:id', async (req, res) => {
    try {
        const id = req.params.id;
        console.log(`📥 GET /api/cases/${id} request received`);
        
        let caseData;
        if (useMongoDB && casesCollection) {
            caseData = await casesCollection.findOne({ _id: new ObjectId(id) });
        } else {
            caseData = memoryStorage.cases.find(c => c._id === id);
        }
        
        if (!caseData) {
            return res.status(404).json({ error: 'Case not found' });
        }
        
        res.json(caseData);
    } catch (error) {
        console.error('❌ Error fetching case:', error.message);
        res.status(500).json({ error: 'Failed to fetch case' });
    }
});

// ✅ NEW: UPDATE case
app.put('/api/cases/:id', async (req, res) => {
    try {
        const id = req.params.id;
        console.log(`🔄 PUT /api/cases/${id} request received`);
        
        const updateData = {
            ...req.body,
            updatedAt: new Date()
        };

        let result;
        if (useMongoDB && casesCollection) {
            result = await casesCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updateData }
            );
        } else {
            const index = memoryStorage.cases.findIndex(c => c._id === id);
            if (index !== -1) {
                memoryStorage.cases[index] = { ...memoryStorage.cases[index], ...updateData };
                result = { modifiedCount: 1 };
            } else {
                result = { modifiedCount: 0 };
            }
        }
        
        if (result.modifiedCount === 0) {
            return res.status(404).json({ error: 'Case not found' });
        }
        
        res.json({ message: 'Case updated successfully' });
    } catch (error) {
        console.error('❌ Error updating case:', error.message);
        res.status(500).json({ error: 'Failed to update case' });
    }
});

// ✅ NEW: Statistics endpoint for admin dashboard
app.get('/api/statistics', async (req, res) => {
    try {
        console.log('📊 GET /api/statistics request received');
        
        let cases;
        if (useMongoDB && casesCollection) {
            cases = await casesCollection.find({}).toArray();
        } else {
            cases = memoryStorage.cases;
        }
        
        const statistics = {
            total: cases.length,
            pending: cases.filter(c => 
                c.status?.toLowerCase().includes('pending') || 
                !c.status
            ).length,
            revision: cases.filter(c => 
                c.status?.toLowerCase().includes('revision')
            ).length,
            hold: cases.filter(c => 
                c.status?.toLowerCase().includes('hold')
            ).length,
            cancelled: cases.filter(c => 
                c.status?.toLowerCase().includes('cancelled')
            ).length
        };
        
        console.log('📈 Statistics calculated:', statistics);
        res.json(statistics);
    } catch (error) {
        console.error('❌ Error fetching statistics:', error.message);
        res.status(500).json({ error: 'Failed to fetch statistics' });
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
        memoryCasesCount: memoryStorage.cases.length,
        nodeEnv: process.env.NODE_ENV,
        port: PORT
    };

    // Test MongoDB connection
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

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'ClearPro Aligner Backend API',
        version: '1.0.0',
        status: 'Running',
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            health: 'GET /api/health',
            cases: 'GET /api/cases',
            createCase: 'POST /api/cases',
            statistics: 'GET /api/statistics',
            updateCase: 'PUT /api/cases/:id',
            getCase: 'GET /api/cases/:id'
        },
        database: useMongoDB ? 'MongoDB' : 'Memory Storage'
    });
});

// Initialize server
async function startServer() {
    console.log('🚀 Starting ClearPro Aligner Backend...');
    console.log('📝 Environment:', process.env.NODE_ENV || 'development');
    console.log('🔐 MongoDB URI:', MONGODB_URI ? 'Set' : 'Not set');
    
    useMongoDB = await connectToMongoDB();
    
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🌐 CORS enabled for: https://total1.onrender.com`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`📋 Cases endpoint: http://localhost:${PORT}/api/cases`);
        console.log(`💾 Storage: ${useMongoDB ? 'MongoDB' : 'Memory (MongoDB not available)'}`);
        
        if (!useMongoDB) {
            console.log('⚠️  Running in fallback mode - data will be lost on server restart');
        }
    });
}

startServer().catch(console.error);
