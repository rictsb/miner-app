#!/usr/bin/env node
/**
 * XLSX Import Script for BTC Miner Valuation App
 *
 * Usage: node scripts/import-projects-xlsx.js /path/to/workbook.xlsx
 *
 * Reads sheet "Project List V9" and regenerates seed-data.json projects array.
 * Preserves existing miners data and handles missing columns gracefully.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SEED_DATA_PATH = path.join(__dirname, '..', 'seed-data.json');
const SHEET_NAME = 'Project List V9';

/**
 * Generate a stable ID from ticker, project name, and site phase
 * Format: lowercase, alphanumeric + hyphens
 */
function generateStableId(ticker, projectName, sitePhase) {
    const parts = [ticker, projectName, sitePhase || ''].filter(Boolean);
    return parts
        .join('::')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Parse Excel date to ISO string (YYYY-MM-DD)
 */
function parseDate(value) {
    if (!value) return null;

    // Handle Excel serial date numbers
    if (typeof value === 'number') {
        const date = XLSX.SSF.parse_date_code(value);
        if (date) {
            const y = date.y;
            const m = String(date.m).padStart(2, '0');
            const d = String(date.d).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }

    // Handle Date objects
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    // Handle string dates like "Nov-2025"
    if (typeof value === 'string') {
        const monthYearMatch = value.match(/^([A-Za-z]{3})-(\d{4})$/);
        if (monthYearMatch) {
            const months = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                           Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
            const m = months[monthYearMatch[1]];
            if (m) return `${monthYearMatch[2]}-${m}-01`;
        }

        // Try to parse as ISO date
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return value.substring(0, 10);
    }

    return null;
}

/**
 * Safely get a numeric value
 */
function getNumber(value, defaultVal = null) {
    if (value === null || value === undefined || value === '') return defaultVal;
    const num = parseFloat(value);
    return isNaN(num) ? defaultVal : num;
}

/**
 * Safely get a string value
 */
function getString(value, defaultVal = '') {
    if (value === null || value === undefined) return defaultVal;
    return String(value).trim() || defaultVal;
}

/**
 * Main import function
 */
function importProjectsFromXlsx(xlsxPath) {
    console.log(`\nImporting projects from: ${xlsxPath}`);
    console.log(`Target sheet: ${SHEET_NAME}\n`);

    // Read Excel file
    if (!fs.existsSync(xlsxPath)) {
        console.error(`Error: File not found: ${xlsxPath}`);
        process.exit(1);
    }

    const workbook = XLSX.readFile(xlsxPath, { cellDates: true });

    if (!workbook.SheetNames.includes(SHEET_NAME)) {
        console.error(`Error: Sheet "${SHEET_NAME}" not found.`);
        console.log(`Available sheets: ${workbook.SheetNames.join(', ')}`);
        process.exit(1);
    }

    const sheet = workbook.Sheets[SHEET_NAME];
    const rows = XLSX.utils.sheet_to_json(sheet);

    console.log(`Found ${rows.length} rows in sheet "${SHEET_NAME}"\n`);

    // Load existing seed data to preserve miners
    let existingSeed = { miners: [], projects: [] };
    if (fs.existsSync(SEED_DATA_PATH)) {
        try {
            existingSeed = JSON.parse(fs.readFileSync(SEED_DATA_PATH, 'utf8'));
            console.log(`Loaded existing seed data with ${existingSeed.miners?.length || 0} miners`);
        } catch (e) {
            console.warn('Warning: Could not parse existing seed-data.json, starting fresh');
        }
    }

    // Map column names (case-insensitive lookup)
    const colMap = {};
    if (rows.length > 0) {
        const sampleRow = rows[0];
        for (const key of Object.keys(sampleRow)) {
            colMap[key.toLowerCase().replace(/[^a-z0-9]/g, '_')] = key;
        }
    }

    const getCol = (row, ...names) => {
        for (const name of names) {
            const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
            if (colMap[normalized]) {
                return row[colMap[normalized]];
            }
            // Also try exact match
            if (row[name] !== undefined) return row[name];
        }
        return undefined;
    };

    // Transform rows to projects
    const projects = [];
    let idCounter = 1;

    for (const row of rows) {
        const ticker = getString(getCol(row, 'Ticker'));
        const siteName = getString(getCol(row, 'Site_Name', 'SiteName', 'Project'));

        if (!ticker || !siteName) {
            console.warn(`Skipping row with missing ticker or site name`);
            continue;
        }

        const sitePhase = getString(getCol(row, 'Site_Phase', 'SitePhase'));
        const stableId = generateStableId(ticker, siteName, sitePhase);

        // Parse energization date
        const energizationDate = parseDate(getCol(row, 'Energization_Date', 'EnergizationDate'));

        // Parse lease start date
        const leaseStartDate = parseDate(getCol(row, 'Lease_Start', 'LeaseStart'));

        // Build project object
        const project = {
            id: stableId,
            numericId: idCounter++,
            ticker: ticker,
            project: siteName,
            site_phase: sitePhase,
            location: `${getString(getCol(row, 'State'))}, ${getString(getCol(row, 'Country'))}`.replace(/^, /, ''),
            country: getString(getCol(row, 'Country'), 'United States'),
            state: getString(getCol(row, 'State')),
            gross_mw: getNumber(getCol(row, 'Gross_MW', 'GrossMW'), 0),
            it_mw: getNumber(getCol(row, 'IT_MW', 'ITMW'), 0),
            pue: getNumber(getCol(row, 'PUE'), 1.3),
            grid: getString(getCol(row, 'Grid')),
            current_use: getString(getCol(row, 'Current_Use', 'CurrentUse')),
            status: getString(getCol(row, 'Status'), 'Development'),
            energization_date: energizationDate,
            lessee: getString(getCol(row, 'Lessee')),
            source_url: getString(getCol(row, 'Source_URL', 'SourceURL')),

            // Lease details
            lease_value_m: getNumber(getCol(row, 'Lease_Value_M', 'LeaseValueM')),
            lease_years: getNumber(getCol(row, 'Lease_Yrs', 'LeaseYrs', 'Lease_Years')),
            annual_rev_m: getNumber(getCol(row, 'Annual_Rev_M', 'AnnualRevM')),
            noi_pct: getNumber(getCol(row, 'NOI_Pct', 'NOIPct')),
            lease_start_date: leaseStartDate,

            // Mining specific fields
            mining_ebitda_annual_m: getNumber(getCol(row, 'Mining_EBITDA_Annual_$M', 'MiningEBITDAAnnualM')),

            // HPC conversion probability
            hpc_conv_prob: getNumber(getCol(row, 'HPC_Conv_Prob', 'HPCConvProb')),

            // Location coordinates
            lat: getNumber(getCol(row, 'Latitude', 'Lat')),
            lng: getNumber(getCol(row, 'Longitude', 'Long', 'Lng'))
        };

        // Clean up null/undefined values
        for (const key of Object.keys(project)) {
            if (project[key] === null || project[key] === undefined || project[key] === '') {
                delete project[key];
            }
        }

        // Ensure required fields have defaults
        if (!project.country) project.country = 'United States';
        if (!project.status) project.status = 'Development';
        if (project.it_mw === undefined) project.it_mw = 0;
        if (project.gross_mw === undefined) project.gross_mw = 0;

        projects.push(project);
    }

    console.log(`Processed ${projects.length} projects\n`);

    // Create new seed data
    const newSeedData = {
        miners: existingSeed.miners || [],
        projects: projects
    };

    // Write to seed-data.json
    fs.writeFileSync(SEED_DATA_PATH, JSON.stringify(newSeedData, null, 2));
    console.log(`Successfully wrote ${projects.length} projects to ${SEED_DATA_PATH}`);

    // Summary by ticker
    const tickerCounts = {};
    for (const p of projects) {
        tickerCounts[p.ticker] = (tickerCounts[p.ticker] || 0) + 1;
    }
    console.log('\nProjects by ticker:');
    for (const [ticker, count] of Object.entries(tickerCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${ticker}: ${count}`);
    }

    // Fields summary
    const fieldsWithData = new Set();
    for (const p of projects) {
        for (const key of Object.keys(p)) {
            if (p[key] !== null && p[key] !== undefined && p[key] !== '') {
                fieldsWithData.add(key);
            }
        }
    }
    console.log(`\nFields populated: ${[...fieldsWithData].sort().join(', ')}`);
}

// CLI entry point
const args = process.argv.slice(2);
if (args.length === 0) {
    console.log('Usage: node scripts/import-projects-xlsx.js /path/to/workbook.xlsx');
    console.log('\nThis script reads the "Project List V9" sheet from an Excel workbook');
    console.log('and regenerates seed-data.json with the project data.');
    process.exit(1);
}

importProjectsFromXlsx(args[0]);
