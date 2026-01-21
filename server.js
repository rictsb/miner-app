const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize data file if it doesn't exist
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            projectOverrides: {},
            customProjects: [],
            factors: null
        }, null, 2));
    }
}

// Load data
function loadData() {
    try {
        initDataFile();
        const data = fs.readFileSync(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading data:', error);
        return {
            projectOverrides: {},
            customProjects: [],
            factors: null
        };
    }
}

// Save data
function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

// API Routes
app.get('/api/data', (req, res) => {
    const data = loadData();
    res.json(data);
});

app.post('/api/data', (req, res) => {
    const success = saveData(req.body);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(500).json({ error: 'Failed to save data' });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`BTC Miner Valuation Terminal v7 running at http://localhost:${PORT}`);
    initDataFile();
});
