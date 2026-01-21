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
      fidoodleFactors: {},
      hpcProjects: [],
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

// Save miner overrides
app.post('/api/miner-overrides', (req, res) => {
  const data = readData();
  data.minerOverrides = req.body;
  writeData(data);
  res.json({ success: true });
});

// Save fidoodle factors
app.post('/api/fidoodle-factors', (req, res) => {
  const data = readData();
  data.fidoodleFactors = req.body;
  writeData(data);
  res.json({ success: true });
});

// Get HPC projects
app.get('/api/hpc-projects', (req, res) => {
  const data = readData();
  res.json(data.hpcProjects || []);
});

// Save HPC projects
app.post('/api/hpc-projects', (req, res) => {
  const data = readData();
  data.hpcProjects = req.body;
  writeData(data);
  res.json({ success: true });
});

// Add single HPC project
app.post('/api/hpc-project', (req, res) => {
  const data = readData();
  if (!data.hpcProjects) data.hpcProjects = [];
  const newProject = { ...req.body, id: Date.now() };
  data.hpcProjects.push(newProject);
  writeData(data);
  res.json(newProject);
});

// Update HPC project
app.put('/api/hpc-project/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  const index = data.hpcProjects.findIndex(p => p.id === id);
  if (index !== -1) {
    data.hpcProjects[index] = { ...req.body, id };
    writeData(data);
    res.json(data.hpcProjects[index]);
  } else {
    res.status(404).json({ error: 'Project not found' });
  }
});

// Delete HPC project
app.delete('/api/hpc-project/:id', (req, res) => {
  const data = readData();
  const id = parseInt(req.params.id);
  data.hpcProjects = data.hpcProjects.filter(p => p.id !== id);
  writeData(data);
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`BTC Miner Valuation App running on http://localhost:${PORT}`);
  initDataFile();
});
