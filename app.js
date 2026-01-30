/**
 * BTC Miner Valuation Terminal v9
 * 3-Tier Hierarchical Data Model: Company → Site → Capacity Phase → Tenancy
 */

// =====================================================
// GLOBAL STATE
// =====================================================

let DATA = {
    companies: [],
    sites: [],
    capacity_phases: [],
    tenancies: []
};

// Lookup maps for fast access
let COMPANY_MAP = {};      // ticker -> company
let SITE_MAP = {};         // site_id -> site
let PHASE_MAP = {};        // phase_id -> phase
let TENANCY_MAP = {};      // tenancy_id -> tenancy

// Sites grouped by company
let SITES_BY_COMPANY = {}; // ticker -> [sites]
let PHASES_BY_SITE = {};   // site_id -> [phases]
let TENANCIES_BY_PHASE = {}; // phase_id -> [tenancies]

// Stock prices
let stockPrices = {};

// User overrides (stored by tenancy ID)
let tenancyOverrides = {};

// Global valuation factors
let factors = {
    btcPrice: 100000,
    baseCap: 0.08,
    baseNoiPerMw: 1.2,
    defaultTerm: 15,
    escalator: 2.5,
    fidoodleDefault: 1.0,
    btcMining: {
        ebitdaPerMw: 0.75,
        ebitdaMultiple: 6
    }
};

// UI State
let currentTab = 'dashboard';
let dashboardSortColumn = 'ticker';
let dashboardSortDirection = 'asc';
let projectsSortColumn = 'ticker';
let projectsSortDirection = 'asc';
let expandedSites = new Set();
let expandedPhases = new Set();

// =====================================================
// DATA LOADING
// =====================================================

