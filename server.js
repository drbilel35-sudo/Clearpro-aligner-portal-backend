// server.js (Backend - Node.js/Express)
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_API_URL = 'https://data.mongodb-api.com/app/data-abcde/endpoint/data/v1';
const MONGODB_API_KEY = 'your-secret-api-key'; // Keep this in environment variables

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
    res.status(500).json({ error: 'Failed to create case' });
  }
});

app.listen(3001, () => {
  console.log('Server running on port 3001');
});
