const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Stock tickers to track
const STOCK_TICKERS = [
    'MARA',           // Marathon Digital
    'RIOT',           // Riot Platforms
    'CLSK',           // CleanSpark
    'CIFR',           // Cipher Mining
    'CORZ',           // Core Scientific
    'WULF',           // TeraWulf
    'HUT',            // Hut 8
    'IREN',           // Iris Energy
    'BITF',           // Bitfarms
    'HIVE',           // HIVE Blockchain
    'GLXY',           // Galaxy Digital (use US listing)
    'APLD',           // Applied Digital
    'BTDR',           // Bitdeer
    'SLNH',           // Soluna Holdings
];

// Cache for stock prices (refresh every 5 minutes)
let stockCache = {
    data: {},
    lastUpdate: 0
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

// Fetch stock data using Yahoo Finance v8 API (no library needed)
async function fetchYahooQuotes(tickers) {
    const results = {};

    // Yahoo Finance v8 quote endpoint
    const symbols = tickers.join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`Yahoo API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.quoteResponse && data.quoteResponse.result) {
            for (const quote of data.quoteResponse.result) {
                const ticker = quote.symbol;
                results[ticker] = {
                    price: quote.regularMarketPrice || 0,
                    marketCap: quote.marketCap || 0,
                    change: quote.regularMarketChangePercent || 0,
                    volume: quote.regularMarketVolume || 0,
                    previousClose: quote.regularMarketPreviousClose || 0,
                    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh || 0,
                    fiftyTwoWeekLow: quote.fiftyTwoWeekLow || 0
                };
            }
        }
    } catch (error) {
        console.error('Yahoo Finance API error:', error.message);
    }

    return results;
}

// Fallback: Fetch from Alpha Vantage demo (limited but free)
async function fetchAlphaVantageQuote(ticker) {
    try {
        // Alpha Vantage demo API (limited requests)
        const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=demo`;
        const response = await fetch(url);
        const data = await response.json();

        if (data['Global Quote']) {
            const quote = data['Global Quote'];
            return {
                price: parseFloat(quote['05. price']) || 0,
                marketCap: 0, // Not available in this endpoint
                change: parseFloat(quote['10. change percent']?.replace('%', '')) || 0,
                volume: parseInt(quote['06. volume']) || 0,
                previousClose: parseFloat(quote['08. previous close']) || 0,
                fiftyTwoWeekHigh: 0,
                fiftyTwoWeekLow: 0
            };
        }
    } catch (error) {
        console.error(`Alpha Vantage error for ${ticker}:`, error.message);
    }
    return null;
}

// Stock prices API endpoint
app.get('/api/stocks', async (req, res) => {
    const now = Date.now();

    // Return cached data if still fresh
    if (stockCache.lastUpdate > 0 && (now - stockCache.lastUpdate) < CACHE_DURATION) {
        console.log('Returning cached stock data');
        return res.json(stockCache.data);
    }

    console.log('Fetching fresh stock data...');

    // Try Yahoo Finance first (batch request)
    let results = await fetchYahooQuotes(STOCK_TICKERS);

    // Log results
    const successCount = Object.keys(results).length;
    console.log(`Yahoo Finance returned ${successCount}/${STOCK_TICKERS.length} tickers`);

    // If we got results, cache them
    if (successCount > 0) {
        stockCache = {
            data: results,
            lastUpdate: now
        };

        // Log prices
        for (const [ticker, data] of Object.entries(results)) {
            console.log(`  ${ticker}: $${data.price?.toFixed(2) || 'N/A'}`);
        }
    }

    res.json(results);
});

// Debug endpoint to check server status
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        tickers: STOCK_TICKERS,
        cacheAge: stockCache.lastUpdate > 0 ? Date.now() - stockCache.lastUpdate : null,
        cachedTickers: Object.keys(stockCache.data).length
    });
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