async function loadData() {
    try {
        const response = await fetch('seed-data.json');
        const data = await response.json();

        DATA = {
            companies: data.companies || [],
            sites: data.sites || [],
            capacity_phases: data.capacity_phases || [],
            tenancies: data.tenancies || []
        };

        // Build lookup maps
        buildLookupMaps();

        // Load saved overrides from localStorage
        loadOverrides();

        // Fetch live prices
        await fetchPrices();

        // Render UI
        renderDashboard();
        renderProjectsHierarchy();
        renderMap();

        console.log(`Loaded: ${DATA.companies.length} companies, ${DATA.sites.length} sites, ${DATA.capacity_phases.length} phases, ${DATA.tenancies.length} tenancies`);

    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function buildLookupMaps() {
    // Company map
    COMPANY_MAP = {};
    DATA.companies.forEach(c => {
        COMPANY_MAP[c.ticker] = c;
    });

    // Site map and grouping
    SITE_MAP = {};
    SITES_BY_COMPANY = {};
    DATA.sites.forEach(s => {
        SITE_MAP[s.id] = s;
        if (!SITES_BY_COMPANY[s.ticker]) {
            SITES_BY_COMPANY[s.ticker] = [];
        }
        SITES_BY_COMPANY[s.ticker].push(s);
    });

    // Phase map and grouping
    PHASE_MAP = {};
    PHASES_BY_SITE = {};
    DATA.capacity_phases.forEach(p => {
        PHASE_MAP[p.id] = p;
        if (!PHASES_BY_SITE[p.site_id]) {
            PHASES_BY_SITE[p.site_id] = [];
        }
        PHASES_BY_SITE[p.site_id].push(p);
    });

    // Tenancy map and grouping
    TENANCY_MAP = {};
    TENANCIES_BY_PHASE = {};
    DATA.tenancies.forEach(t => {
        TENANCY_MAP[t.id] = t;
        if (!TENANCIES_BY_PHASE[t.capacity_phase_id]) {
            TENANCIES_BY_PHASE[t.capacity_phase_id] = [];
        }
        TENANCIES_BY_PHASE[t.capacity_phase_id].push(t);
    });
}

function loadOverrides() {
    try {
        const saved = localStorage.getItem('miner-app-v9-overrides');
        if (saved) {
            tenancyOverrides = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Could not load overrides:', e);
    }
}

function saveOverrides() {
    try {
        localStorage.setItem('miner-app-v9-overrides', JSON.stringify(tenancyOverrides));
    } catch (e) {
        console.warn('Could not save overrides:', e);
    }
}

// =====================================================
// PRICE FETCHING
// =====================================================

async function fetchPrices() {
    // Fetch BTC price
    try {
        const btcResponse = await fetch('https://api.coindesk.com/v1/bpi/currentprice.json');
        const btcData = await btcResponse.json();
        factors.btcPrice = btcData.bpi.USD.rate_float;
        document.getElementById('btc-price').textContent = `$${Math.round(factors.btcPrice).toLocaleString()}`;
    } catch (e) {
        console.warn('Could not fetch BTC price:', e);
        document.getElementById('btc-price').textContent = '$100,000';
    }

    // Fetch stock prices
    const tickers = DATA.companies.map(c => c.ticker);
    for (const ticker of tickers) {
        try {
            // Using a proxy or mock for demo - in production use real API
            stockPrices[ticker] = {
                price: getDefaultStockPrice(ticker),
                change: (Math.random() - 0.5) * 10
            };
        } catch (e) {
            stockPrices[ticker] = { price: 0, change: 0 };
        }
    }
}

function getDefaultStockPrice(ticker) {
    // Default prices for demo
    const defaults = {
        MARA: 18.50, RIOT: 12.30, CLSK: 11.80, CIFR: 6.20, CORZ: 14.50,
        WULF: 5.80, HUT: 22.40, IREN: 12.60, BITF: 2.10, HIVE: 3.40,
        GLXY: 18.90, APLD: 8.50, BTDR: 15.20, ABTC: 0.45, SLNH: 2.80,
        FUFU: 4.20, BTBT: 3.50
    };
    return defaults[ticker] || 10.00;
}

// =====================================================
// VALUATION CALCULATIONS
// =====================================================

/**
 * Calculate the value of a single tenancy
 */
function calculateTenancyValue(tenancy, overrides = {}) {
    const phase = PHASE_MAP[tenancy.capacity_phase_id];
    const site = phase ? SITE_MAP[phase.site_id] : null;

    if (!phase || !site) {
        return { value: 0, components: {}, isBtcSite: false };
    }

    const itMw = overrides.itMw || phase.capacity.it_mw || 0;

    // Determine if this is a BTC mining tenancy
    const isBtcMining = tenancy.use_type === 'BTC_MINING' || tenancy.use_type === 'BTC_HOSTING';

    if (isBtcMining && tenancy.status === 'active') {
        return calculateBtcMiningValue(tenancy, phase, site, overrides);
    } else if (tenancy.status === 'potential') {
        // This is an HPC conversion option - value is calculated separately
        return calculateHpcConversionOption(tenancy, phase, site, overrides);
    } else {
        return calculateHpcLeaseValue(tenancy, phase, site, overrides);
    }
}

/**
 * Calculate BTC mining tenancy value
 */
function calculateBtcMiningValue(tenancy, phase, site, overrides = {}) {
    const itMw = overrides.itMw || tenancy.contract?.mw_allocated || phase.capacity.it_mw || 0;
    const miningEbitda = overrides.miningEbitdaAnnualM ||
        tenancy.btc_mining?.mining_ebitda_annual_m ||
        (itMw * factors.btcMining.ebitdaPerMw);
    const multiple = overrides.btcEbitdaMultiple || factors.btcMining.ebitdaMultiple;
    const locationMult = getLocationMultiplier(site.location?.country, site.grid);
    const fidoodle = overrides.fidoodle ?? factors.fidoodleDefault;

    const miningValue = miningEbitda * multiple * locationMult * fidoodle;

    return {
        value: miningValue,
        isBtcSite: true,
        components: {
            miningValue: miningValue,
            conversionValue: 0,
            miningEbitda: miningEbitda,
            ebitdaMultiple: multiple,
            locationMult: locationMult,
            fidoodle: fidoodle,
            itMw: itMw
        }
    };
}

/**
 * Calculate HPC/AI lease tenancy value
 */
function calculateHpcLeaseValue(tenancy, phase, site, overrides = {}) {
    const itMw = overrides.itMw || tenancy.contract?.mw_allocated || phase.capacity.it_mw || 0;

    // NOI calculation
    let noi;
    if (overrides.noi) {
        noi = overrides.noi;
    } else if (tenancy.contract?.annual_revenue_m && tenancy.contract?.noi_pct) {
        const noiPct = tenancy.contract.noi_pct > 1 ? tenancy.contract.noi_pct / 100 : tenancy.contract.noi_pct;
        noi = tenancy.contract.annual_revenue_m * noiPct;
    } else {
        noi = itMw * factors.baseNoiPerMw;
    }

    // Cap rate
    const baseCap = overrides.capOverride || factors.baseCap;
    const creditMult = getCreditMultiplier(tenancy.tenant);
    const capEff = baseCap / creditMult;

    // Term factor
    const term = overrides.term || tenancy.contract?.term_years || factors.defaultTerm;
    const termFactor = getTermFactor(term);

    // Risk multipliers
    const fCredit = creditMult;
    const fBuild = getBuildStatusMultiplier(phase.status);
    const fTenant = getTenantConcentrationMultiplier(tenancy.tenant);
    const fSize = getSizeMultiplier(itMw);
    const fLocation = getLocationMultiplier(site.location?.country, site.grid);
    const fCompute = tenancy.compute_model === 'gpu_cloud' ? 1.75 : 1.0;

    const combinedMult = fCredit * fBuild * fTenant * fSize * fLocation * fCompute;
    const fidoodle = overrides.fidoodle ?? factors.fidoodleDefault;

    // Final value
    const value = (noi / capEff) * termFactor * combinedMult * fidoodle;

    return {
        value: value,
        isBtcSite: false,
        components: {
            noi: noi,
            capEff: capEff,
            termFactor: termFactor,
            combinedMult: combinedMult,
            fidoodle: fidoodle,
            fCredit: fCredit,
            fBuild: fBuild,
            fTenant: fTenant,
            fSize: fSize,
            fLocation: fLocation,
            fCompute: fCompute,
            itMw: itMw,
            term: term
        }
    };
}

/**
 * Calculate HPC conversion option value for BTC mining sites
 */
function calculateHpcConversionOption(tenancy, phase, site, overrides = {}) {
    if (!tenancy.conversion) {
        return { value: 0, components: {}, isBtcSite: false };
    }

    const convProb = overrides.conversionProbability ?? tenancy.conversion.conversion_probability ?? 0.5;

    // Calculate what the HPC value would be if converted
    const hypotheticalHpcTenancy = {
        ...tenancy,
        status: 'active',
        use_type: 'HPC_LEASE',
        contract: {
            ...tenancy.contract,
            mw_allocated: phase.capacity.it_mw
        }
    };

    const hpcValue = calculateHpcLeaseValue(hypotheticalHpcTenancy, phase, site, overrides);

    // Apply conversion probability
    const optionValue = hpcValue.value * convProb;

    return {
        value: optionValue,
        isBtcSite: false,
        isConversionOption: true,
        components: {
            ...hpcValue.components,
            conversionProbability: convProb,
            fullHpcValue: hpcValue.value
        }
    };
}

/**
 * Calculate total value for a capacity phase (sum of active tenancies)
 */
function calculatePhaseValue(phase) {
    const tenancies = TENANCIES_BY_PHASE[phase.id] || [];
    let totalValue = 0;
    let miningValue = 0;
    let hpcValue = 0;
    let conversionValue = 0;

    tenancies.forEach(t => {
        const overrides = tenancyOverrides[t.id] || {};
        const val = calculateTenancyValue(t, overrides);

        if (t.status === 'potential') {
            conversionValue += val.value;
        } else if (val.isBtcSite) {
            miningValue += val.value;
        } else {
            hpcValue += val.value;
        }
        totalValue += val.value;
    });

    return {
        totalValue,
        miningValue,
        hpcValue,
        conversionValue
    };
}

/**
 * Calculate total value for a site (sum of all phases)
 */
function calculateSiteValue(site) {
    const phases = PHASES_BY_SITE[site.id] || [];
    let totalValue = 0;
    let miningValue = 0;
    let hpcValue = 0;
    let conversionValue = 0;
    let totalMw = 0;

    phases.forEach(p => {
        const val = calculatePhaseValue(p);
        totalValue += val.totalValue;
        miningValue += val.miningValue;
        hpcValue += val.hpcValue;
        conversionValue += val.conversionValue;
        totalMw += p.capacity.it_mw || 0;
    });

    return {
        totalValue,
        miningValue,
        hpcValue,
        conversionValue,
        totalMw
    };
}

/**
 * Calculate total valuation for a company
 */
function calculateCompanyValuation(ticker) {
    const company = COMPANY_MAP[ticker];
    if (!company) return null;

    const sites = SITES_BY_COMPANY[ticker] || [];
    const btcPrice = factors.btcPrice;

    let miningEV = 0;
    let hpcContractedEV = 0;
    let pipelineEV = 0;
    let conversionEV = 0;
    let miningMw = 0;
    let hpcMw = 0;
    let pipelineMw = 0;

    sites.forEach(site => {
        const phases = PHASES_BY_SITE[site.id] || [];

        phases.forEach(phase => {
            const tenancies = TENANCIES_BY_PHASE[phase.id] || [];

            tenancies.forEach(t => {
                const overrides = tenancyOverrides[t.id] || {};
                const val = calculateTenancyValue(t, overrides);

                if (t.status === 'potential') {
                    // HPC conversion option
                    conversionEV += val.value;
                } else if (val.isBtcSite) {
                    // BTC mining
                    miningEV += val.value;
                    miningMw += t.contract?.mw_allocated || phase.capacity.it_mw || 0;
                } else {
                    // HPC/AI lease
                    const isContracted = phase.status === 'Operational' ||
                        (t.contract?.type === 'BINDING' && phase.status === 'Under Construction');

                    if (isContracted) {
                        hpcContractedEV += val.value;
                        hpcMw += t.contract?.mw_allocated || phase.capacity.it_mw || 0;
                    } else {
                        pipelineEV += val.value;
                        pipelineMw += t.contract?.mw_allocated || phase.capacity.it_mw || 0;
                    }
                }
            });
        });
    });

    // Company-level values
    const hodlValue = (company.btc_holdings || 0) * btcPrice / 1e6;
    const cash = company.cash_m || 0;
    const debt = company.debt_m || 0;
    const fdShares = company.fd_shares_m || 1;

    // Total equity value
    const operatingEV = miningEV + hpcContractedEV + pipelineEV + conversionEV;
    const equityValue = operatingEV + hodlValue + cash - debt;
    const fairValue = equityValue / fdShares;

    // Stock price and upside
    const stockPrice = stockPrices[ticker]?.price || 0;
    const priceChange = stockPrices[ticker]?.change || 0;
    const upside = stockPrice > 0 ? ((fairValue / stockPrice - 1) * 100) : 0;

    return {
        ticker,
        company,
        hodlValue,
        cash,
        debt,
        fdShares,
        miningEV,
        hpcContractedEV,
        pipelineEV,
        conversionEV,
        operatingEV,
        equityValue,
        fairValue,
        stockPrice,
        priceChange,
        upside,
        miningMw,
        hpcMw,
        pipelineMw,
        totalMw: miningMw + hpcMw + pipelineMw,
        sites: sites.length
    };
}

// =====================================================
// VALUATION MULTIPLIERS
// =====================================================

function getLocationMultiplier(country, grid) {
    const countryMults = {
        'USA': 1.0, 'Canada': 0.95, 'Norway': 0.9, 'Sweden': 0.9,
        'UAE': 0.85, 'Paraguay': 0.7, 'Ethiopia': 0.6, 'Bhutan': 0.65
    };

    const gridMults = {
        'ERCOT': 1.05, 'PJM': 1.0, 'MISO': 0.95, 'NYISO': 0.95,
        'SPP': 0.9, 'CAISO': 0.9
    };

    const countryMult = countryMults[country] || 0.8;
    const gridMult = gridMults[grid] || 1.0;

    return countryMult * gridMult;
}

function getCreditMultiplier(tenant) {
    const hyperscalers = ['Microsoft', 'Amazon', 'AWS', 'Google', 'Meta', 'Oracle'];
    const tier1 = ['CoreWeave', 'Anthropic', 'OpenAI'];
    const tier2 = ['Fluidstack', 'Core42', 'G42'];

    if (!tenant || tenant === 'Self' || tenant === 'TBD') return 0.8;
    if (hyperscalers.some(h => tenant.includes(h))) return 1.25;
    if (tier1.some(t => tenant.includes(t))) return 1.1;
    if (tier2.some(t => tenant.includes(t))) return 1.0;
    return 0.9;
}

function getBuildStatusMultiplier(status) {
    const mults = {
        'Operational': 1.0,
        'Under Construction': 0.85,
        'Permitted': 0.6,
        'Pipeline': 0.4
    };
    return mults[status] || 0.5;
}

function getTenantConcentrationMultiplier(tenant) {
    // Single tenant risk discount
    return tenant && tenant !== 'Self' ? 0.95 : 1.0;
}

function getSizeMultiplier(mw) {
    if (mw >= 500) return 1.1;
    if (mw >= 200) return 1.05;
    if (mw >= 100) return 1.0;
    if (mw >= 50) return 0.95;
    return 0.9;
}

function getTermFactor(years) {
    // Longer terms = more valuable
    if (years >= 20) return 1.2;
    if (years >= 15) return 1.1;
    if (years >= 10) return 1.0;
    if (years >= 5) return 0.85;
    return 0.7;
}

function isHyperscaler(tenant) {
    const hyperscalers = ['Microsoft', 'Amazon', 'AWS', 'Google', 'Meta', 'Oracle', 'CoreWeave', 'Anthropic'];
    return hyperscalers.some(h => (tenant || '').includes(h));
}

// =====================================================
// DASHBOARD RENDERING
// =====================================================

// Track selected company for persistent panel
let selectedTicker = null;

function renderDashboard() {
    const tbody = document.getElementById('dashboard-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Calculate valuations for all companies
    const companyVals = DATA.companies.map(c => calculateCompanyValuation(c.ticker)).filter(v => v);

    // Sort
    companyVals.sort((a, b) => {
        let aVal, bVal;
        switch (dashboardSortColumn) {
            case 'ticker': aVal = a.ticker; bVal = b.ticker; break;
            case 'price': aVal = a.stockPrice; bVal = b.stockPrice; break;
            case 'netLiquid': aVal = a.hodlValue + a.cash - a.debt; bVal = b.hodlValue + b.cash - b.debt; break;
            case 'miningMw': aVal = a.miningMw; bVal = b.miningMw; break;
            case 'hpcMw': aVal = a.hpcMw + a.pipelineMw; bVal = b.hpcMw + b.pipelineMw; break;
            case 'miningEv': aVal = a.miningEV; bVal = b.miningEV; break;
            case 'hpcEvContracted': aVal = a.hpcContractedEV; bVal = b.hpcContractedEV; break;
            case 'hpcEvPipeline': aVal = a.pipelineEV; bVal = b.pipelineEV; break;
            case 'fairValue': aVal = a.fairValue; bVal = b.fairValue; break;
            case 'upside': aVal = a.upside; bVal = b.upside; break;
            default: aVal = 0; bVal = 0;
        }
        if (typeof aVal === 'string') {
            return dashboardSortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return dashboardSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Totals
    let totalBtc = 0, totalMiningEV = 0, totalHpcContracted = 0, totalPipeline = 0, totalEquity = 0;

    companyVals.forEach(v => {
        totalBtc += v.company.btc_holdings || 0;
        totalMiningEV += v.miningEV;
        totalHpcContracted += v.hpcContractedEV;
        totalPipeline += v.pipelineEV + v.conversionEV;
        totalEquity += v.equityValue;

        // Calculate Net Liquid Assets
        const netLiquid = v.hodlValue + v.cash - v.debt;

        const tr = document.createElement('tr');
        tr.className = `dashboard-row ${selectedTicker === v.ticker ? 'selected' : ''}`;
        tr.dataset.ticker = v.ticker;

        tr.innerHTML = `
            <td class="col-ticker">
                <span class="ticker clickable-ticker" data-ticker="${v.ticker}">${v.ticker}</span>
            </td>
            <td class="col-right ${v.priceChange >= 0 ? 'positive' : 'negative'}">$${v.stockPrice > 0 ? v.stockPrice.toFixed(2) : '--'}</td>
            <td class="net-liquid-cell col-right">
                <span class="${netLiquid >= 0 ? 'positive' : 'negative'}">${Math.round(netLiquid).toLocaleString()}</span>
                <div class="net-liquid-tooltip">
                    <div class="tooltip-row">
                        <span class="tooltip-label">HODL Value:</span>
                        <span class="tooltip-value hodl">$${Math.round(v.hodlValue).toLocaleString()}M</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Cash:</span>
                        <span class="tooltip-value cash">$${Math.round(v.cash).toLocaleString()}M</span>
                    </div>
                    <div class="tooltip-row">
                        <span class="tooltip-label">Debt:</span>
                        <span class="tooltip-value debt">($${Math.round(v.debt).toLocaleString()}M)</span>
                    </div>
                </div>
            </td>
            <td class="col-mw col-right">${Math.round(v.miningMw).toLocaleString()}</td>
            <td class="col-mw col-right">${Math.round(v.hpcMw + v.pipelineMw).toLocaleString()}</td>
            <td class="col-ev col-right">${Math.round(v.miningEV).toLocaleString()}</td>
            <td class="col-ev col-right">${Math.round(v.hpcContractedEV).toLocaleString()}</td>
            <td class="col-ev col-right">${Math.round(v.pipelineEV + v.conversionEV).toLocaleString()}</td>
            <td class="col-right col-fair-value">$${v.fairValue.toFixed(2)}</td>
            <td class="col-right ${v.upside >= 0 ? 'positive' : 'negative'}">${v.stockPrice > 0 ? (v.upside >= 0 ? '+' : '') + v.upside.toFixed(0) + '%' : '--'}</td>
        `;

        // Click on ticker to show company in persistent panel
        tr.querySelector('.clickable-ticker').addEventListener('click', (e) => {
            e.stopPropagation();
            selectCompany(v.ticker);
        });

        // Also allow clicking anywhere on the row
        tr.addEventListener('click', () => {
            selectCompany(v.ticker);
        });

        tbody.appendChild(tr);
    });

    // Update summary cards
    document.getElementById('total-btc').textContent = totalBtc.toLocaleString();
    document.getElementById('total-mining-ev').textContent = '$' + Math.round(totalMiningEV).toLocaleString() + 'M';
    document.getElementById('total-hpc-contracted').textContent = '$' + Math.round(totalHpcContracted).toLocaleString() + 'M';
    document.getElementById('total-pipeline').textContent = '$' + Math.round(totalPipeline).toLocaleString() + 'M';

    // If a company was previously selected, update the panel
    if (selectedTicker) {
        updatePersistentPanel(selectedTicker);
    }
}

/**
 * Select a company and show in persistent panel
 */
function selectCompany(ticker) {
    selectedTicker = ticker;

    // Update row highlighting
    document.querySelectorAll('.dashboard-row').forEach(row => {
        row.classList.toggle('selected', row.dataset.ticker === ticker);
    });

    // Update the persistent panel
    updatePersistentPanel(ticker);
}

/**
 * Update the persistent company panel
 */
function updatePersistentPanel(ticker) {
    const val = calculateCompanyValuation(ticker);
    if (!val) return;

    const company = COMPANY_MAP[ticker];
    const sites = SITES_BY_COMPANY[ticker] || [];

    // Hide placeholder, show content
    document.getElementById('panel-placeholder').style.display = 'none';
    const panelContent = document.getElementById('panel-content');
    panelContent.style.display = 'block';

    // Build panel HTML
    let html = `
        <div class="panel-header">
            <span class="panel-ticker">${ticker}</span>
            <span class="panel-name">${company?.name || ticker}</span>
        </div>

        <div class="panel-price-section">
            <div class="panel-price-row">
                <div class="panel-price-item">
                    <div class="panel-price-label">Price</div>
                    <div class="panel-price-value">${val.stockPrice > 0 ? '$' + val.stockPrice.toFixed(2) : '--'}</div>
                </div>
                <div class="panel-price-arrow">→</div>
                <div class="panel-price-item">
                    <div class="panel-price-label">Fair Value</div>
                    <div class="panel-price-value fair">$${val.fairValue.toFixed(2)}</div>
                </div>
                <div class="panel-upside ${val.upside < 0 ? 'negative' : ''}">
                    ${val.stockPrice > 0 ? (val.upside >= 0 ? '+' : '') + val.upside.toFixed(0) + '%' : '--'}
                </div>
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-title">Balance Sheet</div>
            <div class="panel-grid">
                <div class="panel-stat">
                    <div class="panel-stat-value hodl">${(company?.btc_holdings || 0).toLocaleString()}</div>
                    <div class="panel-stat-label">BTC Holdings</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-value hodl">$${Math.round(val.hodlValue).toLocaleString()}M</div>
                    <div class="panel-stat-label">HODL Value</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-value cash">$${Math.round(val.cash).toLocaleString()}M</div>
                    <div class="panel-stat-label">Cash</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-value debt">$${Math.round(val.debt).toLocaleString()}M</div>
                    <div class="panel-stat-label">Debt</div>
                </div>
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-title">Capacity (MW)</div>
            <div class="panel-grid">
                <div class="panel-stat">
                    <div class="panel-stat-value mw">${Math.round(val.miningMw).toLocaleString()}</div>
                    <div class="panel-stat-label">Mining</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-value mw">${Math.round(val.hpcMw).toLocaleString()}</div>
                    <div class="panel-stat-label">HPC Contracted</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-value mw">${Math.round(val.pipelineMw).toLocaleString()}</div>
                    <div class="panel-stat-label">Pipeline</div>
                </div>
                <div class="panel-stat">
                    <div class="panel-stat-value mw">${Math.round(val.totalMw).toLocaleString()}</div>
                    <div class="panel-stat-label">Total</div>
                </div>
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-title">Enterprise Value ($M)</div>
            <div class="panel-ev-breakdown">
                <div class="panel-ev-row">
                    <span class="panel-ev-label">Mining EV</span>
                    <span class="panel-ev-value">$${Math.round(val.miningEV).toLocaleString()}</span>
                </div>
                <div class="panel-ev-row">
                    <span class="panel-ev-label">HPC Contracted</span>
                    <span class="panel-ev-value">$${Math.round(val.hpcContractedEV).toLocaleString()}</span>
                </div>
                <div class="panel-ev-row">
                    <span class="panel-ev-label">Pipeline</span>
                    <span class="panel-ev-value">$${Math.round(val.pipelineEV).toLocaleString()}</span>
                </div>
                <div class="panel-ev-row">
                    <span class="panel-ev-label">Conversion Options</span>
                    <span class="panel-ev-value">$${Math.round(val.conversionEV).toLocaleString()}</span>
                </div>
                <div class="panel-ev-row total">
                    <span class="panel-ev-label">Total Operating EV</span>
                    <span class="panel-ev-value">$${Math.round(val.operatingEV).toLocaleString()}</span>
                </div>
                <div class="panel-ev-row total equity">
                    <span class="panel-ev-label">Equity Value</span>
                    <span class="panel-ev-value">$${Math.round(val.equityValue).toLocaleString()}</span>
                </div>
            </div>
        </div>

        <div class="panel-section">
            <div class="panel-section-title">Sites & Phases (${sites.length} sites)</div>
            <div class="panel-sites-list">
                ${sites.map(site => {
                    const siteVal = calculateSiteValue(site);
                    const phases = PHASES_BY_SITE[site.id] || [];
                    return `
                        <div class="panel-site-item">
                            <span class="panel-site-name">${site.name}</span>
                            <span class="panel-site-mw">${Math.round(site.power?.total_site_capacity_mw || 0)} MW</span>
                            <span class="panel-site-value">$${Math.round(siteVal.totalValue)}M</span>
                        </div>
                        ${phases.map(phase => {
                            const energization = phase.energization?.date_normalized;
                            const energizationStr = energization ? formatEnergizationDate(phase) : '';
                            return `
                                <div class="panel-phase-item">
                                    <span class="panel-phase-name">${phase.name}</span>
                                    <span class="panel-phase-status status-${phase.status.toLowerCase().replace(/\s+/g, '-')}">${phase.status}</span>
                                    <span class="panel-phase-mw">${Math.round(phase.capacity?.it_mw || 0)} MW</span>
                                    ${energizationStr ? `<span class="panel-phase-energization">${energizationStr}</span>` : ''}
                                </div>
                            `;
                        }).join('')}
                    `;
                }).join('')}
            </div>
        </div>

        <div class="panel-source">
            Source: <a href="${company?.source?.url || '#'}" target="_blank">${company?.source?.type || 'Company Records'}</a>
        </div>
    `;

    panelContent.innerHTML = html;
}

// =====================================================
// PROJECTS TABLE VIEW
// =====================================================

/**
 * Format location string - handles country-only locations (no comma)
 */
function formatLocation(state, country) {
    if (!country) return '';
    if (!state || state.trim() === '') return country;
    return `${state}, ${country}`;
}

/**
 * Format energization date from phase object
 */
function formatEnergizationDate(phase) {
    // Try different possible field locations
    const dateStr = phase?.energization?.date_normalized ||
                    phase?.energization_date ||
                    phase?.timeline?.energization ||
                    phase?.energization?.target;

    if (!dateStr) return '';

    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

/**
 * Get status CSS class
 */
function getStatusClass(status) {
    if (!status) return '';
    return 'status-' + status.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Projects sort state
 */
let projectsTableSort = { column: 'ticker', direction: 'asc' };

function renderProjectsHierarchy() {
    const container = document.getElementById('projects-hierarchy');
    if (!container) return;

    // Get filter values
    const tickerFilter = document.getElementById('project-ticker-filter')?.value || '';
    const statusFilter = document.getElementById('project-status-filter')?.value || '';
    const useFilter = document.getElementById('project-use-filter')?.value || '';

    // Build flat list of all rows (one per active tenancy)
    const rows = [];

    DATA.sites.forEach(site => {
        if (tickerFilter && site.ticker !== tickerFilter) return;

        const phases = PHASES_BY_SITE[site.id] || [];

        phases.forEach(phase => {
            if (statusFilter && phase.status !== statusFilter) return;

            const tenancies = TENANCIES_BY_PHASE[phase.id] || [];
            const activeTenancies = tenancies.filter(t => t.status === 'active');

            // If no active tenancies, still show the phase if it has capacity
            if (activeTenancies.length === 0 && phase.capacity?.it_mw > 0) {
                if (useFilter) return; // Skip if filtering by use type

                rows.push({
                    ticker: site.ticker,
                    siteName: site.name,
                    location: formatLocation(site.location?.state, site.location?.country),
                    phaseName: phase.name,
                    status: phase.status,
                    itMw: phase.capacity?.it_mw || 0,
                    energization: formatEnergizationDate(phase),
                    tenant: '—',
                    useType: '—',
                    contractType: '—',
                    term: null,
                    revenue: null,
                    value: 0,
                    tenancyId: null,
                    isPotential: false,
                    phase: phase,
                    site: site
                });
                return;
            }

            activeTenancies.forEach(tenancy => {
                if (useFilter && tenancy.use_type !== useFilter) return;

                const overrides = tenancyOverrides[tenancy.id] || {};
                const tenancyVal = calculateTenancyValue(tenancy, overrides);

                rows.push({
                    ticker: site.ticker,
                    siteName: site.name,
                    location: formatLocation(site.location?.state, site.location?.country),
                    phaseName: phase.name,
                    status: phase.status,
                    itMw: tenancy.contract?.mw_allocated || phase.capacity?.it_mw || 0,
                    energization: formatEnergizationDate(phase),
                    tenant: tenancy.tenant || 'Self',
                    useType: tenancy.use_type,
                    contractType: tenancy.contract?.type || '',
                    term: tenancy.contract?.term_years || null,
                    revenue: tenancy.contract?.annual_revenue_m || null,
                    value: tenancyVal.value,
                    tenancyId: tenancy.id,
                    isPotential: false,
                    phase: phase,
                    site: site
                });
            });

            // Also add potential (HPC conversion) tenancies
            const potentialTenancies = tenancies.filter(t => t.status === 'potential');
            potentialTenancies.forEach(tenancy => {
                if (useFilter && useFilter !== 'HPC_LEASE') return; // Show HPC conversions when filtering for HPC

                const overrides = tenancyOverrides[tenancy.id] || {};
                const tenancyVal = calculateTenancyValue(tenancy, overrides);

                rows.push({
                    ticker: site.ticker,
                    siteName: site.name,
                    location: formatLocation(site.location?.state, site.location?.country),
                    phaseName: phase.name,
                    status: 'Conversion',
                    itMw: phase.capacity?.it_mw || 0,
                    energization: tenancy.conversion?.target_date ? formatEnergizationDate({ energization: { date_normalized: tenancy.conversion.target_date }}) : '—',
                    tenant: tenancy.conversion?.potential_tenant || 'TBD',
                    useType: 'HPC_OPTION',
                    contractType: `${Math.round((tenancy.conversion?.conversion_probability || 0.5) * 100)}% prob`,
                    term: null,
                    revenue: null,
                    value: tenancyVal.value,
                    tenancyId: tenancy.id,
                    isPotential: true,
                    phase: phase,
                    site: site
                });
            });
        });
    });

    // Sort rows
    rows.sort((a, b) => {
        let aVal, bVal;
        switch (projectsTableSort.column) {
            case 'ticker': aVal = a.ticker; bVal = b.ticker; break;
            case 'site': aVal = a.siteName; bVal = b.siteName; break;
            case 'location': aVal = a.location; bVal = b.location; break;
            case 'status': aVal = a.status; bVal = b.status; break;
            case 'mw': aVal = a.itMw; bVal = b.itMw; break;
            case 'energization': aVal = a.energization || 'z'; bVal = b.energization || 'z'; break;
            case 'tenant': aVal = a.tenant; bVal = b.tenant; break;
            case 'use': aVal = a.useType; bVal = b.useType; break;
            case 'value': aVal = a.value; bVal = b.value; break;
            default: aVal = a.ticker; bVal = b.ticker;
        }

        if (typeof aVal === 'string') {
            const cmp = aVal.localeCompare(bVal);
            return projectsTableSort.direction === 'asc' ? cmp : -cmp;
        }
        return projectsTableSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    // Render table
    let html = `
        <table class="projects-table">
            <thead>
                <tr>
                    <th class="sortable ${projectsTableSort.column === 'ticker' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="ticker">Ticker</th>
                    <th class="sortable ${projectsTableSort.column === 'site' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="site">Site</th>
                    <th class="sortable ${projectsTableSort.column === 'location' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="location">Location</th>
                    <th>Bldg</th>
                    <th class="sortable ${projectsTableSort.column === 'status' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="status">Status</th>
                    <th class="sortable ${projectsTableSort.column === 'mw' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="mw" style="text-align:right">MW</th>
                    <th class="sortable ${projectsTableSort.column === 'energization' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="energization">Energized</th>
                    <th class="sortable ${projectsTableSort.column === 'tenant' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="tenant">Tenant</th>
                    <th class="sortable ${projectsTableSort.column === 'use' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="use">Use</th>
                    <th>Contract</th>
                    <th class="sortable ${projectsTableSort.column === 'value' ? 'sorted-' + projectsTableSort.direction : ''}" data-sort="value" style="text-align:right">Value</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
    `;

    rows.forEach(row => {
        const statusClass = getStatusClass(row.status);
        const useTypeLabel = formatUseType(row.useType);
        const useClass = row.useType ? 'use-' + row.useType.toLowerCase().replace('_', '-') : '';

        html += `
            <tr class="${row.isPotential ? 'potential-row' : ''}">
                <td class="col-ticker"><span class="ticker">${row.ticker}</span></td>
                <td class="col-site">${row.siteName}</td>
                <td class="col-location">${row.location}</td>
                <td class="col-phase">${row.phaseName}</td>
                <td class="col-status"><span class="status-badge ${statusClass}">${row.status}</span></td>
                <td class="col-mw" style="text-align:right">${Math.round(row.itMw)}</td>
                <td class="col-energization">${row.energization || '—'}</td>
                <td class="col-tenant ${row.tenant === 'Self' || row.tenant === '—' ? 'dim' : ''}">${row.tenant}</td>
                <td class="col-use"><span class="use-badge ${useClass}">${useTypeLabel}</span></td>
                <td class="col-contract">
                    ${row.contractType || ''}
                    ${row.term ? ` · ${row.term}y` : ''}
                    ${row.revenue ? ` · $${Math.round(row.revenue)}M/yr` : ''}
                </td>
                <td class="col-value ${row.isPotential ? 'potential' : ''}" style="text-align:right">$${Math.round(row.value).toLocaleString()}M</td>
                <td class="col-actions">
                    ${row.tenancyId ? `<button class="btn-edit-tenancy" data-tenancy-id="${row.tenancyId}" title="Edit overrides">⚙</button>` : ''}
                </td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
        <div class="projects-summary">
            Showing ${rows.length} entries ·
            Total: ${Math.round(rows.reduce((sum, r) => sum + r.itMw, 0)).toLocaleString()} MW ·
            $${Math.round(rows.reduce((sum, r) => sum + r.value, 0)).toLocaleString()}M
        </div>
    `;

    container.innerHTML = html;

    // Add sort handlers
    container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.dataset.sort;
            if (projectsTableSort.column === sortKey) {
                projectsTableSort.direction = projectsTableSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                projectsTableSort.column = sortKey;
                projectsTableSort.direction = 'asc';
            }
            renderProjectsHierarchy();
        });
    });

    // Add edit button handlers
    container.querySelectorAll('.btn-edit-tenancy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openTenancyModal(btn.dataset.tenancyId);
        });
    });
}

// Legacy functions - kept for backwards compatibility but no longer used
function toggleSiteExpansion(siteId) {
    // No-op - flat view always shows all content
}

function togglePhaseExpansion(phaseId) {
    // No-op - flat view always shows all content
}

function formatUseType(useType) {
    const labels = {
        'BTC_MINING': 'BTC Mining',
        'BTC_HOSTING': 'BTC Hosting',
        'HPC_LEASE': 'HPC Lease',
        'GPU_CLOUD': 'GPU Cloud',
        'MIXED': 'Mixed',
        'DEVELOPMENT': 'Development',
        'OTHER': 'Other'
    };
    return labels[useType] || useType;
}

// =====================================================
// COMPANY PANEL (Slide-out - for non-dashboard views)
// =====================================================

function openCompanyPanel(ticker) {
    // If on dashboard, use the persistent panel instead
    if (currentTab === 'dashboard') {
        selectCompany(ticker);
        return;
    }

    const val = calculateCompanyValuation(ticker);
    if (!val) return;

    const company = COMPANY_MAP[ticker];
    const sites = SITES_BY_COMPANY[ticker] || [];

    // Populate header
    document.getElementById('company-panel-ticker').textContent = ticker;
    document.getElementById('company-panel-name').textContent = company?.name || ticker;

    // Price section
    document.getElementById('company-current-price').textContent = val.stockPrice > 0 ? `$${val.stockPrice.toFixed(2)}` : '--';
    const priceChangeEl = document.getElementById('company-price-change');
    priceChangeEl.textContent = val.stockPrice > 0 ? `${val.priceChange >= 0 ? '+' : ''}${val.priceChange.toFixed(1)}%` : '';
    priceChangeEl.className = `price-change ${val.priceChange >= 0 ? 'positive' : 'negative'}`;

    document.getElementById('company-fair-value').textContent = `$${val.fairValue.toFixed(2)}`;

    const upsideBox = document.getElementById('company-upside-box');
    const upsideEl = document.getElementById('company-upside');
    upsideEl.textContent = val.stockPrice > 0 ? `${val.upside >= 0 ? '+' : ''}${val.upside.toFixed(0)}%` : '--';
    upsideBox.className = `upside-box ${val.upside < 0 ? 'negative' : ''}`;

    // Valuation bar
    const positives = val.hodlValue + val.cash + val.miningEV + val.hpcContractedEV + val.pipelineEV + val.conversionEV;
    const barContainer = document.getElementById('company-valuation-bar');

    let barHtml = '';
    if (val.hodlValue > 0) {
        const pct = (val.hodlValue / positives * 100).toFixed(1);
        barHtml += `<div class="valuation-bar-segment hodl" style="width: ${pct}%;" title="HODL: $${Math.round(val.hodlValue)}M">${pct > 8 ? `$${Math.round(val.hodlValue)}M` : ''}</div>`;
    }
    if (val.cash > 0) {
        const pct = (val.cash / positives * 100).toFixed(1);
        barHtml += `<div class="valuation-bar-segment cash" style="width: ${pct}%;" title="Cash: $${Math.round(val.cash)}M">${pct > 8 ? `$${Math.round(val.cash)}M` : ''}</div>`;
    }
    if (val.miningEV > 0) {
        const pct = (val.miningEV / positives * 100).toFixed(1);
        barHtml += `<div class="valuation-bar-segment mining" style="width: ${pct}%;" title="BTC Mining: $${Math.round(val.miningEV)}M">${pct > 8 ? `$${Math.round(val.miningEV)}M` : ''}</div>`;
    }
    if (val.hpcContractedEV > 0) {
        const pct = (val.hpcContractedEV / positives * 100).toFixed(1);
        barHtml += `<div class="valuation-bar-segment hpc" style="width: ${pct}%;" title="HPC Contracted: $${Math.round(val.hpcContractedEV)}M">${pct > 8 ? `$${Math.round(val.hpcContractedEV)}M` : ''}</div>`;
    }
    if (val.pipelineEV + val.conversionEV > 0) {
        const pipeTotal = val.pipelineEV + val.conversionEV;
        const pct = (pipeTotal / positives * 100).toFixed(1);
        barHtml += `<div class="valuation-bar-segment pipeline" style="width: ${pct}%;" title="Pipeline: $${Math.round(pipeTotal)}M">${pct > 8 ? `$${Math.round(pipeTotal)}M` : ''}</div>`;
    }
    barContainer.innerHTML = barHtml;

    // Legend
    document.getElementById('company-valuation-legend').innerHTML = `
        ${val.hodlValue > 0 ? '<span class="legend-item"><span class="legend-dot hodl"></span>HODL</span>' : ''}
        ${val.cash > 0 ? '<span class="legend-item"><span class="legend-dot cash"></span>Cash</span>' : ''}
        ${val.miningEV > 0 ? '<span class="legend-item"><span class="legend-dot mining"></span>BTC Mining</span>' : ''}
        ${val.hpcContractedEV > 0 ? '<span class="legend-item"><span class="legend-dot hpc"></span>HPC Contracted</span>' : ''}
        ${val.pipelineEV + val.conversionEV > 0 ? '<span class="legend-item"><span class="legend-dot pipeline"></span>Pipeline</span>' : ''}
        ${val.debt > 0 ? '<span class="legend-item"><span class="legend-dot debt"></span>Debt</span>' : ''}
    `;

    // Valuation table
    const tableBody = document.getElementById('company-valuation-tbody');
    const components = [
        { name: `BTC Holdings (${(company?.btc_holdings || 0).toLocaleString()} BTC)`, value: val.hodlValue, cls: 'hodl' },
        { name: 'Cash & Equivalents', value: val.cash, cls: 'cash' },
        { name: 'Debt', value: -val.debt, cls: 'debt' },
        { name: `BTC Mining (${Math.round(val.miningMw)} MW)`, value: val.miningEV, cls: 'mining' },
        { name: `HPC Contracted (${Math.round(val.hpcMw)} MW)`, value: val.hpcContractedEV, cls: 'hpc' },
        { name: `Pipeline (${Math.round(val.pipelineMw)} MW)`, value: val.pipelineEV + val.conversionEV, cls: 'pipeline' }
    ];

    let tableHtml = '';
    components.forEach(c => {
        if (c.value === 0 && c.cls !== 'debt') return;
        const perShare = c.value / val.fdShares;
        const pct = (c.value / val.equityValue * 100);
        tableHtml += `
            <tr class="component-${c.cls}">
                <td>${c.name}</td>
                <td class="text-right">${c.value >= 0 ? '' : '-'}$${Math.abs(Math.round(c.value)).toLocaleString()}</td>
                <td class="text-right">${perShare >= 0 ? '' : '-'}$${Math.abs(perShare).toFixed(2)}</td>
                <td class="text-right">${pct.toFixed(1)}%</td>
            </tr>
        `;
    });

    tableHtml += `
        <tr class="total-row">
            <td>Total Equity Value</td>
            <td class="text-right">$${Math.round(val.equityValue).toLocaleString()}</td>
            <td class="text-right">$${val.fairValue.toFixed(2)}</td>
            <td class="text-right">100%</td>
        </tr>
    `;
    tableBody.innerHTML = tableHtml;

    // Sites summary
    const siteSummaryHtml = `
        <div class="site-summary-box">
            <div class="summary-value">${sites.length}</div>
            <div class="summary-label">Sites</div>
        </div>
        <div class="site-summary-box mining">
            <div class="summary-value">${Math.round(val.miningMw)}</div>
            <div class="summary-label">Mining MW</div>
        </div>
        <div class="site-summary-box hpc">
            <div class="summary-value">${Math.round(val.hpcMw)}</div>
            <div class="summary-label">HPC MW</div>
        </div>
        <div class="site-summary-box pipeline">
            <div class="summary-value">${Math.round(val.pipelineMw)}</div>
            <div class="summary-label">Pipeline MW</div>
        </div>
    `;
    document.getElementById('company-sites-summary').innerHTML = siteSummaryHtml;

    // Sites list
    let sitesHtml = '';
    sites.forEach(site => {
        const siteVal = calculateSiteValue(site);
        sitesHtml += `
            <div class="site-item">
                <div class="site-info">
                    <span class="site-name">${site.name}</span>
                    <span class="site-mw">${Math.round(site.power?.total_site_capacity_mw || 0)} MW</span>
                </div>
                <span class="site-value">$${Math.round(siteVal.totalValue)}M</span>
            </div>
        `;
    });
    document.getElementById('company-sites-list').innerHTML = sitesHtml;

    // Source
    document.getElementById('company-source-link').href = company?.source?.url || '#';
    document.getElementById('company-source-link').textContent = company?.source?.type || 'Company Records';

    // Show panel
    document.getElementById('company-panel').classList.add('active');
    document.getElementById('company-panel-overlay').classList.add('active');
}

function closeCompanyPanel() {
    document.getElementById('company-panel').classList.remove('active');
    document.getElementById('company-panel-overlay').classList.remove('active');
}

// =====================================================
// TENANCY EDIT MODAL
// =====================================================

function openTenancyModal(tenancyId) {
    const tenancy = TENANCY_MAP[tenancyId];
    if (!tenancy) return;

    const phase = PHASE_MAP[tenancy.capacity_phase_id];
    const site = phase ? SITE_MAP[phase.site_id] : null;
    const overrides = tenancyOverrides[tenancyId] || {};

    // Populate modal
    document.getElementById('tenancy-modal-title').textContent = `${site?.name || ''} - ${phase?.name || ''} - ${tenancy.tenant || 'Self'}`;
    document.getElementById('tenancy-id').value = tenancyId;

    // Basic info (read-only)
    document.getElementById('tenancy-site').value = site?.name || '';
    document.getElementById('tenancy-phase').value = phase?.name || '';
    document.getElementById('tenancy-tenant').value = tenancy.tenant || 'Self';
    document.getElementById('tenancy-use-type').value = formatUseType(tenancy.use_type);

    // Editable overrides
    document.getElementById('tenancy-mw').value = overrides.itMw || phase?.capacity?.it_mw || '';
    document.getElementById('tenancy-fidoodle').value = overrides.fidoodle ?? '';

    if (tenancy.use_type === 'BTC_MINING' || tenancy.use_type === 'BTC_HOSTING') {
        document.getElementById('btc-overrides-section').style.display = 'block';
        document.getElementById('hpc-overrides-section').style.display = 'none';

        document.getElementById('tenancy-mining-ebitda').value = overrides.miningEbitdaAnnualM ?? '';
        document.getElementById('tenancy-btc-multiple').value = overrides.btcEbitdaMultiple ?? '';
    } else {
        document.getElementById('btc-overrides-section').style.display = 'none';
        document.getElementById('hpc-overrides-section').style.display = 'block';

        document.getElementById('tenancy-noi').value = overrides.noi ?? '';
        document.getElementById('tenancy-cap-rate').value = overrides.capOverride ?? '';
        document.getElementById('tenancy-term').value = overrides.term ?? '';
    }

    if (tenancy.status === 'potential') {
        document.getElementById('conversion-overrides-section').style.display = 'block';
        document.getElementById('tenancy-conv-prob').value = overrides.conversionProbability ?? (tenancy.conversion?.conversion_probability * 100) ?? 50;
    } else {
        document.getElementById('conversion-overrides-section').style.display = 'none';
    }

    // Update preview
    updateTenancyPreview();

    // Show modal
    document.getElementById('tenancy-modal').classList.add('active');
}

function closeTenancyModal() {
    document.getElementById('tenancy-modal').classList.remove('active');
}

function saveTenancyOverrides() {
    const tenancyId = document.getElementById('tenancy-id').value;
    const tenancy = TENANCY_MAP[tenancyId];
    if (!tenancy) return;

    const overrides = {};

    const mw = parseFloat(document.getElementById('tenancy-mw').value);
    if (!isNaN(mw) && mw > 0) overrides.itMw = mw;

    const fidoodle = parseFloat(document.getElementById('tenancy-fidoodle').value);
    if (!isNaN(fidoodle)) overrides.fidoodle = fidoodle;

    if (tenancy.use_type === 'BTC_MINING' || tenancy.use_type === 'BTC_HOSTING') {
        const ebitda = parseFloat(document.getElementById('tenancy-mining-ebitda').value);
        if (!isNaN(ebitda)) overrides.miningEbitdaAnnualM = ebitda;

        const mult = parseFloat(document.getElementById('tenancy-btc-multiple').value);
        if (!isNaN(mult)) overrides.btcEbitdaMultiple = mult;
    } else {
        const noi = parseFloat(document.getElementById('tenancy-noi').value);
        if (!isNaN(noi)) overrides.noi = noi;

        const cap = parseFloat(document.getElementById('tenancy-cap-rate').value);
        if (!isNaN(cap)) overrides.capOverride = cap;

        const term = parseFloat(document.getElementById('tenancy-term').value);
        if (!isNaN(term)) overrides.term = term;
    }

    if (tenancy.status === 'potential') {
        const convProb = parseFloat(document.getElementById('tenancy-conv-prob').value);
        if (!isNaN(convProb)) overrides.conversionProbability = convProb / 100;
    }

    // Save
    if (Object.keys(overrides).length > 0) {
        tenancyOverrides[tenancyId] = overrides;
    } else {
        delete tenancyOverrides[tenancyId];
    }

    saveOverrides();
    closeTenancyModal();
    renderDashboard();
    renderProjectsHierarchy();
}

function updateTenancyPreview() {
    const tenancyId = document.getElementById('tenancy-id').value;
    const tenancy = TENANCY_MAP[tenancyId];
    if (!tenancy) return;

    // Get current form values as overrides
    const overrides = {};

    const mw = parseFloat(document.getElementById('tenancy-mw').value);
    if (!isNaN(mw) && mw > 0) overrides.itMw = mw;

    const fidoodle = parseFloat(document.getElementById('tenancy-fidoodle').value);
    if (!isNaN(fidoodle)) overrides.fidoodle = fidoodle;

    if (tenancy.use_type === 'BTC_MINING' || tenancy.use_type === 'BTC_HOSTING') {
        const ebitda = parseFloat(document.getElementById('tenancy-mining-ebitda').value);
        if (!isNaN(ebitda)) overrides.miningEbitdaAnnualM = ebitda;

        const mult = parseFloat(document.getElementById('tenancy-btc-multiple').value);
        if (!isNaN(mult)) overrides.btcEbitdaMultiple = mult;
    } else {
        const noi = parseFloat(document.getElementById('tenancy-noi').value);
        if (!isNaN(noi)) overrides.noi = noi;

        const cap = parseFloat(document.getElementById('tenancy-cap-rate').value);
        if (!isNaN(cap)) overrides.capOverride = cap;

        const term = parseFloat(document.getElementById('tenancy-term').value);
        if (!isNaN(term)) overrides.term = term;
    }

    if (tenancy.status === 'potential') {
        const convProb = parseFloat(document.getElementById('tenancy-conv-prob').value);
        if (!isNaN(convProb)) overrides.conversionProbability = convProb / 100;
    }

    const val = calculateTenancyValue(tenancy, overrides);

    document.getElementById('tenancy-preview-value').textContent = `$${Math.round(val.value).toLocaleString()}M`;
}

// =====================================================
// MAP RENDERING
// =====================================================

let map = null;
let markers = [];

function renderMap() {
    if (!document.getElementById('map')) return;

    if (!map) {
        map = L.map('map').setView([39.8283, -98.5795], 4);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO'
        }).addTo(map);
    }

    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    // Add markers for each site
    DATA.sites.forEach(site => {
        if (!site.location?.lat || !site.location?.lng) return;

        const siteVal = calculateSiteValue(site);
        const phases = PHASES_BY_SITE[site.id] || [];

        // Determine color based on primary use
        let color = '#888';
        let hasHpc = false;
        let hasBtc = false;

        phases.forEach(phase => {
            const tenancies = TENANCIES_BY_PHASE[phase.id] || [];
            tenancies.forEach(t => {
                if (t.status !== 'active') return;
                if (t.use_type === 'BTC_MINING' || t.use_type === 'BTC_HOSTING') hasBtc = true;
                else hasHpc = true;
            });
        });

        if (hasHpc && hasBtc) color = '#ff8c00';
        else if (hasHpc) color = '#00ff00';
        else if (hasBtc) color = '#00bfff';

        const radius = Math.min(Math.max((site.power?.total_site_capacity_mw || 50) / 30, 5), 20);

        const marker = L.circleMarker([site.location.lat, site.location.lng], {
            radius: radius,
            fillColor: color,
            color: '#fff',
            weight: 1,
            opacity: 0.8,
            fillOpacity: 0.6
        });

        const popupLocation = formatLocation(site.location?.state, site.location?.country);
        marker.bindPopup(`
            <strong>${site.ticker}: ${site.name}</strong><br>
            ${popupLocation}<br>
            ${Math.round(site.power?.total_site_capacity_mw || 0)} MW<br>
            Value: $${Math.round(siteVal.totalValue).toLocaleString()}M
        `);

        marker.addTo(map);
        markers.push(marker);
    });
}

// =====================================================
// TAB NAVIGATION
// =====================================================

function initializeTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            currentTab = tabId;

            if (tabId === 'map-view') {
                setTimeout(() => map?.invalidateSize(), 100);
            }
        });
    });
}

