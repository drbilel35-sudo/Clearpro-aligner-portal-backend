// server.js (Using Environment Variables)
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

// Get MongoDB URI from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bilsheikh5_db_user:QHxl4ahWv0FE2Lps@cluster0.r2hta0h.mongodb.net/clearpro-aligner?retryWrites=true&w=majority';
const PORT = process.env.PORT || 3001;

let db;
let client;

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

// Routes (same as before, but with better error handling)
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
        environment: process.env.NODE_ENV || 'development',
        endpoints: {
            health: 'GET /api/health',
            cases: 'GET /api/cases',
            createCase: 'POST /api/cases'
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
        console.log(`📊 Health check: /api/health`);
        console.log(`💾 Storage: ${useMongoDB ? 'MongoDB' : 'Memory (MongoDB not available)'}`);
        
        if (!useMongoDB) {
            console.log('⚠️  Running in fallback mode - data will be lost on server restart');
        }
    });
}

startServer().catch(console.error);
