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
    baseNoiPerMw: 2.00,      // $M per MW per year (for HPC) - increased from 1.40
    baseCapRate: 8.0,        // % - lowered from 12% for contracted HPC
    hyperscalerPremium: 1.10, // multiplier
    defaultTerm: 15,          // years
    escalator: 2.5,           // % annual rent growth
    pue: 1.30,                // Gross-to-IT conversion
    fidoodleDefault: 1.00,    // Default fidoodle

    // BTC Mining Valuation Parameters
    btcMining: {
        ebitdaPerMw: 0.35,    // $M EBITDA per MW per year
        ebitdaMultiple: 3.5,  // EV/EBITDA multiple for mining - reduced from 5.0
    },

    // HPC Conversion Option - discount factors by conversion year
    // Represents probability-weighted present value of future HPC conversion
    // Steeper curve beyond 2027 reflects execution/permitting/power risk
    hpcConversion: {
        '2025': 0.85,  // Converting soon - high probability, minimal discount
        '2026': 0.70,
        '2027': 0.50,  // Inflection point
        '2028': 0.30,  // Steep dropoff starts here
        '2029': 0.18,
        '2030': 0.12,
        '2031': 0.08,
        '2032': 0.05,  // Essentially option value only
        'never': 0.00
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
        pipeline: 0.40,
        option: 0.20,      // AI/HPC option - very speculative
        planned: 0.15      // AI/HPC planned - highly speculative
    },

    // Mining EBITDA cap ($/MW/year) - prevents unrealistic valuations
    miningEbitdaCap: 0.50,  // $0.5M per MW max (vs $0.35M default)

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
// ALL PROJECTS - Loaded from seed-data.json at runtime
// ============================================================
let ALL_PROJECTS = []; // Will be populated from seed-data.json


// ============================================================
// RULE-OF-THUMB VALUATION ENGINE
// ============================================================

/**
 * Calculate the term factor: 1 - ((1+g)/(1+Cap_eff+g))^T
 * @param {number} T - Lease term in years
 * @param {number} g - Rent escalator (decimal, e.g., 0.025 for 2.5%)
 * @param {number} capEff - Effective cap rate (decimal, e.g., 0.10 for 10%)
 * @param {boolean} isContractedHyperscaler - If true, apply less discount for long leases
 * @returns {number} Term factor
 */
