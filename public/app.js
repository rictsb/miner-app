// BTC Miner Valuation App v7 - Rule-of-Thumb Valuation Engine
// ============================================================

// ============================================================
// GLOBAL STATE
// ============================================================
let btcPrice = 89668;
let ethPrice = 2994;
let stockPrices = {};  // Ticker -> { price, marketCap, change }
let map = null;
let markers = [];
let expandedRows = new Set();  // Track expanded project rows

// User data (persisted)
let projectOverrides = {};  // Per-project overrides
let customProjects = [];    // User-added projects
let savedFactors = null;    // User-saved global factors

// ============================================================
// HYPERSCALER TENANTS (includes AMD per user request)
// ============================================================
const HYPERSCALER_TENANTS = [
    'CoreWeave', 'Microsoft', 'AWS', 'Google', 'Meta', 'Oracle',
    'Anthropic', 'AMD', 'Fluidstack/Google', 'Fluidstack/Anthropic',
    'Fluidstack', 'Core42', 'G42'
];

function isHyperscaler(tenant) {
    if (!tenant) return false;
    return HYPERSCALER_TENANTS.some(h => tenant.toLowerCase().includes(h.toLowerCase()));
}

// ============================================================
// DEFAULT GLOBAL FACTORS
// ============================================================
const DEFAULT_FACTORS = {
    // Global Valuation Parameters
    baseNoiPerMw: 1.40,      // $M per MW per year (for HPC)
    baseCapRate: 12.0,       // %
    hyperscalerPremium: 1.10, // multiplier
    defaultTerm: 15,          // years
    escalator: 2.5,           // % annual rent growth
    pue: 1.30,                // Gross-to-IT conversion
    fidoodleDefault: 1.00,    // Default fidoodle

    // BTC Mining Valuation Parameters
    btcMining: {
        ebitdaPerMw: 0.35,    // $M EBITDA per MW per year
        ebitdaMultiple: 5.0,  // EV/EBITDA multiple for mining
    },

    // HPC Conversion Option - discount factors by conversion year
    // Represents probability-weighted present value of future HPC conversion
    hpcConversion: {
        '2025': 0.80,  // Converting soon - high probability, less discounting
        '2026': 0.65,
        '2027': 0.50,
        '2028': 0.40,
        '2029': 0.30,
        '2030': 0.25,
        '2031': 0.20,
        'never': 0.00   // No conversion value
    },

    // Credit Quality (Cap Rate Adders in %)
    credit: {
        hyperscaler: -2.0,
        ig: -1.0,
        spec: 1.0,
        unrated: 2.0
    },

    // Lease Structure Multipliers
    lease: {
        nnn: 1.00,
        gross: 0.95,
        hosting: 0.85
    },

    // Ownership Multipliers
    ownership: {
        fee: 1.00,
        ground: 0.90,
        jv: 0.80,
        nopower: 0.70
    },

    // Build/Energization Multipliers
    build: {
        operational: 1.00,
        contracted: 0.85,
        development: 0.60,
        pipeline: 0.40
    },

    // Concentration Multipliers
    concentration: {
        multi: 1.00,
        'single-hyper': 0.95,
        'single-ig': 0.90,
        bespoke: 0.80
    },

    // Size Band Multipliers
    size: {
        500: 1.15,
        250: 1.05,
        100: 1.00,
        50: 0.90,
        0: 0.80
    },

    // Country Multipliers
    country: {
        'United States': 1.00,
        'USA': 1.00,
        'Canada': 0.90,
        'Norway': 0.85,
        'Paraguay': 0.70,
        'Bhutan': 0.50,
        'Ethiopia': 0.00,
        'UAE': 0.80,
        'Multiple': 0.80
    },

    // Grid Multipliers
    grid: {
        'ERCOT': 1.05,
        'PJM': 1.00,
        'MISO': 0.95,
        'NYISO': 0.90,
        'SPP': 0.95,
        'other-us': 0.90,
        'canada': 0.90,
        'intl': 0.75
    }
};

// Active factors (merge of defaults and user saved)
let factors = JSON.parse(JSON.stringify(DEFAULT_FACTORS));

// ============================================================
// MINER DATA - From HODL Value sheet
// ============================================================
const MINER_DATA = {
    MARA: {
        btc: 54000, cash: 826.4, debt: 3640, fdShares: 437, miningMW: 1200,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001507605',
        snippets: {
            hodl: 'BTC Holdings: 54,000 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $826.4M per balance sheet',
            debt: 'Total Debt: $3,640M in convertible senior notes',
            shares: 'Shares: 378.18M basic, 437M fully diluted'
        }
    },
    RIOT: {
        btc: 18005, cash: 330.8, debt: 871.9, fdShares: 414, miningMW: 1100,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001167419',
        snippets: {
            hodl: 'BTC Holdings: 18,005 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $330.8M per balance sheet',
            debt: 'Total Debt: $871.9M in convertible notes',
            shares: 'Shares: 371.81M basic, 414M fully diluted'
        }
    },
    CLSK: {
        btc: 13099, cash: 43.0, debt: 825.7, fdShares: 318, miningMW: 745,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001844701',
        snippets: {
            hodl: 'BTC Holdings: 13,099 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $43.0M per balance sheet',
            debt: 'Total Debt: $825.7M in convertible notes',
            shares: 'Shares: 255.58M basic, 318M fully diluted'
        }
    },
    CIFR: {
        btc: 1500, cash: 1210, debt: 1040, fdShares: 395, miningMW: 300,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989',
        snippets: {
            hodl: 'BTC Holdings: 1,500 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $1,210M (includes AWS prepayment)',
            debt: 'Total Debt: $1,040M (AWS prepayment liability)',
            shares: 'Shares: 395.09M basic/fully diluted'
        }
    },
    CORZ: {
        btc: 2350, cash: 453.4, debt: 1160, fdShares: 310, miningMW: 850,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630',
        snippets: {
            hodl: 'BTC Holdings: 2,350 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $453.4M per balance sheet',
            debt: 'Total Debt: $1,160M in convertible notes',
            shares: 'Shares: 310.06M basic/fully diluted'
        }
    },
    WULF: {
        btc: 0, cash: 712.8, debt: 1500, fdShares: 575, miningMW: 150,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001916076',
        snippets: {
            hodl: 'BTC Holdings: 0 BTC (sold all holdings)',
            cash: 'Cash & Equivalents: $712.8M per balance sheet',
            debt: 'Total Debt: $1,500M in project financing',
            shares: 'Shares: 418.68M basic, 575M fully diluted'
        }
    },
    HUT: {
        btc: 13696, cash: 33.5, debt: 390.7, fdShares: 110, miningMW: 280,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001964789',
        snippets: {
            hodl: 'BTC Holdings: 13,696 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $33.5M per balance sheet',
            debt: 'Total Debt: $390.7M in credit facilities',
            shares: 'Shares: 108.04M basic, 110M fully diluted'
        }
    },
    IREN: {
        btc: 0, cash: 1030, debt: 973.5, fdShares: 328, miningMW: 510,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001878848',
        snippets: {
            hodl: 'BTC Holdings: 0 BTC (infrastructure focus)',
            cash: 'Cash & Equivalents: $1,030M per balance sheet',
            debt: 'Total Debt: $973.5M in equipment financing',
            shares: 'Shares: 328.34M basic/fully diluted'
        }
    },
    BITF: {
        btc: 1827, cash: 86.95, debt: 150, fdShares: 520, miningMW: 310,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001858293',
        snippets: {
            hodl: 'BTC Holdings: 1,827 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $86.95M per balance sheet',
            debt: 'Total Debt: $150M in term loans',
            shares: 'Shares: 520M basic/fully diluted'
        }
    },
    HIVE: {
        btc: 435, cash: 48.3, debt: 25, fdShares: 155, miningMW: 180,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001888079',
        snippets: {
            hodl: 'BTC Holdings: 435 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $48.3M per balance sheet',
            debt: 'Total Debt: $25M in equipment financing',
            shares: 'Shares: 155M basic/fully diluted'
        }
    },
    GLXY: {
        btc: 6894, cash: 1.8, debt: 500, fdShares: 390, miningMW: 0,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001886894',
        snippets: {
            hodl: 'BTC Holdings: 6,894 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $1.8M per balance sheet',
            debt: 'Total Debt: $500M in senior notes',
            shares: 'Shares: 390M basic/fully diluted'
        }
    },
    APLD: {
        btc: 0, cash: 150, debt: 400, fdShares: 260, miningMW: 159,
        source: 'FY2025 Q2 Report',
        sourceUrl: 'https://ir.applieddigital.com/news-events/press-releases',
        snippets: {
            hodl: 'BTC Holdings: 0 BTC (HPC focus)',
            cash: 'Cash & Equivalents: ~$150M per latest filing',
            debt: 'Total Debt: ~$400M in project financing',
            shares: 'Shares: ~260M basic/fully diluted'
        }
    },
    BTDR: {
        btc: 1901, cash: 202.3, debt: 800, fdShares: 485, miningMW: 2100,
        source: 'Q3 2024 Report',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001936702',
        snippets: {
            hodl: 'BTC Holdings: 1,901 BTC per Q3 2024 filing',
            cash: 'Cash & Equivalents: $202.3M per balance sheet',
            debt: 'Total Debt: ~$800M in term loans',
            shares: 'Shares: 485M basic/fully diluted'
        }
    },
    ABTC: {
        btc: 5427, cash: 7.98, debt: 50, fdShares: 125, miningMW: 175,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001899123',
        snippets: {
            hodl: 'BTC Holdings: 5,427 BTC per Q3 2024 10-Q filing',
            cash: 'Cash & Equivalents: $7.98M per balance sheet',
            debt: 'Total Debt: ~$50M in equipment financing',
            shares: 'Shares: 125M basic/fully diluted'
        }
    },
    SLNH: {
        btc: 0, cash: 51.4, debt: 0, fdShares: 85, miningMW: 200,
        source: 'Q3 2024 10-Q',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989',
        snippets: {
            hodl: 'BTC Holdings: 0 BTC',
            cash: 'Cash & Equivalents: $51.4M per balance sheet',
            debt: 'Total Debt: $0',
            shares: 'Shares: 85M basic/fully diluted'
        }
    },
    FUFU: {
        btc: 1780, cash: 32.6, debt: 0, fdShares: 150, miningMW: 488,
        source: 'Q3 2024 Report',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
        snippets: {
            hodl: 'BTC Holdings: 1,780 BTC',
            cash: 'Cash & Equivalents: $32.6M per balance sheet',
            debt: 'Total Debt: $0',
            shares: 'Shares: ~150M basic/fully diluted'
        }
    },
    BTBT: {
        btc: 0, cash: 179.1, debt: 0, fdShares: 200, miningMW: 500,
        source: 'Q3 2024 Report',
        sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar',
        snippets: {
            hodl: 'ETH Holdings: 155,227 ETH (no BTC)',
            cash: 'Cash & Equivalents: $179.1M per balance sheet',
            debt: 'Total Debt: $0',
            shares: 'Shares: ~200M basic/fully diluted'
        }
    }
};

