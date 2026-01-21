const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Data file path
const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data file if it doesn't exist
function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      minerOverrides: {},
      projectFidoodles: {},
      countryFactors: {
        'United States': 1.0,
        'USA': 1.0,
        'Canada': 0.9,
        'Norway': 0.85,
        'Paraguay': 0.7,
        'Bhutan': 0.5,
        'Ethiopia': 0.0,
        'UAE': 0.8,
        'Multiple': 0.8
      },
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// Read data
function readData() {
  initDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// Write data
function writeData(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API Routes

// Get all data
app.get('/api/data', (req, res) => {
  res.json(readData());
});

// Save all data
app.post('/api/data', (req, res) => {
  const currentData = readData();
  const newData = {
    ...currentData,
    ...req.body,
    lastUpdated: new Date().toISOString()
  };
  writeData(newData);
  res.json({ success: true });
});

// Save miner overrides
app.post('/api/miner-overrides', (req, res) => {
  const data = readData();
  data.minerOverrides = req.body;
  writeData(data);
  res.json({ success: true });
});

// Save project fidoodles
app.post('/api/project-fidoodles', (req, res) => {
  const data = readData();
  data.projectFidoodles = req.body;
  writeData(data);
  res.json({ success: true });
});

// Save country factors
app.post('/api/country-factors', (req, res) => {
  const data = readData();
  data.countryFactors = req.body;
  writeData(data);
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`BTC Miner Valuation App v6 running on http://localhost:${PORT}`);
  initDataFile();
});
