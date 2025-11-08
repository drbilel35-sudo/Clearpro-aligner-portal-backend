// server.js (COMPLETE FIXED VERSION FOR RENDER)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();

// CORS configuration - UPDATED WITH YOUR FRONTEND URL
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500', 
        'http://127.0.0.1:5500',
        'https://clearproaligner-portal1.onrender.com', // YOUR FRONTEND
        'https://clearproaligner-portal.onrender.com',
        'https://admin-portal-9lu8.onrender.com'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: false
}));

app.options('*', cors());
app.use(express.json());

// MongoDB configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bilsheikh5_db_user:QHxl4ahWv0FE2Lps@cluster0.r2hta0h.mongodb.net/clearpro-aligner?retryWrites=true&w=majority';
const PORT = process.env.PORT || 3001;

let db;
let client;
let casesCollection;

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
        casesCollection = db.collection('cases');
        
        console.log('✅ Successfully connected to MongoDB');
        
        // Create indexes
        await casesCollection.createIndex({ caseId: 1 }, { unique: true });
        await casesCollection.createIndex({ createdAt: -1 });
        await casesCollection.createIndex({ status: 1 });
        await casesCollection.createIndex({ doctor: 1 });
        
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

// ✅ IMPROVED ROUTES WITH BETTER LOGGING

// GET all cases
app.get('/api/cases', async (req, res) => {
    try {
        console.log('📥 GET /api/cases request received');
        
        let cases;
        if (useMongoDB && casesCollection) {
            cases = await casesCollection.find({}).sort({ createdAt: -1 }).toArray();
            console.log(`✅ Found ${cases.length} cases in MongoDB`);
            
            // Log first case for debugging
            if (cases.length > 0) {
                console.log('📝 Sample case:', {
                    id: cases[0]._id,
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

// CREATE case
app.post('/api/cases', async (req, res) => {
    try {
        console.log('📝 POST /api/cases request received');
        
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
        
        console.log('📈 Statistics:', statistics);
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
        port: PORT,
        frontend: 'https://clearproaligner-portal1.onrender.com'
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

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'ClearPro Aligner Backend API',
        version: '1.0.0',
        status: 'Running',
        environment: process.env.NODE_ENV || 'development',
        frontend: 'https://clearproaligner-portal1.onrender.com',
        endpoints: {
            health: 'GET /api/health',
            cases: 'GET /api/cases',
            statistics: 'GET /api/statistics',
            createCase: 'POST /api/cases'
        },
        database: useMongoDB ? 'MongoDB' : 'Memory Storage'
    });
});

// Initialize server
async function startServer() {
    console.log('🚀 Starting ClearPro Aligner Backend...');
    console.log('🌐 Frontend URL: https://clearproaligner-portal1.onrender.com');
    console.log('🔌 Port:', PORT);
    console.log('📝 Environment:', process.env.NODE_ENV || 'development');
    
    useMongoDB = await connectToMongoDB();
    
    // FIX: Listen on all interfaces for Render
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🔗 Health check: http://0.0.0.0:${PORT}/api/health`);
        console.log(`📋 Cases endpoint: http://0.0.0.0:${PORT}/api/cases`);
        console.log(`💾 Storage: ${useMongoDB ? 'MongoDB' : 'Memory Storage'}`);
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