function calculateTermFactor(T, g, capEff, isContractedHyperscaler = false) {
    if (T <= 0 || capEff <= 0) return 0;
    const ratio = (1 + g) / (1 + capEff + g);
    const baseFactor = 1 - Math.pow(ratio, T);

    // For contracted hyperscaler leases, long terms are MORE valuable
    // Apply a "lease certainty premium" that increases with term length
    if (isContractedHyperscaler && T >= 10) {
        // Boost the term factor for long contracted leases
        // 10yr: +10%, 15yr: +15%, 20yr: +20% (capped at 1.0)
        const certaintBonus = Math.min(0.25, (T - 5) * 0.02);
        return Math.min(1.0, baseFactor + certaintBonus);
    }

    return baseFactor;
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
 * Get build/energization multiplier based on status and current_use
 * Applies heavy discounts for option/planned HPC projects
 */
function getBuildMultiplier(status, override = null, currentUse = null) {
    if (override !== null && override !== undefined) {
        return factors.build[override] || 1.0;
    }

    const normalizedStatus = (status || '').toLowerCase();
    const use = (currentUse || '').toLowerCase();

    // Check for option/planned in current_use - these are highly speculative
    if (use.includes('option')) return factors.build.option;
    if (use.includes('planned')) return factors.build.planned;
    if (use === 'power gen') return factors.build.pipeline;  // Power gen sites are speculative

    if (normalizedStatus === 'operational') return factors.build.operational;
    if (normalizedStatus === 'contracted') return factors.build.contracted;
    if (normalizedStatus === 'development') return factors.build.development;
    if (normalizedStatus === 'under construction') return factors.build.development;
    if (normalizedStatus === 'planning') return factors.build.pipeline;
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

    const mw = overrides.itMw || project.it_mw || 0;
    const passthrough = (overrides.passthrough ?? 85) / 100;

    // Calculate from rent per MW if provided (rentMw is in $M per MW per year)
    if (overrides.rentMw) {
        // rentMw is $M per MW per year
        const annualRent = overrides.rentMw * mw;
        return annualRent * passthrough;
    }

    // Calculate annual revenue from lease terms if available
    let annualRev = project.annual_rev;

    // If lease_value_m and lease_years exist, derive annual rev from that
    // (more reliable than annual_rev_m which may be incorrect)
    if (project.lease_value_m && project.lease_years && project.lease_years > 0) {
        annualRev = project.lease_value_m / project.lease_years;
    }

    // Use project's stated annual rev and NOI %
    if (annualRev && annualRev > 0) {
        // Handle noi_pct as either decimal (0.85) or percentage (85)
        let noiPct = project.noi_pct ?? 85;
        if (noiPct > 0 && noiPct <= 1) {
            // It's a decimal, convert to percentage
            noiPct = noiPct * 100;
        }
        return annualRev * (noiPct / 100);
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

    const use = (project.current_use || '').toLowerCase();

    // If current_use contains AI/HPC, it's not BTC only (unless it's BTC/HPC mixed)
    if (use.includes('ai/hpc') || use.includes('hpc/ai') || use === 'hpc development' || use === 'amd servers') {
        return false;
    }

    // If it has stated annual_rev from HPC lease, treat as HPC
    if (project.annual_rev && project.annual_rev > 0 && project.noi_pct) return false;

    // BTC mining, BTC hosting, or BTC/HPC mixed without HPC tenant = BTC mining
    if (use.includes('btc') || use === 'mixed') return true;

    // Under construction, pipeline, planning, power gen - check if it has mining EBITDA
    if (project.mining_ebitda_annual_m && project.mining_ebitda_annual_m > 0) return true;

    return false;
}

/**
 * Parse date string to Date object with timezone safety
 * Uses UTC to avoid local timezone drift
 */
function parseDateSafe(dateStr) {
    if (!dateStr) return null;
    // Add T00:00:00Z to ensure UTC parsing
    const date = new Date(dateStr + 'T00:00:00Z');
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Calculate years from today to a future date
 */
function yearsToDate(dateStr) {
    const targetDate = parseDateSafe(dateStr);
    if (!targetDate) return null;
    const today = new Date();
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const diffMs = targetDate.getTime() - todayUtc;
    return Math.max(0, diffMs / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Calculate truncated mining value when HPC conversion date is set
 * Uses the EBITDA multiple as an implied discount rate to calculate
 * the present value of mining cash flows until conversion.
 *
 * If conversionDate is null -> perpetual mining value (EBITDA * multiple)
 * If conversionDate is today or past -> mining value = 0
 * Otherwise -> NPV of mining EBITDA stream until conversion
 *
 * @param {number} ebitda - Annual mining EBITDA ($M)
 * @param {number} multiple - EBITDA multiple (e.g., 5.0)
 * @param {string|null} conversionDate - ISO date string (YYYY-MM-DD) or null
 * @returns {object} { miningValue, yearsToConv, impliedRate }
 */
function calculateTruncatedMiningValue(ebitda, multiple, conversionDate) {
    // Perpetual case - no conversion
    if (!conversionDate) {
        return {
            miningValue: ebitda * multiple,
            yearsToConv: null,
            impliedRate: null,
            isPerpetual: true
        };
    }

    const yearsToConv = yearsToDate(conversionDate);

    // Already converted or past date
    if (yearsToConv === null || yearsToConv <= 0) {
        return {
            miningValue: 0,
            yearsToConv: 0,
            impliedRate: null,
            isPerpetual: false
        };
    }

    // Implied discount rate from multiple: r = 1/multiple
    // Multiple = 5 implies r = 20%, meaning EV = EBITDA/0.2 = 5x EBITDA
    const r = multiple > 0 ? 1 / multiple : 0;
    const perpetualValue = ebitda * multiple;

    let miningValue;
    if (r === 0) {
        // No discounting - just multiply EBITDA by years
        miningValue = ebitda * yearsToConv;
    } else {
        // Present value of annuity: PV = E * (1 - (1+r)^-T) / r
        miningValue = ebitda * (1 - Math.pow(1 + r, -yearsToConv)) / r;
    }

    // Never exceed perpetual value
    miningValue = Math.min(miningValue, perpetualValue);

    return {
        miningValue: miningValue,
        yearsToConv: yearsToConv,
        impliedRate: r,
        isPerpetual: false
    };
}

/**
 * Calculate BTC Mining Value
 * Value = EBITDA per MW × IT MW × EBITDA Multiple × Country Factor
 * If HPC conversion date is set, truncates mining value to period before conversion
 * NOTE: Fidoodle does NOT apply to BTC mining - only to HPC leases
 */
function calculateBtcMiningValue(project, overrides = {}) {
    const itMw = overrides.itMw || project.it_mw || 0;

    // Effective annual mining EBITDA:
    // Priority: override > project-level (capped) > factors-based estimate
    let ebitdaAnnual;
    let wasCapped = false;

    if (overrides.miningEbitdaAnnualM !== undefined && overrides.miningEbitdaAnnualM !== null) {
        // User override - trust it
        ebitdaAnnual = parseFloat(overrides.miningEbitdaAnnualM);
    } else if (project.mining_ebitda_annual_m !== undefined && project.mining_ebitda_annual_m !== null) {
        // Project-level value - cap it to reasonable range
        const rawEbitda = project.mining_ebitda_annual_m;
        const maxEbitda = factors.miningEbitdaCap * itMw;
        if (rawEbitda > maxEbitda && itMw > 0) {
            ebitdaAnnual = maxEbitda;
            wasCapped = true;
        } else {
            ebitdaAnnual = rawEbitda;
        }
    } else {
        // Fall back to per-MW calculation
        const ebitdaPerMw = overrides.btcEbitdaPerMw ?? factors.btcMining.ebitdaPerMw;
        ebitdaAnnual = ebitdaPerMw * itMw;
    }

    const ebitdaMultiple = overrides.btcEbitdaMultiple ?? factors.btcMining.ebitdaMultiple;
    const fCountry = getCountryMultiplier(project.country, overrides.countryMult);

    // Get HPC conversion date (null = never)
    const hpcConversionDate = overrides.hpcConversionDate || null;

    // Calculate truncated mining value based on conversion date
    const truncation = calculateTruncatedMiningValue(ebitdaAnnual, ebitdaMultiple, hpcConversionDate);

    // Apply country factor
    const miningValue = truncation.miningValue * fCountry;

    return {
        ebitda: ebitdaAnnual,
        ebitdaPerMw: itMw > 0 ? ebitdaAnnual / itMw : 0,
        ebitdaMultiple: ebitdaMultiple,
        fCountry: fCountry,
        value: miningValue,
        // Truncation details
        hpcConversionDate: hpcConversionDate,
        yearsToConv: truncation.yearsToConv,
        impliedRate: truncation.impliedRate,
        isPerpetual: truncation.isPerpetual,
        perpetualValue: ebitdaAnnual * ebitdaMultiple * fCountry
    };
}

/**
 * Calculate HPC Conversion Option Value
 * If a BTC site could convert to HPC in the future, calculate the option value
 * Uses the conversion date to determine when HPC lease begins
 * Value is discounted to present value based on years until conversion
 */
function calculateHpcConversionValue(project, overrides = {}) {
    // Check if conversion is set (either via date or legacy year)
    const hasConversionDate = !!overrides.hpcConversionDate;
    const conversionYear = overrides.hpcConversionYear || 'never';

    if (!hasConversionDate && conversionYear === 'never') {
        return { value: 0, conversionYear: 'never', discountFactor: 0, potentialHpcValue: 0, components: {} };
    }

    const itMw = overrides.itMw || project.it_mw || 0;

    // Calculate discount factor based on years to conversion
    let discountFactor = 1.0;
    let yearsToConversion = 0;

    if (hasConversionDate) {
        yearsToConversion = yearsToDate(overrides.hpcConversionDate) || 0;
        // Discount at ~10% per year (roughly matching the legacy factors)
        // e.g., 1 year = 0.90, 2 years = 0.81, 3 years = 0.73
        discountFactor = Math.pow(0.90, yearsToConversion);
    } else {
        // Legacy: use fixed discount factors by year
        discountFactor = factors.hpcConversion[conversionYear] || 0;
    }

    // Calculate FULL HPC lease value using all the override parameters
    // This allows user to specify prospective tenant, term, fidoodle, etc.

    // 1. Calculate NOI (use override NOI, or calculate from rent, or use base)
    let noi;
    const passthrough = (overrides.passthrough ?? 85) / 100;

    if (overrides.noi !== undefined && overrides.noi !== null && overrides.noi !== '') {
        noi = parseFloat(overrides.noi);
    } else if (overrides.rentMw) {
        // rentMw is $M per MW per year
        const annualRent = overrides.rentMw * itMw;
        noi = annualRent * passthrough;
    } else {
        noi = factors.baseNoiPerMw * itMw;
    }

    // 2. Get effective cap rate (can be overridden or calculated from components)
    let capEff;
    if (overrides.capOverride) {
        capEff = overrides.capOverride / 100;
    } else {
        const baseCap = factors.baseCapRate / 100;
        // Check if user specified a prospective tenant type via credit override
        const creditAdj = overrides.credit ? (factors.credit[overrides.credit] || 0) / 100 : 0;
        capEff = baseCap + creditAdj;
    }

    // 3. Get term parameters
    const T = overrides.term || factors.defaultTerm;
    const g = (overrides.escalator ?? factors.escalator) / 100;

    // 4. Calculate term factor
    const termFactor = calculateTermFactor(T, g, capEff);

    // 5. Get all multipliers
    // For prospective HPC lease, check if user specified hyperscaler tenant
    const isProspectiveHyperscaler = overrides.credit === 'hyperscaler';
    const fCredit = isProspectiveHyperscaler ? factors.hyperscalerPremium : 1.0;
    const fLease = getLeaseMultiplier(overrides.leaseType);
    const fOwnership = getOwnershipMultiplier(overrides.ownership);
    // Use 'pipeline' build status for future conversion (discounted for not yet built/contracted)
    const fBuild = overrides.buildStatus ? getBuildMultiplier(null, overrides.buildStatus) : factors.build.pipeline;
    const fConcentration = getConcentrationMultiplier(overrides.concentration, project);
    const fSize = getSizeMultiplier(itMw, overrides.sizeMult);
    const fCountry = getCountryMultiplier(project.country, overrides.countryMult);
    const fGrid = getGridMultiplier(project.grid, project.country, overrides.gridMult);

    // 6. Get fidoodle
    const fidoodle = overrides.fidoodle ?? factors.fidoodleDefault;

    // 7. Combined multiplier
    const combinedMult = fCredit * fLease * fOwnership * fBuild * fConcentration * fSize * fCountry * fGrid;

    // 8. Calculate potential HPC value (before time discount)
    const baseValue = capEff > 0 ? noi / capEff : 0;
    const potentialHpcValue = baseValue * termFactor * combinedMult * fidoodle;

    // 9. Apply conversion year discount
    const optionValue = potentialHpcValue * discountFactor;

    return {
        value: optionValue,
        conversionYear: conversionYear,
        discountFactor: discountFactor,
        potentialHpcValue: potentialHpcValue,
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
            fidoodle: fidoodle
        }
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
        // BTC Mining Valuation with HPC conversion date-based truncation
        const miningVal = calculateBtcMiningValue(project, overrides);
        const conversionVal = calculateHpcConversionValue(project, overrides);

        // Get conversion probability (default 50%)
        const convProb = (overrides.conversionProbability ?? 50) / 100;
        const hasConversionDate = !!overrides.hpcConversionDate;

        // Apply probability weighting to HPC conversion value
        const probabilityWeightedHpcValue = hasConversionDate ? conversionVal.value * convProb : 0;
        const totalValue = miningVal.value + probabilityWeightedHpcValue;

        return {
            value: totalValue,
            isBtcSite: true,
            components: {
                // Mining components (no fidoodle - that's for HPC only)
                miningValue: miningVal.value,
                ebitda: miningVal.ebitda,
                ebitdaPerMw: miningVal.ebitdaPerMw,
                ebitdaMultiple: miningVal.ebitdaMultiple,
                fCountry: miningVal.fCountry,
                itMw: itMw,
                // HPC conversion date truncation details
                hpcConversionDate: miningVal.hpcConversionDate,
                yearsToConv: miningVal.yearsToConv,
                impliedRate: miningVal.impliedRate,
                isPerpetual: miningVal.isPerpetual,
                perpetualMiningValue: miningVal.perpetualValue,
                // HPC conversion option components
                conversionValue: probabilityWeightedHpcValue,
                conversionProbability: convProb,
                rawConversionValue: conversionVal.value,  // Before probability weighting
                conversionYear: conversionVal.conversionYear,
                conversionDiscount: conversionVal.discountFactor,
                potentialHpcValue: conversionVal.potentialHpcValue,
                conversionComponents: conversionVal.components,  // Full HPC calc details including fidoodle
                // Combined fidoodle from HPC conversion if set
                fidoodle: conversionVal.components?.fidoodle ?? factors.fidoodleDefault
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

    // 4. Calculate term factor (give credit for contracted hyperscaler leases)
    const isContracted = project.status === 'Operational' || project.status === 'Contracted';
    const isContractedHyperscaler = isContracted && isHyperscaler(project.lessee);
    const termFactor = calculateTermFactor(T, g, capEff, isContractedHyperscaler);

    // 5. Get all multipliers
    const fCredit = isHyperscaler(project.lessee) ? factors.hyperscalerPremium : 1.0;
    const fLease = getLeaseMultiplier(overrides.leaseType);
    const fOwnership = getOwnershipMultiplier(overrides.ownership);
    const fBuild = getBuildMultiplier(project.status, overrides.buildStatus, project.current_use);
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

    // Conversion probability slider sync
    const convProbSlider = document.getElementById('project-conv-prob-slider');
    const convProbInput = document.getElementById('project-conv-prob');
    const convProbDisplay = document.getElementById('project-conv-prob-display');

    convProbSlider.addEventListener('input', () => {
        const val = parseInt(convProbSlider.value);
        convProbInput.value = val;
        convProbDisplay.textContent = val + '%';
        updateValuationPreview();
    });

    convProbInput.addEventListener('input', () => {
        const val = Math.min(100, Math.max(0, parseInt(convProbInput.value) || 50));
        convProbSlider.value = val;
        convProbDisplay.textContent = val + '%';
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


    ['map-ticker-filter', 'map-status-filter', 'map-mw-filter'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateMapMarkers);
    });
}

// ============================================================
// DATA LOADING & SAVING
// ============================================================
async function loadData() {
    // Load seed data (projects) from server
    try {
        const seedResponse = await fetch('/seed-data.json');
        if (seedResponse.ok) {
            const seedData = await seedResponse.json();
            if (seedData.projects && seedData.projects.length > 0) {
                // Map seed-data format to app format
                ALL_PROJECTS = seedData.projects.map(p => ({
                    id: p.id || p.numericId,
                    ticker: p.ticker,
                    name: p.project || p.name,
                    country: p.country,
                    state: p.state,
                    gross_mw: p.gross_mw,
                    it_mw: p.it_mw,
                    grid: p.grid,
                    current_use: p.current_use,
                    status: p.status,
                    lessee: p.lessee,
                    lease_years: p.lease_years,
                    lease_value_m: p.lease_value_m,  // Total lease value in $M
                    annual_rev: p.annual_rev_m,
                    noi_pct: p.noi_pct,
                    source_url: p.source_url,
                    lat: p.lat,
                    lng: p.lng,
                    energization_date: p.energization_date,
                    mining_ebitda_annual_m: p.mining_ebitda_annual_m,
                    hpc_conv_prob: p.hpc_conv_prob,
                    lease_start_date: p.lease_start_date
                }));
                console.log(`Loaded ${ALL_PROJECTS.length} projects from seed-data.json`);
            }
        }
    } catch (error) {
        console.error('Could not load seed-data.json:', error);
    }

    // If seed data failed or was empty, show warning
    if (ALL_PROJECTS.length === 0) {
        console.error('No projects loaded! Make sure seed-data.json exists.');
    }

    // Load user overrides and custom projects
    try {
        const response = await fetch('/api/data');
        const data = await response.json();
        projectOverrides = data.projectOverrides || {};
        customProjects = data.customProjects || [];
        if (data.factors) {
            factors = mergeFactors(DEFAULT_FACTORS, data.factors);
            savedFactors = data.factors;
        }

        // Migrate legacy hpcConversionYear to hpcConversionDate
        let needsSave = false;
        for (const projectId in projectOverrides) {
            const override = projectOverrides[projectId];
            if (override.hpcConversionYear && !override.hpcConversionDate) {
                // Migrate: "never" -> null, year -> "YYYY-12-31"
                if (override.hpcConversionYear !== 'never') {
                    override.hpcConversionDate = `${override.hpcConversionYear}-12-31`;
                    needsSave = true;
                    console.log(`Migrated project ${projectId} conversion year ${override.hpcConversionYear} to date ${override.hpcConversionDate}`);
                }
            }
        }
        if (needsSave) {
            await saveData();
            console.log('Saved migrated overrides');
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
    renderCountryFactors();
    populateFilters();
}

// ============================================================
// PRICE FETCHING
// ============================================================

// Stock tickers for display (matches server response)
const STOCK_TICKERS = ['MARA', 'RIOT', 'CLSK', 'CIFR', 'CORZ', 'WULF', 'HUT', 'IREN', 'BITF', 'HIVE', 'GLXY', 'APLD', 'BTDR', 'SLNH'];

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
    // Fetch stock prices from server-side Yahoo Finance endpoint
    try {
        const response = await fetch('/api/stocks');
        if (response.ok) {
            const data = await response.json();
            Object.assign(stockPrices, data);
            console.log('Stock prices updated:', Object.keys(stockPrices).length, 'tickers');
        } else {
            console.error('Stock API error:', response.status);
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
        // totalMcap is now total lease value in $M
        document.getElementById('total-mcap').textContent = '$' + formatNumber(totalMcap / 1000, 1) + 'B';
    }
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
        let totalLeaseValue = 0;  // Total nominal HPC lease value

        projects.forEach(p => {
            const overrides = projectOverrides[p.id] || {};
            const valuation = calculateProjectValue(p, overrides);

            // Add lease value if it's an HPC project with known lease terms
            if (p.lease_value_m && p.lease_value_m > 0 && !isBtcMiningOnly(p, overrides)) {
                totalLeaseValue += p.lease_value_m;
            }

            if (valuation.isBtcSite) {
                // BTC mining site - split mining value from HPC conversion option
                miningMw += p.it_mw || 0;
                // Mining value goes to mining column
                miningEV += valuation.components.miningValue || 0;
                // HPC conversion option value goes to pipeline column
                if (valuation.components.conversionValue > 0) {
                    pipelineEv += valuation.components.conversionValue;
                }
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
        const priceChange = stock.change || 0;
        const upside = stockPrice > 0 ? ((fairValue / stockPrice - 1) * 100) : 0;

        totalBtc += miner.btc;
        totalHpcContracted += contractedEv;
        totalHpcPipeline += pipelineEv;
        totalMiningEv += miningEV;
        totalFairValue += equityValue;
        totalMcap += totalLeaseValue;  // Now tracking total lease value instead of market cap

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
            <td class="has-tooltip" data-tooltip="Total nominal value of known HPC leases">${totalLeaseValue > 0 ? '$' + formatNumber(totalLeaseValue / 1000, 2) + 'B' : '--'}</td>
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
            <td colspan="13">
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
        // totalMcap is now total lease value in $M
        document.getElementById('total-mcap').textContent = '$' + formatNumber(totalMcap / 1000, 1) + 'B';
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

            // Format energization date for display
            const energizeDate = project.energization_date ? formatEnergizationDate(project.energization_date) : '-';

            // Different display for BTC vs HPC sites
            if (valuation.isBtcSite) {
                // BTC Mining Site
                const convYear = c.conversionYear || 'never';
                const convDate = c.hpcConversionDate;
                const yearsToConv = c.yearsToConv;

                // Format conversion display: prefer date, fall back to year
                let convDisplay = 'Never';
                if (convDate) {
                    const d = new Date(convDate + 'T00:00:00Z');
                    convDisplay = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    if (yearsToConv !== null && yearsToConv > 0) {
                        convDisplay += ` (${yearsToConv.toFixed(1)}y)`;
                    }
                } else if (convYear !== 'never') {
                    convDisplay = convYear;
                }

                // Show remaining BTC value vs perpetual value
                const miningValueDisplay = c.isPerpetual ?
                    formatNumber(c.miningValue || 0, 1) :
                    `${formatNumber(c.miningValue || 0, 1)} / ${formatNumber(c.perpetualMiningValue || 0, 1)}`;

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
                    <td class="col-energize">${energizeDate}</td>
                    <td class="col-tenant">${project.lessee || '-'}</td>
                    <td class="conv-date-cell ${convDate ? 'has-date' : ''}" title="${convDate || 'Click to set conversion date'}">
                        ${convDisplay}
                    </td>
                    <td class="fidoodle-cell ${hasOverrides && overrides.fidoodle ? 'has-override' : ''}" data-project-id="${project.id}">
                        <span class="fidoodle-value">${(c.fidoodle || factors.fidoodleDefault).toFixed(2)}</span>
                        <span class="fidoodle-edit-icon">✎</span>
                    </td>
                    <td class="positive">${formatNumber(valuation.value, 1)}</td>
                    <td class="col-source">${project.source_url ? `<a href="${project.source_url}" class="source-link" target="_blank" onclick="event.stopPropagation();">Link</a>` : '-'}</td>
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
                    <td class="col-energize">${energizeDate}</td>
                    <td class="col-tenant">${project.lessee || '-'}</td>
                    <td>-</td>
                    <td class="fidoodle-cell ${hasOverrides && overrides.fidoodle ? 'has-override' : ''}" data-project-id="${project.id}">
                        <span class="fidoodle-value">${(c.fidoodle || factors.fidoodleDefault).toFixed(2)}</span>
                        <span class="fidoodle-edit-icon">✎</span>
                    </td>
                    <td class="positive">${formatNumber(valuation.value, 1)}</td>
                    <td class="col-source">${project.source_url ? `<a href="${project.source_url}" class="source-link" target="_blank" onclick="event.stopPropagation();">Link</a>` : '-'}</td>
                `;
            }

            tbody.appendChild(tr);

            // Create expanded details row
            const expandedTr = document.createElement('tr');
            expandedTr.className = `expanded-content project-details-row ${isExpanded ? 'show' : ''}`;
            expandedTr.dataset.projectId = project.id;

            if (valuation.isBtcSite) {
                // Format HPC conversion date display
                const convDateDisplay = c.hpcConversionDate ?
                    new Date(c.hpcConversionDate + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
                    'Never';
                const yearsDisplay = c.yearsToConv !== null ? c.yearsToConv.toFixed(2) : '∞';
                const rateDisplay = c.impliedRate !== null ? (c.impliedRate * 100).toFixed(1) + '%' : '-';

                expandedTr.innerHTML = `
                    <td colspan="13">
                        <div class="valuation-details">
                            <div class="valuation-section">
                                <h4>BTC Mining Valuation${c.hpcConversionDate ? ' (Truncated to Conversion Date)' : ''}</h4>
                                ${c.hpcConversionDate ? `
                                <div class="formula-display" style="margin-bottom: 10px; background: #1a1a00; padding: 8px; border-radius: 4px;">
                                    <span class="formula-label" style="color: #ffcc00;">HPC Conversion:</span>
                                    <span class="formula-part">${convDateDisplay}</span>
                                    <span class="formula-op">|</span>
                                    <span class="formula-part">Years remaining: ${yearsDisplay}</span>
                                    <span class="formula-op">|</span>
                                    <span class="formula-part">Implied rate: ${rateDisplay}</span>
                                </div>
                                ` : ''}
                                <div class="formula-display">
                                    <span class="formula-label">Annual EBITDA =</span>
                                    <span class="formula-part">$${formatNumber(c.ebitda || 0, 2)}M/yr</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Multiple (${(c.ebitdaMultiple || 0).toFixed(1)}x)</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Country (${(c.fCountry || 1).toFixed(2)})</span>
                                    ${c.isPerpetual ? `
                                    <span class="formula-result">= $${formatNumber(c.miningValue || 0, 1)}M (perpetual)</span>
                                    ` : `
                                    <span class="formula-result" style="color: #ffcc00;">
                                        = $${formatNumber(c.miningValue || 0, 1)}M
                                        <small>(of $${formatNumber(c.perpetualMiningValue || 0, 1)}M perpetual)</small>
                                    </span>
                                    `}
                                </div>
                                ${!c.isPerpetual && c.yearsToConv !== null ? `
                                <div class="formula-display" style="margin-top: 8px; font-size: 11px; color: #888;">
                                    <span class="formula-label">NPV Formula:</span>
                                    <span class="formula-part">E × (1 - (1+r)^-T) / r</span>
                                    <span class="formula-op">=</span>
                                    <span class="formula-part">$${formatNumber(c.ebitda || 0, 2)}M × (1 - (1+${rateDisplay})^-${yearsDisplay}) / ${rateDisplay}</span>
                                </div>
                                ` : ''}
                            </div>
                            ${c.conversionValue > 0 ? `
                            <div class="valuation-section">
                                <h4>Prospective HPC Lease (${c.conversionYear} conversion - legacy)</h4>
                                <div class="formula-display">
                                    <span class="formula-label">HPC Value =</span>
                                    <span class="formula-part">NOI ($${formatNumber(c.conversionComponents?.noi || 0, 1)}M)</span>
                                    <span class="formula-op">÷</span>
                                    <span class="formula-part">Cap (${((c.conversionComponents?.capEff || 0.12) * 100).toFixed(1)}%)</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Term (${(c.conversionComponents?.termFactor || 1).toFixed(2)})</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Mult (${(c.conversionComponents?.combinedMult || 1).toFixed(2)})</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">Fidoodle (${(c.conversionComponents?.fidoodle || 1).toFixed(2)})</span>
                                    <span class="formula-result">= $${formatNumber(c.potentialHpcValue || 0, 1)}M</span>
                                </div>
                                <div class="formula-display" style="margin-top: 8px;">
                                    <span class="formula-label">Pipeline Value =</span>
                                    <span class="formula-part">$${formatNumber(c.potentialHpcValue || 0, 1)}M</span>
                                    <span class="formula-op">×</span>
                                    <span class="formula-part">${c.conversionYear} discount (${((c.conversionDiscount || 0) * 100).toFixed(0)}%)</span>
                                    <span class="formula-result">= $${formatNumber(c.conversionValue || 0, 1)}M</span>
                                </div>
                            </div>
                            ` : ''}
                            <div class="valuation-total">
                                <strong>Total Value: $${formatNumber(valuation.value, 1)}M</strong>
                                (Mining: $${formatNumber(c.miningValue || 0, 1)}M${c.conversionValue > 0 ? ` + HPC Pipeline: $${formatNumber(c.conversionValue || 0, 1)}M` : ''})
                            </div>
                            <button class="btn btn-small edit-project-btn" data-project-id="${project.id}">Edit Conversion Date & Terms</button>
                        </div>
                    </td>
                `;
            } else {
                expandedTr.innerHTML = `
                    <td colspan="13">
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
            const projectId = e.target.dataset.projectId;
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
            const projectId = cell.dataset.projectId;
            openFidoodleEditor(projectId);
        });
    });

    // Add event listeners for edit buttons in expanded rows
    document.querySelectorAll('.edit-project-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectId = btn.dataset.projectId;
            // Try both string and numeric ID matching
            const allProjs = [...ALL_PROJECTS, ...customProjects];
            const project = allProjs.find(p => p.id === projectId || p.id === parseInt(projectId) || String(p.id) === projectId);
            if (project) openProjectModal(project);
        });
    });
}

// Fidoodle editor popup
function openFidoodleEditor(projectId) {
    const allProjects = [...ALL_PROJECTS, ...customProjects];
    // Support both string and numeric IDs
    const project = allProjects.find(p => p.id === projectId || p.id === parseInt(projectId) || String(p.id) === projectId);
    if (!project) return;
    // Use the actual project ID for overrides
    projectId = project.id;

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
// PROJECT MODAL
// ============================================================
function openProjectModal(project) {
    const modal = document.getElementById('project-modal');
    const overrides = projectOverrides[project.id] || {};
    const itMw = overrides.itMw || project.it_mw || 0;

    document.getElementById('project-modal-title').textContent = `${project.ticker}: ${project.name}`;
    document.getElementById('project-id').value = project.id;
    document.getElementById('project-ticker').value = project.ticker;
    document.getElementById('project-name').value = project.name;
    document.getElementById('project-country').value = project.country;
    document.getElementById('project-grid').value = project.grid || '';
    document.getElementById('project-it-mw').value = itMw || '';

    // Country multiplier
    const countryMult = getCountryMultiplier(project.country);
    document.getElementById('project-country-mult').value = overrides.countryMult || '';
    document.getElementById('hint-country-mult').textContent = `(default: ${countryMult.toFixed(2)})`;

    // BTC Mining section
    const defaultMiningEbitda = factors.btcMining.ebitdaPerMw * itMw;
    document.getElementById('project-mining-ebitda').value = overrides.miningEbitdaAnnualM ?? '';
    document.getElementById('hint-mining-ebitda').textContent = `(default: $${defaultMiningEbitda.toFixed(1)}M)`;

    document.getElementById('project-btc-multiple').value = overrides.btcEbitdaMultiple ?? '';
    document.getElementById('hint-btc-multiple').textContent = `(default: ${factors.btcMining.ebitdaMultiple}x)`;

    // HPC Conversion section
    document.getElementById('project-hpc-conversion-date').value = overrides.hpcConversionDate || '';

    // Conversion probability
    const convProb = overrides.conversionProbability ?? 50;
    document.getElementById('project-conv-prob').value = overrides.conversionProbability ?? '';
    document.getElementById('project-conv-prob-slider').value = convProb;
    document.getElementById('project-conv-prob-display').textContent = convProb + '%';

    // HPC lease terms (rent is now $/MW/year)
    document.getElementById('project-rent-mw').value = overrides.rentMw ?? '';
    document.getElementById('hint-hpc-rent').textContent = `(default: $${factors.baseNoiPerMw.toFixed(2)}M)`;

    document.getElementById('project-term').value = overrides.term || '';
    document.getElementById('hint-term').textContent = `(default: ${factors.defaultTerm}y)`;

    document.getElementById('project-escalator').value = overrides.escalator || '';
    document.getElementById('hint-escalator').textContent = `(default: ${factors.escalator}%)`;

    document.getElementById('project-credit').value = overrides.credit || '';
    document.getElementById('project-passthrough').value = overrides.passthrough ?? '';

    // Fidoodle
    const fidoodle = overrides.fidoodle ?? factors.fidoodleDefault;
    document.getElementById('project-fidoodle').value = overrides.fidoodle ?? '';
    document.getElementById('project-fidoodle-slider').value = fidoodle;
    document.getElementById('project-fidoodle-display').textContent = fidoodle.toFixed(2);

    // Cap rate override
    document.getElementById('project-cap-override').value = overrides.capOverride || '';

    // Advanced overrides
    document.getElementById('project-lease-type').value = overrides.leaseType || '';
    document.getElementById('project-concentration').value = overrides.concentration || '';
    document.getElementById('project-ownership').value = overrides.ownership || '';
    document.getElementById('project-build-status').value = overrides.buildStatus || '';
    document.getElementById('project-size-mult').value = overrides.sizeMult || '';
    document.getElementById('project-grid-mult').value = overrides.gridMult || '';
    document.getElementById('project-noi').value = overrides.noi || '';

    updateValuationPreview();
    modal.classList.add('active');
}

function closeProjectModal() {
    document.getElementById('project-modal').classList.remove('active');
}

function updateValuationPreview() {
    const projectIdStr = document.getElementById('project-id').value;
    const allProjects = [...ALL_PROJECTS, ...customProjects];
    const project = allProjects.find(p => p.id === projectIdStr || p.id === parseInt(projectIdStr) || String(p.id) === projectIdStr);
    if (!project) return;

    const overrides = getOverridesFromForm();
    const itMw = overrides.itMw || project.it_mw || 0;

    // Update preview title with site MW
    document.getElementById('preview-title').textContent = `Live Valuation: ${itMw.toLocaleString()} MW site`;

    // Calculate BTC mining value (regardless of site type, for preview purposes)
    const miningVal = calculateBtcMiningValue(project, overrides);

    // Calculate HPC conversion value
    const conversionVal = calculateHpcConversionValue(project, overrides);

    // Get conversion probability
    const convProb = (overrides.conversionProbability ?? 50) / 100;
    const hasConversionDate = !!overrides.hpcConversionDate;

    // === BTC Mining Section ===
    document.getElementById('preview-mining-ebitda').textContent = '$' + formatNumber(miningVal.ebitda || 0, 1) + 'M/yr';
    document.getElementById('preview-mining-multiple').textContent = (miningVal.ebitdaMultiple || 0).toFixed(1) + 'x';

    if (miningVal.isPerpetual || !hasConversionDate) {
        document.getElementById('preview-mining-period').textContent = 'Perpetual';
    } else {
        const years = miningVal.yearsToConv || 0;
        document.getElementById('preview-mining-period').textContent = years.toFixed(1) + ' years';
    }

    document.getElementById('preview-mining-value').textContent = '$' + formatNumber(miningVal.value || 0, 1) + 'M';
    document.getElementById('preview-btc-value').textContent = '$' + formatNumber(miningVal.value || 0, 1) + 'M';

    // === HPC Conversion Section ===
    if (hasConversionDate) {
        const convDate = new Date(overrides.hpcConversionDate);
        const dateStr = convDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        document.getElementById('preview-conv-date').textContent = dateStr;
    } else {
        document.getElementById('preview-conv-date').textContent = 'Never';
    }

    document.getElementById('preview-conv-prob').textContent = (convProb * 100).toFixed(0) + '%';

    // Calculate HPC NOI for preview
    const hpcNoi = conversionVal.components?.noi || 0;
    document.getElementById('preview-hpc-noi').textContent = '$' + formatNumber(hpcNoi, 1) + 'M/yr';

    // Cap rate
    const capRate = conversionVal.components?.capEff || 0;
    document.getElementById('preview-cap').textContent = (capRate * 100).toFixed(1) + '%';
    document.getElementById('hint-cap-rate').textContent = 'Effective: ' + (capRate * 100).toFixed(1) + '%';

    // Fidoodle
    const fidoodle = conversionVal.components?.fidoodle || factors.fidoodleDefault;
    document.getElementById('preview-fidoodle').textContent = fidoodle.toFixed(2);

    // HPC option value (probability-weighted)
    const hpcOptionValue = hasConversionDate ? conversionVal.value * convProb : 0;
    document.getElementById('preview-hpc-option').textContent = '$' + formatNumber(hpcOptionValue, 1) + 'M';
    document.getElementById('preview-hpc-value').textContent = '$' + formatNumber(hpcOptionValue, 1) + 'M';

    // === Total Value ===
    const totalValue = miningVal.value + hpcOptionValue;
    document.getElementById('preview-value').textContent = '$' + formatNumber(totalValue, 1) + 'M';

    // Breakdown text
    if (hasConversionDate && hpcOptionValue > 0) {
        document.getElementById('preview-breakdown').textContent =
            `$${formatNumber(miningVal.value, 1)}M mining + $${formatNumber(hpcOptionValue, 1)}M HPC (${(convProb * 100).toFixed(0)}% prob)`;
    } else {
        document.getElementById('preview-breakdown').textContent = 'BTC mining only (no conversion set)';
    }
}

function getOverridesFromForm() {
    const hpcConversionDate = document.getElementById('project-hpc-conversion-date').value;
    return {
        // Site basics
        itMw: parseFloatOrNull(document.getElementById('project-it-mw').value),
        countryMult: parseFloatOrNull(document.getElementById('project-country-mult').value),

        // BTC Mining
        miningEbitdaAnnualM: parseFloatOrNull(document.getElementById('project-mining-ebitda').value),
        btcEbitdaMultiple: parseFloatOrNull(document.getElementById('project-btc-multiple').value),

        // HPC Conversion
        hpcConversionDate: hpcConversionDate || null,
        conversionProbability: parseFloatOrNull(document.getElementById('project-conv-prob').value),
        rentMw: parseFloatOrNull(document.getElementById('project-rent-mw').value),
        term: parseFloatOrNull(document.getElementById('project-term').value),
        escalator: parseFloatOrNull(document.getElementById('project-escalator').value),
        credit: document.getElementById('project-credit').value || null,
        passthrough: parseFloatOrNull(document.getElementById('project-passthrough').value),
        fidoodle: parseFloatOrNull(document.getElementById('project-fidoodle').value),
        capOverride: parseFloatOrNull(document.getElementById('project-cap-override').value),

        // Advanced overrides
        leaseType: document.getElementById('project-lease-type').value || null,
        concentration: document.getElementById('project-concentration').value || null,
        ownership: document.getElementById('project-ownership').value || null,
        buildStatus: document.getElementById('project-build-status').value || null,
        sizeMult: parseFloatOrNull(document.getElementById('project-size-mult').value),
        gridMult: parseFloatOrNull(document.getElementById('project-grid-mult').value),
        noi: parseFloatOrNull(document.getElementById('project-noi').value)
    };
}

// HPC Conversion Date helper functions
function setConversionDateNever() {
    document.getElementById('project-hpc-conversion-date').value = '';
    updateValuationPreview();
}

function setConversionDateOffset(years) {
    const date = new Date();
    date.setFullYear(date.getFullYear() + years);
    const iso = date.toISOString().split('T')[0];
    document.getElementById('project-hpc-conversion-date').value = iso;
    updateValuationPreview();
}

function setConversionDateEnd(year) {
    document.getElementById('project-hpc-conversion-date').value = `${year}-12-31`;
    updateValuationPreview();
}

function parseFloatOrNull(val) {
    if (val === '' || val === null || val === undefined) return null;
    const str = String(val).trim();
    if (str === '') return null;
    const parsed = parseFloat(str);
    return isNaN(parsed) ? null : parsed;
}

function saveProjectOverrides(e) {
    e.preventDefault();
    // Use the project ID as stored (could be string or number)
    const projectId = document.getElementById('project-id').value;
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

    const currentTicker = tickerFilter.value;
    tickerFilter.innerHTML = '<option value="">All</option>';
    tickers.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        tickerFilter.appendChild(opt);
    });
    tickerFilter.value = currentTicker;

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

function formatEnergizationDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear();
    // For dates before 2020, show as "Operational"
    if (year < 2020) return 'Oper.';
    return `${month} ${year}`;
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

        let contractedMw = 0, pipelineMw = 0, contractedEv = 0, pipelineEv = 0, miningMw = 0, miningEV = 0;

        projects.forEach(p => {
            const overrides = projectOverrides[p.id] || {};
            const valuation = calculateProjectValue(p, overrides);

            if (valuation.isBtcSite) {
                // BTC mining site - split mining value from HPC conversion option
                miningMw += p.it_mw || 0;
                miningEV += valuation.components.miningValue || 0;
                // HPC conversion option value goes to pipeline
                if (valuation.components.conversionValue > 0) {
                    pipelineEv += valuation.components.conversionValue;
                }
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
