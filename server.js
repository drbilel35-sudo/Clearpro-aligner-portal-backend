// server.js (Backend - Node.js/Express)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Updated CORS configuration for production
app.use(cors({
    origin: [
        'http://localhost',           // Local development
        'http://127.0.0.1',           // Local development
        'http://localhost:3000',      // Local frontend development
        'http://127.0.0.1:3000',      // Local frontend development
        'http://localhost:5500',      // Live Server extension
        'http://127.0.0.1:5500',      // Live Server extension
        'file://',                    // Direct file access
        'https://clearpro-aligner-portal.netlify.app', // Your frontend when deployed
        'https://*.netlify.app',      // Any Netlify subdomain
        'https://*.vercel.app',       // Any Vercel subdomain
        'https://*.github.io',        // GitHub Pages
        '*'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200
}));

app.use(express.json());

const MONGODB_API_URL = process.env.MONGODB_API_URL;
const MONGODB_API_KEY = process.env.MONGODB_API_KEY;
const PORT = process.env.PORT || 3001;

// Routes
app.get('/api/cases', async (req, res) => {
  try {
    const response = await axios.post(`${MONGODB_API_URL}/action/find`, {
      collection: 'cases',
      database: 'clearpro-aligner',
      dataSource: 'Cluster0'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': MONGODB_API_KEY
      }
    });
    res.json(response.data.documents);
  } catch (error) {
    console.error('Error fetching cases:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch cases' });
  }
});

app.post('/api/cases', async (req, res) => {
  try {
    const response = await axios.post(`${MONGODB_API_URL}/action/insertOne`, {
      collection: 'cases',
      database: 'clearpro-aligner',
      dataSource: 'Cluster0',
      document: req.body
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': MONGODB_API_KEY
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error creating case:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create case' });
  }
});

app.put('/api/cases/:id', async (req, res) => {
  try {
    const response = await axios.post(`${MONGODB_API_URL}/action/updateOne`, {
      collection: 'cases',
      database: 'clearpro-aligner',
      dataSource: 'Cluster0',
      filter: { _id: { $oid: req.params.id } },
      update: { $set: req.body }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': MONGODB_API_KEY
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error updating case:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to update case' });
  }
});

app.delete('/api/cases/:id', async (req, res) => {
  try {
    const response = await axios.post(`${MONGODB_API_URL}/action/deleteOne`, {
      collection: 'cases',
      database: 'clearpro-aligner',
      dataSource: 'Cluster0',
      filter: { _id: { $oid: req.params.id } }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'api-key': MONGODB_API_KEY
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error('Error deleting case:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to delete case' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ClearPro Aligner API is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'ClearPro Aligner Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      cases: '/api/cases'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: https://clearpro-aligner-portal-backend.onrender.com/api/health`);
  console.log(`🔗 API Base URL: https://clearpro-aligner-portal-backend.onrender.com/api`);
});
