const express = require('express');
const fs = require('fs');
const path = require('path');
const yahooFinance = require('yahoo-finance2').default;

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Stock tickers to track
const STOCK_TICKERS = ['MARA', 'RIOT', 'CLSK', 'CIFR', 'CORZ', 'WULF', 'HUT', 'IREN', 'BITF', 'HIVE', 'GLXY', 'APLD', 'BTDR', 'SLNH', 'FUFU'];

// Cache for stock prices (refresh every 60 seconds)
let stockCache = {
    data: {},
    lastUpdate: 0
};
const CACHE_DURATION = 60 * 1000; // 60 seconds

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

// Stock prices API endpoint using Yahoo Finance
app.get('/api/stocks', async (req, res) => {
    const now = Date.now();

    // Return cached data if still fresh
    if (stockCache.lastUpdate > 0 && (now - stockCache.lastUpdate) < CACHE_DURATION) {
        return res.json(stockCache.data);
    }

    try {
        const results = {};

        // Fetch quotes for all tickers
        const quotes = await yahooFinance.quote(STOCK_TICKERS);

        // Handle both single quote and array of quotes
        const quotesArray = Array.isArray(quotes) ? quotes : [quotes];

        quotesArray.forEach(quote => {
            if (quote && quote.symbol) {
                results[quote.symbol] = {
                    price: quote.regularMarketPrice || 0,
                    marketCap: quote.marketCap || 0,
                    change: quote.regularMarketChangePercent || 0,
                    volume: quote.regularMarketVolume || 0,
                    previousClose: quote.regularMarketPreviousClose || 0,
                    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
                    fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0
                };
            }
        });

        // Update cache
        stockCache = {
            data: results,
            lastUpdate: now
        };

        res.json(results);
    } catch (error) {
        console.error('Yahoo Finance API error:', error.message);

        // Return cached data if available, even if stale
        if (Object.keys(stockCache.data).length > 0) {
            return res.json(stockCache.data);
        }

        res.status(500).json({ error: 'Failed to fetch stock prices' });
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
