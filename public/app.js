// BTC Miner Valuation App v6 - Comprehensive Edition
// ============================================================

// Global state
let btcPrice = 89668;
let ethPrice = 2994;
let minerOverrides = {};
let projectFidoodles = {}; // Per-project fidoodle factors
let countryFactors = {};
let map = null;
let markers = [];

// ============================================================
// HYPERSCALER TENANTS (includes AMD per user request)
// ============================================================
const HYPERSCALER_TENANTS = [
    'CoreWeave', 'Microsoft', 'AWS', 'Google', 'Meta', 'Oracle',
    'Anthropic', 'AMD', 'Fluidstack/Google', 'Fluidstack/Anthropic'
];

function isHyperscaler(tenant) {
    if (!tenant) return false;
    return HYPERSCALER_TENANTS.some(h => tenant.toLowerCase().includes(h.toLowerCase()));
}

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
    { id: 1, ticker: 'APLD', name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 1', phase: 'Capacity Online', country: 'United States', state: 'ND', gross_mw: 130, it_mw: 100, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Operational', lessee: 'CoreWeave', lease_value: 2750, lease_years: 15, annual_rev: 183, noi_pct: 85, source_url: 'https://drive.google.com/file/d/1UhQsQqkob2KHu0I-jjosxlQqi854LSSD/view', lat: 46.002750, lng: -98.527046 },
    { id: 2, ticker: 'APLD', name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 2', phase: 'Power under construction', country: 'United States', state: 'ND', gross_mw: 195, it_mw: 150, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_value: 4125, lease_years: 15, annual_rev: 275, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142', lat: 46.002750, lng: -98.527046 },
    { id: 3, ticker: 'APLD', name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 3', phase: 'Power under construction', country: 'United States', state: 'ND', gross_mw: 195, it_mw: 150, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_value: 4125, lease_years: 15, annual_rev: 275, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142', lat: 46.002750, lng: -98.527046 },
    { id: 4, ticker: 'APLD', name: 'Harwood, ND (Polaris Forge 2) - Hyperscaler Bldg 1', phase: 'Power under construction', country: 'United States', state: 'ND', gross_mw: 130, it_mw: 100, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'IG Hyperscaler (TBA)', lease_value: 2500, lease_years: 15, annual_rev: 167, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases', lat: 46.979411, lng: -96.880638 },
    { id: 5, ticker: 'APLD', name: 'Harwood, ND (Polaris Forge 2) - Hyperscaler Bldg 2', phase: 'Power under construction', country: 'United States', state: 'ND', gross_mw: 130, it_mw: 100, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'IG Hyperscaler (TBA)', lease_value: 2500, lease_years: 15, annual_rev: 167, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases', lat: 46.979411, lng: -96.880638 },
    { id: 6, ticker: 'APLD', name: 'Harwood, ND (Polaris Forge 2) - ROFR Expansion', phase: 'Pipeline', country: 'United States', state: 'ND', gross_mw: 1040, it_mw: 800, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'US Hyperscaler (IG)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 85, source_url: 'https://ir.applieddigital.com/news-events/press-releases', lat: 46.979411, lng: -96.880638 },
    { id: 7, ticker: 'APLD', name: '3 NEW sites - Advanced Discussions', phase: 'Pipeline', country: 'United States', state: '', gross_mw: 1170, it_mw: 900, pue: 1.3, grid: '', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'IG Hyperscaler (TBD)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 85, source_url: '', lat: null, lng: null },
    { id: 8, ticker: 'APLD', name: 'Jamestown, ND - BTC Mining (legacy)', phase: 'Operational', country: 'United States', state: 'ND', gross_mw: 106, it_mw: 82, pue: 1.3, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://ir.applieddigital.com/news-events/press-releases', lat: 46.910556, lng: -98.708056 },
    { id: 9, ticker: 'APLD', name: 'Ellendale, ND - BTC Hosting (legacy)', phase: 'Operational', country: 'United States', state: 'ND', gross_mw: 207, it_mw: 159, pue: 1.3, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: 'Self/hosting', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://ir.applieddigital.com/news-events/press-releases', lat: 46.002750, lng: -98.527046 },

    // BITF Projects
    { id: 10, ticker: 'BITF', name: 'Scrubgrass Plant, PA (Stronghold)', phase: 'Operational', country: 'United States', state: 'PA', gross_mw: 85, it_mw: 65, pue: 1.3, grid: 'PJM', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001858293', lat: 41.211870, lng: -79.779720 },
    { id: 11, ticker: 'BITF', name: 'Panther Creek, PA (HPC/AI campus)', phase: 'Development', country: 'United States', state: 'PA', gross_mw: 307, it_mw: 275, pue: 1.12, grid: 'PJM', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001858293', lat: 40.631480, lng: -76.192722 },
    { id: 12, ticker: 'BITF', name: 'Quebec portfolio (6 sites)', phase: 'Operational', country: 'Canada', state: 'QC', gross_mw: 70, it_mw: 54, pue: 1.3, grid: 'HQ', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001858293', lat: 53.000000, lng: -70.000000 },
    { id: 13, ticker: 'BITF', name: 'Sharon, PA', phase: 'Operational', country: 'United States', state: 'PA', gross_mw: 25, it_mw: 19, pue: 1.3, grid: 'PJM', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 41.233112, lng: -80.493403 },
    { id: 14, ticker: 'BITF', name: 'Baie-Comeau, Quebec', phase: 'Operational', country: 'Canada', state: 'QC', gross_mw: 34, it_mw: 26, pue: 1.3, grid: 'HQ', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 49.221242, lng: -68.150162 },
    { id: 15, ticker: 'BITF', name: 'Washington State (Stronghold)', phase: 'Operational', country: 'United States', state: 'WA', gross_mw: 10, it_mw: 8, pue: 1.3, grid: 'BPA', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 47.391700, lng: -121.570800 },

    // BTDR Projects
    { id: 16, ticker: 'BTDR', name: 'Clarington, OH - 570MW', phase: 'Operational', country: 'United States', state: 'OH', gross_mw: 570, it_mw: 456, pue: 1.25, grid: 'PJM', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001936702', lat: 39.765631, lng: -80.871206 },
    { id: 17, ticker: 'BTDR', name: 'Rockdale, TX', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 623, it_mw: 498, pue: 1.25, grid: 'ERCOT', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 30.655628, lng: -97.001389 },
    { id: 18, ticker: 'BTDR', name: 'Jigmeling, Bhutan - 500MW', phase: 'Operational', country: 'Bhutan', state: '', gross_mw: 500, it_mw: 442, pue: 1.13, grid: 'BTN', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 26.912150, lng: 90.390260 },
    { id: 19, ticker: 'BTDR', name: 'Niles, OH - 300MW', phase: 'Operational', country: 'United States', state: 'OH', gross_mw: 300, it_mw: 240, pue: 1.25, grid: 'PJM', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 41.182778, lng: -80.765556 },
    { id: 20, ticker: 'BTDR', name: 'Tydal, Norway - 50MW', phase: 'Operational', country: 'Norway', state: '', gross_mw: 50, it_mw: 44, pue: 1.13, grid: 'NOR', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 63.044800, lng: 11.650400 },
    { id: 21, ticker: 'BTDR', name: 'Tydal, Norway - 175MW', phase: 'Operational', country: 'Norway', state: '', gross_mw: 175, it_mw: 155, pue: 1.13, grid: 'NOR', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 63.044800, lng: 11.650400 },
    { id: 22, ticker: 'BTDR', name: 'Fox Creek, Alberta - 101MW', phase: 'Operational', country: 'Canada', state: 'AB', gross_mw: 101, it_mw: 89, pue: 1.13, grid: 'AESO', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 54.402168, lng: -116.808907 },
    { id: 23, ticker: 'BTDR', name: 'Gedu, Bhutan', phase: 'Operational', country: 'Bhutan', state: '', gross_mw: 100, it_mw: 88, pue: 1.13, grid: 'BTN', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 26.922624, lng: 89.523811 },
    { id: 24, ticker: 'BTDR', name: 'Molde, Norway', phase: 'Operational', country: 'Norway', state: '', gross_mw: 84, it_mw: 74, pue: 1.13, grid: 'NOR', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 62.733333, lng: 7.183333 },
    { id: 25, ticker: 'BTDR', name: 'Knoxville, TN', phase: 'Operational', country: 'United States', state: 'TN', gross_mw: 95, it_mw: 76, pue: 1.25, grid: 'TVA', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.960100, lng: -83.920557 },
    { id: 26, ticker: 'BTDR', name: 'Ethiopia - Phase 1', phase: 'Operational', country: 'Ethiopia', state: '', gross_mw: 40, it_mw: 35, pue: 1.13, grid: 'ETH', current_use: 'Mixed', status: 'Operational', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 8.000000, lng: 39.000000 },
    { id: 27, ticker: 'BTDR', name: 'Ethiopia - Phase 2', phase: 'Development', country: 'Ethiopia', state: '', gross_mw: 10, it_mw: 9, pue: 1.13, grid: 'ETH', current_use: 'Mixed', status: 'Development', lessee: 'Self/mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 8.000000, lng: 39.000000 },

    // CIFR Projects
    { id: 28, ticker: 'CIFR', name: 'AWS AI Hosting Contract', phase: 'Contracted', country: 'United States', state: '', gross_mw: 278, it_mw: 214, pue: 1.3, grid: '', current_use: 'AI/HPC', status: 'Contracted', lessee: 'AWS', lease_value: 5500, lease_years: 15, annual_rev: 367, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989', lat: null, lng: null },
    { id: 29, ticker: 'CIFR', name: 'Barber Lake (TX) - Fluidstack/Google', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 218, it_mw: 168, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack/Google', lease_value: 3000, lease_years: 10, annual_rev: 300, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989', lat: 32.420474, lng: -100.913205 },
    { id: 30, ticker: 'CIFR', name: 'Barber Lake Fluidstack Additional Site', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 51, it_mw: 39, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack', lease_value: 830, lease_years: 10, annual_rev: 83, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989', lat: 32.420474, lng: -100.913205 },
    { id: 31, ticker: 'CIFR', name: 'Colchis (West TX) - 1 GW JV', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 1000, it_mw: 800, pue: 1.25, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: 'TBD (future HPC)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.106000, lng: -97.647500 },
    { id: 32, ticker: 'CIFR', name: 'McLennan (Riesel, TX)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 75, it_mw: 58, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.474892, lng: -96.923326 },
    { id: 33, ticker: 'CIFR', name: 'Mikeska (Doole, TX)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 13, it_mw: 10, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.395717, lng: -99.598953 },
    { id: 34, ticker: 'CIFR', name: 'Odessa (TX)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 103, it_mw: 79, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.845556, lng: -102.367222 },
    { id: 35, ticker: 'CIFR', name: 'Bear (Andrews, TX) - JV', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 45, it_mw: 35, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'JV (~49% Cipher)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.318611, lng: -102.545278 },
    { id: 36, ticker: 'CIFR', name: 'Chief (Andrews, TX) - JV', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 45, it_mw: 35, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'JV (~49% Cipher)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.318611, lng: -102.545278 },

    // CLSK Projects
    { id: 37, ticker: 'CLSK', name: 'Georgia portfolio (12 locations)', phase: 'Operational', country: 'United States', state: 'GA', gross_mw: 300, it_mw: 231, pue: 1.3, grid: 'SERC', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001844701', lat: 32.986600, lng: -83.648700 },
    { id: 38, ticker: 'CLSK', name: 'Houston/Austin County, TX - AI DC', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 200, it_mw: 154, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 29.950181, lng: -96.256976 },
    { id: 39, ticker: 'CLSK', name: 'Tennessee portfolio (13 locations)', phase: 'Operational', country: 'United States', state: 'TN', gross_mw: 250, it_mw: 192, pue: 1.3, grid: 'TVA', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.744900, lng: -86.748900 },
    { id: 40, ticker: 'CLSK', name: 'Wyoming portfolio (2 locations)', phase: 'Operational', country: 'United States', state: 'WY', gross_mw: 90, it_mw: 69, pue: 1.3, grid: 'WECC', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 42.747500, lng: -107.208500 },
    { id: 41, ticker: 'CLSK', name: 'Mississippi portfolio (5 locations)', phase: 'Operational', country: 'United States', state: 'MS', gross_mw: 150, it_mw: 115, pue: 1.3, grid: 'SERC', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.767300, lng: -89.681200 },

    // CORZ Projects
    { id: 42, ticker: 'CORZ', name: 'CoreWeave - Denton TX (full site)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 338, it_mw: 260, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Operational', lessee: 'CoreWeave', lease_value: 3835, lease_years: 12, annual_rev: 320, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630', lat: 33.215536, lng: -97.132481 },
    { id: 43, ticker: 'CORZ', name: 'CoreWeave - 5 other sites combined', phase: 'Contracted', country: 'United States', state: '', gross_mw: 429, it_mw: 330, pue: 1.3, grid: '', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_value: 4865, lease_years: 12, annual_rev: 405, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630', lat: null, lng: null },
    { id: 44, ticker: 'CORZ', name: 'Cottonwood / Pecos, TX', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, pue: 1.3, grid: 'ERCOT', current_use: 'Mixed', status: 'Operational', lessee: 'Mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.422962, lng: -103.492988 },
    { id: 45, ticker: 'CORZ', name: 'Dalton, GA campus', phase: 'Operational', country: 'United States', state: 'GA', gross_mw: 104, it_mw: 80, pue: 1.3, grid: 'SERC', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 34.769861, lng: -84.969160 },
    { id: 46, ticker: 'CORZ', name: 'Marble, NC - HPC conversion', phase: 'Pipeline', country: 'United States', state: 'NC', gross_mw: 135, it_mw: 104, pue: 1.3, grid: 'SERC', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'CoreWeave', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.174265, lng: -83.926521 },
    { id: 47, ticker: 'CORZ', name: 'Calvert City, KY', phase: 'Operational', country: 'United States', state: 'KY', gross_mw: 130, it_mw: 100, pue: 1.3, grid: 'TVA', current_use: 'Mixed', status: 'Operational', lessee: 'Mixed', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 37.033123, lng: -88.350280 },
    { id: 48, ticker: 'CORZ', name: 'Muskogee, OK - CoreWeave', phase: 'Pipeline', country: 'United States', state: 'OK', gross_mw: 91, it_mw: 70, pue: 1.3, grid: 'SPP', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'CoreWeave', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.747868, lng: -95.369414 },
    { id: 49, ticker: 'CORZ', name: 'Grand Forks, ND', phase: 'Operational', country: 'United States', state: 'ND', gross_mw: 52, it_mw: 40, pue: 1.3, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 47.925136, lng: -97.032699 },
    { id: 50, ticker: 'CORZ', name: 'Austin, TX - CoreWeave', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 21, it_mw: 16, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Operational', lessee: 'CoreWeave', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 30.267118, lng: -97.743130 },

    // GLXY Projects
    { id: 51, ticker: 'GLXY', name: 'Helios, TX - CoreWeave Phase I', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_value: 5714, lease_years: 15, annual_rev: 381, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001886894', lat: 33.781408, lng: -100.879051 },
    { id: 52, ticker: 'GLXY', name: 'Helios, TX - CoreWeave Phase II', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_value: 5714, lease_years: 15, annual_rev: 381, noi_pct: 85, source_url: '', lat: 33.781408, lng: -100.879051 },
    { id: 53, ticker: 'GLXY', name: 'Helios, TX - CoreWeave Phase III', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 164, it_mw: 126, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'CoreWeave', lease_value: 3572, lease_years: 15, annual_rev: 238, noi_pct: 85, source_url: '', lat: 33.781408, lng: -100.879051 },
    { id: 54, ticker: 'GLXY', name: 'Helios, TX - Expansion', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 250, it_mw: 192, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 33.781408, lng: -100.879051 },

    // HUT Projects
    { id: 55, ticker: 'HUT', name: 'River Bend (LA) - Fluidstack/Anthropic lease', phase: 'Contracted', country: 'United States', state: 'LA', gross_mw: 319, it_mw: 245, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack/Anthropic', lease_value: 7000, lease_years: 15, annual_rev: 467, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001964789', lat: 30.757000, lng: -91.332700 },
    { id: 56, ticker: 'HUT', name: 'River Bend (LA) - ROFO expansion', phase: 'Pipeline', country: 'United States', state: 'LA', gross_mw: 1300, it_mw: 1000, pue: 1.3, grid: 'MISO', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Fluidstack', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 30.757000, lng: -91.332700 },
    { id: 57, ticker: 'HUT', name: 'Anthropic partnership - other sites option', phase: 'Pipeline', country: 'United States', state: '', gross_mw: 1092, it_mw: 840, pue: 1.3, grid: '', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Anthropic', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: null, lng: null },
    { id: 58, ticker: 'HUT', name: 'Ontario power gen sites (4)', phase: 'Operational', country: 'Canada', state: 'ON', gross_mw: 210, it_mw: 162, pue: 1.3, grid: 'IESO', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 50.000000, lng: -85.000000 },
    { id: 59, ticker: 'HUT', name: 'King Mountain, TX (JV)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 310, it_mw: 248, pue: 1.25, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'JV', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.284588, lng: -102.274029 },
    { id: 60, ticker: 'HUT', name: 'Vega, TX', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 100, it_mw: 80, pue: 1.25, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.243034, lng: -102.428431 },
    { id: 61, ticker: 'HUT', name: 'Medicine Hat, AB', phase: 'Operational', country: 'Canada', state: 'AB', gross_mw: 101, it_mw: 78, pue: 1.3, grid: 'AESO', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 50.041668, lng: -110.677498 },

    // IREN Projects
    { id: 62, ticker: 'IREN', name: 'Childress (TX) - Microsoft Horizon 1-4', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 260, it_mw: 200, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Microsoft', lease_value: 9700, lease_years: 5, annual_rev: 1940, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001878848', lat: 34.426427, lng: -100.204444 },
    { id: 63, ticker: 'IREN', name: 'Childress (TX) - Full 750MW', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 975, it_mw: 750, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 34.426427, lng: -100.204444 },
    { id: 64, ticker: 'IREN', name: 'Sweetwater 1 (TX)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 100, it_mw: 77, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.471109, lng: -100.406268 },
    { id: 65, ticker: 'IREN', name: 'Sweetwater 2 (TX)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 100, it_mw: 77, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.471109, lng: -100.406268 },
    { id: 66, ticker: 'IREN', name: 'Mackenzie (BC)', phase: 'Operational', country: 'Canada', state: 'BC', gross_mw: 64, it_mw: 49, pue: 1.3, grid: 'BC Hydro', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 55.336167, lng: -123.090000 },
    { id: 67, ticker: 'IREN', name: 'Prince George (BC)', phase: 'Operational', country: 'Canada', state: 'BC', gross_mw: 64, it_mw: 49, pue: 1.3, grid: 'BC Hydro', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 53.916943, lng: -122.749443 },
    { id: 68, ticker: 'IREN', name: 'Canal Flats (BC)', phase: 'Operational', country: 'Canada', state: 'BC', gross_mw: 51, it_mw: 39, pue: 1.3, grid: 'BC Hydro', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 50.150000, lng: -115.833331 },

    // MARA Projects
    { id: 69, ticker: 'MARA', name: 'MPLX Delaware Basin (LOI - up to 1.5GW)', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 1500, it_mw: 1200, pue: 1.25, grid: 'ERCOT', current_use: 'Mixed', status: 'Development', lessee: 'Self/TBD', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001507605', lat: 31.422962, lng: -103.492988 },
    { id: 70, ticker: 'MARA', name: 'UAE operations (Zero Two JV)', phase: 'Operational', country: 'UAE', state: '', gross_mw: 250, it_mw: 221, pue: 1.13, grid: 'UAE', current_use: 'BTC', status: 'Operational', lessee: 'JV', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: null, lng: null },
    { id: 71, ticker: 'MARA', name: 'Granbury, TX', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 230, it_mw: 184, pue: 1.25, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.448431, lng: -97.787659 },
    { id: 72, ticker: 'MARA', name: 'McCamey, TX (hosted)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 239, it_mw: 191, pue: 1.25, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: 'Hosted', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.132376, lng: -102.222910 },
    { id: 73, ticker: 'MARA', name: 'Ellendale, ND (hosted)', phase: 'Operational', country: 'United States', state: 'ND', gross_mw: 207, it_mw: 159, pue: 1.3, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: 'Hosted', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 46.002750, lng: -98.527046 },
    { id: 74, ticker: 'MARA', name: 'Garden City, TX', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 182, it_mw: 146, pue: 1.25, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.864022, lng: -101.481231 },
    { id: 75, ticker: 'MARA', name: 'Jamestown, ND (hosted)', phase: 'Operational', country: 'United States', state: 'ND', gross_mw: 106, it_mw: 82, pue: 1.3, grid: 'MISO', current_use: 'BTC', status: 'Operational', lessee: 'Hosted', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 46.910556, lng: -98.708056 },
    { id: 76, ticker: 'MARA', name: 'Kearney, NE', phase: 'Operational', country: 'United States', state: 'NE', gross_mw: 64, it_mw: 51, pue: 1.25, grid: 'SPP', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 40.699331, lng: -99.081636 },

    // WULF Projects
    { id: 77, ticker: 'WULF', name: 'Lake Mariner (NY) - Fluidstack/Google (CB-1 to CB-5)', phase: 'Contracted', country: 'United States', state: 'NY', gross_mw: 476, it_mw: 366, pue: 1.3, grid: 'NYISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack/Google', lease_value: 6700, lease_years: 10, annual_rev: 670, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001916076', lat: 43.359730, lng: -78.605270 },
    { id: 78, ticker: 'WULF', name: 'Lake Mariner (NY) - Core42/G42', phase: 'Contracted', country: 'United States', state: 'NY', gross_mw: 78, it_mw: 60, pue: 1.3, grid: 'NYISO', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Core42 (G42)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 43.359730, lng: -78.605270 },
    { id: 79, ticker: 'WULF', name: 'Abernathy, TX - Fluidstack/Google JV', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 112, it_mw: 86, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Fluidstack (51% JV)', lease_value: 4800, lease_years: 25, annual_rev: 192, noi_pct: 85, source_url: '', lat: 33.832304, lng: -101.842949 },
    { id: 80, ticker: 'WULF', name: 'Fluidstack JV Option - Abernathy Phase II', phase: 'Pipeline', country: 'United States', state: 'TX', gross_mw: 218, it_mw: 168, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Fluidstack', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 33.832304, lng: -101.842949 },
    { id: 81, ticker: 'WULF', name: 'Fluidstack JV Option - New Site TBD', phase: 'Pipeline', country: 'United States', state: '', gross_mw: 218, it_mw: 168, pue: 1.3, grid: '', current_use: 'AI/HPC', status: 'Pipeline', lessee: 'Fluidstack', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: null, lng: null },
    { id: 82, ticker: 'WULF', name: 'Lake Mariner (NY) - BTC Mining', phase: 'Operational', country: 'United States', state: 'NY', gross_mw: 200, it_mw: 154, pue: 1.3, grid: 'NYISO', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 43.359730, lng: -78.605270 },

    // RIOT Projects
    { id: 83, ticker: 'RIOT', name: 'Rockdale, TX (Whinstone) - BTC', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 750, it_mw: 600, pue: 1.25, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001167419', lat: 30.655628, lng: -97.001389 },
    { id: 84, ticker: 'RIOT', name: 'Rockdale, TX (Whinstone) - AMD', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 33, it_mw: 25, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Operational', lessee: 'AMD', lease_value: 311, lease_years: 10, annual_rev: 31, noi_pct: 85, source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001167419', lat: 30.655628, lng: -97.001389 },
    { id: 85, ticker: 'RIOT', name: 'Corsicana, TX - Phase 1', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 400, it_mw: 320, pue: 1.25, grid: 'ERCOT', current_use: 'BTC', status: 'Development', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.095564, lng: -96.469432 },
    { id: 86, ticker: 'RIOT', name: 'Corsicana, TX - Full Build', phase: 'Pipeline', country: 'United States', state: 'TX', gross_mw: 600, it_mw: 462, pue: 1.3, grid: 'ERCOT', current_use: 'Mixed', status: 'Pipeline', lessee: 'TBD (Evaluation)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 32.095564, lng: -96.469432 },

    // SLNH Projects
    { id: 87, ticker: 'SLNH', name: 'Project Dorothy 1A (TX)', phase: 'Operational', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.106000, lng: -97.647500 },
    { id: 88, ticker: 'SLNH', name: 'Project Dorothy 1B (TX)', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, pue: 1.3, grid: 'ERCOT', current_use: 'BTC', status: 'Development', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.106000, lng: -97.647500 },
    { id: 89, ticker: 'SLNH', name: 'Project Kati 1 (TX)', phase: 'Contracted', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Contracted', lessee: 'Galaxy Digital (48MW)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.106000, lng: -97.647500 },
    { id: 90, ticker: 'SLNH', name: 'Project Kati 2 (TX)', phase: 'Development', country: 'United States', state: 'TX', gross_mw: 83, it_mw: 64, pue: 1.3, grid: 'ERCOT', current_use: 'AI/HPC', status: 'Development', lessee: 'TBD (AI/HPC)', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 31.106000, lng: -97.647500 },

    // HIVE Projects
    { id: 91, ticker: 'HIVE', name: 'Yguazu, Paraguay (ex-Bitfarms)', phase: 'Operational', country: 'Paraguay', state: '', gross_mw: 100, it_mw: 77, pue: 1.3, grid: 'ANDE', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: -25.450000, lng: -55.000000 },

    // FUFU Projects
    { id: 92, ticker: 'FUFU', name: 'Global hosting capacity', phase: 'Operational', country: 'Multiple', state: '', gross_mw: 635, it_mw: 488, pue: 1.3, grid: '', current_use: 'BTC', status: 'Operational', lessee: 'Self/hosting', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: null, lng: null },
    { id: 93, ticker: 'FUFU', name: 'Oklahoma - 51MW', phase: 'Operational', country: 'United States', state: 'OK', gross_mw: 66, it_mw: 51, pue: 1.3, grid: 'SPP', current_use: 'BTC', status: 'Operational', lessee: '', lease_value: 0, lease_years: 0, annual_rev: 0, noi_pct: 0, source_url: '', lat: 35.537600, lng: -96.924700 }
];

// ============================================================
// DEFAULT COUNTRY FACTORS
// ============================================================
const DEFAULT_COUNTRY_FACTORS = {
    'United States': 1.0,
    'USA': 1.0,
    'Canada': 0.9,
    'Norway': 0.85,
    'Paraguay': 0.7,
    'Bhutan': 0.5,
    'Ethiopia': 0.0,
    'UAE': 0.8,
    'Multiple': 0.8,
    'US / Canada': 0.95,
    'US/Canada': 0.95
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadData();
    fetchPrices();
    setInterval(fetchPrices, 60000);
});

function initializeTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');

            // Handle map tab special case
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

// ============================================================
// DATA LOADING & SAVING
// ============================================================
async function loadData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        minerOverrides = data.minerOverrides || {};
        projectFidoodles = data.projectFidoodles || {};
        countryFactors = data.countryFactors || { ...DEFAULT_COUNTRY_FACTORS };
    } catch (error) {
        console.error('Error loading data:', error);
        countryFactors = { ...DEFAULT_COUNTRY_FACTORS };
    }

    renderAll();
}

async function saveData() {
    try {
        await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                minerOverrides,
                projectFidoodles,
                countryFactors
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
}

// ============================================================
// PRICE FETCHING
// ============================================================
async function fetchPrices() {
    try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
        const data = await response.json();
        btcPrice = data.bitcoin.usd;
        ethPrice = data.ethereum.usd;
    } catch (error) {
        console.error('Error fetching prices:', error);
    }
    updatePriceDisplay();
    renderDashboard();
}

function updatePriceDisplay() {
    document.getElementById('btc-price').textContent = '$' + btcPrice.toLocaleString();
    document.getElementById('eth-price').textContent = '$' + ethPrice.toLocaleString();
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
}

// ============================================================
// VALUATION HELPERS
// ============================================================
function getCountryFactor(country) {
    if (!country) return 1.0;
    // Normalize country name
    const normalized = country.trim();
    return countryFactors[normalized] ?? 1.0;
}

function getSizeFactor(mw) {
    if (mw >= 500) return 1.10;
    if (mw >= 250) return 1.00;
    if (mw >= 100) return 0.95;
    return 0.85;
}

function getProjectValue(project) {
    const countryFactor = getCountryFactor(project.country);
    const sizeFactor = getSizeFactor(project.it_mw || 0);
    const fidoodle = projectFidoodles[project.id] ?? 1.0;

    // Base value calculation
    let baseValue = (project.it_mw || 0) * 1.4 / 0.12; // NOI/MW / cap rate

    // Apply factors
    return baseValue * countryFactor * sizeFactor * fidoodle;
}

function calculateHpcDcfValue(project) {
    if (!project.annual_rev || project.annual_rev === 0) {
        if (project.it_mw && project.it_mw > 0 && isHyperscaler(project.lessee)) {
            const estimatedRev = project.it_mw * 1.5;
            const noi = estimatedRev * 0.85;
            const capRate = 0.10; // Hyperscaler rate
            return noi / capRate * getCountryFactor(project.country);
        }
        return 0;
    }

    const annualNoi = project.annual_rev * (project.noi_pct || 85) / 100;
    let capRate = 0.12;

    // Credit quality adjustments
    if (isHyperscaler(project.lessee)) {
        capRate -= 0.02;
    }

    const years = project.lease_years || 10;
    let dcfValue = annualNoi / capRate;

    if (years < 10) {
        dcfValue *= (years / 10);
    }

    // Status adjustment
    if (project.status === 'Pipeline') {
        dcfValue *= 0.5;
    } else if (project.status === 'Development') {
        dcfValue *= 0.7;
    } else if (project.status === 'Contracted') {
        dcfValue *= 0.85;
    }

    return dcfValue * getCountryFactor(project.country);
}

function hasHyperscalerLease(ticker) {
    return ALL_PROJECTS.some(p =>
        p.ticker === ticker &&
        isHyperscaler(p.lessee) &&
        (p.status === 'Operational' || p.status === 'Contracted')
    );
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
    let totalHpcValue = 0;

    // Calculate per-ticker metrics
    const tickerMetrics = {};

    Object.keys(MINER_DATA).forEach(ticker => {
        const projects = ALL_PROJECTS.filter(p => p.ticker === ticker);

        let contractedMw = 0;
        let pipelineMw = 0;
        let contractedEv = 0;
        let pipelineEv = 0;
        let miningMw = 0;

        projects.forEach(p => {
            const isHpc = p.current_use === 'AI/HPC' || isHyperscaler(p.lessee);
            const dcf = calculateHpcDcfValue(p);

            if (isHpc && (p.status === 'Operational' || p.status === 'Contracted')) {
                contractedMw += p.it_mw || 0;
                contractedEv += dcf;
            } else if (isHpc && (p.status === 'Pipeline' || p.status === 'Development')) {
                pipelineMw += p.it_mw || 0;
                pipelineEv += dcf;
            } else if (p.current_use === 'BTC' || p.current_use === 'Mixed') {
                miningMw += p.it_mw || 0;
            }
        });

        tickerMetrics[ticker] = { contractedMw, pipelineMw, contractedEv, pipelineEv, miningMw, projects };
    });

    Object.keys(MINER_DATA).forEach(ticker => {
        const miner = MINER_DATA[ticker];
        const metrics = tickerMetrics[ticker];
        const overrides = minerOverrides[ticker] || {};

        const btc = overrides.btc ?? miner.btc;
        const cash = overrides.cash ?? miner.cash;
        const debt = overrides.debt ?? miner.debt;
        const fdShares = overrides.fdShares ?? miner.fdShares;

        const hodlValue = btc * btcPrice / 1e6;
        const hasHyperscaler = hasHyperscalerLease(ticker);

        // Mining EV
        const miningEV = metrics.miningMw * 1.4 / 0.12;

        // Total EV
        const totalEV = miningEV + metrics.contractedEv + metrics.pipelineEv;
        const equityValue = totalEV + hodlValue + cash - debt;
        const fairValue = equityValue / fdShares;

        // Mock price
        const currentPrice = fairValue * (0.7 + Math.random() * 0.6);
        const mcap = currentPrice * fdShares;
        const upside = ((fairValue / currentPrice) - 1) * 100;

        totalMcap += mcap;
        totalBtc += btc;
        totalHpcContracted += metrics.contractedMw;
        totalHpcPipeline += metrics.pipelineMw;
        totalHpcValue += metrics.contractedEv;

        // Create expandable row
        const row = document.createElement('tr');
        row.className = 'expandable-row';
        row.dataset.ticker = ticker;
        row.onclick = () => toggleExpandedRow(ticker);

        const hyperscalerBadge = hasHyperscaler ? '<span class="hyperscaler-badge">⚡ HPC</span>' : '';

        row.innerHTML = `
            <td><span class="expand-icon">▶</span></td>
            <td class="ticker">${ticker}${hyperscalerBadge}</td>
            <td>$${currentPrice.toFixed(2)}</td>
            <td>$${(mcap / 1000).toFixed(1)}B</td>
            <td class="has-tooltip" data-tooltip="${miner.snippets?.hodl || 'N/A'}">
                <a href="${miner.sourceUrl}" target="_blank" class="source-link">$${hodlValue.toFixed(0)}M</a>
            </td>
            <td class="has-tooltip" data-tooltip="${miner.snippets?.cash || 'N/A'}">
                <a href="${miner.sourceUrl}" target="_blank" class="source-link">$${cash.toFixed(0)}M</a>
            </td>
            <td class="has-tooltip" data-tooltip="${miner.snippets?.debt || 'N/A'}">
                <a href="${miner.sourceUrl}" target="_blank" class="source-link">$${debt.toFixed(0)}M</a>
            </td>
            <td class="has-tooltip" data-tooltip="${miner.snippets?.shares || 'N/A'}">
                <a href="${miner.sourceUrl}" target="_blank" class="source-link">${fdShares.toFixed(0)}M</a>
            </td>
            <td>${metrics.miningMw.toFixed(0)}</td>
            <td>${(metrics.contractedMw + metrics.pipelineMw).toFixed(0)}</td>
            <td>$${miningEV.toFixed(0)}M</td>
            <td class="positive">$${metrics.contractedEv.toFixed(0)}M</td>
            <td class="neutral">$${metrics.pipelineEv.toFixed(0)}M</td>
            <td class="positive">$${fairValue.toFixed(2)}</td>
            <td class="${upside >= 0 ? 'positive' : 'negative'}">${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%</td>
        `;
        tbody.appendChild(row);

        // Create expanded content row
        const expandedRow = document.createElement('tr');
        expandedRow.className = 'expanded-content';
        expandedRow.id = `expanded-${ticker}`;
        expandedRow.innerHTML = `<td colspan="15">${renderProjectSummary(metrics.projects)}</td>`;
        tbody.appendChild(expandedRow);
    });

    // Update summary cards
    document.getElementById('total-mcap').textContent = '$' + (totalMcap / 1000).toFixed(1) + 'B';
    document.getElementById('total-btc').textContent = totalBtc.toLocaleString();
    document.getElementById('total-btc-value').textContent = '$' + (totalBtc * btcPrice / 1e9).toFixed(2) + 'B';
    document.getElementById('total-hpc-contracted').textContent = totalHpcContracted.toFixed(0) + ' MW';
    document.getElementById('total-hpc-pipeline').textContent = totalHpcPipeline.toFixed(0) + ' MW';
    document.getElementById('total-hpc-value').textContent = '$' + (totalHpcValue / 1000).toFixed(1) + 'B';
}

function toggleExpandedRow(ticker) {
    const row = document.querySelector(`tr[data-ticker="${ticker}"]`);
    const expandedRow = document.getElementById(`expanded-${ticker}`);

    if (row.classList.contains('expanded')) {
        row.classList.remove('expanded');
        expandedRow.classList.remove('show');
    } else {
        row.classList.add('expanded');
        expandedRow.classList.add('show');
    }
}

function renderProjectSummary(projects) {
    if (!projects || projects.length === 0) {
        return '<div style="color: #888;">No projects</div>';
    }

    let html = '<div class="project-summary">';

    // Sort: contracted first, then by MW
    projects.sort((a, b) => {
        const aContracted = a.status === 'Operational' || a.status === 'Contracted';
        const bContracted = b.status === 'Operational' || b.status === 'Contracted';
        if (aContracted !== bContracted) return bContracted - aContracted;
        return (b.it_mw || 0) - (a.it_mw || 0);
    });

    projects.forEach(p => {
        const isContracted = p.status === 'Operational' || p.status === 'Contracted';
        const statusClass = isContracted ? 'contracted' : 'pipeline';
        const dcf = calculateHpcDcfValue(p);

        html += `
            <div class="project-item ${statusClass}">
                <div class="project-name">${p.name.substring(0, 40)}${p.name.length > 40 ? '...' : ''}</div>
                <div class="project-details">
                    ${p.it_mw || 0} MW | ${p.current_use} | ${p.status}
                    ${p.lessee ? ` | ${p.lessee}` : ''}
                    ${dcf > 0 ? ` | DCF: $${dcf.toFixed(0)}M` : ''}
                </div>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

// ============================================================
// PROJECTS TABLE RENDERING
// ============================================================
function renderProjectsTable() {
    const tbody = document.querySelector('#projects-table tbody');
    tbody.innerHTML = '';

    const tickerFilter = document.getElementById('project-ticker-filter')?.value || '';
    const statusFilter = document.getElementById('project-status-filter')?.value || '';
    const useFilter = document.getElementById('project-use-filter')?.value || '';
    const countryFilter = document.getElementById('project-country-filter')?.value || '';

    let filtered = ALL_PROJECTS.filter(p => {
        if (tickerFilter && p.ticker !== tickerFilter) return false;
        if (statusFilter && p.status !== statusFilter) return false;
        if (useFilter && p.current_use !== useFilter) return false;
        if (countryFilter && p.country !== countryFilter) return false;
        return true;
    });

    filtered.forEach(project => {
        const fidoodle = projectFidoodles[project.id] ?? 1.0;
        const adjValue = getProjectValue(project);
        const statusClass = project.status === 'Operational' ? 'status-operational' :
                          project.status === 'Contracted' ? 'status-contracted' : 'status-pipeline';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="ticker">${project.ticker}</td>
            <td>${project.name}</td>
            <td>${project.state || '-'}</td>
            <td>${project.country || '-'}</td>
            <td>${project.gross_mw || 0}</td>
            <td>${project.it_mw || 0}</td>
            <td>${project.current_use || '-'}</td>
            <td><span class="status-badge ${statusClass}">${project.status || '-'}</span></td>
            <td>${project.lessee || '-'}</td>
            <td>
                <input type="number" class="editable-input" value="${fidoodle}"
                       min="0" max="2" step="0.05" style="width: 50px;"
                       onchange="updateProjectFidoodle(${project.id}, this.value)">
            </td>
            <td>$${(adjValue / 1000).toFixed(1)}B</td>
            <td>${project.source_url ? `<a href="${project.source_url}" target="_blank" class="source-link">Source</a>` : '-'}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateProjectFidoodle(projectId, value) {
    projectFidoodles[projectId] = parseFloat(value) || 1.0;
    saveData();
    renderDashboard();
}

// ============================================================
// HPC TABLE RENDERING
// ============================================================
function renderHpcTable() {
    const tbody = document.querySelector('#hpc-table tbody');
    tbody.innerHTML = '';

    const filterTicker = document.getElementById('hpc-ticker-filter')?.value || '';

    // Filter to HPC projects
    let hpcProjects = ALL_PROJECTS.filter(p =>
        p.current_use === 'AI/HPC' || isHyperscaler(p.lessee)
    );

    if (filterTicker) {
        hpcProjects = hpcProjects.filter(p => p.ticker === filterTicker);
    }

    let contractedMw = 0;
    let pipelineMw = 0;
    let totalContract = 0;
    let totalDcf = 0;
    let leaseCount = 0;

    hpcProjects.forEach(project => {
        const dcfValue = calculateHpcDcfValue(project);
        const isContracted = project.status === 'Operational' || project.status === 'Contracted';

        if (isContracted) {
            contractedMw += project.it_mw || 0;
            leaseCount++;
        } else {
            pipelineMw += project.it_mw || 0;
        }

        totalContract += project.lease_value || 0;
        totalDcf += dcfValue;

        const statusClass = project.status === 'Operational' ? 'status-operational' :
                           project.status === 'Contracted' ? 'status-contracted' : 'status-pipeline';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="ticker">${project.ticker}</td>
            <td>${project.name}</td>
            <td>${project.lessee || '-'}</td>
            <td>${project.it_mw || 0}</td>
            <td>${project.lease_value ? '$' + project.lease_value.toLocaleString() + 'M' : '-'}</td>
            <td>${project.lease_years || '-'}</td>
            <td>${project.annual_rev ? '$' + project.annual_rev + 'M' : '-'}</td>
            <td>${project.noi_pct || 85}%</td>
            <td><span class="status-badge ${statusClass}">${project.status || 'Unknown'}</span></td>
            <td class="positive">$${dcfValue.toFixed(0)}M</td>
            <td>${project.source_url ? `<a href="${project.source_url}" target="_blank" class="source-link">Source</a>` : '-'}</td>
            <td>-</td>
        `;
        tbody.appendChild(row);
    });

    // Update summary cards
    document.getElementById('hpc-lease-count').textContent = leaseCount;
    document.getElementById('hpc-contracted-mw').textContent = contractedMw.toFixed(0) + ' MW';
    document.getElementById('hpc-pipeline-mw').textContent = pipelineMw.toFixed(0) + ' MW';
    document.getElementById('hpc-total-contract').textContent = '$' + (totalContract / 1000).toFixed(1) + 'B';
    document.getElementById('hpc-dcf-value').textContent = '$' + (totalDcf / 1000).toFixed(1) + 'B';
}

// ============================================================
// COUNTRY FACTORS RENDERING
// ============================================================
function renderCountryFactors() {
    const tbody = document.querySelector('#country-factors-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    Object.entries(countryFactors).sort((a, b) => a[0].localeCompare(b[0])).forEach(([country, factor]) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${country}</td>
            <td>
                <input type="number" class="editable-input" value="${factor}"
                       min="0" max="2" step="0.1" data-country="${country}"
                       onchange="updateCountryFactor('${country}', this.value)">
            </td>
        `;
        tbody.appendChild(row);
    });
}

function updateCountryFactor(country, value) {
    countryFactors[country] = parseFloat(value) || 1.0;
    saveData();
    renderAll();
}

function addCountryFactor() {
    document.getElementById('country-modal').classList.add('active');
}

function closeCountryModal() {
    document.getElementById('country-modal').classList.remove('active');
}

function saveNewCountryFactor() {
    const name = document.getElementById('new-country-name').value.trim();
    const factor = parseFloat(document.getElementById('new-country-factor').value) || 1.0;

    if (name) {
        countryFactors[name] = factor;
        saveData();
        renderCountryFactors();
        closeCountryModal();
    }
}

function saveFactors() {
    saveData();
    alert('Factors saved!');
    renderAll();
}

function resetFactors() {
    countryFactors = { ...DEFAULT_COUNTRY_FACTORS };
    saveData();
    renderCountryFactors();
    renderAll();
}

// ============================================================
// MAP TAB
// ============================================================
function initMap() {
    if (map) return;

    map = L.map('map', {
        center: [39.8283, -98.5795], // US center
        zoom: 4,
        scrollWheelZoom: true
    });

    // Dark tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(map);

    updateMapMarkers();
}

function updateMapMarkers() {
    if (!map) return;

    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const tickerFilter = document.getElementById('map-ticker-filter')?.value || '';
    const statusFilter = document.getElementById('map-status-filter')?.value || '';
    const mwFilter = parseFloat(document.getElementById('map-mw-filter')?.value) || 0;

    ALL_PROJECTS.filter(p => p.lat && p.lng).forEach(project => {
        // Apply filters
        if (tickerFilter && project.ticker !== tickerFilter) return;
        if (mwFilter && (project.it_mw || 0) < mwFilter) return;

        const isHpc = project.current_use === 'AI/HPC' || isHyperscaler(project.lessee);
        const isContracted = project.status === 'Operational' || project.status === 'Contracted';

        if (statusFilter === 'contracted' && !(isHpc && isContracted)) return;
        if (statusFilter === 'pipeline' && !(isHpc && !isContracted)) return;
        if (statusFilter === 'btc' && project.current_use !== 'BTC') return;

        // Determine color
        let color = '#888';
        if (isHpc && isContracted) {
            color = '#00ff00';
        } else if (isHpc) {
            color = '#ff8c00';
        } else if (project.current_use === 'BTC') {
            color = '#00bfff';
        }

        // Size based on MW
        const radius = Math.max(6, Math.min(20, Math.sqrt(project.it_mw || 10) * 2));

        const marker = L.circleMarker([project.lat, project.lng], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
        });

        const statusClass = isContracted ? 'background: #003300; color: #00ff00;' : 'background: #330033; color: #ff88ff;';

        marker.bindPopup(`
            <div style="min-width: 200px;">
                <div class="popup-ticker">${project.ticker}</div>
                <span class="popup-status" style="${statusClass}">${project.status}</span>
                <div style="margin-top: 8px;"><strong>${project.name}</strong></div>
                <div style="margin-top: 5px; color: #888;">
                    ${project.it_mw || 0} MW IT | ${project.current_use}
                    ${project.lessee ? `<br>Tenant: ${project.lessee}` : ''}
                    ${project.lease_value ? `<br>Contract: $${project.lease_value}M` : ''}
                </div>
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

// Add map filter event listeners
document.getElementById('map-ticker-filter')?.addEventListener('change', updateMapMarkers);
document.getElementById('map-status-filter')?.addEventListener('change', updateMapMarkers);
document.getElementById('map-mw-filter')?.addEventListener('change', updateMapMarkers);

// ============================================================
// FILTERS
// ============================================================
function populateFilters() {
    const tickers = [...new Set(ALL_PROJECTS.map(p => p.ticker))].sort();
    const countries = [...new Set(ALL_PROJECTS.map(p => p.country).filter(Boolean))].sort();

    // Populate all ticker filters
    ['project-ticker-filter', 'hpc-ticker-filter', 'map-ticker-filter', 'hpc-ticker'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentVal = select.value;
            if (id === 'hpc-ticker') {
                select.innerHTML = '';
            } else {
                select.innerHTML = '<option value="">All</option>';
            }
            tickers.forEach(ticker => {
                select.innerHTML += `<option value="${ticker}">${ticker}</option>`;
            });
            if (currentVal) select.value = currentVal;
        }
    });

    // Populate country filter
    const countryFilter = document.getElementById('project-country-filter');
    if (countryFilter) {
        countryFilter.innerHTML = '<option value="">All</option>';
        countries.forEach(country => {
            countryFilter.innerHTML += `<option value="${country}">${country}</option>`;
        });
    }
}

// Filter event listeners
document.getElementById('project-ticker-filter')?.addEventListener('change', renderProjectsTable);
document.getElementById('project-status-filter')?.addEventListener('change', renderProjectsTable);
document.getElementById('project-use-filter')?.addEventListener('change', renderProjectsTable);
document.getElementById('project-country-filter')?.addEventListener('change', renderProjectsTable);
document.getElementById('hpc-ticker-filter')?.addEventListener('change', renderHpcTable);
document.getElementById('hpc-cap-rate')?.addEventListener('change', () => { renderHpcTable(); renderDashboard(); });

// ============================================================
// HPC MODAL
// ============================================================
function openHpcModal() {
    document.getElementById('hpc-modal').classList.add('active');
    document.getElementById('hpc-modal-title').textContent = 'Add HPC Project';
    document.getElementById('hpc-form').reset();
}

function closeHpcModal() {
    document.getElementById('hpc-modal').classList.remove('active');
}

// ============================================================
// UTILITIES
// ============================================================
function resetAllOverrides() {
    if (confirm('Reset all overrides?')) {
        minerOverrides = {};
        projectFidoodles = {};
        saveData();
        renderAll();
    }
}

function exportData() {
    let csv = 'Ticker,Price,Mkt Cap ($B),HODL Val ($M),Cash ($M),Debt ($M),FD Shares (M),Mining MW,HPC MW,Mining EV ($M),HPC EV Contracted ($M),HPC EV Pipeline ($M)\n';

    Object.keys(MINER_DATA).forEach(ticker => {
        const miner = MINER_DATA[ticker];
        const projects = ALL_PROJECTS.filter(p => p.ticker === ticker);

        let contractedMw = 0, pipelineMw = 0, contractedEv = 0, pipelineEv = 0, miningMw = 0;

        projects.forEach(p => {
            const isHpc = p.current_use === 'AI/HPC' || isHyperscaler(p.lessee);
            const dcf = calculateHpcDcfValue(p);
            const isContracted = p.status === 'Operational' || p.status === 'Contracted';

            if (isHpc && isContracted) { contractedMw += p.it_mw || 0; contractedEv += dcf; }
            else if (isHpc) { pipelineMw += p.it_mw || 0; pipelineEv += dcf; }
            else { miningMw += p.it_mw || 0; }
        });

        const hodlValue = miner.btc * btcPrice / 1e6;
        const miningEV = miningMw * 1.4 / 0.12;

        csv += `${ticker},-,${((miner.fdShares * 10) / 1000).toFixed(1)},${hodlValue.toFixed(0)},${miner.cash},${miner.debt},${miner.fdShares},${miningMw},${contractedMw + pipelineMw},${miningEV.toFixed(0)},${contractedEv.toFixed(0)},${pipelineEv.toFixed(0)}\n`;
    });

    downloadCsv(csv, 'miner_valuation_export.csv');
}

function exportProjects() {
    let csv = 'Ticker,Site Name,Country,State,Gross MW,IT MW,Use,Status,Lessee,Lease Value ($M),Fidoodle,Adj Value ($M)\n';

    ALL_PROJECTS.forEach(p => {
        const fidoodle = projectFidoodles[p.id] ?? 1.0;
        const adjValue = getProjectValue(p);
        csv += `"${p.ticker}","${p.name}","${p.country}","${p.state}",${p.gross_mw || 0},${p.it_mw || 0},"${p.current_use}","${p.status}","${p.lessee || ''}",${p.lease_value || 0},${fidoodle},${adjValue.toFixed(0)}\n`;
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
