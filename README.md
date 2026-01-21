# BTC Miner Valuation Terminal v6

A Bloomberg terminal-style web application for valuing Bitcoin mining companies with integrated HPC/AI lease DCF modeling.

## Features

- **Dashboard**: Overview of all miners with live BTC prices, HODL values, and fair value calculations
- **Projects**: Complete project list with filtering by ticker, status, and use type
- **HPC Val**: Detailed DCF valuation of all contracted HPC/AI leases
- **Factors**: Configurable valuation factors (cap rates, size factors, credit adjustments)

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

## Data Sources

- Miner financials from Q3/Q4 2024 SEC filings (10-Q/10-K)
- HPC lease data from company press releases and investor presentations
- Live BTC/ETH prices from CoinGecko API

## Usage

1. **Dashboard**: View all miners with calculated fair values. Hover over HODL, Cash, Debt, Shares columns to see source data.
2. **HPC Val**: Click "Load Seed Data" to populate with all contracted HPC leases. Edit projects or add new ones.
3. **Factors**: Adjust valuation parameters (cap rate, credit factors)

## Files

- `server.js` - Express server with JSON file storage
- `public/index.html` - Main HTML with Bloomberg terminal styling
- `public/app.js` - All application logic, data, and rendering
- `data.json` - Persisted user data (overrides, projects)