// =====================================================
// SORTING
// =====================================================

function initializeSorting() {
    document.querySelectorAll('#dashboard-table th.sortable').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.dataset.sort;
            if (dashboardSortColumn === sortKey) {
                dashboardSortDirection = dashboardSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                dashboardSortColumn = sortKey;
                dashboardSortDirection = 'desc';
            }
            renderDashboard();
        });
    });
}

// =====================================================
// FILTERS
// =====================================================

function initializeFilters() {
    // Populate ticker filter
    const tickerFilter = document.getElementById('project-ticker-filter');
    if (tickerFilter) {
        const tickers = [...new Set(DATA.sites.map(s => s.ticker))].sort();
        tickerFilter.innerHTML = '<option value="">All Companies</option>' +
            tickers.map(t => `<option value="${t}">${t}</option>`).join('');

        tickerFilter.addEventListener('change', renderProjectsHierarchy);
    }

    // Status filter
    const statusFilter = document.getElementById('project-status-filter');
    if (statusFilter) {
        statusFilter.addEventListener('change', renderProjectsHierarchy);
    }

    // Use type filter
    const useFilter = document.getElementById('project-use-filter');
    if (useFilter) {
        useFilter.addEventListener('change', renderProjectsHierarchy);
    }
}

// =====================================================
// UTILITIES
// =====================================================

