const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Stock tickers to track
const STOCK_TICKERS = [
    'MARA', 'RIOT', 'CLSK', 'CIFR', 'CORZ', 'WULF', 'HUT',
    'IREN', 'BITF', 'HIVE', 'GLXY', 'APLD', 'BTDR', 'SLNH',
    'BTBT', 'FUFU', 'ABTC'  // BTBT = Bit Digital, FUFU = BitFuFu, ABTC = American Bitcoin Corp
];

// ===========================================
// FREE API KEY SETUP:
// ===========================================
// 1. Go to https://finnhub.io/register
// 2. Sign up for FREE (no credit card needed)
// 3. Copy your API key from the dashboard
// 4. Add it as FINNHUB_API_KEY environment variable in Render
// ===========================================

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

// Cache for stock prices
let stockCache = {
    data: {},
    lastUpdate: 0,
    lastError: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes (to avoid hitting API rate limits)

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize data file
function initDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            projectOverrides: {},
            customProjects: [],
            factors: null
        }, null, 2));
    }
}

// Load/Save data
function loadData() {
    try {
        initDataFile();
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (error) {
        return { projectOverrides: {}, customProjects: [], factors: null };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        return false;
    }
}

// Data API
app.get('/api/data', (req, res) => res.json(loadData()));
app.post('/api/data', (req, res) => {
    res.json({ success: saveData(req.body) });
});

// Serve seed data (projects and miners from generated JSON)
const SEED_DATA_FILE = path.join(__dirname, 'seed-data.json');
app.get('/seed-data.json', (req, res) => {
    try {
        if (fs.existsSync(SEED_DATA_FILE)) {
            res.sendFile(SEED_DATA_FILE);
        } else {
            res.status(404).json({ error: 'seed-data.json not found' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error loading seed data' });
    }
});

// Helper: fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// Fetch from Finnhub with real API key
async function fetchFinnhub(tickers) {
    const results = {};

    if (!FINNHUB_API_KEY) {
        console.log('[Finnhub] No API key configured');
        stockCache.lastError = 'No FINNHUB_API_KEY configured';
        return results;
    }

    console.log('[Finnhub] Fetching with API key...');

    for (const ticker of tickers) {
        try {
            const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
            const response = await fetchWithTimeout(url, {}, 5000);

            if (response.ok) {
                const q = await response.json();
                if (q.c && q.c > 0) {
                    results[ticker] = {
                        price: q.c || 0,           // Current price
                        marketCap: 0,              // Finnhub doesn't provide this in quote
                        change: q.dp || 0,         // Percent change
                        high: q.h || 0,            // Day high
                        low: q.l || 0,             // Day low
                        open: q.o || 0,            // Open
                        prevClose: q.pc || 0       // Previous close
                    };
                    console.log(`[Finnhub] ${ticker}: $${q.c.toFixed(2)} (${q.dp > 0 ? '+' : ''}${q.dp?.toFixed(2)}%)`);
                }
            } else {
                const err = await response.text();
                console.error(`[Finnhub] ${ticker} error:`, response.status, err);
            }

            // Small delay to avoid rate limits (60 calls/minute on free tier)
            await new Promise(r => setTimeout(r, 100));

        } catch (e) {
            console.error(`[Finnhub] ${ticker} failed:`, e.message);
        }
    }

    return results;
}

// Fetch market caps separately (Finnhub company profile endpoint)
async function fetchMarketCaps(tickers, existingData) {
    if (!FINNHUB_API_KEY) return;

    console.log('[Finnhub] Fetching market caps...');

    for (const ticker of tickers) {
        if (!existingData[ticker]) continue;

        try {
            const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`;
            const response = await fetchWithTimeout(url, {}, 5000);

            if (response.ok) {
                const profile = await response.json();
                if (profile.marketCapitalization) {
                    // Finnhub returns market cap in millions
                    existingData[ticker].marketCap = profile.marketCapitalization * 1000000;
                    console.log(`[Finnhub] ${ticker} market cap: $${(profile.marketCapitalization / 1000).toFixed(2)}B`);
                }
            }

            // Delay for rate limits
            await new Promise(r => setTimeout(r, 100));

        } catch (e) {
            // Skip errors for market cap
        }
    }
}

// Stock prices API endpoint
app.get('/api/stocks', async (req, res) => {
    const now = Date.now();

    // Return cached data if fresh
    if (stockCache.lastUpdate > 0 && (now - stockCache.lastUpdate) < CACHE_DURATION) {
        console.log('[Cache] Returning cached data');
        return res.json(stockCache.data);
    }

    console.log('=== Fetching stock data ===');

    // Fetch quotes
    let results = await fetchFinnhub(STOCK_TICKERS);

    // Fetch market caps (uses additional API calls)
    if (Object.keys(results).length > 0) {
        await fetchMarketCaps(STOCK_TICKERS, results);
    }

    // Cache if successful
    if (Object.keys(results).length > 0) {
        stockCache = { data: results, lastUpdate: now, lastError: null };
    }

    console.log('=== Final: Got', Object.keys(results).length, 'tickers ===');
    res.json(results);
});

// Status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        nodeVersion: process.version,
        finnhubConfigured: !!FINNHUB_API_KEY,
        tickers: STOCK_TICKERS,
        cachedTickers: Object.keys(stockCache.data).length,
        cachedData: stockCache.data,
        cacheAge: stockCache.lastUpdate > 0 ? Math.round((Date.now() - stockCache.lastUpdate) / 1000) + 's' : null,
        lastError: stockCache.lastError,
        time: new Date().toISOString()
    });
});

// Test endpoint
app.get('/api/test-fetch', async (req, res) => {
    const results = {
        time: new Date().toISOString(),
        finnhubKeyConfigured: !!FINNHUB_API_KEY,
        finnhubKeyPreview: FINNHUB_API_KEY ? FINNHUB_API_KEY.substring(0, 4) + '...' : 'NOT SET'
    };

    if (!FINNHUB_API_KEY) {
        results.error = 'No API key configured';
        results.instructions = [
            '1. Go to https://finnhub.io/register',
            '2. Sign up for FREE',
            '3. Copy your API key',
            '4. In Render: Environment > Add FINNHUB_API_KEY',
            '5. Redeploy'
        ];
    } else {
        // Test with AAPL
        try {
            const url = `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${FINNHUB_API_KEY}`;
            const response = await fetchWithTimeout(url, {}, 5000);
            const data = await response.json();

            results.testTicker = 'AAPL';
            results.status = response.status;
            results.ok = response.ok;
            results.data = data;
            results.price = data.c;
        } catch (e) {
            results.error = e.message;
        }
    }

    res.json(results);
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Node ${process.version}`);
    console.log(`Finnhub API: ${FINNHUB_API_KEY ? 'Configured' : 'NOT SET - get free key at https://finnhub.io/register'}`);
    initDataFile();
});
