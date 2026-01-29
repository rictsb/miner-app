/**
 * Simple Express server for BTC Miner Valuation Terminal v9
 * Used for local development and Render deployment
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`BTC Miner Valuation Terminal v9 running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});