function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// =====================================================
// DATA QUALITY / UNIT TEST SYSTEM
// =====================================================

let testResults = [];
let ignoredIssues = new Set();

// Test definitions
const DATA_QUALITY_TESTS = [
    {
        id: 'T1',
        name: 'MW Validation',
        description: 'Validates MW values are reasonable',
        severity: 'P0',
        run: runMwValidation
    },
    {
        id: 'T2',
        name: 'Status Consistency',
        description: 'Validates status matches tenancy data',
        severity: 'P1',
        run: runStatusConsistency
    },
    {
        id: 'T3',
        name: 'HPC Site Validation',
        description: 'Validates HPC/AI site configurations',
        severity: 'P0',
        run: runHpcSiteValidation
    },
    {
        id: 'T4',
        name: 'Financial Sanity',
        description: 'Validates financial data is reasonable',
        severity: 'P1',
        run: runFinancialSanity
    },
    {
        id: 'T5',
        name: 'Geographic Validation',
        description: 'Validates location data',
        severity: 'P2',
        run: runGeographicValidation
    },
    {
        id: 'T6',
        name: 'Company Reconciliation',
        description: 'Validates company-level totals match site sums',
        severity: 'P1',
        run: runCompanyReconciliation
    },
    {
        id: 'T7',
        name: 'Provenance Check',
        description: 'Flags missing source attribution',
        severity: 'P2',
        run: runProvenanceCheck
    }
];

