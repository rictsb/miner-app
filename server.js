const express = require('express');
const fs = require('fs');
const path = require('path');
const yahooFinance = require('yahoo-finance2').default;

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Stock tickers to track (with proper exchange suffixes where needed)
const STOCK_TICKERS = [
    'MARA',           // Marathon Digital
    'RIOT',           // Riot Platforms
    'CLSK',           // CleanSpark
    'CIFR',           // Cipher Mining
    'CORZ',           // Core Scientific
    'WULF',           // TeraWulf
    'HUT',            // Hut 8 (also trades as HUT.TO on TSX)
    'IREN',           // Iris Energy
    'BITF',           // Bitfarms
    'HIVE',           // HIVE Blockchain (also HIVE.V on TSX)
    'GLXY.TO',        // Galaxy Digital (TSX) - not on US exchanges
    'APLD',           // Applied Digital
    'BTDR',           // Bitdeer
    'SLNH',           // Soluna Holdings
    // 'FUFU' - not a public ticker, skip
];

// Map display tickers to Yahoo tickers
const TICKER_MAP = {
    'GLXY.TO': 'GLXY',  // Display as GLXY but fetch from TSX
};

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
        console.log('Returning cached stock data');
        return res.json(stockCache.data);
    }

    console.log('Fetching fresh stock data from Yahoo Finance...');
    const results = {};

    // Fetch each ticker individually to handle errors gracefully
    for (const ticker of STOCK_TICKERS) {
        try {
            const quote = await yahooFinance.quote(ticker);
            if (quote) {
                // Use mapped display name if exists
                const displayTicker = TICKER_MAP[ticker] || ticker;
                results[displayTicker] = {
                    price: quote.regularMarketPrice || 0,
                    marketCap: quote.marketCap || 0,
                    change: quote.regularMarketChangePercent || 0,
                    volume: quote.regularMarketVolume || 0,
                    previousClose: quote.regularMarketPreviousClose || 0,
                    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
                    fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0
                };
                console.log(`  ${displayTicker}: $${quote.regularMarketPrice?.toFixed(2) || 'N/A'}`);
            }
        } catch (error) {
            console.error(`  Error fetching ${ticker}:`, error.message);
        }
    }

    // Update cache if we got any results
    if (Object.keys(results).length > 0) {
        stockCache = {
            data: results,
            lastUpdate: now
        };
        console.log(`Cached ${Object.keys(results).length} stock prices`);
    }

    // Return results (could be empty if all failed)
    res.json(results);
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
