const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3001;

// Stock price cache (in-memory, refreshes on demand)
let stockPriceCache = {};
let lastPriceFetch = 0;
const PRICE_CACHE_TTL = 60 * 1000; // 1 minute cache

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load seed data
const dataPath = path.join(__dirname, 'data.json');
let data;

// Initialize data from seed or existing file
if (fs.existsSync(dataPath)) {
  data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
} else {
  const seedData = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));

  // Miner name lookup
  const minerNames = {
    'MARA': 'MARA Holdings',
    'SLNH': 'Soluna Holdings',
    'FUFU': 'BitFuFu',
    'RIOT': 'Riot Platforms',
    'CLSK': 'CleanSpark',
    'CIFR': 'Cipher Mining',
    'BTDR': 'Bitdeer',
    'WULF': 'TeraWulf',
    'CORZ': 'Core Scientific',
    'HUT': 'Hut 8',
    'IREN': 'IREN Limited',
    'BITF': 'Bitfarms',
    'HIVE': 'HIVE Digital',
    'GLXY': 'Galaxy Digital',
    'APLD': 'Applied Digital'
  };

  // Transform miners
  const miners = seedData.miners.map(m => ({
    ...m,
    name: minerNames[m.ticker] || m.ticker,
    hashrate_eh: m.hashrate_eh || 0,
    hashrate_type: m.hashrate_type || 'Self',
    total_debt_m: m.total_debt_m || 0,
    cash_m: m.cash_m || 0,
    btc_holdings: m.btc_holdings || 0,
    eth_holdings: m.eth_holdings || 0
  }));

  // Transform projects with IDs
  const projects = seedData.projects.map((p, idx) => ({
    id: idx + 1,
    ...p
  }));

  // Add default valuation factors
  const defaultFactors = [
    { id: 1, category: 'valuation', factor_key: 'cap_rate', multiplier: 0.12, sort_order: 0 },
    { id: 2, category: 'valuation', factor_key: 'noi_per_mw_yr', multiplier: 1.4, sort_order: 1 },
    { id: 3, category: 'valuation', factor_key: 'hyperscaler_premium', multiplier: 1.1, sort_order: 2 },
  ];

  // Transform factors with IDs
  const existingFactorKeys = new Set();
  const factors = [...defaultFactors];
  let factorId = defaultFactors.length + 1;

  seedData.factors.forEach(f => {
    const key = `${f.category}_${f.factor_key}`;
    if (!existingFactorKeys.has(key)) {
      existingFactorKeys.add(key);
      factors.push({
        id: factorId++,
        ...f,
        sort_order: f.sort_order || 0
      });
    }
  });

  data = { miners, projects, factors };
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// Save data helper
function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// ============== MINERS API ==============