function runAllTests() {
    testResults = [];
    loadIgnoredIssues();

    DATA_QUALITY_TESTS.forEach(test => {
        const issues = test.run();
        issues.forEach(issue => {
            testResults.push({
                ...issue,
                testId: test.id,
                testName: test.name,
                severity: test.severity,
                ignored: ignoredIssues.has(issue.id)
            });
        });
    });

    renderDataQualityResults();
}

// T1: MW Validation
function runMwValidation() {
    const issues = [];

    DATA.capacity_phases.forEach(phase => {
        const site = SITE_MAP[phase.site_id];
        const mw = phase.capacity?.it_mw || 0;

        // Check for zero/negative MW on operational phases
        if (phase.status === 'Operational' && mw <= 0) {
            issues.push({
                id: `T1-${phase.id}-zero-mw`,
                entity: 'capacity_phase',
                entityId: phase.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase.name,
                field: 'it_mw',
                currentValue: mw,
                issue: 'Operational phase has zero or negative MW',
                recommendation: 'Add valid MW capacity or change status'
            });
        }

        // Check for unreasonably high MW (sanity cap at 2000)
        if (mw > 2000) {
            issues.push({
                id: `T1-${phase.id}-high-mw`,
                entity: 'capacity_phase',
                entityId: phase.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase.name,
                field: 'it_mw',
                currentValue: mw,
                issue: `MW value (${mw}) exceeds sanity cap of 2000`,
                recommendation: 'Verify this is correct or split into multiple phases'
            });
        }

        // Check for excessive decimal places
        if (mw % 1 !== 0 && mw.toString().split('.')[1]?.length > 2) {
            issues.push({
                id: `T1-${phase.id}-decimal-mw`,
                entity: 'capacity_phase',
                entityId: phase.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase.name,
                field: 'it_mw',
                currentValue: mw,
                issue: 'MW has excessive decimal places',
                recommendation: `Round to ${Math.round(mw)} MW`
            });
        }
    });

    return issues;
}

