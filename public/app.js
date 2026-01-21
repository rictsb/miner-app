// BTC Miner Valuation App v6
// Global state
let btcPrice = 89668;
let ethPrice = 2994;
let miners = [];
let projects = [];
let hpcProjects = [];
let minerOverrides = {};
let fidoodleFactors = {};

// ============================================================
// MINER DATA - From HODL Value sheet (accurate as of Q4 2024)
// ============================================================
const MINER_DATA = {
    MARA: { btc: 54000, cash: 826.4, debt: 3640, fdShares: 437, miningMW: 1200, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001507605' },
    RIOT: { btc: 18005, cash: 330.8, debt: 871.9, fdShares: 414, miningMW: 1100, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001167419' },
    CLSK: { btc: 13099, cash: 43.0, debt: 825.7, fdShares: 318, miningMW: 745, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001844701' },
    CIFR: { btc: 1500, cash: 1210, debt: 1040, fdShares: 395, miningMW: 300, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989' },
    CORZ: { btc: 2350, cash: 453.4, debt: 1160, fdShares: 310, miningMW: 850, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630' },
    WULF: { btc: 0, cash: 712.8, debt: 1500, fdShares: 575, miningMW: 150, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001916076' },
    HUT: { btc: 13696, cash: 33.5, debt: 390.7, fdShares: 110, miningMW: 280, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001964789' },
    IREN: { btc: 0, cash: 1030, debt: 973.5, fdShares: 328, miningMW: 510, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001878848' },
    BITF: { btc: 1827, cash: 86.95, debt: 150, fdShares: 520, miningMW: 310, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001858293' },
    HIVE: { btc: 435, cash: 48.3, debt: 25, fdShares: 155, miningMW: 180, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001888079' },
    GLXY: { btc: 6894, cash: 1.8, debt: 500, fdShares: 390, miningMW: 0, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001886894' },
    APLD: { btc: 0, cash: 150, debt: 400, fdShares: 260, miningMW: 159, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001144980' },
    BTDR: { btc: 1901, cash: 202.3, debt: 800, fdShares: 485, miningMW: 2100, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001936702' },
    ABTC: { btc: 5427, cash: 7.98, debt: 50, fdShares: 125, miningMW: 175, source: 'Q3 2024 10-Q', sourceUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001899123' }
};

// Source snippets for hover tooltips
const MINER_SOURCE_SNIPPETS = {
    MARA: { hodl: 'BTC Holdings: 54,000 BTC', cash: 'Cash & Eq: $826.4M', debt: 'Debt: $3,640M (convertible notes)', shares: 'Shares: 378M basic / 437M FD' },
    RIOT: { hodl: 'BTC Holdings: 18,005 BTC', cash: 'Cash & Eq: $330.8M', debt: 'Debt: $871.9M (convertible notes)', shares: 'Shares: 372M basic / 414M FD' },
    CLSK: { hodl: 'BTC Holdings: 13,099 BTC', cash: 'Cash & Eq: $43.0M', debt: 'Debt: $825.7M (convertible notes)', shares: 'Shares: 256M basic / 318M FD' },
    CIFR: { hodl: 'BTC Holdings: 1,500 BTC', cash: 'Cash & Eq: $1,210M', debt: 'Debt: $1,040M (AWS prepayment)', shares: 'Shares: 395M basic/FD' },
    CORZ: { hodl: 'BTC Holdings: 2,350 BTC', cash: 'Cash & Eq: $453.4M', debt: 'Debt: $1,160M (convertible notes)', shares: 'Shares: 310M basic/FD' },
    WULF: { hodl: 'BTC Holdings: 0 BTC (sold)', cash: 'Cash & Eq: $712.8M', debt: 'Debt: $1,500M (project financing)', shares: 'Shares: 419M basic / 575M FD' },
    HUT: { hodl: 'BTC Holdings: 13,696 BTC', cash: 'Cash & Eq: $33.5M', debt: 'Debt: $390.7M (credit facilities)', shares: 'Shares: 108M basic / 110M FD' },
    IREN: { hodl: 'BTC Holdings: 0 BTC', cash: 'Cash & Eq: $1,030M', debt: 'Debt: $973.5M (equipment financing)', shares: 'Shares: 328M basic/FD' },
    BITF: { hodl: 'BTC Holdings: 1,827 BTC', cash: 'Cash & Eq: $86.95M', debt: 'Debt: $150M (term loans)', shares: 'Shares: 520M basic/FD' },
    HIVE: { hodl: 'BTC Holdings: 435 BTC', cash: 'Cash & Eq: $48.3M', debt: 'Debt: $25M (equipment)', shares: 'Shares: 155M basic/FD' },
    GLXY: { hodl: 'BTC Holdings: 6,894 BTC', cash: 'Cash & Eq: $1.8M', debt: 'Debt: $500M (senior notes)', shares: 'Shares: 390M basic/FD' },
    APLD: { hodl: 'BTC Holdings: 0 BTC', cash: 'Cash & Eq: $150M', debt: 'Debt: $400M (project financing)', shares: 'Shares: 260M basic/FD' },
    BTDR: { hodl: 'BTC Holdings: 1,901 BTC', cash: 'Cash & Eq: $202.3M', debt: 'Debt: $800M (term loans)', shares: 'Shares: 485M basic/FD' },
    ABTC: { hodl: 'BTC Holdings: 5,427 BTC', cash: 'Cash & Eq: $7.98M', debt: 'Debt: $50M (equipment)', shares: 'Shares: 125M basic/FD' }
};

// ============================================================
// HPC SEED DATA - From Excel "Project List V9" sheet
// All contracted HPC/AI leases with real tenants
// ============================================================
function getHpcSeedData() {
    return [
        // ========== APLD - CoreWeave $11B/400MW Deal ==========
        {
            id: 1001,
            ticker: 'APLD',
            name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 1',
            tenant: 'CoreWeave',
            it_mw: 100,
            lease_value: 2750,
            years: 15,
            annual_rev: 183,
            noi_pct: 85,
            status: 'Operational',
            credit: 'hyperscaler',
            notes: 'Part of $11B/400MW; Bldg 1 - now operating at full 100MW',
            source_url: 'https://drive.google.com/file/d/1UhQsQqkob2KHu0I-jjosxlQqi854LSSD/view?usp=share_link'
        },
        {
            id: 1002,
            ticker: 'APLD',
            name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 2',
            tenant: 'CoreWeave',
            it_mw: 150,
            lease_value: 4125,
            years: 15,
            annual_rev: 275,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Part of $11B/400MW; Bldg 2 - 150MW IT stated',
            source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142/applied-digital-reports-fiscal-second-quarter-2026-results'
        },
        {
            id: 1003,
            ticker: 'APLD',
            name: 'Ellendale, ND (Polaris Forge 1) - CoreWeave Bldg 3',
            tenant: 'CoreWeave',
            it_mw: 150,
            lease_value: 4125,
            years: 15,
            annual_rev: 275,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Part of $11B/400MW; Bldg 3 - completes 400MW campus',
            source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142/applied-digital-reports-fiscal-second-quarter-2026-results'
        },
        {
            id: 1004,
            ticker: 'APLD',
            name: 'Harwood, ND (Polaris Forge 2) - Hyperscaler Bldg 1',
            tenant: 'IG Hyperscaler (TBA)',
            it_mw: 100,
            lease_value: 2500,
            years: 15,
            annual_rev: 167,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'investment_grade',
            notes: 'New IG hyperscaler contract; specific tenant TBA',
            source_url: 'https://ir.applieddigital.com/news-events/press-releases'
        },
        {
            id: 1005,
            ticker: 'APLD',
            name: 'Harwood, ND (Polaris Forge 2) - Hyperscaler Bldg 2',
            tenant: 'IG Hyperscaler (TBA)',
            it_mw: 100,
            lease_value: 2500,
            years: 15,
            annual_rev: 167,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'investment_grade',
            notes: 'New IG hyperscaler contract; specific tenant TBA',
            source_url: 'https://ir.applieddigital.com/news-events/press-releases'
        },
        {
            id: 1006,
            ticker: 'APLD',
            name: 'Harwood, ND (Polaris Forge 2) - ROFR Expansion',
            tenant: 'US Hyperscaler (IG)',
            it_mw: 800,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Pipeline',
            credit: 'investment_grade',
            notes: 'ROFR option for 800MW expansion',
            source_url: 'https://ir.applieddigital.com/news-events/press-releases'
        },

        // ========== CIFR - AWS $5.5B + Fluidstack/Google ==========
        {
            id: 2001,
            ticker: 'CIFR',
            name: 'AWS AI Hosting Contract',
            tenant: 'AWS',
            it_mw: 214,
            lease_value: 5500,
            years: 15,
            annual_rev: 367,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'AWS AI hosting contract - largest single cloud deal',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989'
        },
        {
            id: 2002,
            ticker: 'CIFR',
            name: 'Barber Lake (TX) - Fluidstack/Google',
            tenant: 'Fluidstack/Google',
            it_mw: 168,
            lease_value: 3000,
            years: 10,
            annual_rev: 300,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Fluidstack/Google lease at Barber Lake',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989'
        },
        {
            id: 2003,
            ticker: 'CIFR',
            name: 'Barber Lake Fluidstack Additional Site',
            tenant: 'Fluidstack',
            it_mw: 39,
            lease_value: 830,
            years: 10,
            annual_rev: 83,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'investment_grade',
            notes: 'Additional Fluidstack capacity',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989'
        },

        // ========== CORZ - CoreWeave ~$8.7B/780MW Deal ==========
        {
            id: 3001,
            ticker: 'CORZ',
            name: 'CoreWeave - Denton TX (full site)',
            tenant: 'CoreWeave',
            it_mw: 260,
            lease_value: 3835,
            years: 12,
            annual_rev: 320,
            noi_pct: 85,
            status: 'Operational',
            credit: 'hyperscaler',
            notes: 'Full Denton site converted to CoreWeave',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630'
        },
        {
            id: 3002,
            ticker: 'CORZ',
            name: 'CoreWeave - 5 other sites combined',
            tenant: 'CoreWeave',
            it_mw: 330,
            lease_value: 4865,
            years: 12,
            annual_rev: 405,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Combined 5 additional CoreWeave sites',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630'
        },
        {
            id: 3003,
            ticker: 'CORZ',
            name: 'Marble, NC - HPC conversion',
            tenant: 'CoreWeave',
            it_mw: 104,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Pipeline',
            credit: 'hyperscaler',
            notes: 'Marble NC site HPC conversion',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630'
        },
        {
            id: 3004,
            ticker: 'CORZ',
            name: 'Muskogee, OK - CoreWeave',
            tenant: 'CoreWeave',
            it_mw: 70,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Pipeline',
            credit: 'hyperscaler',
            notes: 'Muskogee OK CoreWeave expansion',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630'
        },
        {
            id: 3005,
            ticker: 'CORZ',
            name: 'Austin, TX - CoreWeave',
            tenant: 'CoreWeave',
            it_mw: 16,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Operational',
            credit: 'hyperscaler',
            notes: 'Austin TX CoreWeave site',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001894630'
        },

        // ========== GLXY - CoreWeave $15B/526MW Helios Deal ==========
        {
            id: 4001,
            ticker: 'GLXY',
            name: 'Helios, TX - CoreWeave Phase I',
            tenant: 'CoreWeave',
            it_mw: 200,
            lease_value: 5714,
            years: 15,
            annual_rev: 381,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Helios Phase I - part of $15B/526MW deal',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001886894'
        },
        {
            id: 4002,
            ticker: 'GLXY',
            name: 'Helios, TX - CoreWeave Phase II',
            tenant: 'CoreWeave',
            it_mw: 200,
            lease_value: 5714,
            years: 15,
            annual_rev: 381,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Helios Phase II - part of $15B/526MW deal',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001886894'
        },
        {
            id: 4003,
            ticker: 'GLXY',
            name: 'Helios, TX - CoreWeave Phase III',
            tenant: 'CoreWeave',
            it_mw: 126,
            lease_value: 3572,
            years: 15,
            annual_rev: 238,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Helios Phase III - completes 526MW campus',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001886894'
        },

        // ========== HUT - Fluidstack/Anthropic $7B/245MW + Options ==========
        {
            id: 5001,
            ticker: 'HUT',
            name: 'River Bend (LA) - Fluidstack/Anthropic lease',
            tenant: 'Fluidstack/Anthropic',
            it_mw: 245,
            lease_value: 7000,
            years: 15,
            annual_rev: 467,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'River Bend 245MW - Anthropic via Fluidstack',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001964789'
        },
        {
            id: 5002,
            ticker: 'HUT',
            name: 'River Bend (LA) - ROFO expansion',
            tenant: 'Fluidstack',
            it_mw: 1000,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Pipeline',
            credit: 'investment_grade',
            notes: 'ROFO for 1GW expansion at River Bend',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001964789'
        },
        {
            id: 5003,
            ticker: 'HUT',
            name: 'Anthropic partnership - other sites option',
            tenant: 'Anthropic',
            it_mw: 840,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Pipeline',
            credit: 'hyperscaler',
            notes: 'Option for 840MW at other HUT sites',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001964789'
        },

        // ========== IREN - Microsoft $9.7B/200MW Childress Deal ==========
        {
            id: 6001,
            ticker: 'IREN',
            name: 'Childress (TX) - Microsoft Horizon 1-4',
            tenant: 'Microsoft',
            it_mw: 200,
            lease_value: 9700,
            years: 5,
            annual_rev: 1940,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Microsoft Childress - $9.7B over 5 years, Horizon 1-4',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001878848'
        },

        // ========== WULF - Fluidstack/Google $6.7B/366MW + Core42 ==========
        {
            id: 7001,
            ticker: 'WULF',
            name: 'Lake Mariner (NY) - Fluidstack/Google (CB-1 to CB-4)',
            tenant: 'Fluidstack/Google',
            it_mw: 366,
            lease_value: 6700,
            years: 10,
            annual_rev: 670,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Lake Mariner CB-1 to CB-4 - Fluidstack/Google',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001916076'
        },
        {
            id: 7002,
            ticker: 'WULF',
            name: 'Lake Mariner (NY) - Core42/G42',
            tenant: 'Core42 (G42)',
            it_mw: 60,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'investment_grade',
            notes: 'Core42/G42 deal at Lake Mariner',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001916076'
        },
        {
            id: 7003,
            ticker: 'WULF',
            name: 'Abernathy, TX - Fluidstack/Google JV',
            tenant: 'Fluidstack (51% JV)',
            it_mw: 86,
            lease_value: 4800,
            years: 25,
            annual_rev: 192,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'hyperscaler',
            notes: 'Abernathy JV - 51% TeraWulf ownership',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001916076'
        },
        {
            id: 7004,
            ticker: 'WULF',
            name: 'Fluidstack JV Option - Abernathy Phase II',
            tenant: 'Fluidstack',
            it_mw: 168,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Pipeline',
            credit: 'investment_grade',
            notes: 'Option for Abernathy Phase II expansion',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001916076'
        },

        // ========== RIOT - AMD 25MW Deal ==========
        {
            id: 8001,
            ticker: 'RIOT',
            name: 'Rockdale, TX (Whinstone)',
            tenant: 'AMD',
            it_mw: 25,
            lease_value: 311,
            years: 10,
            annual_rev: 31,
            noi_pct: 85,
            status: 'Operational',
            credit: 'investment_grade',
            notes: 'AMD colocation at Whinstone Rockdale',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001167419'
        },

        // ========== SLNH - Galaxy Digital Deal ==========
        {
            id: 9001,
            ticker: 'SLNH',
            name: 'Project Kati 1 (TX)',
            tenant: 'Galaxy Digital (48MW)',
            it_mw: 64,
            lease_value: 0,
            years: 0,
            annual_rev: 0,
            noi_pct: 85,
            status: 'Contracted',
            credit: 'speculative',
            notes: 'Galaxy Digital 48MW hosting at Kati 1',
            source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989'
        }
    ];
}

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    loadData();
    fetchPrices();
    setInterval(fetchPrices, 60000); // Update prices every minute
});

function initializeTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
}

// ============================================================
// DATA LOADING
// ============================================================
async function loadData() {
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        minerOverrides = data.minerOverrides || {};
        fidoodleFactors = data.fidoodleFactors || {};
        hpcProjects = data.hpcProjects || [];

        // If no HPC projects, seed with default data
        if (hpcProjects.length === 0) {
            seedHpcProjects();
        }

        renderDashboard();
        renderHpcTable();
        populateFilters();
    } catch (error) {
        console.error('Error loading data:', error);
        // Initialize with seed data if server unavailable
        hpcProjects = getHpcSeedData();
        renderDashboard();
        renderHpcTable();
        populateFilters();
    }
}

async function saveData() {
    try {
        await fetch('/api/miner-overrides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(minerOverrides)
        });
        await fetch('/api/fidoodle-factors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fidoodleFactors)
        });
        await fetch('/api/hpc-projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(hpcProjects)
        });
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// ============================================================
// PRICE FETCHING
// ============================================================
async function fetchPrices() {
    try {
        // Using CoinGecko API for live prices
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd');
        const data = await response.json();
        btcPrice = data.bitcoin.usd;
        ethPrice = data.ethereum.usd;
        updatePriceDisplay();
        renderDashboard();
    } catch (error) {
        console.error('Error fetching prices:', error);
        updatePriceDisplay();
    }
}

function updatePriceDisplay() {
    document.getElementById('btc-price').textContent = '$' + btcPrice.toLocaleString();
    document.getElementById('eth-price').textContent = '$' + ethPrice.toLocaleString();
    document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
}

// ============================================================
// DASHBOARD RENDERING
// ============================================================
function renderDashboard() {
    const tbody = document.querySelector('#dashboard-table tbody');
    tbody.innerHTML = '';

    let totalMcap = 0;
    let totalBtc = 0;
    let totalHpcMw = 0;
    let totalHpcValue = 0;

    // Calculate HPC MW and value per ticker
    const hpcByTicker = {};
    hpcProjects.forEach(p => {
        if (!hpcByTicker[p.ticker]) {
            hpcByTicker[p.ticker] = { mw: 0, dcfValue: 0 };
        }
        hpcByTicker[p.ticker].mw += p.it_mw || 0;
        hpcByTicker[p.ticker].dcfValue += calculateDcfValue(p);
    });

    Object.keys(MINER_DATA).forEach(ticker => {
        const miner = MINER_DATA[ticker];
        const overrides = minerOverrides[ticker] || {};
        const fidoodle = fidoodleFactors[ticker] || 1.0;
        const snippets = MINER_SOURCE_SNIPPETS[ticker] || {};

        // Calculate values
        const btc = overrides.btc ?? miner.btc;
        const cash = overrides.cash ?? miner.cash;
        const debt = overrides.debt ?? miner.debt;
        const fdShares = overrides.fdShares ?? miner.fdShares;
        const miningMW = overrides.miningMW ?? miner.miningMW;

        const hodlValue = btc * btcPrice / 1e6; // In millions
        const hpcData = hpcByTicker[ticker] || { mw: 0, dcfValue: 0 };

        // Mining EV calculation (simplified)
        const miningEV = miningMW * 1.4 / 0.12 * fidoodle; // NOI/MW * cap rate

        // Total EV
        const totalEV = miningEV + hpcData.dcfValue;

        // Equity value
        const equityValue = totalEV + hodlValue + cash - debt;

        // Fair value per share
        const fairValue = equityValue / fdShares;

        // Mock current price (would be from API)
        const currentPrice = fairValue * (0.7 + Math.random() * 0.6);
        const mcap = currentPrice * fdShares;

        const upside = ((fairValue / currentPrice) - 1) * 100;

        totalMcap += mcap;
        totalBtc += btc;
        totalHpcMw += hpcData.mw;
        totalHpcValue += hpcData.dcfValue;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="ticker">${ticker}</td>
            <td>$${currentPrice.toFixed(2)}</td>
            <td>$${(mcap / 1000).toFixed(1)}B</td>
            <td class="tooltip" data-tooltip="${snippets.hodl || 'N/A'}">$${hodlValue.toFixed(0)}M</td>
            <td class="tooltip" data-tooltip="${snippets.cash || 'N/A'}">$${cash.toFixed(0)}M</td>
            <td class="tooltip" data-tooltip="${snippets.debt || 'N/A'}">$${debt.toFixed(0)}M</td>
            <td class="tooltip" data-tooltip="${snippets.shares || 'N/A'}">${fdShares.toFixed(0)}M</td>
            <td>${miningMW}</td>
            <td>${hpcData.mw.toFixed(0)}</td>
            <td>$${miningEV.toFixed(0)}M</td>
            <td>$${hpcData.dcfValue.toFixed(0)}M</td>
            <td class="positive">$${fairValue.toFixed(2)}</td>
            <td class="${upside >= 0 ? 'positive' : 'negative'}">${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%</td>
        `;
        tbody.appendChild(row);
    });

    // Update summary cards
    document.getElementById('total-mcap').textContent = '$' + (totalMcap / 1000).toFixed(1) + 'B';
    document.getElementById('total-btc').textContent = totalBtc.toLocaleString();
    document.getElementById('total-btc-value').textContent = '$' + (totalBtc * btcPrice / 1e9).toFixed(2) + 'B';
    document.getElementById('total-hpc-mw').textContent = totalHpcMw.toFixed(0) + ' MW';
    document.getElementById('total-hpc-value').textContent = '$' + (totalHpcValue / 1000).toFixed(1) + 'B';
}

// ============================================================
// HPC VALUATION (DCF)
// ============================================================
function calculateDcfValue(project) {
    if (!project.annual_rev || project.annual_rev === 0) {
        // Estimate from MW if no revenue stated
        if (project.it_mw && project.it_mw > 0) {
            const estimatedRev = project.it_mw * 1.5; // ~$1.5M per MW annual
            const noi = estimatedRev * (project.noi_pct || 85) / 100;
            const capRate = getCapRate(project);
            return noi / capRate;
        }
        return 0;
    }

    const annualNoi = project.annual_rev * (project.noi_pct || 85) / 100;
    const capRate = getCapRate(project);
    const years = project.years || 10;

    // Simple DCF: NOI / cap rate with term adjustment
    let dcfValue = annualNoi / capRate;

    // Adjust for lease term (shorter = less value)
    if (years < 10) {
        dcfValue *= (years / 10);
    }

    // Adjust for status
    if (project.status === 'Pipeline') {
        dcfValue *= 0.5;
    } else if (project.status === 'Contracted') {
        dcfValue *= 0.85;
    }

    return dcfValue;
}

function getCapRate(project) {
    const baseCapRate = parseFloat(document.getElementById('hpc-cap-rate')?.value || 12) / 100;

    // Credit quality adjustments
    const creditAdders = {
        'hyperscaler': -0.02,
        'investment_grade': -0.01,
        'speculative': 0.01,
        'unrated': 0.02
    };

    return baseCapRate + (creditAdders[project.credit] || 0);
}

// ============================================================
// HPC TABLE RENDERING
// ============================================================
function renderHpcTable() {
    const tbody = document.querySelector('#hpc-table tbody');
    tbody.innerHTML = '';

    const filterTicker = document.getElementById('hpc-ticker-filter')?.value || '';

    let filteredProjects = hpcProjects;
    if (filterTicker) {
        filteredProjects = hpcProjects.filter(p => p.ticker === filterTicker);
    }

    let totalMw = 0;
    let totalContract = 0;
    let totalDcf = 0;

    filteredProjects.forEach(project => {
        const dcfValue = calculateDcfValue(project);
        totalMw += project.it_mw || 0;
        totalContract += project.lease_value || 0;
        totalDcf += dcfValue;

        const statusClass = project.status === 'Operational' ? 'status-operational' :
                           project.status === 'Contracted' ? 'status-contracted' : 'status-pipeline';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="ticker">${project.ticker}</td>
            <td>${project.name}</td>
            <td>${project.tenant || '-'}</td>
            <td>${project.it_mw || 0}</td>
            <td>${project.lease_value ? '$' + project.lease_value.toLocaleString() + 'M' : '-'}</td>
            <td>${project.years || '-'}</td>
            <td>${project.annual_rev ? '$' + project.annual_rev + 'M' : '-'}</td>
            <td>${project.noi_pct || 85}%</td>
            <td><span class="status-badge ${statusClass}">${project.status || 'Unknown'}</span></td>
            <td class="positive">$${dcfValue.toFixed(0)}M</td>
            <td>${project.source_url ? `<a href="${project.source_url}" target="_blank" class="source-link">Source</a>` : '-'}</td>
            <td>
                <button class="btn btn-secondary" onclick="editHpcProject(${project.id})" style="padding: 4px 8px; font-size: 10px;">Edit</button>
                <button class="btn btn-secondary" onclick="deleteHpcProject(${project.id})" style="padding: 4px 8px; font-size: 10px;">Del</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Update summary cards
    document.getElementById('hpc-lease-count').textContent = filteredProjects.length;
    document.getElementById('hpc-total-mw').textContent = totalMw.toFixed(0) + ' MW';
    document.getElementById('hpc-total-contract').textContent = '$' + (totalContract / 1000).toFixed(1) + 'B';
    document.getElementById('hpc-dcf-value').textContent = '$' + (totalDcf / 1000).toFixed(1) + 'B';
}

// ============================================================
// HPC PROJECT MANAGEMENT
// ============================================================
function seedHpcProjects() {
    hpcProjects = getHpcSeedData();
    saveData();
    renderHpcTable();
    renderDashboard();
    populateFilters();
}

function openHpcModal(projectId = null) {
    const modal = document.getElementById('hpc-modal');
    const form = document.getElementById('hpc-form');
    const title = document.getElementById('hpc-modal-title');

    form.reset();
    document.getElementById('hpc-id').value = '';

    if (projectId) {
        const project = hpcProjects.find(p => p.id === projectId);
        if (project) {
            title.textContent = 'Edit HPC Project';
            document.getElementById('hpc-id').value = project.id;
            document.getElementById('hpc-ticker').value = project.ticker;
            document.getElementById('hpc-name').value = project.name;
            document.getElementById('hpc-tenant').value = project.tenant || '';
            document.getElementById('hpc-mw').value = project.it_mw;
            document.getElementById('hpc-lease-value').value = project.lease_value || '';
            document.getElementById('hpc-years').value = project.years || '';
            document.getElementById('hpc-annual-rev').value = project.annual_rev || '';
            document.getElementById('hpc-noi-pct').value = project.noi_pct || 85;
            document.getElementById('hpc-status').value = project.status || 'Contracted';
            document.getElementById('hpc-credit').value = project.credit || 'investment_grade';
            document.getElementById('hpc-source-url').value = project.source_url || '';
            document.getElementById('hpc-notes').value = project.notes || '';
        }
    } else {
        title.textContent = 'Add HPC Project';
    }

    modal.classList.add('active');
}

function closeHpcModal() {
    document.getElementById('hpc-modal').classList.remove('active');
}

function editHpcProject(id) {
    openHpcModal(id);
}

async function deleteHpcProject(id) {
    if (confirm('Delete this HPC project?')) {
        hpcProjects = hpcProjects.filter(p => p.id !== id);
        await saveData();
        renderHpcTable();
        renderDashboard();
    }
}

// Form submission
document.getElementById('hpc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('hpc-id').value;
    const project = {
        id: id ? parseInt(id) : Date.now(),
        ticker: document.getElementById('hpc-ticker').value,
        name: document.getElementById('hpc-name').value,
        tenant: document.getElementById('hpc-tenant').value,
        it_mw: parseFloat(document.getElementById('hpc-mw').value) || 0,
        lease_value: parseFloat(document.getElementById('hpc-lease-value').value) || 0,
        years: parseFloat(document.getElementById('hpc-years').value) || 0,
        annual_rev: parseFloat(document.getElementById('hpc-annual-rev').value) || 0,
        noi_pct: parseFloat(document.getElementById('hpc-noi-pct').value) || 85,
        status: document.getElementById('hpc-status').value,
        credit: document.getElementById('hpc-credit').value,
        source_url: document.getElementById('hpc-source-url').value,
        notes: document.getElementById('hpc-notes').value
    };

    if (id) {
        const index = hpcProjects.findIndex(p => p.id === parseInt(id));
        if (index !== -1) {
            hpcProjects[index] = project;
        }
    } else {
        hpcProjects.push(project);
    }

    await saveData();
    closeHpcModal();
    renderHpcTable();
    renderDashboard();
});

// ============================================================
// FILTERS
// ============================================================
function populateFilters() {
    const tickers = [...new Set(hpcProjects.map(p => p.ticker))].sort();

    const hpcFilter = document.getElementById('hpc-ticker-filter');
    if (hpcFilter) {
        hpcFilter.innerHTML = '<option value="">All</option>';
        tickers.forEach(ticker => {
            hpcFilter.innerHTML += `<option value="${ticker}">${ticker}</option>`;
        });
    }
}

document.getElementById('hpc-ticker-filter')?.addEventListener('change', renderHpcTable);
document.getElementById('hpc-cap-rate')?.addEventListener('change', () => {
    renderHpcTable();
    renderDashboard();
});

// ============================================================
// UTILITIES
// ============================================================
function resetAllOverrides() {
    if (confirm('Reset all miner overrides and fidoodle factors?')) {
        minerOverrides = {};
        fidoodleFactors = {};
        saveData();
        renderDashboard();
    }
}

function exportData() {
    let csv = 'Ticker,Price,Mkt Cap,HODL Val,Cash,Debt,FD Shares,Mining MW,HPC MW\n';

    Object.keys(MINER_DATA).forEach(ticker => {
        const miner = MINER_DATA[ticker];
        const hodlValue = miner.btc * btcPrice / 1e6;
        const hpcMw = hpcProjects.filter(p => p.ticker === ticker).reduce((sum, p) => sum + (p.it_mw || 0), 0);

        csv += `${ticker},N/A,N/A,${hodlValue.toFixed(0)},${miner.cash},${miner.debt},${miner.fdShares},${miner.miningMW},${hpcMw}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'miner_valuation_export.csv';
    a.click();
}

// Global fidoodle factor
document.getElementById('global-fidoodle')?.addEventListener('change', (e) => {
    const value = parseFloat(e.target.value);
    Object.keys(MINER_DATA).forEach(ticker => {
        fidoodleFactors[ticker] = value;
    });
    saveData();
    renderDashboard();
});
