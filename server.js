// server.js (Backend - Node.js/Express)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Fixed CORS configuration
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
    credentials: false, // Changed to false when using multiple origins
    optionsSuccessStatus: 200
}));

app.use(express.json());

const MONGODB_API_URL = process.env.MONGODB_API_URL;
const MONGODB_API_KEY = process.env.MONGODB_API_KEY;
const PORT = process.env.PORT || 3001;

// Validate environment variables on startup
if (!MONGODB_API_URL || !MONGODB_API_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('MONGODB_API_URL:', MONGODB_API_URL ? 'Set' : 'Missing');
    console.error('MONGODB_API_KEY:', MONGODB_API_KEY ? 'Set' : 'Missing');
    console.log('💡 Please check your Render environment variables');
}

// Simple in-memory storage as fallback
let memoryStorage = {
    cases: []
};

// Helper function to generate MongoDB-style ID
function generateId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// MongoDB connection test
async function testMongoDBConnection() {
    if (!MONGODB_API_URL || !MONGODB_API_KEY) {
        console.log('⚠️  MongoDB credentials not found, using memory storage');
        return false;
    }

    try {
        const response = await axios.post(`${MONGODB_API_URL}/action/find`, {
            collection: 'cases',
            database: 'clearpro-aligner',
            dataSource: 'Cluster0',
            filter: {}
        }, {
            headers: {
                'Content-Type': 'application/json',
                'api-key': MONGODB_API_KEY
            },
            timeout: 10000
        });
        console.log('✅ MongoDB connection successful');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error.message);
        console.log('⚠️  Falling back to memory storage');
        return false;
    }
}

let useMongoDB = false;

// Initialize connection on startup
testMongoDBConnection().then(connected => {
    useMongoDB = connected;
});

// Routes
app.get('/api/cases', async (req, res) => {
    try {
        if (useMongoDB) {
            const response = await axios.post(`${MONGODB_API_URL}/action/find`, {
                collection: 'cases',
                database: 'clearpro-aligner',
                dataSource: 'Cluster0',
                filter: {}
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': MONGODB_API_KEY
                },
                timeout: 10000
            });
            res.json(response.data.documents || []);
        } else {
            // Fallback to memory storage
            res.json(memoryStorage.cases);
        }
    } catch (error) {
        console.error('Error fetching cases:', error.message);
        // Fallback to memory storage on error
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

        if (useMongoDB) {
            const response = await axios.post(`${MONGODB_API_URL}/action/insertOne`, {
                collection: 'cases',
                database: 'clearpro-aligner',
                dataSource: 'Cluster0',
                document: caseData
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': MONGODB_API_KEY
                },
                timeout: 10000
            });
            res.json({ insertedId: caseData._id, ...response.data });
        } else {
            // Fallback to memory storage
            memoryStorage.cases.push(caseData);
            res.json({ insertedId: caseData._id, case: caseData });
        }
    } catch (error) {
        console.error('Error creating case:', error.message);
        // Fallback to memory storage
        const caseData = {
            ...req.body,
            _id: generateId(),
            createdAt: new Date(),
            updatedAt: new Date()
        };
        memoryStorage.cases.push(caseData);
        res.json({ insertedId: caseData._id, case: caseData });
    }
});

app.put('/api/cases/:id', async (req, res) => {
    try {
        const caseId = req.params.id;
        const updateData = {
            ...req.body,
            updatedAt: new Date()
        };

        if (useMongoDB) {
            const response = await axios.post(`${MONGODB_API_URL}/action/updateOne`, {
                collection: 'cases',
                database: 'clearpro-aligner',
                dataSource: 'Cluster0',
                filter: { _id: { $oid: caseId } },
                update: { $set: updateData }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': MONGODB_API_KEY
                },
                timeout: 10000
            });
            res.json(response.data);
        } else {
            // Fallback to memory storage
            const index = memoryStorage.cases.findIndex(c => c._id === caseId);
            if (index !== -1) {
                memoryStorage.cases[index] = { ...memoryStorage.cases[index], ...updateData };
                res.json({ modifiedCount: 1 });
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

        if (useMongoDB) {
            const response = await axios.post(`${MONGODB_API_URL}/action/deleteOne`, {
                collection: 'cases',
                database: 'clearpro-aligner',
                dataSource: 'Cluster0',
                filter: { _id: { $oid: caseId } }
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': MONGODB_API_KEY
                },
                timeout: 10000
            });
            res.json(response.data);
        } else {
            // Fallback to memory storage
            const initialLength = memoryStorage.cases.length;
            memoryStorage.cases = memoryStorage.cases.filter(c => c._id !== caseId);
            const deletedCount = initialLength - memoryStorage.cases.length;
            res.json({ deletedCount });
        }
    } catch (error) {
        console.error('Error deleting case:', error.message);
        res.status(500).json({ error: 'Failed to delete case' });
    }
});

// Health check endpoint with detailed info
app.get('/api/health', async (req, res) => {
    const healthInfo = {
        status: 'OK',
        message: 'ClearPro Aligner API is running',
        timestamp: new Date().toISOString(),
        database: useMongoDB ? 'MongoDB' : 'Memory Storage',
        environment: process.env.NODE_ENV || 'development',
        memoryCasesCount: memoryStorage.cases.length
    };

    // Test MongoDB connection if credentials are available
    if (MONGODB_API_URL && MONGODB_API_KEY) {
        try {
            await axios.post(`${MONGODB_API_URL}/action/find`, {
                collection: 'cases',
                database: 'clearpro-aligner',
                dataSource: 'Cluster0',
                filter: {},
                limit: 1
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': MONGODB_API_KEY
                },
                timeout: 5000
            });
            healthInfo.database = 'MongoDB (Connected)';
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
            health: '/api/health',
            cases: '/api/cases'
        },
        database: useMongoDB ? 'MongoDB' : 'Memory Storage'
    });
});

// Add sample data for memory storage
app.post('/api/seed', (req, res) => {
    memoryStorage.cases = [
        {
            _id: 'demo-1',
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
            instructions: 'Demo case - Backend is working!',
            submittedBy: 'dr.hilda',
            createdAt: new Date(),
            updatedAt: new Date()
        }
    ];
    res.json({ message: 'Sample data loaded', cases: memoryStorage.cases });
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
            root: 'GET /'
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: https://clearpro-aligner-portal-backend.onrender.com/api/health`);
    console.log(`🔗 API Base URL: https://clearpro-aligner-portal-backend.onrender.com/api`);
    console.log(`💾 Storage: ${useMongoDB ? 'MongoDB' : 'Memory (MongoDB not configured)'}`);
});