// T2: Status Consistency
function runStatusConsistency() {
    const issues = [];

    DATA.capacity_phases.forEach(phase => {
        const site = SITE_MAP[phase.site_id];
        const tenancies = TENANCIES_BY_PHASE[phase.id] || [];
        const activeTenancies = tenancies.filter(t => t.status === 'active');

        // Operational phases should have tenants or be self-operated
        if (phase.status === 'Operational' && activeTenancies.length === 0) {
            issues.push({
                id: `T2-${phase.id}-no-tenancy`,
                entity: 'capacity_phase',
                entityId: phase.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase.name,
                field: 'status',
                currentValue: phase.status,
                issue: 'Operational phase has no active tenancy',
                recommendation: 'Add tenancy or change phase status'
            });
        }

        // Pipeline/Permitted phases should not have binding contracts with revenue
        activeTenancies.forEach(t => {
            if (phase.status === 'Permitted' && t.contract?.type === 'BINDING' && t.contract?.annual_revenue_m > 0) {
                issues.push({
                    id: `T2-${t.id}-permitted-with-revenue`,
                    entity: 'tenancy',
                    entityId: t.id,
                    ticker: site?.ticker,
                    siteName: site?.name,
                    phaseName: phase.name,
                    field: 'contract',
                    currentValue: `${t.contract.type} with $${t.contract.annual_revenue_m}M revenue`,
                    issue: 'Permitted phase has binding contract with revenue',
                    recommendation: 'Change phase status to Under Construction or Operational'
                });
            }
        });
    });

    return issues;
}