// ============================================================
// ALL PROJECTS - From Excel "Project List V9" sheet
// ============================================================
const ALL_PROJECTS = [
    // APLD Projects
    { id: 1, ticker: 'APLD', name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 1', country: 'United States', state: 'ND', gross_mw: 130, it_mw: 100, grid: 'MISO', current_use: 'AI/HPC', status: 'Operational', lessee: 'CoreWeave', lease_years: 15, annual_rev: 183, noi_pct: 85, source_url: 'https://drive.google.com/file/d/1UhQsQqkob2KHu0I-jjosxlQqi854LSSD/view', lat: 46.002750, lng: -98.527046 },
    { id: 2, ticker: 'APLD', name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 2', country: 'United States', state: 'ND', gross_mw: 195, it_mw: 150, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_years: 15, annual_rev: 275, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142', lat: 46.002750, lng: -98.527046 },
    { id: 3, ticker: 'APLD', name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 3', country: 'United States', state: 'ND', gross_mw: 195, it_mw: 150, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_years: 15, annual_rev: 275, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142', lat: 46.002750, lng: -98.527046 },
    { id: 4, ticker: 'APLD', name: 'Harwood, ND (Polaris Forge 2) - Hyperscaler Bldg 1', country: 'United States', state: 'ND', gross_mw: 130, it_mw: 100, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'IG Hyperscaler (TBA)', lease_years: 15, annual_rev: 167, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases', lat: 46.979411, lng: -96.880638 },
    { id: 5, ticker: 'APLD', name: 'Harwood, ND (Polaris Forge 2) - Hyperscaler Bldg 2', country: 'United States', state: 'ND', gross_mw: 130, it_mw: 100, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'IG Hyperscaler (TBA)', lease_years: 15, annual_rev: 167, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases', lat: 46.979411, lng: -96.880638 },
    { id: 6, ticker: 'APLD', name: 'Harwood, ND (Polaris Forge 2) - ROFR Expansion', country: 'United States', state: 'ND', gross_mw: 1040, it_mw: 800, grid: 'MISO', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'US Hyperscaler (IG)', lease_years: 0, annual_rev: 0, noi_pct: 85, source_url: '', lat: 46.979411, lng: -96.880638 },
    { id: 7, ticker: 'APLD', name: '3 NEW sites - Advanced Discussions', country: 'United States', state: '', gross_mw: 1170, it_mw: 900, grid: '', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'IG Hyperscaler (TBD)', lease_years: 0, annual_rev: 0, noi_pct: 85, source_url: '', lat: null, lng: null },
    { id: 8, ticker: 'APLD', name: 'Jamestown, ND - BTC Mining (legacy)', country: 'United States', state: 'ND', gross_mw: 106, it_mw: 82, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 46.910556, lng: -98.708056 },
    { id: 9, ticker: 'APLD', name: 'Ellendale, ND - BTC Hosting (legacy)', country: 'United States', state: 'ND', gross_mw: 207, it_mw: 159, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: 'Self/hosting', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 46.002750, lng: -98.527046 },

    // BITF Projects
    { id: 10, ticker: 'BITF', name: 'Scrubgrass Plant, PA (Stronghold)', country: 'United States', state: 'PA', gross_mw: 85, it_mw: 65, grid: 'PJM', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 41.211870, lng: -79.779720 },
    { id: 11, ticker: 'BITF', name: 'Panther Creek, PA (HPC/AI campus)', country: 'United States', state: 'PA', gross_mw: 307, it_mw: 275, grid: 'PJM', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 40.631480, lng: -76.192722 },
    { id: 12, ticker: 'BITF', name: 'Quebec portfolio (6 sites)', country: 'Canada', state: 'QC', gross_mw: 70, it_mw: 54, grid: 'HQ', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 53.000000, lng: -70.000000 },
    { id: 13, ticker: 'BITF', name: 'Sharon, PA', country: 'United States', state: 'PA', gross_mw: 25, it_mw: 19, grid: 'PJM', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 41.233112, lng: -80.493403 },
    { id: 14, ticker: 'BITF', name: 'Baie-Comeau, Quebec', country: 'Canada', state: 'QC', gross_mw: 34, it_mw: 26, grid: 'HQ', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 49.221242, lng: -68.150162 },
    { id: 15, ticker: 'BITF', name: 'Washington State (Stronghold)', country: 'United States', state: 'WA', gross_mw: 10, it_mw: 8, grid: 'BPA', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 47.391700, lng: -121.570800 },

    // BTDR Projects
    { id: 16, ticker: 'BTDR', name: 'Clarington, OH - 570MW', country: 'United States', state: 'OH', gross_mw: 570, it_mw: 456, grid: 'PJM', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 39.765631, lng: -80.871206 },
    { id: 17, ticker: 'BTDR', name: 'Rockdale, TX', country: 'United States', state: 'TX', gross_mw: 623, it_mw: 498, grid: 'ERCOT', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 30.655628, lng: -97.001389 },
    { id: 18, ticker: 'BTDR', name: 'Jigmeling, Bhutan - 500MW', country: 'Bhutan', state: '', gross_mw: 500, it_mw: 442, grid: 'BTN', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 26.912150, lng: 90.390260 },
    { id: 19, ticker: 'BTDR', name: 'Niles, OH - 300MW', country: 'United States', state: 'OH', gross_mw: 300, it_mw: 240, grid: 'PJM', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 41.182778, lng: -80.765556 },
    { id: 20, ticker: 'BTDR', name: 'Tydal, Norway - 50MW', country: 'Norway', state: '', gross_mw: 50, it_mw: 44, grid: 'NOR', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 63.044800, lng: 11.650400 },
    { id: 21, ticker: 'BTDR', name: 'Tydal, Norway - 175MW', country: 'Norway', state: '', gross_mw: 175, it_mw: 155, grid: 'NOR', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 63.044800, lng: 11.650400 },
    { id: 22, ticker: 'BTDR', name: 'Fox Creek, Alberta - 101MW', country: 'Canada', state: 'AB', gross_mw: 101, it_mw: 89, grid: 'AESO', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 54.402168, lng: -116.808907 },
    { id: 23, ticker: 'BTDR', name: 'Gedu, Bhutan', country: 'Bhutan', state: '', gross_mw: 100, it_mw: 88, grid: 'BTN', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 26.922624, lng: 89.523811 },
    { id: 24, ticker: 'BTDR', name: 'Molde, Norway', country: 'Norway', state: '', gross_mw: 84, it_mw: 74, grid: 'NOR', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 62.733333, lng: 7.183333 },
    { id: 25, ticker: 'BTDR', name: 'Knoxville, TN', country: 'United States', state: 'TN', gross_mw: 95, it_mw: 76, grid: 'TVA', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.960100, lng: -83.920557 },
    { id: 26, ticker: 'BTDR', name: 'Ethiopia - Phase 1', country: 'Ethiopia', state: '', gross_mw: 40, it_mw: 35, grid: 'ETH', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 8.000000, lng: 39.000000 },
    { id: 27, ticker: 'BTDR', name: 'Ethiopia - Phase 2', country: 'Ethiopia', state: '', gross_mw: 10, it_mw: 9, grid: 'ETH', current_use: 'Mixed', status: 'Development', lessee: 'Self/mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 8.000000, lng: 39.000000 },

    // CIFR Projects
    { id: 28, ticker: 'CIFR', name: 'AWS AI Hosting Contract', country: 'United States', state: '', gross_mw: 278, it_mw: 214, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'AWS', lease_years: 15, annual_rev: 367, noi_pct: 85, source_url: 'https://investors.ciphermining.com/news-releases/news-release-details/cipher-mining-signs-agreement-strategic-partnership-softbank', lat: null, lng: null },
    { id: 29, ticker: 'CIFR', name: 'Barber Lake (TX) - Fluidstack/Google', country: 'United States', state: 'TX', gross_mw: 218, it_mw: 168, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack/Google', lease_years: 10, annual_rev: 300, noi_pct: 85, source_url: 'https://investors.ciphermining.com/news-releases/news-release-details/cipher-mining-announces-fluidstack-ai-cloud-partnership', lat: 32.420474, lng: -100.913205 },
    { id: 30, ticker: 'CIFR', name: 'Barber Lake Fluidstack Additional Site', country: 'United States', state: 'TX', gross_mw: 51, it_mw: 39, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack', lease_years: 10, annual_rev: 83, noi_pct: 85, source_url: 'https://investors.ciphermining.com/news-releases/news-release-details/cipher-mining-announces-fluidstack-ai-cloud-partnership', lat: 32.420474, lng: -100.913205 },
    { id: 31, ticker: 'CIFR', name: 'Colchis (West TX) - 1 GW JV', country: 'United States', state: 'TX', gross_mw: 1000, it_mw: 800, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: 'TBD (future HPC)', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://investors.ciphermining.com/news-releases/news-release-details/cipher-mining-signs-agreement-strategic-partnership-softbank', lat: 31.106000, lng: -97.647500 },
    { id: 32, ticker: 'CIFR', name: 'McLennan (Riesel, TX)', country: 'United States', state: 'TX', gross_mw: 75, it_mw: 58, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.474892, lng: -96.923326 },
    { id: 33, ticker: 'CIFR', name: 'Mikeska (Doole, TX)', country: 'United States', state: 'TX', gross_mw: 13, it_mw: 10, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.395717, lng: -99.598953 },
    { id: 34, ticker: 'CIFR', name: 'Odessa (TX)', country: 'United States', state: 'TX', gross_mw: 103, it_mw: 79, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.845556, lng: -102.367222 },
    { id: 35, ticker: 'CIFR', name: 'Bear (Andrews, TX) - JV', country: 'United States', state: 'TX', gross_mw: 45, it_mw: 35, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'JV (~49% Cipher)', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.318611, lng: -102.545278 },
    { id: 36, ticker: 'CIFR', name: 'Chief (Andrews, TX) - JV', country: 'United States', state: 'TX', gross_mw: 45, it_mw: 35, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'JV (~49% Cipher)', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.318611, lng: -102.545278 },

    // CLSK Projects
    { id: 37, ticker: 'CLSK', name: 'Georgia portfolio (12 locations)', country: 'United States', state: 'GA', gross_mw: 300, it_mw: 231, grid: 'SERC', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.986600, lng: -83.648700 },
    { id: 38, ticker: 'CLSK', name: 'Houston/Austin County, TX - AI DC', country: 'United States', state: 'TX', gross_mw: 200, it_mw: 154, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 29.950181, lng: -96.256976 },
    { id: 39, ticker: 'CLSK', name: 'Tennessee portfolio (13 locations)', country: 'United States', state: 'TN', gross_mw: 250, it_mw: 192, grid: 'TVA', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.744900, lng: -86.748900 },
    { id: 40, ticker: 'CLSK', name: 'Wyoming portfolio (2 locations)', country: 'United States', state: 'WY', gross_mw: 90, it_mw: 69, grid: 'WECC', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 42.747500, lng: -107.208500 },
    { id: 41, ticker: 'CLSK', name: 'Mississippi portfolio (5 locations)', country: 'United States', state: 'MS', gross_mw: 150, it_mw: 115, grid: 'SERC', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.767300, lng: -89.681200 },

    // CORZ Projects
    { id: 42, ticker: 'CORZ', name: 'CoreWeave - Denton TX (full site)', country: 'United States', state: 'TX', gross_mw: 338, it_mw: 260, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Operational', lessee: 'CoreWeave', lease_years: 12, annual_rev: 320, noi_pct: 85, source_url: 'https://www.sec.gov/Archives/edgar/data/0001844971/000119312524235399/d738426d8k.htm', lat: 33.215536, lng: -97.132481 },
    { id: 43, ticker: 'CORZ', name: 'CoreWeave - 5 other sites combined', country: 'United States', state: '', gross_mw: 429, it_mw: 330, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_years: 12, annual_rev: 405, noi_pct: 85, source_url: 'https://www.sec.gov/Archives/edgar/data/0001844971/000119312524235399/d738426d8k.htm', lat: null, lng: null },
    { id: 44, ticker: 'CORZ', name: 'Cottonwood / Pecos, TX', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, grid: 'ERCOT', current_use: 'Mixed', status: 'Operational', lessee: 'Mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.422962, lng: -103.492988 },
    { id: 45, ticker: 'CORZ', name: 'Dalton, GA campus', country: 'United States', state: 'GA', gross_mw: 104, it_mw: 80, grid: 'SERC', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 34.769861, lng: -84.969160 },
    { id: 46, ticker: 'CORZ', name: 'Marble, NC - HPC conversion', country: 'United States', state: 'NC', gross_mw: 135, it_mw: 104, grid: 'SERC', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'CoreWeave', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/Archives/edgar/data/0001844971/000119312524235399/d738426d8k.htm', lat: 35.174265, lng: -83.926521 },
    { id: 47, ticker: 'CORZ', name: 'Calvert City, KY', country: 'United States', state: 'KY', gross_mw: 130, it_mw: 100, grid: 'TVA', current_use: 'Mixed', status: 'Operational', lessee: 'Mixed', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 37.033123, lng: -88.350280 },
    { id: 48, ticker: 'CORZ', name: 'Muskogee, OK - CoreWeave', country: 'United States', state: 'OK', gross_mw: 91, it_mw: 70, grid: 'SPP', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'CoreWeave', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/Archives/edgar/data/0001844971/000119312524235399/d738426d8k.htm', lat: 35.747868, lng: -95.369414 },
    { id: 49, ticker: 'CORZ', name: 'Grand Forks, ND', country: 'United States', state: 'ND', gross_mw: 52, it_mw: 40, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 47.925136, lng: -97.032699 },
    { id: 50, ticker: 'CORZ', name: 'Austin, TX - CoreWeave', country: 'United States', state: 'TX', gross_mw: 21, it_mw: 16, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Operational', lessee: 'CoreWeave', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/Archives/edgar/data/0001844971/000119312524235399/d738426d8k.htm', lat: 30.267118, lng: -97.743130 },

    // GLXY Projects
    { id: 51, ticker: 'GLXY', name: 'Helios, TX - CoreWeave Phase I', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_years: 15, annual_rev: 381, noi_pct: 85, source_url: 'https://investor.galaxy.com/news-releases/news-release-details/galaxy-digital-and-coreweave-announce-strategic-partnership', lat: 33.781408, lng: -100.879051 },
    { id: 52, ticker: 'GLXY', name: 'Helios, TX - CoreWeave Phase II', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_years: 15, annual_rev: 381, noi_pct: 85, source_url: 'https://investor.galaxy.com/news-releases/news-release-details/galaxy-digital-and-coreweave-announce-strategic-partnership', lat: 33.781408, lng: -100.879051 },
    { id: 53, ticker: 'GLXY', name: 'Helios, TX - CoreWeave Phase III', country: 'United States', state: 'TX', gross_mw: 164, it_mw: 126, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_years: 15, annual_rev: 238, noi_pct: 85, source_url: 'https://investor.galaxy.com/news-releases/news-release-details/galaxy-digital-and-coreweave-announce-strategic-partnership', lat: 33.781408, lng: -100.879051 },
    { id: 54, ticker: 'GLXY', name: 'Helios, TX - Expansion', country: 'United States', state: 'TX', gross_mw: 250, it_mw: 192, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://investor.galaxy.com/news-releases/news-release-details/galaxy-digital-and-coreweave-announce-strategic-partnership', lat: 33.781408, lng: -100.879051 },

    // HUT Projects
    { id: 55, ticker: 'HUT', name: 'River Bend (LA) - Fluidstack/Anthropic lease', country: 'United States', state: 'LA', gross_mw: 319, it_mw: 245, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack/Anthropic', lease_years: 15, annual_rev: 467, noi_pct: 85, source_url: 'https://hut8.com/news/hut-8-announces-strategic-partnership-with-anthropic/', lat: 30.757000, lng: -91.332700 },
    { id: 56, ticker: 'HUT', name: 'River Bend (LA) - ROFO expansion', country: 'United States', state: 'LA', gross_mw: 1300, it_mw: 1000, grid: 'MISO', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Fluidstack', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://hut8.com/news/hut-8-announces-strategic-partnership-with-anthropic/', lat: 30.757000, lng: -91.332700 },
    { id: 57, ticker: 'HUT', name: 'Anthropic partnership - other sites option', country: 'United States', state: '', gross_mw: 1092, it_mw: 840, grid: '', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Anthropic', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://hut8.com/news/hut-8-announces-strategic-partnership-with-anthropic/', lat: null, lng: null },
    { id: 58, ticker: 'HUT', name: 'Ontario power gen sites (4)', country: 'Canada', state: 'ON', gross_mw: 210, it_mw: 162, grid: 'IESO', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 50.000000, lng: -85.000000 },
    { id: 59, ticker: 'HUT', name: 'King Mountain, TX (JV)', country: 'United States', state: 'TX', gross_mw: 310, it_mw: 248, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'JV', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.284588, lng: -102.274029 },
    { id: 60, ticker: 'HUT', name: 'Vega, TX', country: 'United States', state: 'TX', gross_mw: 100, it_mw: 80, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.243034, lng: -102.428431 },
    { id: 61, ticker: 'HUT', name: 'Medicine Hat, AB', country: 'Canada', state: 'AB', gross_mw: 101, it_mw: 78, grid: 'AESO', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 50.041668, lng: -110.677498 },

    // IREN Projects
    { id: 62, ticker: 'IREN', name: 'Childress (TX) - Microsoft Horizon 1-4', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Microsoft', lease_years: 5, annual_rev: 1940, noi_pct: 85, source_url: 'https://investors.iren.com/news-releases/news-release-details/iris-energy-announces-colocation-and-cloud-services-agreement', lat: 34.426427, lng: -100.204444 },
    { id: 63, ticker: 'IREN', name: 'Childress (TX) - Full 750MW', country: 'United States', state: 'TX', gross_mw: 975, it_mw: 750, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://investors.iren.com/news-releases/news-release-details/iris-energy-announces-colocation-and-cloud-services-agreement', lat: 34.426427, lng: -100.204444 },
    { id: 64, ticker: 'IREN', name: 'Sweetwater 1 (TX)', country: 'United States', state: 'TX', gross_mw: 100, it_mw: 77, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.471109, lng: -100.406268 },
    { id: 65, ticker: 'IREN', name: 'Sweetwater 2 (TX)', country: 'United States', state: 'TX', gross_mw: 100, it_mw: 77, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.471109, lng: -100.406268 },
    { id: 66, ticker: 'IREN', name: 'Mackenzie (BC)', country: 'Canada', state: 'BC', gross_mw: 64, it_mw: 49, grid: 'BC Hydro', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 55.336167, lng: -123.090000 },
    { id: 67, ticker: 'IREN', name: 'Prince George (BC)', country: 'Canada', state: 'BC', gross_mw: 64, it_mw: 49, grid: 'BC Hydro', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 53.916943, lng: -122.749443 },
    { id: 68, ticker: 'IREN', name: 'Canal Flats (BC)', country: 'Canada', state: 'BC', gross_mw: 51, it_mw: 39, grid: 'BC Hydro', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 50.150000, lng: -115.833331 },

    // MARA Projects
    { id: 69, ticker: 'MARA', name: 'MPLX Delaware Basin (LOI - up to 1.5GW)', country: 'United States', state: 'TX', gross_mw: 1500, it_mw: 1200, grid: 'ERCOT', current_use: 'Mixed', status: 'Development', lessee: 'Self/TBD', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.422962, lng: -103.492988 },
    { id: 70, ticker: 'MARA', name: 'UAE operations (Zero Two JV)', country: 'UAE', state: '', gross_mw: 250, it_mw: 221, grid: 'UAE', current_use: 'BTC', status: 'Operational', lessee: 'JV', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: null, lng: null },
    { id: 71, ticker: 'MARA', name: 'Granbury, TX', country: 'United States', state: 'TX', gross_mw: 230, it_mw: 184, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.448431, lng: -97.787659 },
    { id: 72, ticker: 'MARA', name: 'McCamey, TX (hosted)', country: 'United States', state: 'TX', gross_mw: 239, it_mw: 191, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'Hosted', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.132376, lng: -102.222910 },
    { id: 73, ticker: 'MARA', name: 'Ellendale, ND (hosted)', country: 'United States', state: 'ND', gross_mw: 207, it_mw: 159, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: 'Hosted', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 46.002750, lng: -98.527046 },
    { id: 74, ticker: 'MARA', name: 'Garden City, TX', country: 'United States', state: 'TX', gross_mw: 182, it_mw: 146, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.864022, lng: -101.481231 },
    { id: 75, ticker: 'MARA', name: 'Jamestown, ND (hosted)', country: 'United States', state: 'ND', gross_mw: 106, it_mw: 82, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: 'Hosted', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 46.910556, lng: -98.708056 },
    { id: 76, ticker: 'MARA', name: 'Kearney, NE', country: 'United States', state: 'NE', gross_mw: 64, it_mw: 51, grid: 'SPP', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 40.699331, lng: -99.081636 },

    // WULF Projects
    { id: 77, ticker: 'WULF', name: 'Lake Mariner (NY) - Fluidstack/Google (CB-1 to CB-5)', country: 'United States', state: 'NY', gross_mw: 476, it_mw: 366, grid: 'NYISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack/Google', lease_years: 10, annual_rev: 670, noi_pct: 85, source_url: 'https://ir.terawulf.com/news-events/press-releases/detail/107/terawulf-announces-hpc-ai-expansion-at-lake-mariner-with', lat: 43.359730, lng: -78.605270 },
    { id: 78, ticker: 'WULF', name: 'Lake Mariner (NY) - Core42/G42', country: 'United States', state: 'NY', gross_mw: 78, it_mw: 60, grid: 'NYISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Core42 (G42)', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://ir.terawulf.com/news-events/press-releases/detail/106/terawulf-announces-agreement-with-core42-for-72-5mw-of-ai', lat: 43.359730, lng: -78.605270 },
    { id: 79, ticker: 'WULF', name: 'Abernathy, TX - Fluidstack/Google JV', country: 'United States', state: 'TX', gross_mw: 112, it_mw: 86, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack (51% JV)', lease_years: 25, annual_rev: 192, noi_pct: 85, source_url: 'https://ir.terawulf.com/news-events/press-releases/detail/107/terawulf-announces-hpc-ai-expansion-at-lake-mariner-with', lat: 33.832304, lng: -101.842949 },
    { id: 80, ticker: 'WULF', name: 'Fluidstack JV Option - Abernathy Phase II', country: 'United States', state: 'TX', gross_mw: 218, it_mw: 168, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Fluidstack', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://ir.terawulf.com/news-events/press-releases/detail/107/terawulf-announces-hpc-ai-expansion-at-lake-mariner-with', lat: 33.832304, lng: -101.842949 },
    { id: 81, ticker: 'WULF', name: 'Fluidstack JV Option - New Site TBD', country: 'United States', state: '', gross_mw: 218, it_mw: 168, grid: '', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Fluidstack', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://ir.terawulf.com/news-events/press-releases/detail/107/terawulf-announces-hpc-ai-expansion-at-lake-mariner-with', lat: null, lng: null },
    { id: 82, ticker: 'WULF', name: 'Lake Mariner (NY) - BTC Mining', country: 'United States', state: 'NY', gross_mw: 200, it_mw: 154, grid: 'NYISO', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 43.359730, lng: -78.605270 },

    // RIOT Projects
    { id: 83, ticker: 'RIOT', name: 'Rockdale, TX (Whinstone) - BTC', country: 'United States', state: 'TX', gross_mw: 750, it_mw: 600, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.riotplatforms.com/news-media/press-releases', lat: 30.655628, lng: -97.001389 },
    { id: 84, ticker: 'RIOT', name: 'Rockdale, TX (Whinstone) - AMD', country: 'United States', state: 'TX', gross_mw: 33, it_mw: 25, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Operational', lessee: 'AMD', lease_years: 10, annual_rev: 31, noi_pct: 85, source_url: 'https://www.riotplatforms.com/news-media/press-releases/detail/174/riot-platforms-inc-announces-artificial-intelligence-and', lat: 30.655628, lng: -97.001389 },
    { id: 85, ticker: 'RIOT', name: 'Corsicana, TX - Phase 1', country: 'United States', state: 'TX', gross_mw: 400, it_mw: 320, grid: 'ERCOT', current_use: 'BTC', status: 'Development', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.095564, lng: -96.469432 },
    { id: 86, ticker: 'RIOT', name: 'Corsicana, TX - Full Build', country: 'United States', state: 'TX', gross_mw: 600, it_mw: 462, grid: 'ERCOT', current_use: 'Mixed', status: 'Pipeline', lessee: 'TBD (Evaluation)', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.095564, lng: -96.469432 },

    // SLNH Projects
    { id: 87, ticker: 'SLNH', name: 'Project Dorothy 1A (TX)', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://investors.soluna.com/news-releases/', lat: 31.106000, lng: -97.647500 },
    { id: 88, ticker: 'SLNH', name: 'Project Dorothy 1B (TX)', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, grid: 'ERCOT', current_use: 'BTC', status: 'Development', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://investors.soluna.com/news-releases/', lat: 31.106000, lng: -97.647500 },
    { id: 89, ticker: 'SLNH', name: 'Project Kati 1 (TX)', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Galaxy Digital (48MW)', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://investors.soluna.com/news-releases/news-release-details/soluna-holdings-inks-deal-with-galaxy-digital-to-develop-48-mw/', lat: 31.106000, lng: -97.647500 },
    { id: 90, ticker: 'SLNH', name: 'Project Kati 2 (TX)', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: 'TBD (AI/HPC)', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://investors.soluna.com/news-releases/', lat: 31.106000, lng: -97.647500 },

    // HIVE Projects
    { id: 91, ticker: 'HIVE', name: 'Yguazu, Paraguay (ex-Bitfarms)', country: 'Paraguay', state: '', gross_mw: 100, it_mw: 77, grid: 'ANDE', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: -25.450000, lng: -55.000000 },

    // FUFU Projects
    { id: 92, ticker: 'FUFU', name: 'Global hosting capacity', country: 'Multiple', state: '', gross_mw: 635, it_mw: 488, grid: '', current_use: 'BTC', status: 'Operational', lessee: 'Self/hosting', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: null, lng: null },
    { id: 93, ticker: 'FUFU', name: 'Oklahoma - 51MW', country: 'United States', state: 'OK', gross_mw: 66, it_mw: 51, grid: 'SPP', current_use: 'BTC', status: 'Operational', lessee: '', lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.537600, lng: -96.924700 }
];

// ============================================================
// RULE-OF-THUMB VALUATION ENGINE
// ============================================================

/**
 * Calculate the term factor: 1 - ((1+g)/(1+Cap_eff+g))^T
 * @param {number} T - Lease term in years
 * @param {number} g - Rent escalator (decimal, e.g., 0.025 for 2.5%)
 * @param {number} capEff - Effective cap rate (decimal, e.g., 0.10 for 10%)
 * @returns {number} Term factor
 */
function calculateTermFactor(T, g, capEff) {
    if (T <= 0 || capEff <= 0) return 0;
    const ratio = (1 + g) / (1 + capEff + g);
    return 1 - Math.pow(ratio, T);
}

/**
 * Get the effective cap rate based on project attributes and factors
 * @param {Object} project - Project data
 * @param {Object} overrides - Per-project overrides
 * @returns {number} Effective cap rate as decimal
 */
function getEffectiveCapRate(project, overrides = {}) {
    // Check for direct override
    if (overrides.capOverride) {
        return overrides.capOverride / 100;
    }

    // Start with base cap rate
    let capRate = factors.baseCapRate;

    // Credit quality adjustment
    const creditTier = overrides.credit || getCreditTier(project);
    capRate += factors.credit[creditTier] || 0;

    // Ensure cap rate doesn't go negative
    return Math.max(capRate, 4) / 100;
}

/**
 * Get credit tier based on tenant
 */
function getCreditTier(project) {
    if (isHyperscaler(project.lessee)) return 'hyperscaler';
    if (project.lessee && project.lessee.toLowerCase().includes('ig')) return 'ig';
    if (!project.lessee || project.lessee === '') return 'unrated';
    return 'spec';
}

/**
 * Get size multiplier based on IT MW
 */
function getSizeMultiplier(itMw, override = null) {
    if (override !== null && override !== undefined) return override;

    if (itMw >= 500) return factors.size[500];
    if (itMw >= 250) return factors.size[250];
    if (itMw >= 100) return factors.size[100];
    if (itMw >= 50) return factors.size[50];
    return factors.size[0];
}

/**
 * Get country multiplier
 */
function getCountryMultiplier(country, override = null) {
    if (override !== null && override !== undefined) return override;
    return factors.country[country] ?? 1.0;
}

/**
 * Get grid multiplier
 */
function getGridMultiplier(grid, country, override = null) {
    if (override !== null && override !== undefined) return override;

    // Check specific grids
    if (factors.grid[grid]) return factors.grid[grid];

    // Country-based defaults
    if (country === 'Canada') return factors.grid['canada'];
    if (country === 'United States') return factors.grid['other-us'];
    return factors.grid['intl'];
}

/**
 * Get build/energization multiplier based on status
 */
function getBuildMultiplier(status, override = null) {
    if (override !== null && override !== undefined) {
        return factors.build[override] || 1.0;
    }
    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === 'operational') return factors.build.operational;
    if (normalizedStatus === 'contracted') return factors.build.contracted;
    if (normalizedStatus === 'development') return factors.build.development;
    return factors.build.pipeline;
}

/**
 * Get lease structure multiplier
 */
function getLeaseMultiplier(leaseType) {
    if (!leaseType) return factors.lease.nnn;  // Default to NNN
    return factors.lease[leaseType] || factors.lease.nnn;
}

/**
 * Get ownership multiplier
 */
function getOwnershipMultiplier(ownership) {
    if (!ownership) return factors.ownership.fee;  // Default to fee simple
    return factors.ownership[ownership] || factors.ownership.fee;
}

/**
 * Get concentration multiplier
 */
function getConcentrationMultiplier(concentration, project) {
    if (concentration) return factors.concentration[concentration] || 1.0;
    // Default based on tenant type
    if (isHyperscaler(project.lessee)) return factors.concentration['single-hyper'];
    if (project.lessee) return factors.concentration['single-ig'];
    return factors.concentration.multi;
}

/**
 * Calculate project NOI
 */
function calculateNOI(project, overrides = {}) {
    // Direct NOI override
    if (overrides.noi !== undefined && overrides.noi !== null && overrides.noi !== '') {
        return parseFloat(overrides.noi);
    }

    // Calculate from rent per kW if provided
    if (overrides.rentKw && overrides.passthrough) {
        const mw = overrides.itMw || project.it_mw || 0;
        const annualRent = overrides.rentKw * 1000 * mw * 12 / 1000000;  // Convert to $M
        return annualRent * (overrides.passthrough / 100);
    }

    // Use project's stated annual rev and NOI %
    if (project.annual_rev && project.noi_pct) {
        return project.annual_rev * (project.noi_pct / 100);
    }

    // Default: Base NOI per MW * IT MW
    const itMw = overrides.itMw || project.it_mw || 0;
    return factors.baseNoiPerMw * itMw;
}

/**
 * Check if project is a BTC mining site (not HPC/AI)
 */
function isBtcMiningOnly(project, overrides = {}) {
    // If it has a hyperscaler tenant, it's HPC
    if (isHyperscaler(project.lessee)) return false;
    // If current_use is AI/HPC, it's not BTC only
    if (project.current_use === 'AI/HPC') return false;
    // If it has stated annual_rev from HPC lease, treat as HPC
    if (project.annual_rev && project.annual_rev > 0 && project.noi_pct) return false;
    // BTC or Mixed without HPC tenant = BTC mining
    return project.current_use === 'BTC' || project.current_use === 'Mixed';
}

/**
 * Calculate BTC Mining Value
 * Value = EBITDA per MW × IT MW × EBITDA Multiple × Country Factor × Fidoodle
 */
function calculateBtcMiningValue(project, overrides = {}) {
    const itMw = overrides.itMw || project.it_mw || 0;
    const ebitdaPerMw = overrides.btcEbitdaPerMw ?? factors.btcMining.ebitdaPerMw;
    const ebitdaMultiple = overrides.btcEbitdaMultiple ?? factors.btcMining.ebitdaMultiple;
    const fCountry = getCountryMultiplier(project.country, overrides.countryMult);
    const fidoodle = overrides.fidoodle ?? factors.fidoodleDefault;

    const ebitda = ebitdaPerMw * itMw;
    const miningValue = ebitda * ebitdaMultiple * fCountry * fidoodle;

    return {
        ebitda: ebitda,
        ebitdaPerMw: ebitdaPerMw,
        ebitdaMultiple: ebitdaMultiple,
        fCountry: fCountry,
        fidoodle: fidoodle,
        value: miningValue
    };
}

/**
 * Calculate HPC Conversion Option Value
 * If a BTC site could convert to HPC in the future, calculate the option value
 * Option Value = Potential HPC Value × Conversion Discount Factor × Country Factor
 */
function calculateHpcConversionValue(project, overrides = {}) {
    const conversionYear = overrides.hpcConversionYear || 'never';
    if (conversionYear === 'never') {
        return { value: 0, conversionYear: 'never', discountFactor: 0, potentialHpcValue: 0 };
    }

    const itMw = overrides.itMw || project.it_mw || 0;
    const discountFactor = factors.hpcConversion[conversionYear] || 0;

    // Calculate what the site would be worth as HPC (using default HPC assumptions)
    // Use base NOI per MW and base cap rate for potential value
    const potentialNoi = factors.baseNoiPerMw * itMw;
    const potentialCapRate = factors.baseCapRate / 100;
    const fSize = getSizeMultiplier(itMw, null);
    const fCountry = getCountryMultiplier(project.country, overrides.countryMult);
    const fGrid = getGridMultiplier(project.grid, project.country, overrides.gridMult);

    // Potential HPC value (simplified - operational, NNN, fee simple assumptions)
    const potentialHpcValue = (potentialNoi / potentialCapRate) * fSize * fCountry * fGrid;

    // Apply conversion discount
    const optionValue = potentialHpcValue * discountFactor;

    return {
        value: optionValue,
        conversionYear: conversionYear,
        discountFactor: discountFactor,
        potentialHpcValue: potentialHpcValue,
        fSize: fSize,
        fCountry: fCountry,
        fGrid: fGrid
    };
}

/**
 * Main valuation function - Rule of Thumb formula
 * For HPC/AI: Value = NOI1 / Cap_eff × TermFactor × Multipliers × Fidoodle
 * For BTC: Value = Mining Value + HPC Conversion Option Value
 */
function calculateProjectValue(project, overrides = {}) {
    const itMw = overrides.itMw || project.it_mw || 0;
    if (itMw <= 0) return { value: 0, components: {}, isBtcSite: false };

    // Check if this is a BTC mining site
    const btcSite = isBtcMiningOnly(project, overrides);

    if (btcSite) {
        // BTC Mining Valuation
        const miningVal = calculateBtcMiningValue(project, overrides);
        const conversionVal = calculateHpcConversionValue(project, overrides);

        const totalValue = miningVal.value + conversionVal.value;

        return {
            value: totalValue,
            isBtcSite: true,
            components: {
                // Mining components
                miningValue: miningVal.value,
                ebitda: miningVal.ebitda,
                ebitdaPerMw: miningVal.ebitdaPerMw,
                ebitdaMultiple: miningVal.ebitdaMultiple,
                // Conversion option components
                conversionValue: conversionVal.value,
                conversionYear: conversionVal.conversionYear,
                conversionDiscount: conversionVal.discountFactor,
                potentialHpcValue: conversionVal.potentialHpcValue,
                // Common
                fCountry: miningVal.fCountry,
                fidoodle: miningVal.fidoodle,
                itMw: itMw
            }
        };
    }

    // HPC/AI Lease Valuation (original formula)
    // 1. Calculate NOI
    const noi = calculateNOI(project, overrides);

    // 2. Get effective cap rate
    const capEff = getEffectiveCapRate(project, overrides);

    // 3. Get term parameters
    const T = overrides.term || project.lease_years || factors.defaultTerm;
    const g = (overrides.escalator ?? factors.escalator) / 100;

    // 4. Calculate term factor
    const termFactor = calculateTermFactor(T, g, capEff);

    // 5. Get all multipliers
    const fCredit = isHyperscaler(project.lessee) ? factors.hyperscalerPremium : 1.0;
    const fLease = getLeaseMultiplier(overrides.leaseType);
    const fOwnership = getOwnershipMultiplier(overrides.ownership);
    const fBuild = getBuildMultiplier(project.status, overrides.buildStatus);
    const fConcentration = getConcentrationMultiplier(overrides.concentration, project);
    const fSize = getSizeMultiplier(itMw, overrides.sizeMult);
    const fCountry = getCountryMultiplier(project.country, overrides.countryMult);
    const fGrid = getGridMultiplier(project.grid, project.country, overrides.gridMult);

    // 6. Get fidoodle
    const fidoodle = overrides.fidoodle ?? factors.fidoodleDefault;

    // 7. Combined multiplier
    const combinedMult = fCredit * fLease * fOwnership * fBuild * fConcentration * fSize * fCountry * fGrid;

    // 8. Calculate value
    // Value = (NOI / Cap_eff) * TermFactor * CombinedMultipliers * Fidoodle
    const baseValue = capEff > 0 ? noi / capEff : 0;
    const value = baseValue * termFactor * combinedMult * fidoodle;

    return {
        value: value,
        isBtcSite: false,
        components: {
            noi: noi,
            capEff: capEff,
            T: T,
            g: g,
            termFactor: termFactor,
            fCredit: fCredit,
            fLease: fLease,
            fOwnership: fOwnership,
            fBuild: fBuild,
            fConcentration: fConcentration,
            fSize: fSize,
            fCountry: fCountry,
            fGrid: fGrid,
            combinedMult: combinedMult,
            fidoodle: fidoodle,
            baseValue: baseValue
        }
    };
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadData();
    fetchPrices();
    setInterval(fetchPrices, 60000);
    setupEventListeners();
});

function initializeTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');

            if (tabId === 'map') {
                document.getElementById('map-tab').classList.add('active');
                if (!map) {
                    setTimeout(initMap, 100);
                } else {
                    map.invalidateSize();
                    updateMapMarkers();
                }
            } else {
                document.getElementById(tabId).classList.add('active');
            }
        });
    });
}

function setupEventListeners() {
    // Project form
    document.getElementById('project-form').addEventListener('submit', saveProjectOverrides);

    // Fidoodle slider sync
    const fidoodleSlider = document.getElementById('project-fidoodle-slider');
    const fidoodleInput = document.getElementById('project-fidoodle');
    const fidoodleDisplay = document.getElementById('project-fidoodle-display');

    fidoodleSlider.addEventListener('input', () => {
        const val = parseFloat(fidoodleSlider.value).toFixed(2);
        fidoodleInput.value = val;
        fidoodleDisplay.textContent = val;
        updateValuationPreview();
    });

    fidoodleInput.addEventListener('input', () => {
        const val = parseFloat(fidoodleInput.value) || 1.0;
        fidoodleSlider.value = val;
        fidoodleDisplay.textContent = val.toFixed(2);
        updateValuationPreview();
    });

    // Live preview on any input change
    const modalInputs = document.querySelectorAll('#project-form input, #project-form select');
    modalInputs.forEach(input => {
        input.addEventListener('change', updateValuationPreview);
        input.addEventListener('input', updateValuationPreview);
    });

    // Add project form
    document.getElementById('add-project-form').addEventListener('submit', addNewProject);

    // Filters
    ['project-ticker-filter', 'project-status-filter', 'project-use-filter', 'project-country-filter'].forEach(id => {
        document.getElementById(id).addEventListener('change', renderProjectsTable);
    });

    document.getElementById('hpc-ticker-filter').addEventListener('change', renderHpcTable);

    ['map-ticker-filter', 'map-status-filter', 'map-mw-filter'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateMapMarkers);
    });
}

// ============================================================
// DATA LOADING & SAVING
// ============================================================
async function loadData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        projectOverrides = data.projectOverrides || {};
        customProjects = data.customProjects || [];
        if (data.factors) {
            factors = mergeFactors(DEFAULT_FACTORS, data.factors);
            savedFactors = data.factors;
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }

    renderAll();
    loadFactorsToUI();
}

function mergeFactors(defaults, saved) {
    const merged = JSON.parse(JSON.stringify(defaults));
    for (const key in saved) {
        if (typeof saved[key] === 'object' && !Array.isArray(saved[key])) {
            merged[key] = { ...merged[key], ...saved[key] };
        } else {
            merged[key] = saved[key];
        }
    }
    return merged;
}

async function saveData() {
    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectOverrides,
                customProjects,
                factors
            })
        });
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

function renderAll() {
    renderDashboard();
    renderProjectsTable();
    renderHpcTable();
    renderCountryFactors();
    populateFilters();
    updateHpcBaseCap();
}

// ============================================================
// PRICE FETCHING
// ============================================================

// Stock tickers for Yahoo Finance
const STOCK_TICKERS = ['MARA', 'RIOT', 'CLSK', 'CIFR', 'CORZ', 'WULF', 'HUT', 'IREN', 'BITF', 'HIVE', 'GLXY', 'APLD', 'BTDR', 'SLNH', 'FUFU'];

async function fetchPrices() {
    // Fetch BTC and stock prices in parallel
    await Promise.all([
        fetchCryptoPrices(),
        fetchStockPrices()
    ]);

    updatePriceDisplay();
    renderDashboard();
}

async function fetchCryptoPrices() {
    let success = false;

    // Try CoinGecko first
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
        if (response.ok) {
            const data = await response.json();
            if (data.bitcoin && data.bitcoin.usd) {
                btcPrice = data.bitcoin.usd;
                ethPrice = data.ethereum?.usd || ethPrice;
                success = true;
            }
        }
    } catch (error) {
        console.error('CoinGecko API error:', error);
    }

    // Fallback to Coinbase API
    if (!success) {
        try {
            const [btcResp, ethResp] = await Promise.all([
                fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot'),
                fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot')
            ]);
            if (btcResp.ok) {
                const btcData = await btcResp.json();
                btcPrice = parseFloat(btcData.data.amount);
                success = true;
            }
            if (ethResp.ok) {
                const ethData = await ethResp.json();
                ethPrice = parseFloat(ethData.data.amount);
            }
        } catch (error) {
            console.error('Coinbase API error:', error);
        }
    }

    // Second fallback to Blockchain.info (BTC only)
    if (!success) {
        try {
            const response = await fetch('https://blockchain.info/ticker');
            if (response.ok) {
                const data = await response.json();
                if (data.USD && data.USD.last) {
                    btcPrice = data.USD.last;
                    success = true;
                }
            }
        } catch (error) {
            console.error('Blockchain.info API error:', error);
        }
    }
}

async function fetchStockPrices() {
    // Fetch stock prices from our server-side Yahoo Finance endpoint
    try {
        const response = await fetch('/api/stocks');
        if (response.ok) {
            const data = await response.json();
            // Merge into stockPrices object
            Object.assign(stockPrices, data);
            console.log('Stock prices updated:', Object.keys(stockPrices).length, 'tickers');
        } else {
            console.error('Stock API returned error:', response.status);
        }
    } catch (error) {
        console.error('Error fetching stock prices:', error);
    }
}

function getStockPrice(ticker) {
    return stockPrices[ticker] || { price: 0, marketCap: 0, change: 0 };
}

function updatePriceDisplay() {
    document.getElementById('btc-price').textContent = '$' + btcPrice.toLocaleString();
    document.getElementById('eth-price').textContent = '$' + ethPrice.toLocaleString();
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();

    // Calculate total market cap from Yahoo data
    let totalMcap = 0;
    STOCK_TICKERS.forEach(ticker => {
        const stock = getStockPrice(ticker);
        totalMcap += stock.marketCap || 0;
    });

    if (totalMcap > 0) {
        document.getElementById('total-mcap').textContent = '$' + formatNumber(totalMcap / 1e9, 1) + 'B';
    }
}

function updateHpcBaseCap() {
    document.getElementById('hpc-base-cap-display').textContent = factors.baseCapRate.toFixed(1) + '%';
}

// ============================================================
// DASHBOARD RENDERING
// ============================================================
function renderDashboard() {
    const tbody = document.querySelector('#dashboard-table tbody');
    tbody.innerHTML = '';

    let totalMcap = 0;
    let totalBtc = 0;
    let totalHpcContracted = 0;
    let totalHpcPipeline = 0;
    let totalMiningEv = 0;
    let totalFairValue = 0;

    const allProjects = [...ALL_PROJECTS, ...customProjects];

    // Calculate per-ticker metrics
    Object.keys(MINER_DATA).forEach(ticker => {
        const miner = MINER_DATA[ticker];
        const projects = allProjects.filter(p => p.ticker === ticker);

        let contractedMw = 0, pipelineMw = 0;
        let contractedEv = 0, pipelineEv = 0;
        let miningMw = 0;
        let miningEV = 0;  // Now calculated per-project

        projects.forEach(p => {
            const overrides = projectOverrides[p.id] || {};
            const valuation = calculateProjectValue(p, overrides);

            if (valuation.isBtcSite) {
                // BTC mining site - use mining valuation
                miningMw += p.it_mw || 0;
                miningEV += valuation.value;  // Includes mining value + conversion option
            } else {
                // HPC/AI site
                const isContracted = p.status === 'Operational' || p.status === 'Contracted';
                if (isContracted) {
                    contractedMw += p.it_mw || 0;
                    contractedEv += valuation.value;
                } else {
                    pipelineMw += p.it_mw || 0;
                    pipelineEv += valuation.value;
                }
            }
        });

        const hodlValue = miner.btc * btcPrice / 1e6;
        const totalEV = miningEV + contractedEv + pipelineEv;
        const equityValue = totalEV + hodlValue + miner.cash - miner.debt;
        const fairValue = equityValue / miner.fdShares;
        const hasHyperscaler = projects.some(p => isHyperscaler(p.lessee) && (p.status === 'Operational' || p.status === 'Contracted'));

        // Get stock price data from Yahoo Finance
        const stock = getStockPrice(ticker);
        const stockPrice = stock.price || 0;
        const marketCap = stock.marketCap || 0;
        const priceChange = stock.change || 0;
        const upside = stockPrice > 0 ? ((fairValue / stockPrice - 1) * 100) : 0;

        totalBtc += miner.btc;
        totalHpcContracted += contractedEv;
        totalHpcPipeline += pipelineEv;
        totalMiningEv += miningEV;
        totalFairValue += equityValue;
        totalMcap += marketCap;

        // Main row
        const tr = document.createElement('tr');
        tr.className = 'expandable-row';
        tr.dataset.ticker = ticker;
        tr.innerHTML = `
            <td class="text-left"><span class="expand-icon">&#9654;</span></td>
            <td class="col-ticker">
                <span class="ticker">${ticker}</span>
                ${hasHyperscaler ? '<span class="hyperscaler-badge">HPC</span>' : ''}
            </td>
            <td class="${priceChange >= 0 ? 'positive' : 'negative'}">$${stockPrice > 0 ? stockPrice.toFixed(2) : '--'}</td>
            <td class="has-tooltip" data-tooltip="Yahoo Finance market cap">${marketCap > 0 ? '$' + formatNumber(marketCap / 1e9, 2) + 'B' : '--'}</td>
            <td class="has-tooltip" data-tooltip="${miner.snippets.hodl}">
                <a href="${miner.sourceUrl}" class="source-link" target="_blank">${formatNumber(hodlValue, 1)}M</a>
            </td>
            <td class="has-tooltip" data-tooltip="${miner.snippets.cash}">
                <a href="${miner.sourceUrl}" class="source-link" target="_blank">${formatNumber(miner.cash, 1)}M</a>
            </td>
            <td class="has-tooltip" data-tooltip="${miner.snippets.debt}">
                <a href="${miner.sourceUrl}" class="source-link" target="_blank">${formatNumber(miner.debt, 1)}M</a>
            </td>
            <td class="has-tooltip" data-tooltip="${miner.snippets.shares}">
                <a href="${miner.sourceUrl}" class="source-link" target="_blank">${formatNumber(miner.fdShares, 0)}M</a>
            </td>
            <td>${miningMw.toLocaleString()}</td>
            <td>${(contractedMw + pipelineMw).toLocaleString()}</td>
            <td>${formatNumber(miningEV, 1)}M</td>
            <td class="positive">${formatNumber(contractedEv, 1)}M</td>
            <td class="neutral">${formatNumber(pipelineEv, 1)}M</td>
            <td class="positive">$${formatNumber(fairValue, 2)}</td>
            <td class="${upside >= 0 ? 'positive' : 'negative'}">${stockPrice > 0 ? (upside >= 0 ? '+' : '') + upside.toFixed(0) + '%' : '--'}</td>
        `;
        tbody.appendChild(tr);

        // Expanded row
        const expandedTr = document.createElement('tr');
        expandedTr.className = 'expanded-content';
        expandedTr.dataset.ticker = ticker;
        expandedTr.innerHTML = `
            <td colspan="15">
                <div class="project-summary">
                    ${projects.map(p => {
                        const overrides = projectOverrides[p.id] || {};
                        const val = calculateProjectValue(p, overrides);
                        const isContracted = p.status === 'Operational' || p.status === 'Contracted';
                        return `
                            <div class="project-item ${isContracted ? 'contracted' : 'pipeline'}">
                                <div class="project-name">${p.name}</div>
                                <div class="project-details">
                                    ${p.it_mw || 0} MW | ${p.current_use} | ${p.status}
                                    ${p.lessee ? ` | ${p.lessee}` : ''}
                                    | Value: $${formatNumber(val.value, 1)}M
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </td>
        `;
        tbody.appendChild(expandedTr);

        // Click to expand
        tr.addEventListener('click', () => {
            tr.classList.toggle('expanded');
            expandedTr.classList.toggle('show');
        });
    });

    // Update summary cards
    if (totalMcap > 0) {
        document.getElementById('total-mcap').textContent = '$' + formatNumber(totalMcap / 1e9, 1) + 'B';
    }
    document.getElementById('total-btc').textContent = totalBtc.toLocaleString();
    document.getElementById('total-btc-value').textContent = '$' + formatNumber(totalBtc * btcPrice / 1e6, 0) + 'M';
    document.getElementById('total-hpc-contracted').textContent = '$' + formatNumber(totalHpcContracted / 1000, 2) + 'B';
    document.getElementById('total-hpc-pipeline').textContent = '$' + formatNumber(totalHpcPipeline / 1000, 2) + 'B';
    document.getElementById('total-fair-value').textContent = '$' + formatNumber(totalFairValue / 1000, 2) + 'B';
}

// ============================================================
// PROJECTS TABLE RENDERING
// ============================================================
function renderProjectsTable() {
    const tbody = document.querySelector('#projects-table tbody');
    tbody.innerHTML = '';

    const tickerFilter = document.getElementById('project-ticker-filter').value;
    const statusFilter = document.getElementById('project-status-filter').value;
    const useFilter = document.getElementById('project-use-filter').value;
    const countryFilter = document.getElementById('project-country-filter').value;

    const allProjects = [...ALL_PROJECTS, ...customProjects];

    allProjects
        .filter(p => {
            if (tickerFilter && p.ticker !== tickerFilter) return false;
            if (statusFilter && p.status !== statusFilter) return false;
            if (useFilter && p.current_use !== useFilter) return false;
            if (countryFilter && p.country !== countryFilter) return false;
            return true;
        })
        .forEach(project => {
            const overrides = projectOverrides[project.id] || {};
            const valuation = calculateProjectValue(project, overrides);
            const hasOverrides = Object.keys(overrides).length > 0;
            const c = valuation.components;
            const isExpanded = expandedRows.has(project.id);

            const tr = document.createElement('tr');
            tr.className = `project-row expandable-row ${isExpanded ? 'expanded' : ''}`;
            tr.dataset.projectId = project.id;

            const location = project.state ? `${project.state}, ${project.country}` : project.country;

            // Different display for BTC vs HPC sites
            if (valuation.isBtcSite) {
                // BTC Mining Site
                const convYear = c.conversionYear || 'never';
                const convDisplay = convYear === 'never' ? 'Never' : convYear;

                tr.innerHTML = `
                    <td class="col-expand"><span class="expand-icon">${isExpanded ? '▼' : '▶'}</span></td>
                    <td class="col-ticker">
                        <span class="ticker">${project.ticker}</span>
                        ${hasOverrides ? '<span class="override-dot"></span>' : ''}
                    </td>
                    <td class="col-name">${project.name}</td>
                    <td class="col-location">${location}</td>
                    <td>${project.it_mw || 0}</td>
                    <td class="col-status">${project.current_use}</td>
                    <td class="col-status">
                        <span class="status-badge status-${project.status.toLowerCase()}">${project.status}</span>
                    </td>
                    <td class="col-tenant">${project.lessee || '-'}</td>
                    <td>${formatNumber(c.ebitda || 0, 1)}</td>
                    <td>${c.ebitdaMultiple?.toFixed(1) || 0}x</td>
                    <td>
                        <select class="hpc-conversion-select" data-project-id="${project.id}" onclick="event.stopPropagation();">
                            <option value="never" ${convYear === 'never' ? 'selected' : ''}>Never</option>
                            <option value="2025" ${convYear === '2025' ? 'selected' : ''}>2025</option>
                            <option value="2026" ${convYear === '2026' ? 'selected' : ''}>2026</option>
                            <option value="2027" ${convYear === '2027' ? 'selected' : ''}>2027</option>
                            <option value="2028" ${convYear === '2028' ? 'selected' : ''}>2028</option>
                            <option value="2029" ${convYear === '2029' ? 'selected' : ''}>2029</option>
                            <option value="2030" ${convYear === '2030' ? 'selected' : ''}>2030</option>
                            <option value="2031" ${convYear === '2031' ? 'selected' : ''}>2031</option>
                        </select>
                    </td>
                    <td>${formatNumber(c.fCountry || 1, 2)}</td>
                    <td class="fidoodle-cell ${hasOverrides && overrides.fidoodle ? 'has-override' : ''}" data-project-id="${project.id}">
                        <span class="fidoodle-value">${(c.fidoodle || factors.fidoodleDefault).toFixed(2)}</span>
                        <span class="fidoodle-edit-icon">✎</span>
                    </td>
                    <td class="positive">${formatNumber(valuation.value, 1)}</td>
                `;
            } else {
                // HPC/AI Site
                tr.innerHTML = `
                    <td class="col-expand"><span class="expand-icon">${isExpanded ? '▼' : '▶'}</span></td>
                    <td class="col-ticker">
                        <span class="ticker">${project.ticker}</span>
                        ${hasOverrides ? '<span class="override-dot"></span>' : ''}
                    </td>
                    <td class="col-name">${project.name}</td>
                    <td class="col-location">${location}</td>
                    <td>${project.it_mw || 0}</td>
                    <td class="col-status">${project.current_use}</td>
                    <td class="col-status">
                        <span class="status-badge status-${project.status.toLowerCase()}">${project.status}</span>
                    </td>
                    <td class="col-tenant">${project.lessee || '-'}</td>
                    <td>${formatNumber(c.noi || 0, 1)}</td>
                    <td>${((c.capEff || 0) * 100).toFixed(1)}%</td>
                    <td class="neutral">T=${(c.termFactor || 0).toFixed(2)}</td>
                    <td>${(c.combinedMult || 0).toFixed(3)}</td>
                    <td class="fidoodle-cell ${hasOverrides && overrides.fidoodle ? 'has-override' : ''}" data-project-id="${project.id}">
                        <span class="fidoodle-value">${(c.fidoodle || factors.fidoodleDefault).toFixed(2)}</span>
                        <span class="fidoodle-edit-icon">✎</span>
                    </td>
                    <td class="positive">${formatNumber(valuation.value, 1)}</td>
                `;
            }

            tbody.appendChild(tr);

            // Create expanded details row
            const expandedTr = document.createElement('tr');
            expandedTr.className = `expanded-content project-details-row ${isExpanded ? 'show' : ''}`;
            expandedTr.dataset.projectId = project.id;

            if (valuation.isBtcSite) {
                expandedTr.innerHTML = `
                    <td colspan="14">
                        <div class="valuation-details">
                            <div class="valuation-section">
                                <h4>BTC Mining Valuation</h4>
                                <div class="formula-display">
                                    <span class="formula-label">Mining Value =</span>
                                    <span class="formula-part">EBITDA/MW ($${(c.ebitdaPerMw || 0).toFixed(2)}M)</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">IT MW (${project.it_mw || 0})</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Multiple (${(c.ebitdaMultiple || 0).toFixed(1)}x)</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Country (${(c.fCountry || 1).toFixed(2)})</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Fidoodle (${(c.fidoodle || 1).toFixed(2)})</span>
                                    <span class="formula-result">= $${formatNumber(c.miningValue || 0, 1)}M</span>
                                </div>
                            </div>
                            ${c.conversionValue > 0 ? `
                            <div class="valuation-section">
                                <h4>HPC Conversion Option</h4>
                                <div class="formula-display">
                                    <span class="formula-label">Option Value =</span>
                                    <span class="formula-part">Potential HPC ($${formatNumber(c.potentialHpcValue || 0, 1)}M)</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Discount (${((c.conversionDiscount || 0) * 100).toFixed(0)}% for ${c.conversionYear})</span>
                                    <span class="formula-result">= $${formatNumber(c.conversionValue || 0, 1)}M</span>
                                </div>
                            </div>
                            ` : ''}
                            <div class="valuation-total">
                                <strong>Total Value: $${formatNumber(valuation.value, 1)}M</strong>
                                (Mining: $${formatNumber(c.miningValue || 0, 1)}M + Option: $${formatNumber(c.conversionValue || 0, 1)}M)
                            </div>
                            <button class="btn btn-small edit-project-btn" data-project-id="${project.id}">Edit All Overrides</button>
                        </div>
                    </td>
                `;
            } else {
                expandedTr.innerHTML = `
                    <td colspan="14">
                        <div class="valuation-details">
                            <div class="valuation-section">
                                <h4>HPC Lease Valuation</h4>
                                <div class="formula-display">
                                    <span class="formula-label">Value =</span>
                                    <span class="formula-part">NOI ($${formatNumber(c.noi || 0, 1)}M)</span>
                                    <span class="formula-op">÷</span>
                                    <span class="formula-part">Cap Rate (${((c.capEff || 0) * 100).toFixed(1)}%)</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Term Factor (${(c.termFactor || 0).toFixed(3)})</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Multipliers (${(c.combinedMult || 0).toFixed(3)})</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Fidoodle (${(c.fidoodle || 1).toFixed(2)})</span>
                                    <span class="formula-result">= $${formatNumber(valuation.value, 1)}M</span>
                                </div>
                            </div>
                            <div class="valuation-section multipliers-breakdown">
                                <h4>Multiplier Breakdown</h4>
                                <div class="multiplier-grid">
                                    <div class="mult-item"><span class="mult-label">Credit:</span> <span class="mult-value">${(c.fCredit || 1).toFixed(2)}</span></div>
                                    <div class="mult-item"><span class="mult-label">Lease:</span> <span class="mult-value">${(c.fLease || 1).toFixed(2)}</span></div>
                                    <div class="mult-item"><span class="mult-label">Ownership:</span> <span class="mult-value">${(c.fOwnership || 1).toFixed(2)}</span></div>
                                    <div class="mult-item"><span class="mult-label">Build:</span> <span class="mult-value">${(c.fBuild || 1).toFixed(2)}</span></div>
                                    <div class="mult-item"><span class="mult-label">Concentration:</span> <span class="mult-value">${(c.fConcentration || 1).toFixed(2)}</span></div>
                                    <div class="mult-item"><span class="mult-label">Size:</span> <span class="mult-value">${(c.fSize || 1).toFixed(2)}</span></div>
                                    <div class="mult-item"><span class="mult-label">Country:</span> <span class="mult-value">${(c.fCountry || 1).toFixed(2)}</span></div>
                                    <div class="mult-item"><span class="mult-label">Grid:</span> <span class="mult-value">${(c.fGrid || 1).toFixed(2)}</span></div>
                                </div>
                            </div>
                            <div class="valuation-total">
                                <strong>Total Value: $${formatNumber(valuation.value, 1)}M</strong>
                                ${project.source_url ? `<a href="${project.source_url}" target="_blank" class="source-link">View Source</a>` : ''}
                            </div>
                            <button class="btn btn-small edit-project-btn" data-project-id="${project.id}">Edit All Overrides</button>
                        </div>
                    </td>
                `;
            }

            tbody.appendChild(expandedTr);

            // Click handler for row expansion
            tr.addEventListener('click', (e) => {
                // Don't expand if clicking on special elements
                if (e.target.classList.contains('hpc-conversion-select') ||
                    e.target.classList.contains('fidoodle-edit-icon') ||
                    e.target.closest('.fidoodle-cell')) return;

                if (expandedRows.has(project.id)) {
                    expandedRows.delete(project.id);
                } else {
                    expandedRows.add(project.id);
                }
                renderProjectsTable();
            });
        });

    // Add event listeners for HPC conversion dropdowns
    document.querySelectorAll('.hpc-conversion-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const projectId = parseInt(e.target.dataset.projectId);
            const year = e.target.value;
            if (!projectOverrides[projectId]) {
                projectOverrides[projectId] = {};
            }
            projectOverrides[projectId].hpcConversionYear = year;
            saveData();
            renderProjectsTable();
            renderDashboard();
        });
    });

    // Add event listeners for fidoodle edit cells
    document.querySelectorAll('.fidoodle-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = parseInt(cell.dataset.projectId);
            openFidoodleEditor(projectId);
        });
    });

    // Add event listeners for edit buttons in expanded rows
    document.querySelectorAll('.edit-project-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = parseInt(btn.dataset.projectId);
            const project = allProjects.find(p => p.id === projectId);
            if (project) openProjectModal(project);
        });
    });
}

// Fidoodle editor popup
function openFidoodleEditor(projectId) {
    const allProjects = [...ALL_PROJECTS, ...customProjects];
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;

    const overrides = projectOverrides[projectId] || {};
    const currentFidoodle = overrides.fidoodle ?? factors.fidoodleDefault;

    // Create popup
    const popup = document.createElement('div');
    popup.className = 'fidoodle-popup';
    popup.innerHTML = `
        <div class="fidoodle-popup-content">
            <h4>Edit Fidoodle: ${project.name}</h4>
            <p class="fidoodle-desc">Adjustment factor for this project (default: ${factors.fidoodleDefault.toFixed(2)})</p>
            <div class="fidoodle-input-row">
                <input type="number" id="fidoodle-input" value="${currentFidoodle.toFixed(2)}" step="0.05" min="0" max="5">
                <button class="btn btn-small" id="fidoodle-save">Save</button>
                <button class="btn btn-small btn-secondary" id="fidoodle-reset">Reset</button>
                <button class="btn btn-small btn-secondary" id="fidoodle-cancel">Cancel</button>
            </div>
        </div>
    `;

    document.body.appendChild(popup);

    // Position near the cursor
    const rect = event.target.getBoundingClientRect();
    popup.style.top = `${rect.bottom + 5}px`;
    popup.style.left = `${rect.left}px`;

    // Event handlers
    document.getElementById('fidoodle-save').addEventListener('click', () => {
        const newValue = parseFloat(document.getElementById('fidoodle-input').value);
        if (!isNaN(newValue) && newValue >= 0) {
            if (!projectOverrides[projectId]) {
                projectOverrides[projectId] = {};
            }
            projectOverrides[projectId].fidoodle = newValue;
            saveData();
            renderProjectsTable();
            renderDashboard();
            renderHpcTable();
        }
        popup.remove();
    });

    document.getElementById('fidoodle-reset').addEventListener('click', () => {
        if (projectOverrides[projectId]) {
            delete projectOverrides[projectId].fidoodle;
            if (Object.keys(projectOverrides[projectId]).length === 0) {
                delete projectOverrides[projectId];
            }
            saveData();
            renderProjectsTable();
            renderDashboard();
            renderHpcTable();
        }
        popup.remove();
    });

    document.getElementById('fidoodle-cancel').addEventListener('click', () => {
        popup.remove();
    });

    // Close on click outside
    popup.addEventListener('click', (e) => {
        if (e.target === popup) popup.remove();
    });

    // Focus input
    document.getElementById('fidoodle-input').focus();
    document.getElementById('fidoodle-input').select();
}

// ============================================================
// HPC VAL TABLE RENDERING
// ============================================================
function renderHpcTable() {
    const tbody = document.querySelector('#hpc-table tbody');
    tbody.innerHTML = '';

    const tickerFilter = document.getElementById('hpc-ticker-filter').value;
    const allProjects = [...ALL_PROJECTS, ...customProjects];

    let totalProjects = 0;
    let contractedMw = 0, pipelineMw = 0;
    let contractedValue = 0, pipelineValue = 0;

    allProjects
        .filter(p => {
            if (p.current_use !== 'AI/HPC' && !isHyperscaler(p.lessee)) return false;
            if (tickerFilter && p.ticker !== tickerFilter) return false;
            return true;
        })
        .forEach(project => {
            const overrides = projectOverrides[project.id] || {};
            const valuation = calculateProjectValue(project, overrides);
            const c = valuation.components;

            totalProjects++;
            const isContracted = project.status === 'Operational' || project.status === 'Contracted';

            if (isContracted) {
                contractedMw += project.it_mw || 0;
                contractedValue += valuation.value;
            } else {
                pipelineMw += project.it_mw || 0;
                pipelineValue += valuation.value;
            }

            const tr = document.createElement('tr');
            tr.className = 'project-row';
            tr.dataset.projectId = project.id;

            tr.innerHTML = `
                <td class="col-ticker"><span class="ticker">${project.ticker}</span></td>
                <td class="col-name">${project.name}</td>
                <td class="col-tenant">${project.lessee || '-'}</td>
                <td>${project.it_mw || 0}</td>
                <td>${formatNumber(c.noi, 1)}</td>
                <td>${(c.capEff * 100).toFixed(1)}%</td>
                <td>${c.T}</td>
                <td>${c.termFactor.toFixed(3)}</td>
                <td class="col-status">
                    <span class="status-badge status-${project.status.toLowerCase()}">${project.status}</span>
                </td>
                <td class="has-tooltip" data-tooltip="F_credit: ${c.fCredit.toFixed(2)}
F_lease: ${c.fLease.toFixed(2)}
F_ownership: ${c.fOwnership.toFixed(2)}
F_build: ${c.fBuild.toFixed(2)}
F_concentration: ${c.fConcentration.toFixed(2)}
F_size: ${c.fSize.toFixed(2)}
F_country: ${c.fCountry.toFixed(2)}
F_grid: ${c.fGrid.toFixed(2)}
Fidoodle: ${c.fidoodle.toFixed(2)}">${c.combinedMult.toFixed(3)} x ${c.fidoodle.toFixed(2)}</td>
                <td class="positive">$${formatNumber(valuation.value, 1)}M</td>
                <td class="col-source">
                    ${project.source_url ? `<a href="${project.source_url}" class="source-link" target="_blank">Link</a>` : '-'}
                </td>
            `;

            tr.addEventListener('click', () => openProjectModal(project));
            tbody.appendChild(tr);
        });

    // Update summary cards
    document.getElementById('hpc-project-count').textContent = totalProjects;
    document.getElementById('hpc-contracted-mw').textContent = contractedMw.toLocaleString() + ' MW';
    document.getElementById('hpc-pipeline-mw').textContent = pipelineMw.toLocaleString() + ' MW';
    document.getElementById('hpc-contracted-value').textContent = '$' + formatNumber(contractedValue / 1000, 2) + 'B';
    document.getElementById('hpc-pipeline-value').textContent = '$' + formatNumber(pipelineValue / 1000, 2) + 'B';
}

// ============================================================
// PROJECT MODAL
// ============================================================
function openProjectModal(project) {
    const modal = document.getElementById('project-modal');
    const overrides = projectOverrides[project.id] || {};

    document.getElementById('project-modal-title').textContent = `Project Overrides: ${project.name}`;
    document.getElementById('project-id').value = project.id;
    document.getElementById('project-ticker').value = project.ticker;
    document.getElementById('project-name').value = project.name;
    document.getElementById('project-country').value = project.country;
    document.getElementById('project-grid').value = project.grid || '';
    document.getElementById('project-it-mw').value = overrides.itMw || project.it_mw || '';

    // NOI & Revenue
    document.getElementById('project-noi').value = overrides.noi || '';
    document.getElementById('project-rent-kw').value = overrides.rentKw || '';
    document.getElementById('project-passthrough').value = overrides.passthrough || 85;

    // Cap Rate Components
    document.getElementById('project-credit').value = overrides.credit || '';
    document.getElementById('project-lease-type').value = overrides.leaseType || '';
    document.getElementById('project-concentration').value = overrides.concentration || '';
    document.getElementById('project-ownership').value = overrides.ownership || '';
    document.getElementById('project-build-status').value = overrides.buildStatus || '';
    document.getElementById('project-cap-override').value = overrides.capOverride || '';

    // Term & Escalation
    document.getElementById('project-term').value = overrides.term || '';
    document.getElementById('project-escalator').value = overrides.escalator || '';
    document.getElementById('project-delay').value = overrides.delay || 0;

    // Multiplier Overrides
    document.getElementById('project-size-mult').value = overrides.sizeMult || '';
    document.getElementById('project-country-mult').value = overrides.countryMult || '';
    document.getElementById('project-grid-mult').value = overrides.gridMult || '';

    // Fidoodle
    const fidoodle = overrides.fidoodle ?? factors.fidoodleDefault;
    document.getElementById('project-fidoodle').value = fidoodle;
    document.getElementById('project-fidoodle-slider').value = fidoodle;
    document.getElementById('project-fidoodle-display').textContent = fidoodle.toFixed(2);

    updateValuationPreview();
    modal.classList.add('active');
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.remove('active');
}

function updateValuationPreview() {
    const projectId = parseInt(document.getElementById('project-id').value);
    const project = [...ALL_PROJECTS, ...customProjects].find(p => p.id === projectId);
    if (!project) return;

    const overrides = getOverridesFromForm();
    const valuation = calculateProjectValue(project, overrides);
    const c = valuation.components;

    document.getElementById('preview-noi').textContent = '$' + formatNumber(c.noi, 1) + 'M';
    document.getElementById('preview-cap').textContent = (c.capEff * 100).toFixed(1) + '%';
    document.getElementById('preview-term').textContent = c.termFactor.toFixed(3);
    document.getElementById('preview-mult').textContent = c.combinedMult.toFixed(3);
    document.getElementById('preview-fidoodle').textContent = c.fidoodle.toFixed(3);
    document.getElementById('preview-value').textContent = '$' + formatNumber(valuation.value, 1) + 'M';
}

function getOverridesFromForm() {
    return {
        itMw: parseFloatOrNull(document.getElementById('project-it-mw').value),
        noi: parseFloatOrNull(document.getElementById('project-noi').value),
        rentKw: parseFloatOrNull(document.getElementById('project-rent-kw').value),
        passthrough: parseFloatOrNull(document.getElementById('project-passthrough').value),
        credit: document.getElementById('project-credit').value || null,
        leaseType: document.getElementById('project-lease-type').value || null,
        concentration: document.getElementById('project-concentration').value || null,
        ownership: document.getElementById('project-ownership').value || null,
        buildStatus: document.getElementById('project-build-status').value || null,
        capOverride: parseFloatOrNull(document.getElementById('project-cap-override').value),
        term: parseFloatOrNull(document.getElementById('project-term').value),
        escalator: parseFloatOrNull(document.getElementById('project-escalator').value),
        delay: parseFloatOrNull(document.getElementById('project-delay').value),
        sizeMult: parseFloatOrNull(document.getElementById('project-size-mult').value),
        countryMult: parseFloatOrNull(document.getElementById('project-country-mult').value),
        gridMult: parseFloatOrNull(document.getElementById('project-grid-mult').value),
        fidoodle: parseFloatOrNull(document.getElementById('project-fidoodle').value)
    };
}

function parseFloatOrNull(val) {
    if (val === '' || val === null || val === undefined) return null;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
}

function saveProjectOverrides(e) {
    e.preventDefault();
    const projectId = parseInt(document.getElementById('project-id').value);
    const overrides = getOverridesFromForm();

    // Clean up null values
    const cleanOverrides = {};
    for (const key in overrides) {
        if (overrides[key] !== null) {
            cleanOverrides[key] = overrides[key];
        }
    }

    if (Object.keys(cleanOverrides).length > 0) {
        projectOverrides[projectId] = cleanOverrides;
    } else {
        delete projectOverrides[projectId];
    }

    saveData();
    closeProjectModal();
    renderAll();
}

function clearProjectOverrides() {
    const projectId = parseInt(document.getElementById('project-id').value);
    delete projectOverrides[projectId];
    saveData();
    closeProjectModal();
    renderAll();
}

// ============================================================
// FACTORS PAGE
// ============================================================
function loadFactorsToUI() {
    // Global parameters
    document.getElementById('factor-base-noi').value = factors.baseNoiPerMw;
    document.getElementById('factor-base-cap').value = factors.baseCapRate;
    document.getElementById('factor-hyperscaler-premium').value = factors.hyperscalerPremium;
    document.getElementById('factor-default-term').value = factors.defaultTerm;
    document.getElementById('factor-escalator').value = factors.escalator;
    document.getElementById('factor-pue').value = factors.pue;
    document.getElementById('factor-fidoodle-default').value = factors.fidoodleDefault;

    // BTC Mining
    document.getElementById('factor-btc-ebitda-mw').value = factors.btcMining.ebitdaPerMw;
    document.getElementById('factor-btc-multiple').value = factors.btcMining.ebitdaMultiple;

    // HPC Conversion
    document.getElementById('conv-2025').value = factors.hpcConversion['2025'];
    document.getElementById('conv-2026').value = factors.hpcConversion['2026'];
    document.getElementById('conv-2027').value = factors.hpcConversion['2027'];
    document.getElementById('conv-2028').value = factors.hpcConversion['2028'];
    document.getElementById('conv-2029').value = factors.hpcConversion['2029'];
    document.getElementById('conv-2030').value = factors.hpcConversion['2030'];
    document.getElementById('conv-2031').value = factors.hpcConversion['2031'];

    // Credit
    document.getElementById('credit-hyperscaler').value = factors.credit.hyperscaler;
    document.getElementById('credit-ig').value = factors.credit.ig;
    document.getElementById('credit-spec').value = factors.credit.spec;
    document.getElementById('credit-unrated').value = factors.credit.unrated;

    // Lease
    document.getElementById('lease-nnn').value = factors.lease.nnn;
    document.getElementById('lease-gross').value = factors.lease.gross;
    document.getElementById('lease-hosting').value = factors.lease.hosting;

    // Ownership
    document.getElementById('own-fee').value = factors.ownership.fee;
    document.getElementById('own-ground').value = factors.ownership.ground;
    document.getElementById('own-jv').value = factors.ownership.jv;
    document.getElementById('own-nopower').value = factors.ownership.nopower;

    // Build
    document.getElementById('build-operational').value = factors.build.operational;
    document.getElementById('build-contracted').value = factors.build.contracted;
    document.getElementById('build-development').value = factors.build.development;
    document.getElementById('build-pipeline').value = factors.build.pipeline;

    // Concentration
    document.getElementById('conc-multi').value = factors.concentration.multi;
    document.getElementById('conc-single-hyper').value = factors.concentration['single-hyper'];
    document.getElementById('conc-single-ig').value = factors.concentration['single-ig'];
    document.getElementById('conc-bespoke').value = factors.concentration.bespoke;

    // Size
    document.getElementById('size-500').value = factors.size[500];
    document.getElementById('size-250').value = factors.size[250];
    document.getElementById('size-100').value = factors.size[100];
    document.getElementById('size-50').value = factors.size[50];
    document.getElementById('size-0').value = factors.size[0];

    // Grid
    document.getElementById('grid-ercot').value = factors.grid.ERCOT;
    document.getElementById('grid-pjm').value = factors.grid.PJM;
    document.getElementById('grid-miso').value = factors.grid.MISO;
    document.getElementById('grid-nyiso').value = factors.grid.NYISO;
    document.getElementById('grid-spp').value = factors.grid.SPP;
    document.getElementById('grid-other-us').value = factors.grid['other-us'];
    document.getElementById('grid-canada').value = factors.grid.canada;
    document.getElementById('grid-intl').value = factors.grid.intl;
}

function saveAllFactors() {
    // Global parameters
    factors.baseNoiPerMw = parseFloat(document.getElementById('factor-base-noi').value);
    factors.baseCapRate = parseFloat(document.getElementById('factor-base-cap').value);
    factors.hyperscalerPremium = parseFloat(document.getElementById('factor-hyperscaler-premium').value);
    factors.defaultTerm = parseInt(document.getElementById('factor-default-term').value);
    factors.escalator = parseFloat(document.getElementById('factor-escalator').value);
    factors.pue = parseFloat(document.getElementById('factor-pue').value);
    factors.fidoodleDefault = parseFloat(document.getElementById('factor-fidoodle-default').value);

    // BTC Mining
    factors.btcMining.ebitdaPerMw = parseFloat(document.getElementById('factor-btc-ebitda-mw').value);
    factors.btcMining.ebitdaMultiple = parseFloat(document.getElementById('factor-btc-multiple').value);

    // HPC Conversion
    factors.hpcConversion['2025'] = parseFloat(document.getElementById('conv-2025').value);
    factors.hpcConversion['2026'] = parseFloat(document.getElementById('conv-2026').value);
    factors.hpcConversion['2027'] = parseFloat(document.getElementById('conv-2027').value);
    factors.hpcConversion['2028'] = parseFloat(document.getElementById('conv-2028').value);
    factors.hpcConversion['2029'] = parseFloat(document.getElementById('conv-2029').value);
    factors.hpcConversion['2030'] = parseFloat(document.getElementById('conv-2030').value);
    factors.hpcConversion['2031'] = parseFloat(document.getElementById('conv-2031').value);

    // Credit
    factors.credit.hyperscaler = parseFloat(document.getElementById('credit-hyperscaler').value);
    factors.credit.ig = parseFloat(document.getElementById('credit-ig').value);
    factors.credit.spec = parseFloat(document.getElementById('credit-spec').value);
    factors.credit.unrated = parseFloat(document.getElementById('credit-unrated').value);

    // Lease
    factors.lease.nnn = parseFloat(document.getElementById('lease-nnn').value);
    factors.lease.gross = parseFloat(document.getElementById('lease-gross').value);
    factors.lease.hosting = parseFloat(document.getElementById('lease-hosting').value);

    // Ownership
    factors.ownership.fee = parseFloat(document.getElementById('own-fee').value);
    factors.ownership.ground = parseFloat(document.getElementById('own-ground').value);
    factors.ownership.jv = parseFloat(document.getElementById('own-jv').value);
    factors.ownership.nopower = parseFloat(document.getElementById('own-nopower').value);

    // Build
    factors.build.operational = parseFloat(document.getElementById('build-operational').value);
    factors.build.contracted = parseFloat(document.getElementById('build-contracted').value);
    factors.build.development = parseFloat(document.getElementById('build-development').value);
    factors.build.pipeline = parseFloat(document.getElementById('build-pipeline').value);

    // Concentration
    factors.concentration.multi = parseFloat(document.getElementById('conc-multi').value);
    factors.concentration['single-hyper'] = parseFloat(document.getElementById('conc-single-hyper').value);
    factors.concentration['single-ig'] = parseFloat(document.getElementById('conc-single-ig').value);
    factors.concentration.bespoke = parseFloat(document.getElementById('conc-bespoke').value);

    // Size
    factors.size[500] = parseFloat(document.getElementById('size-500').value);
    factors.size[250] = parseFloat(document.getElementById('size-250').value);
    factors.size[100] = parseFloat(document.getElementById('size-100').value);
    factors.size[50] = parseFloat(document.getElementById('size-50').value);
    factors.size[0] = parseFloat(document.getElementById('size-0').value);

    // Grid
    factors.grid.ERCOT = parseFloat(document.getElementById('grid-ercot').value);
    factors.grid.PJM = parseFloat(document.getElementById('grid-pjm').value);
    factors.grid.MISO = parseFloat(document.getElementById('grid-miso').value);
    factors.grid.NYISO = parseFloat(document.getElementById('grid-nyiso').value);
    factors.grid.SPP = parseFloat(document.getElementById('grid-spp').value);
    factors.grid['other-us'] = parseFloat(document.getElementById('grid-other-us').value);
    factors.grid.canada = parseFloat(document.getElementById('grid-canada').value);
    factors.grid.intl = parseFloat(document.getElementById('grid-intl').value);

    // Save country factors
    saveCountryFactorsFromUI();

    saveData();
    renderAll();
    alert('Factors saved successfully!');
}

function resetAllFactors() {
    if (!confirm('Reset all factors to defaults? This cannot be undone.')) return;
    factors = JSON.parse(JSON.stringify(DEFAULT_FACTORS));
    loadFactorsToUI();
    renderCountryFactors();
    saveData();
    renderAll();
    alert('Factors reset to defaults.');
}

// ============================================================
// COUNTRY FACTORS
// ============================================================
function renderCountryFactors() {
    const container = document.getElementById('country-factors-container');
    container.innerHTML = '';

    for (const [country, factor] of Object.entries(factors.country)) {
        const div = document.createElement('div');
        div.className = 'factor-row';
        div.innerHTML = `
            <span class="factor-label">${country}</span>
            <div>
                <input type="number" class="factor-input country-factor-input" data-country="${country}" value="${factor}" step="0.1" min="0" max="2">
                <span class="factor-unit">x</span>
            </div>
        `;
        container.appendChild(div);
    }
}

function saveCountryFactorsFromUI() {
    const inputs = document.querySelectorAll('.country-factor-input');
    inputs.forEach(input => {
        const country = input.dataset.country;
        factors.country[country] = parseFloat(input.value);
    });
}

function addCountryFactor() {
    document.getElementById('country-modal').classList.add('active');
}

function closeCountryModal() {
    document.getElementById('country-modal').classList.remove('active');
}

function saveNewCountryFactor() {
    const name = document.getElementById('new-country-name').value.trim();
    const factor = parseFloat(document.getElementById('new-country-factor').value);

    if (!name) {
        alert('Please enter a country name');
        return;
    }

    factors.country[name] = factor;
    renderCountryFactors();
    closeCountryModal();
    saveData();

    document.getElementById('new-country-name').value = '';
    document.getElementById('new-country-factor').value = '1.0';
}

// ============================================================
// ADD PROJECT MODAL
// ============================================================
function openAddProjectModal() {
    const modal = document.getElementById('add-project-modal');
    const tickerSelect = document.getElementById('add-ticker');
    tickerSelect.innerHTML = Object.keys(MINER_DATA).map(t => `<option value="${t}">${t}</option>`).join('');
    modal.classList.add('active');
}

function closeAddProjectModal() {
    document.getElementById('add-project-modal').classList.remove('active');
}

function addNewProject(e) {
    e.preventDefault();

    const newId = Math.max(...ALL_PROJECTS.map(p => p.id), ...customProjects.map(p => p.id), 0) + 1;

    const project = {
        id: newId,
        ticker: document.getElementById('add-ticker').value,
        name: document.getElementById('add-name').value,
        country: document.getElementById('add-country').value,
        state: '',
        gross_mw: 0,
        it_mw: parseInt(document.getElementById('add-it-mw').value) || 0,
        grid: document.getElementById('add-grid').value,
        current_use: 'AI/HPC',
        status: document.getElementById('add-status').value,
        lessee: document.getElementById('add-tenant').value,
        lease_years: parseInt(document.getElementById('add-term').value) || 15,
        annual_rev: parseFloat(document.getElementById('add-noi').value) || 0,
        noi_pct: 85,
        source_url: document.getElementById('add-source').value,
        lat: null,
        lng: null
    };

    customProjects.push(project);
    saveData();
    closeAddProjectModal();
    renderAll();

    // Clear form
    document.getElementById('add-project-form').reset();
}

// ============================================================
// MAP
// ============================================================
function initMap() {
    map = L.map('map').setView([39.8283, -98.5795], 4);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO',
        maxZoom: 19
    }).addTo(map);

    populateMapFilters();
    updateMapMarkers();
}

function populateMapFilters() {
    const tickerFilter = document.getElementById('map-ticker-filter');
    const tickers = [...new Set(ALL_PROJECTS.map(p => p.ticker))].sort();
    tickers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tickerFilter.appendChild(opt);
    });
}

function updateMapMarkers() {
    if (!map) return;

    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const tickerFilter = document.getElementById('map-ticker-filter').value;
    const statusFilter = document.getElementById('map-status-filter').value;
    const minMw = parseInt(document.getElementById('map-mw-filter').value) || 0;

    const allProjects = [...ALL_PROJECTS, ...customProjects];

    allProjects
        .filter(p => p.lat && p.lng)
        .filter(p => {
            if (tickerFilter && p.ticker !== tickerFilter) return false;
            if (minMw && (p.it_mw || 0) < minMw) return false;
            if (statusFilter) {
                const isHpc = p.current_use === 'AI/HPC' || isHyperscaler(p.lessee);
                const isContracted = p.status === 'Operational' || p.status === 'Contracted';
                if (statusFilter === 'contracted' && !(isHpc && isContracted)) return false;
                if (statusFilter === 'pipeline' && !(isHpc && !isContracted)) return false;
                if (statusFilter === 'btc' && isHpc) return false;
            }
            return true;
        })
        .forEach(p => {
            const isHpc = p.current_use === 'AI/HPC' || isHyperscaler(p.lessee);
            const isContracted = p.status === 'Operational' || p.status === 'Contracted';

            let color = '#888';
            if (isHpc && isContracted) color = '#00ff00';
            else if (isHpc) color = '#ff8c00';
            else if (p.current_use === 'BTC') color = '#00bfff';

            const marker = L.circleMarker([p.lat, p.lng], {
                radius: Math.min(Math.max((p.it_mw || 50) / 30, 5), 20),
                fillColor: color,
                color: '#fff',
                weight: 1,
                opacity: 1,
                fillOpacity: 0.7
            });

            const overrides = projectOverrides[p.id] || {};
            const valuation = calculateProjectValue(p, overrides);

            marker.bindPopup(`
                <div>
                    <strong class="popup-ticker">${p.ticker}</strong>
                    <span class="status-badge status-${p.status.toLowerCase()}" style="margin-left: 8px;">${p.status}</span>
                    <br><strong>${p.name}</strong>
                    <br>${p.it_mw || 0} MW | ${p.current_use}
                    ${p.lessee ? `<br>Tenant: ${p.lessee}` : ''}
                    <br>Value: <strong style="color: #00ff00;">$${formatNumber(valuation.value, 1)}M</strong>
                </div>
            `);

            marker.addTo(map);
            markers.push(marker);
        });
}

function resetMapFilters() {
    document.getElementById('map-ticker-filter').value = '';
    document.getElementById('map-status-filter').value = '';
    document.getElementById('map-mw-filter').value = '0';
    updateMapMarkers();
}

// ============================================================
// FILTERS
// ============================================================
function populateFilters() {
    const allProjects = [...ALL_PROJECTS, ...customProjects];
    const tickers = [...new Set(allProjects.map(p => p.ticker))].sort();
    const countries = [...new Set(allProjects.map(p => p.country))].sort();

    // Project filters
    const tickerFilter = document.getElementById('project-ticker-filter');
    const countryFilter = document.getElementById('project-country-filter');
    const hpcTickerFilter = document.getElementById('hpc-ticker-filter');

    [tickerFilter, hpcTickerFilter].forEach(select => {
        const current = select.value;
        select.innerHTML = '<option value="">All</option>';
        tickers.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
        select.value = current;
    });

    countryFilter.innerHTML = '<option value="">All</option>';
    countries.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        countryFilter.appendChild(opt);
    });
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function formatNumber(num, decimals = 1) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function resetAllOverrides() {
    if (!confirm('Reset all project overrides? This cannot be undone.')) return;
    projectOverrides = {};
    saveData();
    renderAll();
    alert('All overrides cleared.');
}

// ============================================================
// EXPORT FUNCTIONS
// ============================================================
function exportDashboard() {
    let csv = 'Ticker,BTC Holdings,Cash ($M),Debt ($M),FD Shares (M),Mining MW,HPC MW Contracted,HPC MW Pipeline,Mining EV ($M),HPC EV Contracted ($M),HPC EV Pipeline ($M),Fair Value ($)\n';

    const allProjects = [...ALL_PROJECTS, ...customProjects];

    Object.keys(MINER_DATA).forEach(ticker => {
        const miner = MINER_DATA[ticker];
        const projects = allProjects.filter(p => p.ticker === ticker);

        let contractedMw = 0, pipelineMw = 0, contractedEv = 0, pipelineEv = 0, miningMw = 0;

        projects.forEach(p => {
            const overrides = projectOverrides[p.id] || {};
            const valuation = calculateProjectValue(p, overrides);
            const isHpc = p.current_use === 'AI/HPC' || isHyperscaler(p.lessee);

            if (isHpc && (p.status === 'Operational' || p.status === 'Contracted')) {
                contractedMw += p.it_mw || 0;
                contractedEv += valuation.value;
            } else if (isHpc) {
                pipelineMw += p.it_mw || 0;
                pipelineEv += valuation.value;
            } else {
                miningMw += p.it_mw || 0;
            }
        });

        const miningEV = miningMw * factors.baseNoiPerMw / (factors.baseCapRate / 100);
        const hodlValue = miner.btc * btcPrice / 1e6;
        const totalEV = miningEV + contractedEv + pipelineEv;
        const equityValue = totalEV + hodlValue + miner.cash - miner.debt;
        const fairValue = equityValue / miner.fdShares;

        csv += `${ticker},${miner.btc},${miner.cash},${miner.debt},${miner.fdShares},${miningMw},${contractedMw},${pipelineMw},${miningEV.toFixed(1)},${contractedEv.toFixed(1)},${pipelineEv.toFixed(1)},${fairValue.toFixed(2)}\n`;
    });

    downloadCsv(csv, 'dashboard_export.csv');
}

function exportProjects() {
    let csv = 'Ticker,Name,Country,Grid,IT MW,Use,Status,Tenant,NOI ($M),Cap Rate,Term Factor,Multipliers,Fidoodle,Value ($M)\n';

    const allProjects = [...ALL_PROJECTS, ...customProjects];

    allProjects.forEach(p => {
        const overrides = projectOverrides[p.id] || {};
        const val = calculateProjectValue(p, overrides);
        const c = val.components;

        csv += `"${p.ticker}","${p.name}","${p.country}","${p.grid || ''}",${p.it_mw || 0},"${p.current_use}","${p.status}","${p.lessee || ''}",${c.noi.toFixed(1)},${(c.capEff * 100).toFixed(1)}%,${c.termFactor.toFixed(3)},${c.combinedMult.toFixed(3)},${c.fidoodle.toFixed(2)},${val.value.toFixed(1)}\n`;
    });

    downloadCsv(csv, 'projects_export.csv');
}

function downloadCsv(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
}
