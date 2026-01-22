# BTC Miner Valuation Terminal v7

A Bloomberg terminal-style web application for valuing Bitcoin mining companies with integrated HPC/AI lease DCF modeling.

## Features

- **Dashboard**: Overview of all miners with live BTC prices, HODL values, and fair value calculations
- **Projects**: Complete project list with filtering by ticker, status, and use type
- **HPC Conversion Date**: Per-project date picker to truncate mining value when converting to HPC
- **Factors**: Configurable valuation factors (cap rates, size factors, credit adjustments)
- **Map**: Geographic visualization of all projects

## HPC Leases Included (from Excel)

| Ticker | Tenant | MW | Contract Value |
|--------|--------|-----|----------------|
| APLD | CoreWeave | 400 | $11B |
| APLD | IG Hyperscaler | 200 | $5B |
| CIFR | AWS | 214 | $5.5B |
| CIFR | Fluidstack/Google | 207 | $3.8B |
| CORZ | CoreWeave | 780 | $8.7B |
| GLXY | CoreWeave | 526 | $15B |
| HUT | Fluidstack/Anthropic | 245 | $7B |
| IREN | Microsoft | 200 | $9.7B |
| WULF | Fluidstack/Google | 512 | $11.5B |
| RIOT | AMD | 25 | $311M |

## Installation

```bash
npm install
npm start
```

Then open http://localhost:3000

## Regenerate Project Dataset from XLSX

To update the project data from an Excel workbook:

```bash
# Install dev dependencies (xlsx)
npm install

# Run the import script
node scripts/import-projects-xlsx.js /path/to/Miner_Projects.xlsx
```

This reads the "Project List V9" sheet and regenerates `seed-data.json` with:
- Project ID (stable slug from ticker::name::phase)
- Energization dates
- Mining EBITDA values
- HPC conversion probabilities
- Lease details

Manual overrides in `data.json` are preserved and continue to work after regeneration.

## Valuation Engine

### BTC Mining Sites

Mining value = Annual EBITDA × Multiple × Country Factor

**With HPC Conversion Date:**
- If conversion date is set, mining value is truncated using NPV formula
- Uses the EBITDA multiple as implied discount rate (5x = 20% rate)
- NPV = E × (1 - (1+r)^-T) / r, capped at perpetual value

**Acceptance Checks:**
- e=10 ($M/yr), m=5: no conversion → miningEV=50
- e=10, m=5: convDate=today → miningEV=0
- e=10, m=5: convDate=+1y → miningEV≈8.33
- e=10, m=5: convDate=+10y → miningEV approaches but never exceeds 50

### HPC/AI Lease Sites

Value = (NOI / Cap Rate) × Term Factor × Multipliers × Fidoodle

## Data Sources

- Miner financials from Q3/Q4 2024 SEC filings (10-Q/10-K)
- HPC lease data from company press releases and investor presentations
- Live BTC/ETH prices from CoinGecko API
- Stock prices from Finnhub API

## Files

- `server.js` - Express server with JSON file storage
- `public/index.html` - Main HTML with Bloomberg terminal styling
- `public/app.js` - All application logic, data, and rendering
- `data.json` - Persisted user data (overrides, projects)
- `seed-data.json` - Generated project data from XLSX import
- `scripts/import-projects-xlsx.js` - XLSX import script