// T3: HPC Site Validation
function runHpcSiteValidation() {
    const issues = [];

    DATA.tenancies.filter(t => t.status === 'active').forEach(tenancy => {
        const phase = PHASE_MAP[tenancy.capacity_phase_id];
        const site = phase ? SITE_MAP[phase.site_id] : null;

        // HPC lease should have tenant
        if ((tenancy.use_type === 'HPC_LEASE' || tenancy.use_type === 'GPU_CLOUD') &&
            (!tenancy.tenant || tenancy.tenant === 'Self' || tenancy.tenant === 'TBD')) {
            issues.push({
                id: `T3-${tenancy.id}-no-tenant`,
                entity: 'tenancy',
                entityId: tenancy.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase?.name,
                field: 'tenant',
                currentValue: tenancy.tenant || 'null',
                issue: 'HPC/GPU Cloud tenancy has no tenant specified',
                recommendation: 'Add tenant name or change use_type'
            });
        }

        // GPU Cloud should have higher margin indicator
        if (tenancy.compute_model === 'gpu_cloud' && tenancy.use_type !== 'GPU_CLOUD') {
            issues.push({
                id: `T3-${tenancy.id}-compute-model-mismatch`,
                entity: 'tenancy',
                entityId: tenancy.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase?.name,
                field: 'compute_model',
                currentValue: `compute_model=${tenancy.compute_model}, use_type=${tenancy.use_type}`,
                issue: 'compute_model is gpu_cloud but use_type is not GPU_CLOUD',
                recommendation: 'Align compute_model and use_type'
            });
        }

        // HPC with annual revenue should have NOI percentage
        if ((tenancy.use_type === 'HPC_LEASE' || tenancy.use_type === 'GPU_CLOUD') &&
            tenancy.contract?.annual_revenue_m > 0 &&
            !tenancy.contract?.noi_pct) {
            issues.push({
                id: `T3-${tenancy.id}-no-noi`,
                entity: 'tenancy',
                entityId: tenancy.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase?.name,
                field: 'noi_pct',
                currentValue: 'null',
                issue: 'HPC tenancy has revenue but no NOI percentage',
                recommendation: 'Add noi_pct (typical range: 0.70-0.85)'
            });
        }
    });

    return issues;
}

// T4: Financial Sanity
function runFinancialSanity() {
    const issues = [];

    DATA.tenancies.filter(t => t.status === 'active').forEach(tenancy => {
        const phase = PHASE_MAP[tenancy.capacity_phase_id];
        const site = phase ? SITE_MAP[phase.site_id] : null;

        // Check term is reasonable (1-30 years)
        if (tenancy.contract?.term_years) {
            if (tenancy.contract.term_years < 1 || tenancy.contract.term_years > 30) {
                issues.push({
                    id: `T4-${tenancy.id}-term`,
                    entity: 'tenancy',
                    entityId: tenancy.id,
                    ticker: site?.ticker,
                    siteName: site?.name,
                    phaseName: phase?.name,
                    field: 'term_years',
                    currentValue: tenancy.contract.term_years,
                    issue: `Term (${tenancy.contract.term_years} years) outside expected range 1-30`,
                    recommendation: 'Verify term is correct'
                });
            }
        }

        // Check NOI percentage is reasonable (0-100%)
        if (tenancy.contract?.noi_pct) {
            const noiPct = tenancy.contract.noi_pct > 1 ? tenancy.contract.noi_pct : tenancy.contract.noi_pct * 100;
            if (noiPct < 20 || noiPct > 95) {
                issues.push({
                    id: `T4-${tenancy.id}-noi-pct`,
                    entity: 'tenancy',
                    entityId: tenancy.id,
                    ticker: site?.ticker,
                    siteName: site?.name,
                    phaseName: phase?.name,
                    field: 'noi_pct',
                    currentValue: tenancy.contract.noi_pct,
                    issue: `NOI percentage (${noiPct.toFixed(1)}%) outside expected range 20-95%`,
                    recommendation: 'Verify NOI percentage is correct'
                });
            }
        }

        // Check contract value matches annual rev * term
        if (tenancy.contract?.annual_revenue_m && tenancy.contract?.term_years && tenancy.contract?.total_contract_value_m) {
            const expected = tenancy.contract.annual_revenue_m * tenancy.contract.term_years;
            const actual = tenancy.contract.total_contract_value_m;
            const diff = Math.abs(expected - actual) / expected;

            if (diff > 0.1) { // More than 10% difference
                issues.push({
                    id: `T4-${tenancy.id}-contract-value`,
                    entity: 'tenancy',
                    entityId: tenancy.id,
                    ticker: site?.ticker,
                    siteName: site?.name,
                    phaseName: phase?.name,
                    field: 'total_contract_value_m',
                    currentValue: `$${actual}M (expected $${expected.toFixed(0)}M based on $${tenancy.contract.annual_revenue_m}M x ${tenancy.contract.term_years}y)`,
                    issue: 'Contract value does not match annual revenue × term',
                    recommendation: 'Verify contract value or add escalator assumption'
                });
            }
        }
    });

    // Check company balance sheet data
    DATA.companies.forEach(company => {
        if (company.btc_holdings < 0) {
            issues.push({
                id: `T4-${company.ticker}-btc-negative`,
                entity: 'company',
                entityId: company.ticker,
                ticker: company.ticker,
                field: 'btc_holdings',
                currentValue: company.btc_holdings,
                issue: 'BTC holdings is negative',
                recommendation: 'Set to 0 or correct value'
            });
        }

        if (company.fd_shares_m <= 0) {
            issues.push({
                id: `T4-${company.ticker}-shares-zero`,
                entity: 'company',
                entityId: company.ticker,
                ticker: company.ticker,
                field: 'fd_shares_m',
                currentValue: company.fd_shares_m,
                issue: 'Fully diluted shares is zero or negative',
                recommendation: 'Add valid share count'
            });
        }
    });

    return issues;
}

