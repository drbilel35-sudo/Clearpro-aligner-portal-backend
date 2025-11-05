// server.js (Backend - Node.js/Express)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
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
  res.json({ status: 'OK', message: 'ClearPro Aligner API is running' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