// Get all miners with computed valuations
app.get('/api/miners', (req, res) => {
  try {
    const result = data.miners.map(m => {
      const projects = data.projects.filter(p => p.ticker === m.ticker);
      return {
        ...m,
        project_count: projects.length,
        total_it_mw: projects.reduce((sum, p) => sum + (p.it_mw || 0), 0),
        total_lease_value: projects.reduce((sum, p) => sum + (p.lease_value_m || 0), 0),
        total_noi: projects.reduce((sum, p) => sum + (p.noi_annual_m || 0), 0)
      };
    });
    res.json(result.sort((a, b) => a.ticker.localeCompare(b.ticker)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single miner with full details
app.get('/api/miners/:ticker', (req, res) => {
  try {
    const miner = data.miners.find(m => m.ticker === req.params.ticker);
    if (!miner) {
      return res.status(404).json({ error: 'Miner not found' });
    }

    const projects = data.projects
      .filter(p => p.ticker === req.params.ticker)
      .sort((a, b) => (a.energization_date || '').localeCompare(b.energization_date || ''));

    res.json({ ...miner, projects });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create miner
app.post('/api/miners', (req, res) => {
  try {
    const { ticker, name, hashrate_eh, hashrate_type, total_debt_m, cash_m, btc_holdings, eth_holdings } = req.body;

    if (data.miners.find(m => m.ticker === ticker)) {
      return res.status(400).json({ error: 'Miner already exists' });
    }

    data.miners.push({
      ticker,
      name: name || ticker,
      hashrate_eh: hashrate_eh || 0,
      hashrate_type: hashrate_type || 'Self',
      total_debt_m: total_debt_m || 0,
      cash_m: cash_m || 0,
      btc_holdings: btc_holdings || 0,
      eth_holdings: eth_holdings || 0
    });

    saveData();
    res.json({ success: true, ticker });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update miner
app.put('/api/miners/:ticker', (req, res) => {
  try {
    const idx = data.miners.findIndex(m => m.ticker === req.params.ticker);
    if (idx === -1) {
      return res.status(404).json({ error: 'Miner not found' });
    }

    const { name, hashrate_eh, hashrate_type, total_debt_m, cash_m, btc_holdings, eth_holdings } = req.body;

    if (name !== undefined) data.miners[idx].name = name;
    if (hashrate_eh !== undefined) data.miners[idx].hashrate_eh = hashrate_eh;
    if (hashrate_type !== undefined) data.miners[idx].hashrate_type = hashrate_type;
    if (total_debt_m !== undefined) data.miners[idx].total_debt_m = total_debt_m;
    if (cash_m !== undefined) data.miners[idx].cash_m = cash_m;
    if (btc_holdings !== undefined) data.miners[idx].btc_holdings = btc_holdings;
    if (eth_holdings !== undefined) data.miners[idx].eth_holdings = eth_holdings;

    saveData();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete miner
app.delete('/api/miners/:ticker', (req, res) => {
  try {
    data.projects = data.projects.filter(p => p.ticker !== req.params.ticker);
    data.miners = data.miners.filter(m => m.ticker !== req.params.ticker);
    saveData();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== PROJECTS API ==============

// Get all projects with filters
app.get('/api/projects', (req, res) => {
  try {
    let result = [...data.projects];

    if (req.query.ticker) {
      result = result.filter(p => p.ticker === req.query.ticker);
    }
    if (req.query.status) {
      result = result.filter(p => p.status === req.query.status);
    }
    if (req.query.has_lease === 'true') {
      result = result.filter(p => p.lease_value_m && p.lease_value_m > 0);
    }
    if (req.query.has_lease === 'false') {
      result = result.filter(p => !p.lease_value_m || p.lease_value_m === 0);
    }
    if (req.query.min_mw) {
      result = result.filter(p => (p.it_mw || 0) >= parseFloat(req.query.min_mw));
    }
    if (req.query.max_mw) {
      result = result.filter(p => (p.it_mw || 0) <= parseFloat(req.query.max_mw));
    }
    if (req.query.grid) {
      result = result.filter(p => p.grid === req.query.grid);
    }
    if (req.query.site_phase) {
      result = result.filter(p => p.site_phase === req.query.site_phase);
    }
    if (req.query.year) {
      result = result.filter(p => {
        if (!p.energization_date) return false;
        return p.energization_date.includes(req.query.year);
      });
    }

    result.sort((a, b) => {
      const tickerCmp = (a.ticker || '').localeCompare(b.ticker || '');
      if (tickerCmp !== 0) return tickerCmp;
      return (a.energization_date || '').localeCompare(b.energization_date || '');
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single project
app.get('/api/projects/:id', (req, res) => {
  try {
    const project = data.projects.find(p => p.id === parseInt(req.params.id));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create project
app.post('/api/projects', (req, res) => {
  try {
    const maxId = data.projects.reduce((max, p) => Math.max(max, p.id || 0), 0);
    const newProject = {
      id: maxId + 1,
      ...req.body
    };
    data.projects.push(newProject);
    saveData();
    res.json({ success: true, id: newProject.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update project
app.put('/api/projects/:id', (req, res) => {
  try {
    const idx = data.projects.findIndex(p => p.id === parseInt(req.params.id));
    if (idx === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    Object.keys(req.body).forEach(key => {
      if (key !== 'id') {
        data.projects[idx][key] = req.body[key];
      }
    });

    saveData();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
  try {
    data.projects = data.projects.filter(p => p.id !== parseInt(req.params.id));
    saveData();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== FACTORS API ==============

// Get all factors
app.get('/api/factors', (req, res) => {
  try {
    const sorted = [...data.factors].sort((a, b) => {
      const catCmp = (a.category || '').localeCompare(b.category || '');
      if (catCmp !== 0) return catCmp;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update factor
app.put('/api/factors/:id', (req, res) => {
  try {
    const idx = data.factors.findIndex(f => f.id === parseInt(req.params.id));
    if (idx === -1) {
      return res.status(404).json({ error: 'Factor not found' });
    }

    if (req.body.multiplier !== undefined) {
      data.factors[idx].multiplier = req.body.multiplier;
    }

    saveData();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== VALUATION API ==============

// Get computed valuations for all miners
app.get('/api/valuations', (req, res) => {
  try {
    const btcPrice = parseFloat(req.query.btc_price) || 90000;
    const ethPrice = parseFloat(req.query.eth_price) || 3000;
    const evPerEh = parseFloat(req.query.ev_per_eh) || 54;

    // Build factor lookup
    const factorLookup = {};
    data.factors.forEach(f => {
      if (!factorLookup[f.category]) factorLookup[f.category] = {};
      factorLookup[f.category][f.factor_key] = f.multiplier;
    });

    const capRate = factorLookup['valuation']?.['cap_rate'] || 0.12;
    const noiPerMwYr = factorLookup['valuation']?.['noi_per_mw_yr'] || 1.4;

    const valuations = data.miners.map(miner => {
      // Get projects for this miner
      const projects = data.projects.filter(p => p.ticker === miner.ticker);

      // 1. Mining Value
      const miningEv = (miner.hashrate_eh || 0) * evPerEh;

      // 2. HODL Value
      const hodlValue = (miner.btc_holdings || 0) * btcPrice / 1000000 +
                        (miner.eth_holdings || 0) * ethPrice / 1000000;

      // 3. Lease Value (NPV of contracted NOI)
      let leaseValue = 0;
      let pipelineValue = 0;

      projects.forEach(p => {
        // Get applicable factors
        let phaseFactor = 1;
        if (factorLookup['phase']) {
          phaseFactor = factorLookup['phase'][p.site_phase] || 0.5;
        }

        let gridFactor = 1;
        if (factorLookup['grid'] && p.grid) {
          const gridKey = p.grid.split(' ')[0]; // Get first word (e.g., "ERCOT" from "ERCOT (Texas)")
          gridFactor = factorLookup['grid'][gridKey] || 0.9;
        }

        let yearFactor = 1;
        if (factorLookup['year'] && p.energization_date) {
          // Extract year from date string (could be "Dec-2026" or "2026-12-01")
          const yearMatch = p.energization_date.match(/20\d{2}/);
          if (yearMatch) {
            yearFactor = factorLookup['year'][yearMatch[0]] || 0.5;
          }
        }

        let sizeFactor = 1;
        if (factorLookup['size'] && p.it_mw) {
          if (p.it_mw >= 500) sizeFactor = factorLookup['size']['500'] || 1.1;
          else if (p.it_mw >= 250) sizeFactor = factorLookup['size']['250'] || 1.0;
          else if (p.it_mw >= 100) sizeFactor = factorLookup['size']['100'] || 0.95;
          else sizeFactor = factorLookup['size']['99'] || 0.85;
        }

        const combinedFactor = phaseFactor * gridFactor * yearFactor * sizeFactor;

        if (p.noi_annual_m && p.noi_annual_m > 0) {
          // Contracted lease - use actual NOI
          leaseValue += (p.noi_annual_m / capRate) * combinedFactor;
        } else if (p.it_mw && p.it_mw > 0) {
          // Pipeline - estimate value based on capacity
          const estimatedNoi = p.it_mw * noiPerMwYr * 0.85; // 85% NOI margin
          pipelineValue += (estimatedNoi / capRate) * combinedFactor;
        }
      });

      // 4. Net position
      const totalAssetValue = miningEv + hodlValue + leaseValue + pipelineValue + (miner.cash_m || 0);
      const netValue = totalAssetValue - (miner.total_debt_m || 0);

      return {
        ticker: miner.ticker,
        name: miner.name,
        components: {
          mining_ev: Math.round(miningEv),
          hodl_value: Math.round(hodlValue),
          lease_value: Math.round(leaseValue),
          pipeline_value: Math.round(pipelineValue),
          cash: Math.round(miner.cash_m || 0),
          total_assets: Math.round(totalAssetValue),
          debt: Math.round(miner.total_debt_m || 0),
          net_value: Math.round(netValue)
        },
        metrics: {
          hashrate_eh: miner.hashrate_eh,
          btc_holdings: miner.btc_holdings,
          project_count: projects.length,
          total_it_mw: projects.reduce((sum, p) => sum + (p.it_mw || 0), 0),
          contracted_mw: projects.filter(p => p.lease_value_m > 0).reduce((sum, p) => sum + (p.it_mw || 0), 0)
        }
      };
    });

    res.json(valuations.sort((a, b) => b.components.net_value - a.components.net_value));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== STATS API ==============

app.get('/api/stats', (req, res) => {
  try {
    const statusCounts = {};
    const phaseCounts = {};
    const gridCounts = {};

    data.projects.forEach(p => {
      if (p.status) {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      }
      if (p.site_phase) {
        phaseCounts[p.site_phase] = (phaseCounts[p.site_phase] || 0) + 1;
      }
      if (p.grid) {
        if (!gridCounts[p.grid]) {
          gridCounts[p.grid] = { count: 0, total_mw: 0 };
        }
        gridCounts[p.grid].count++;
        gridCounts[p.grid].total_mw += p.it_mw || 0;
      }
    });

    const stats = {
      total_miners: data.miners.length,
      total_projects: data.projects.length,
      total_it_mw: data.projects.reduce((sum, p) => sum + (p.it_mw || 0), 0),
      total_lease_value: data.projects.filter(p => p.lease_value_m > 0).reduce((sum, p) => sum + p.lease_value_m, 0),
      contracted_projects: data.projects.filter(p => p.lease_value_m > 0).length,
      statuses: Object.entries(statusCounts).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
      phases: Object.entries(phaseCounts).map(([site_phase, count]) => ({ site_phase, count })).sort((a, b) => b.count - a.count),
      grids: Object.entries(gridCounts).map(([grid, data]) => ({ grid, ...data })).sort((a, b) => b.total_mw - a.total_mw)
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== STOCK PRICES API ==============

// Fetch stock price from Yahoo Finance
async function fetchStockPrice(ticker) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;

    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
          resolve(price || null);
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Get all stock prices
app.get('/api/stock-prices', async (req, res) => {
  try {
    const now = Date.now();
    const forceRefresh = req.query.refresh === 'true';

    // Return cached prices if fresh enough
    if (!forceRefresh && now - lastPriceFetch < PRICE_CACHE_TTL && Object.keys(stockPriceCache).length > 0) {
      return res.json(stockPriceCache);
    }

    // Fetch all miner stock prices
    const tickers = data.miners.map(m => m.ticker);
    const prices = {};

    // Fetch in parallel with small batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (ticker) => {
        const price = await fetchStockPrice(ticker);
        return { ticker, price };
      }));
      results.forEach(r => {
        if (r.price !== null) {
          prices[r.ticker] = r.price;
        }
      });
    }

    stockPriceCache = prices;
    lastPriceFetch = now;

    res.json(prices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single stock price
app.get('/api/stock-prices/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();
    const price = await fetchStockPrice(ticker);
    res.json({ ticker, price });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== ENHANCED VALUATION API ==============

// Get computed valuations with per-share metrics
app.get('/api/valuations-enhanced', async (req, res) => {
  try {
    const btcPrice = parseFloat(req.query.btc_price) || 90000;
    const ethPrice = parseFloat(req.query.eth_price) || 3000;
    const evPerEh = parseFloat(req.query.ev_per_eh) || 54;
    const includeStockPrices = req.query.include_prices !== 'false';

    // Fetch current stock prices if requested
    let stockPrices = {};
    if (includeStockPrices) {
      const now = Date.now();
      if (now - lastPriceFetch < PRICE_CACHE_TTL && Object.keys(stockPriceCache).length > 0) {
        stockPrices = stockPriceCache;
      } else {
        const tickers = data.miners.map(m => m.ticker);
        for (const ticker of tickers) {
          const price = await fetchStockPrice(ticker);
          if (price !== null) {
            stockPrices[ticker] = price;
          }
        }
        stockPriceCache = stockPrices;
        lastPriceFetch = now;
      }
    }

    // Build factor lookup
    const factorLookup = {};
    data.factors.forEach(f => {
      if (!factorLookup[f.category]) factorLookup[f.category] = {};
      factorLookup[f.category][f.factor_key] = f.multiplier;
    });

    const capRate = factorLookup['valuation']?.['cap_rate'] || 0.12;
    const noiPerMwYr = factorLookup['valuation']?.['noi_per_mw_yr'] || 1.4;

    const valuations = data.miners.map(miner => {
      // Get projects for this miner
      const projects = data.projects.filter(p => p.ticker === miner.ticker);

      // 1. Mining Value
      const miningEv = (miner.hashrate_eh || 0) * evPerEh;

      // 2. HODL Value
      const hodlValue = (miner.btc_holdings || 0) * btcPrice / 1000000 +
                        (miner.eth_holdings || 0) * ethPrice / 1000000;

      // 3. Lease Value (NPV of contracted NOI)
      let leaseValue = 0;
      let pipelineValue = 0;

      projects.forEach(p => {
        // Get applicable factors
        let phaseFactor = 1;
        if (factorLookup['phase']) {
          phaseFactor = factorLookup['phase'][p.site_phase] || 0.5;
        }

        let gridFactor = 1;
        if (factorLookup['grid'] && p.grid) {
          const gridKey = p.grid.split(' ')[0];
          gridFactor = factorLookup['grid'][gridKey] || 0.9;
        }

        let yearFactor = 1;
        if (factorLookup['year'] && p.energization_date) {
          const yearMatch = p.energization_date.match(/20\d{2}/);
          if (yearMatch) {
            yearFactor = factorLookup['year'][yearMatch[0]] || 0.5;
          }
        }

        let sizeFactor = 1;
        if (factorLookup['size'] && p.it_mw) {
          if (p.it_mw >= 500) sizeFactor = factorLookup['size']['500'] || 1.1;
          else if (p.it_mw >= 250) sizeFactor = factorLookup['size']['250'] || 1.0;
          else if (p.it_mw >= 100) sizeFactor = factorLookup['size']['100'] || 0.95;
          else sizeFactor = factorLookup['size']['99'] || 0.85;
        }

        const combinedFactor = phaseFactor * gridFactor * yearFactor * sizeFactor;

        if (p.noi_annual_m && p.noi_annual_m > 0) {
          leaseValue += (p.noi_annual_m / capRate) * combinedFactor;
        } else if (p.it_mw && p.it_mw > 0) {
          const estimatedNoi = p.it_mw * noiPerMwYr * 0.85;
          pipelineValue += (estimatedNoi / capRate) * combinedFactor;
        }
      });

      // 4. Net position
      const totalAssetValue = miningEv + hodlValue + leaseValue + pipelineValue + (miner.cash_m || 0);
      const netValue = totalAssetValue - (miner.total_debt_m || 0);

      // 5. Per-share metrics
      const fdShares = miner.fd_shares_m || miner.shares_outstanding_m || 0;
      const impliedValuePerShare = fdShares > 0 ? (netValue / fdShares) : null;
      const currentPrice = stockPrices[miner.ticker] || null;
      const upsidePct = (impliedValuePerShare && currentPrice)
        ? ((impliedValuePerShare - currentPrice) / currentPrice * 100)
        : null;

      return {
        ticker: miner.ticker,
        name: miner.name,
        components: {
          mining_ev: Math.round(miningEv),
          hodl_value: Math.round(hodlValue),
          lease_value: Math.round(leaseValue),
          pipeline_value: Math.round(pipelineValue),
          cash: Math.round(miner.cash_m || 0),
          total_assets: Math.round(totalAssetValue),
          debt: Math.round(miner.total_debt_m || 0),
          net_value: Math.round(netValue)
        },
        per_share: {
          fd_shares_m: fdShares,
          implied_value: impliedValuePerShare ? Math.round(impliedValuePerShare * 100) / 100 : null,
          current_price: currentPrice,
          upside_pct: upsidePct ? Math.round(upsidePct * 10) / 10 : null
        },
        metrics: {
          hashrate_eh: miner.hashrate_eh,
          btc_holdings: miner.btc_holdings,
          project_count: projects.length,
          total_it_mw: projects.reduce((sum, p) => sum + (p.it_mw || 0), 0),
          contracted_mw: projects.filter(p => p.lease_value_m > 0).reduce((sum, p) => sum + (p.it_mw || 0), 0)
        }
      };
    });

    res.json(valuations.sort((a, b) => b.components.net_value - a.components.net_value));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