// T5: Geographic Validation
function runGeographicValidation() {
    const issues = [];

    const validCountries = ['USA', 'Canada', 'Norway', 'Sweden', 'UAE', 'Paraguay', 'Ethiopia', 'Bhutan', 'United States'];
    const validGrids = ['ERCOT', 'PJM', 'MISO', 'NYISO', 'SPP', 'CAISO', 'SERC', 'Hydro-Québec', 'BC Hydro', 'BPA / WECC', 'Various', 'Unknown'];

    DATA.sites.forEach(site => {
        // Check country
        if (!site.location?.country || !validCountries.some(c => site.location.country.includes(c))) {
            issues.push({
                id: `T5-${site.id}-country`,
                entity: 'site',
                entityId: site.id,
                ticker: site.ticker,
                siteName: site.name,
                field: 'country',
                currentValue: site.location?.country || 'null',
                issue: 'Unknown or missing country',
                recommendation: 'Add valid country code'
            });
        }

        // Check grid for US sites
        if (site.location?.country === 'USA' || site.location?.country === 'United States') {
            if (!site.grid || !validGrids.some(g => site.grid.includes(g))) {
                issues.push({
                    id: `T5-${site.id}-grid`,
                    entity: 'site',
                    entityId: site.id,
                    ticker: site.ticker,
                    siteName: site.name,
                    field: 'grid',
                    currentValue: site.grid || 'null',
                    issue: 'US site missing or has unknown grid',
                    recommendation: 'Add valid grid (ERCOT, PJM, MISO, etc.)'
                });
            }
        }

        // Check coordinates
        if (!site.location?.lat || !site.location?.lng) {
            issues.push({
                id: `T5-${site.id}-coords`,
                entity: 'site',
                entityId: site.id,
                ticker: site.ticker,
                siteName: site.name,
                field: 'coordinates',
                currentValue: `lat=${site.location?.lat}, lng=${site.location?.lng}`,
                issue: 'Missing coordinates',
                recommendation: 'Add latitude and longitude'
            });
        }
    });

    return issues;
}

// T6: Company Reconciliation
function runCompanyReconciliation() {
    const issues = [];

    DATA.companies.forEach(company => {
        const sites = SITES_BY_COMPANY[company.ticker] || [];

        // Sum MW from all phases
        let totalSiteMw = 0;
        sites.forEach(site => {
            const phases = PHASES_BY_SITE[site.id] || [];
            phases.forEach(phase => {
                totalSiteMw += phase.capacity?.it_mw || 0;
            });
        });

        // Check if company has sites
        if (sites.length === 0) {
            issues.push({
                id: `T6-${company.ticker}-no-sites`,
                entity: 'company',
                entityId: company.ticker,
                ticker: company.ticker,
                field: 'sites',
                currentValue: '0 sites',
                issue: 'Company has no associated sites',
                recommendation: 'Add sites for this company or remove from companies list'
            });
        }

        // Check BTC holdings vs mining sites
        const hasBtcHoldings = company.btc_holdings > 0;
        const hasMiningTenancy = sites.some(site => {
            const phases = PHASES_BY_SITE[site.id] || [];
            return phases.some(phase => {
                const tenancies = TENANCIES_BY_PHASE[phase.id] || [];
                return tenancies.some(t => t.status === 'active' && (t.use_type === 'BTC_MINING' || t.use_type === 'BTC_HOSTING'));
            });
        });

        if (hasBtcHoldings && !hasMiningTenancy) {
            issues.push({
                id: `T6-${company.ticker}-btc-no-mining`,
                entity: 'company',
                entityId: company.ticker,
                ticker: company.ticker,
                field: 'btc_holdings',
                currentValue: `${company.btc_holdings.toLocaleString()} BTC but no mining sites`,
                issue: 'Company has BTC holdings but no mining tenancies',
                recommendation: 'Add mining sites or verify BTC source (treasury purchase?)'
            });
        }
    });

    return issues;
}

// T7: Provenance Check
function runProvenanceCheck() {
    const issues = [];

    // Check companies
    DATA.companies.forEach(company => {
        if (!company.source?.url) {
            issues.push({
                id: `T7-${company.ticker}-company-source`,
                entity: 'company',
                entityId: company.ticker,
                ticker: company.ticker,
                field: 'source',
                currentValue: 'null',
                issue: 'Company has no source URL',
                recommendation: 'Add SEC filing or IR source URL'
            });
        }
    });

    // Check sites
    DATA.sites.forEach(site => {
        if (!site.source?.url) {
            issues.push({
                id: `T7-${site.id}-site-source`,
                entity: 'site',
                entityId: site.id,
                ticker: site.ticker,
                siteName: site.name,
                field: 'source',
                currentValue: 'null',
                issue: 'Site has no source URL',
                recommendation: 'Add source URL for site data'
            });
        }
    });

    // Check tenancies with financial data
    DATA.tenancies.filter(t => t.status === 'active' && t.contract?.annual_revenue_m).forEach(tenancy => {
        const phase = PHASE_MAP[tenancy.capacity_phase_id];
        const site = phase ? SITE_MAP[phase.site_id] : null;

        if (!tenancy.source?.url) {
            issues.push({
                id: `T7-${tenancy.id}-tenancy-source`,
                entity: 'tenancy',
                entityId: tenancy.id,
                ticker: site?.ticker,
                siteName: site?.name,
                phaseName: phase?.name,
                field: 'source',
                currentValue: 'null',
                issue: 'Tenancy with financial data has no source URL',
                recommendation: 'Add source URL for contract/lease data'
            });
        }
    });

    return issues;
}

// Render Data Quality Results
function renderDataQualityResults() {
    const container = document.getElementById('data-quality-results');
    if (!container) return;

    // Calculate summary
    const p0Issues = testResults.filter(r => r.severity === 'P0' && !r.ignored);
    const p1Issues = testResults.filter(r => r.severity === 'P1' && !r.ignored);
    const p2Issues = testResults.filter(r => r.severity === 'P2' && !r.ignored);
    const ignoredCount = testResults.filter(r => r.ignored).length;

    // Update summary cards
    document.getElementById('dq-p0-count').textContent = p0Issues.length;
    document.getElementById('dq-p1-count').textContent = p1Issues.length;
    document.getElementById('dq-p2-count').textContent = p2Issues.length;
    document.getElementById('dq-ignored-count').textContent = ignoredCount;
    document.getElementById('dq-run-date').textContent = new Date().toLocaleString();

    // Filter based on UI
    const severityFilter = document.getElementById('dq-severity-filter')?.value || '';
    const testFilter = document.getElementById('dq-test-filter')?.value || '';
    const showIgnored = document.getElementById('dq-show-ignored')?.checked || false;

    let filteredResults = testResults.filter(r => {
        if (!showIgnored && r.ignored) return false;
        if (severityFilter && r.severity !== severityFilter) return false;
        if (testFilter && r.testId !== testFilter) return false;
        return true;
    });

    // Sort by severity then test
    const severityOrder = { 'P0': 0, 'P1': 1, 'P2': 2 };
    filteredResults.sort((a, b) => {
        if (severityOrder[a.severity] !== severityOrder[b.severity]) {
            return severityOrder[a.severity] - severityOrder[b.severity];
        }
        return a.testId.localeCompare(b.testId);
    });

    // Render issues
    let html = '';

    if (filteredResults.length === 0) {
        html = '<div class="dq-no-issues">No issues found matching filters</div>';
    } else {
        filteredResults.forEach(issue => {
            html += `
                <div class="dq-issue ${issue.ignored ? 'ignored' : ''} severity-${issue.severity.toLowerCase()}">
                    <div class="dq-issue-header">
                        <span class="dq-severity ${issue.severity.toLowerCase()}">${issue.severity}</span>
                        <span class="dq-test-id">${issue.testId}</span>
                        <span class="dq-ticker">${issue.ticker || ''}</span>
                        <span class="dq-location">${issue.siteName || ''} ${issue.phaseName ? '> ' + issue.phaseName : ''}</span>
                        <div class="dq-issue-actions">
                            ${issue.ignored
                                ? `<button class="btn-dq-action" onclick="unignoreIssue('${issue.id}')">Restore</button>`
                                : `<button class="btn-dq-action" onclick="ignoreIssue('${issue.id}')">Ignore</button>`
                            }
                        </div>
                    </div>
                    <div class="dq-issue-body">
                        <div class="dq-field"><strong>Field:</strong> ${issue.field}</div>
                        <div class="dq-current"><strong>Current:</strong> ${issue.currentValue}</div>
                        <div class="dq-issue-text"><strong>Issue:</strong> ${issue.issue}</div>
                        <div class="dq-recommendation"><strong>Recommendation:</strong> ${issue.recommendation}</div>
                    </div>
                </div>
            `;
        });
    }

    container.innerHTML = html;
}

function ignoreIssue(issueId) {
    ignoredIssues.add(issueId);
    saveIgnoredIssues();
    renderDataQualityResults();
}

function unignoreIssue(issueId) {
    ignoredIssues.delete(issueId);
    saveIgnoredIssues();
    renderDataQualityResults();
}

function loadIgnoredIssues() {
    try {
        const saved = localStorage.getItem('miner-app-v9-ignored-issues');
        if (saved) {
            ignoredIssues = new Set(JSON.parse(saved));
        }
    } catch (e) {
        console.warn('Could not load ignored issues:', e);
    }
}

function saveIgnoredIssues() {
    try {
        localStorage.setItem('miner-app-v9-ignored-issues', JSON.stringify([...ignoredIssues]));
    } catch (e) {
        console.warn('Could not save ignored issues:', e);
    }
}

function exportDataQualityReport() {
    const report = {
        runDate: new Date().toISOString(),
        summary: {
            p0: testResults.filter(r => r.severity === 'P0' && !r.ignored).length,
            p1: testResults.filter(r => r.severity === 'P1' && !r.ignored).length,
            p2: testResults.filter(r => r.severity === 'P2' && !r.ignored).length,
            ignored: testResults.filter(r => r.ignored).length,
            total: testResults.length
        },
        issues: testResults
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `data-quality-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
}

// =====================================================
// INITIALIZATION
// =====================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeSorting();
    loadData().then(() => {
        initializeFilters();
        // Auto-run tests on load
        setTimeout(runAllTests, 500);
    });
});
