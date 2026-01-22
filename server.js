const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// Stock tickers to track
const STOCK_TICKERS = [
    'MARA', 'RIOT', 'CLSK', 'CIFR', 'CORZ', 'WULF', 'HUT',
    'IREN', 'BITF', 'HIVE', 'GLXY', 'APLD', 'BTDR', 'SLNH'
];

// Cache for stock prices
let stockCache = {
    data: {},
    lastUpdate: 0,
    lastError: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

// Method 1: Yahoo Finance v7 API
async function fetchYahooQuotes(tickers) {
    const results = {};
    const symbols = tickers.join(',');
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;

    try {
        console.log('[Yahoo] Fetching...');
        const response = await fetchWithTimeout(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            }
        }, 15000);

        console.log('[Yahoo] Status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.quoteResponse?.result) {
            for (const quote of data.quoteResponse.result) {
                results[quote.symbol] = {
                    price: quote.regularMarketPrice || 0,
                    marketCap: quote.marketCap || 0,
                    change: quote.regularMarketChangePercent || 0
                };
            }
            console.log('[Yahoo] Got', Object.keys(results).length, 'quotes');
        }
    } catch (error) {
        console.error('[Yahoo] Error:', error.message);
        stockCache.lastError = `Yahoo: ${error.message}`;
    }

    return results;
}

// Method 2: YFinance via RapidAPI proxy (free tier available)
async function fetchYahooViaProxy(tickers) {
    const results = {};
    const symbols = tickers.join(',');

    // Try allorigins proxy
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`)}`;

    try {
        console.log('[Proxy] Fetching via allorigins...');
        const response = await fetchWithTimeout(proxyUrl, {}, 15000);

        if (response.ok) {
            const data = await response.json();
            if (data.quoteResponse?.result) {
                for (const quote of data.quoteResponse.result) {
                    results[quote.symbol] = {
                        price: quote.regularMarketPrice || 0,
                        marketCap: quote.marketCap || 0,
                        change: quote.regularMarketChangePercent || 0
                    };
                }
                console.log('[Proxy] Got', Object.keys(results).length, 'quotes');
            }
        }
    } catch (error) {
        console.error('[Proxy] Error:', error.message);
        stockCache.lastError = `Proxy: ${error.message}`;
    }

    return results;
}

// Method 3: Twelve Data API (free tier - 8 calls/minute)
async function fetchTwelveData(tickers) {
    const results = {};

    // Free API key from twelvedata.com (demo key)
    const symbols = tickers.slice(0, 8).join(','); // Limit for free tier
    const url = `https://api.twelvedata.com/quote?symbol=${symbols}&apikey=demo`;

    try {
        console.log('[TwelveData] Fetching...');
        const response = await fetchWithTimeout(url, {}, 10000);

        if (response.ok) {
            const data = await response.json();

            // Handle single vs multiple results
            if (Array.isArray(data)) {
                for (const quote of data) {
                    if (quote.symbol && quote.close) {
                        results[quote.symbol] = {
                            price: parseFloat(quote.close) || 0,
                            marketCap: 0,
                            change: parseFloat(quote.percent_change) || 0
                        };
                    }
                }
            } else if (data.symbol && data.close) {
                results[data.symbol] = {
                    price: parseFloat(data.close) || 0,
                    marketCap: 0,
                    change: parseFloat(data.percent_change) || 0
                };
            }
            console.log('[TwelveData] Got', Object.keys(results).length, 'quotes');
        }
    } catch (error) {
        console.error('[TwelveData] Error:', error.message);
    }

    return results;
}

// Stock prices API endpoint
app.get('/api/stocks', async (req, res) => {
    const now = Date.now();

    // Return cached data if fresh
    if (stockCache.lastUpdate > 0 && (now - stockCache.lastUpdate) < CACHE_DURATION) {
        return res.json(stockCache.data);
    }

    console.log('=== Fetching stock data ===');
    let results = {};

    // Use proxy as primary method (Yahoo direct is now blocked with 401)
    results = await fetchYahooViaProxy(STOCK_TICKERS);

    // Fallback to TwelveData
    if (Object.keys(results).length === 0) {
        results = await fetchTwelveData(STOCK_TICKERS);
    }

    // Cache if successful
    if (Object.keys(results).length > 0) {
        stockCache = { data: results, lastUpdate: now, lastError: null };
    }

    console.log('=== Got', Object.keys(results).length, 'tickers ===');
    res.json(results);
});

// Status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        status: 'ok',
        nodeVersion: process.version,
        tickers: STOCK_TICKERS,
        cachedTickers: Object.keys(stockCache.data).length,
        cacheAge: stockCache.lastUpdate > 0 ? Math.round((Date.now() - stockCache.lastUpdate) / 1000) + 's' : null,
        lastError: stockCache.lastError,
        time: new Date().toISOString()
    });
});

// Simple test - just try to fetch Google
app.get('/api/test-network', async (req, res) => {
    const tests = {};

    // Test 1: Can we reach Google?
    try {
        const r = await fetchWithTimeout('https://www.google.com', {}, 5000);
        tests.google = { ok: r.ok, status: r.status };
    } catch (e) {
        tests.google = { ok: false, error: e.message };
    }

    // Test 2: Can we reach Yahoo Finance?
    try {
        const r = await fetchWithTimeout('https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, 10000);
        const data = await r.text();
        tests.yahoo = { ok: r.ok, status: r.status, hasData: data.length > 0, sample: data.substring(0, 200) };
    } catch (e) {
        tests.yahoo = { ok: false, error: e.message };
    }

    // Test 3: Can we reach the proxy?
    try {
        const r = await fetchWithTimeout('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://httpbin.org/get'), {}, 10000);
        tests.proxy = { ok: r.ok, status: r.status };
    } catch (e) {
        tests.proxy = { ok: false, error: e.message };
    }

    res.json({
        nodeVersion: process.version,
        time: new Date().toISOString(),
        tests
    });
});

// Test fetch endpoint
app.get('/api/test-fetch', async (req, res) => {
    console.log('=== Test fetch triggered ===');
    stockCache.lastUpdate = 0; // Clear cache

    const results = {
        time: new Date().toISOString(),
        nodeVersion: process.version
    };

    // Test Yahoo
    try {
        results.yahoo = await fetchYahooQuotes(['MARA', 'RIOT']);
    } catch (e) {
        results.yahoo = { error: e.message };
    }

    // Test Proxy
    try {
        results.proxy = await fetchYahooViaProxy(['MARA', 'RIOT']);
    } catch (e) {
        results.proxy = { error: e.message };
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
    initDataFile();
});
