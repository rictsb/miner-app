// Global state
let miners = [];
let projects = [];
let valuations = [];
let factors = [];
let projectValuations = {};
let map = null;
let markers = [];
let selectedMiner = null;
let expandedRows = new Set();
let expandedProjects = new Set();

// Sorting state
let valuationSort = { col: 'net_value', dir: 'desc' };
let projectSort = { col: 'value', dir: 'desc' };

// Column widths (stored in localStorage)
let columnWidths = JSON.parse(localStorage.getItem('columnWidths') || '{}');

// Fidoodle factors - manual overrides per project (stored in localStorage)
let fidoodleFactors = JSON.parse(localStorage.getItem('fidoodleFactors') || '{}');

// Miner data sources/overrides (stored in localStorage)
let minerOverrides = JSON.parse(localStorage.getItem('minerOverrides') || '{}');

const API_BASE = '/api';

// ============== COLUMN DEFINITIONS ==============

const valuationColumns = [
  { key: 'expand', label: '', width: 20, sortable: false },
  { key: 'ticker', label: 'Ticker', width: 60, sortable: true, align: 'left' },
  { key: 'mining_ev', label: 'Mining', width: 70, sortable: true, align: 'right', format: 'money' },
  { key: 'lease_value', label: 'Lease', width: 70, sortable: true, align: 'right', format: 'money', class: 'text-success' },
  { key: 'pipeline_value', label: 'Pipeline', width: 70, sortable: true, align: 'right', format: 'money', class: 'text-warning' },
  { key: 'hodl_value', label: 'HODL', width: 70, sortable: true, align: 'right', format: 'money', hasSource: true },
  { key: 'cash', label: 'Cash', width: 60, sortable: true, align: 'right', format: 'money', hasSource: true },
  { key: 'debt', label: 'Debt', width: 60, sortable: true, align: 'right', format: 'money', class: 'text-danger', hasSource: true },
  { key: 'net_value', label: 'Net Val', width: 80, sortable: true, align: 'right', format: 'money' },
  { key: 'fd_shares_m', label: 'Shares', width: 60, sortable: true, align: 'right', format: 'number', hasSource: true },
  { key: 'current_price', label: 'Price', width: 60, sortable: true, align: 'right', format: 'price' },
  { key: 'implied_value', label: 'Impl/Sh', width: 60, sortable: true, align: 'right', format: 'price' },
  { key: 'upside_pct', label: 'Upside', width: 60, sortable: true, align: 'right', format: 'percent' }
];

const projectColumns = [
  { key: 'expand', label: '', width: 20, sortable: false },
  { key: 'ticker', label: 'Ticker', width: 55, sortable: true, align: 'left' },
  { key: 'site_name', label: 'Site', width: 120, sortable: true, align: 'left' },
  { key: 'it_mw', label: 'IT MW', width: 55, sortable: true, align: 'right', format: 'number' },
  { key: 'grid', label: 'Grid', width: 55, sortable: true, align: 'left' },
  { key: 'site_phase', label: 'Phase', width: 90, sortable: true, align: 'left' },
  { key: 'lessee', label: 'Lessee', width: 70, sortable: true, align: 'left' },
  { key: 'noi_annual_m', label: 'NOI $M', width: 55, sortable: true, align: 'right', format: 'decimal' },
  { key: 'value', label: 'Value $M', width: 70, sortable: true, align: 'right', format: 'decimal', class: 'text-success' },
  { key: 'factor', label: 'Factor', width: 50, sortable: true, align: 'right', format: 'factor' },
  { key: 'confidence', label: 'Conf', width: 50, sortable: true, align: 'left' },
  { key: 'actions', label: '', width: 30, sortable: false }
];

// ============== INITIALIZATION ==============

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadData();
  fetchLiveBtcPrice();
  // Refresh BTC price every 60 seconds
  setInterval(fetchLiveBtcPrice, 60000);
});

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
      if (tab.dataset.tab === 'map' && !map) {
        setTimeout(initMap, 100);
      }
    });
  });
}

async function loadData() {
  try {
    const [minersRes, projectsRes, factorsRes, statsRes] = await Promise.all([
      fetch(`${API_BASE}/miners`),
      fetch(`${API_BASE}/projects`),
      fetch(`${API_BASE}/factors`),
      fetch(`${API_BASE}/stats`)
    ]);
    miners = await minersRes.json();
    projects = await projectsRes.json();
    factors = await factorsRes.json();
    const stats = await statsRes.json();
    renderMinerList();
    renderStats(stats);
    populateFilters();
    renderFactors();
    refreshValuations();
  } catch (err) {
    console.error('Error loading data:', err);
  }
}

// ============== LIVE BTC PRICE ==============

async function fetchLiveBtcPrice() {
  try {
    const res = await fetch(`${API_BASE}/btc-price`);
    const data = await res.json();
    if (data.price) {
      document.getElementById('btc-price').value = Math.round(data.price);
      document.getElementById('btc-live-indicator').textContent = '● LIVE';
      refreshValuations();
    }
  } catch (err) {
    document.getElementById('btc-live-indicator').textContent = '';
    console.log('Could not fetch live BTC price');
  }
}

// ============== VALUATIONS ==============

async function refreshValuations() {
  const btcPrice = document.getElementById('btc-price').value || 90000;
  const evPerEh = document.getElementById('ev-per-eh').value || 54;
  try {
    // Re-fetch factors to get any updates
    const factorsRes = await fetch(`${API_BASE}/factors`);
    factors = await factorsRes.json();

    const res = await fetch(`${API_BASE}/valuations-enhanced?btc_price=${btcPrice}&ev_per_eh=${evPerEh}`);
    valuations = await res.json();
    calculateProjectValuations();
    renderValuationHeader();
    renderValuationTable();
    renderProjectsHeader();
    renderProjects();
    renderMinerList();
  } catch (err) {
    console.error('Error refreshing valuations:', err);
  }
}

async function refreshStockPrices() {
  const btcPrice = document.getElementById('btc-price').value || 90000;
  const evPerEh = document.getElementById('ev-per-eh').value || 54;
  try {
    const res = await fetch(`${API_BASE}/valuations-enhanced?btc_price=${btcPrice}&ev_per_eh=${evPerEh}&refresh_prices=true`);
    valuations = await res.json();
    calculateProjectValuations();
    renderValuationTable();
    renderMinerList();
  } catch (err) {
    console.error('Error refreshing stock prices:', err);
  }
}

function calculateProjectValuations() {
  const factorLookup = {};
  factors.forEach(f => {
    if (!factorLookup[f.category]) factorLookup[f.category] = {};
    factorLookup[f.category][f.factor_key] = f.multiplier;
  });

  const capRate = factorLookup['valuation']?.['cap_rate'] || 0.12;
  const noiPerMwYr = factorLookup['valuation']?.['noi_per_mw_yr'] || 1.4;

  projectValuations = {};

  projects.forEach(p => {
    let phaseFactor = factorLookup['phase']?.[p.site_phase] || 0.5;
    let gridFactor = 1;
    if (factorLookup['grid'] && p.grid) {
      const gridKey = p.grid.split(' ')[0];
      gridFactor = factorLookup['grid'][gridKey] || 0.9;
    }
    let yearFactor = 1;
    if (factorLookup['year'] && p.energization_date) {
      const yearMatch = p.energization_date.match(/20\d{2}/);
      if (yearMatch) yearFactor = factorLookup['year'][yearMatch[0]] || 0.5;
    }
    let sizeFactor = 1;
    if (factorLookup['size'] && p.it_mw) {
      if (p.it_mw >= 500) sizeFactor = factorLookup['size']['500'] || 1.1;
      else if (p.it_mw >= 250) sizeFactor = factorLookup['size']['250'] || 1.0;
      else if (p.it_mw >= 100) sizeFactor = factorLookup['size']['100'] || 0.95;
      else sizeFactor = factorLookup['size']['99'] || 0.85;
    }

    // Country factor - defaults to 1.0 if not found
    let countryFactor = 1;
    if (factorLookup['country'] && p.country) {
      countryFactor = factorLookup['country'][p.country];
      if (countryFactor === undefined) countryFactor = 1.0; // default for unlisted countries
    }

    // Fidoodle factor - manual override per project
    const fidoodleFactor = fidoodleFactors[p.id] !== undefined ? fidoodleFactors[p.id] : null;
    const hasFidoodle = fidoodleFactor !== null;

    // Combined factor uses fidoodle if set, otherwise calculated factors
    const calculatedFactor = phaseFactor * gridFactor * yearFactor * sizeFactor * countryFactor;
    const combinedFactor = hasFidoodle ? fidoodleFactor : calculatedFactor;

    let leaseValue = 0, pipelineValue = 0, valueType = 'none';
    let baseNoi = 0, estimatedNoi = 0;

    if (p.noi_annual_m && p.noi_annual_m > 0) {
      baseNoi = p.noi_annual_m;
      leaseValue = (baseNoi / capRate) * combinedFactor;
      valueType = 'lease';
    } else if (p.it_mw && p.it_mw > 0) {
      estimatedNoi = p.it_mw * noiPerMwYr * 0.85;
      pipelineValue = (estimatedNoi / capRate) * combinedFactor;
      valueType = 'pipeline';
    }

    projectValuations[p.id] = {
      lease_value: leaseValue,
      pipeline_value: pipelineValue,
      total_value: leaseValue + pipelineValue,
      value_type: valueType,
      base_noi: baseNoi,
      estimated_noi: estimatedNoi,
      cap_rate: capRate,
      noi_per_mw: noiPerMwYr,
      factors: { phase: phaseFactor, grid: gridFactor, year: yearFactor, size: sizeFactor, country: countryFactor, calculated: calculatedFactor, fidoodle: fidoodleFactor, combined: combinedFactor },
      hasFidoodle: hasFidoodle
    };
  });
}

// ============== SORTABLE & RESIZABLE HEADERS ==============

function renderValuationHeader() {
  const tr = document.getElementById('valuation-header');
  tr.innerHTML = valuationColumns.map((col, i) => {
    const width = columnWidths[`val_${col.key}`] || col.width;
    const sortClass = valuationSort.col === col.key ? `sorted-${valuationSort.dir}` : '';
    const alignClass = col.align === 'right' ? 'text-right' : '';
    return `<th style="width:${width}px;min-width:${width}px" class="${sortClass} ${alignClass}"
      ${col.sortable ? `onclick="sortValuations('${col.key}')"` : ''}>
      ${col.label}<div class="resizer" onmousedown="startResize(event, 'val_${col.key}', ${i})"></div>
    </th>`;
  }).join('');
}

function renderProjectsHeader() {
  const tr = document.getElementById('projects-header');
  tr.innerHTML = projectColumns.map((col, i) => {
    const width = columnWidths[`proj_${col.key}`] || col.width;
    const sortClass = projectSort.col === col.key ? `sorted-${projectSort.dir}` : '';
    const alignClass = col.align === 'right' ? 'text-right' : '';
    return `<th style="width:${width}px;min-width:${width}px" class="${sortClass} ${alignClass}"
      ${col.sortable ? `onclick="sortProjects('${col.key}')"` : ''}>
      ${col.label}<div class="resizer" onmousedown="startResize(event, 'proj_${col.key}', ${i})"></div>
    </th>`;
  }).join('');
}

function sortValuations(col) {
  if (valuationSort.col === col) {
    valuationSort.dir = valuationSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    valuationSort.col = col;
    valuationSort.dir = 'desc';
  }
  renderValuationHeader();
  renderValuationTable();
}

function sortProjects(col) {
  if (projectSort.col === col) {
    projectSort.dir = projectSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    projectSort.col = col;
    projectSort.dir = 'desc';
  }
  renderProjectsHeader();
  renderProjects();
}

function startResize(e, colKey, colIndex) {
  e.preventDefault();
  e.stopPropagation();
  const th = e.target.parentElement;
  const startX = e.pageX;
  const startWidth = th.offsetWidth;
  const resizer = e.target;
  resizer.classList.add('resizing');

  function onMouseMove(e) {
    const newWidth = Math.max(30, startWidth + (e.pageX - startX));
    th.style.width = newWidth + 'px';
    th.style.minWidth = newWidth + 'px';
    columnWidths[colKey] = newWidth;
  }

  function onMouseUp() {
    resizer.classList.remove('resizing');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    localStorage.setItem('columnWidths', JSON.stringify(columnWidths));
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ============== VALUATION TABLE ==============

function getValuationValue(v, key) {
  if (key === 'ticker') return v.ticker;
  if (key === 'fd_shares_m') return v.per_share?.fd_shares_m;
  if (key === 'current_price') return v.per_share?.current_price;
  if (key === 'implied_value') return v.per_share?.implied_value;
  if (key === 'upside_pct') return v.per_share?.upside_pct;
  return v.components?.[key];
}

function renderValuationTable() {
  // Calculate lease and pipeline totals per miner from client-side projectValuations (with factors applied)
  const minerTotals = {};
  projects.forEach(p => {
    const pv = projectValuations[p.id];
    if (!pv) return;
    if (!minerTotals[p.ticker]) minerTotals[p.ticker] = { lease: 0, pipeline: 0 };
    minerTotals[p.ticker].lease += pv.lease_value || 0;
    minerTotals[p.ticker].pipeline += pv.pipeline_value || 0;
  });

  // Override server values with client-calculated values and manual overrides
  valuations.forEach(v => {
    const totals = minerTotals[v.ticker] || { lease: 0, pipeline: 0 };
    v.components.lease_value = totals.lease;
    v.components.pipeline_value = totals.pipeline;

    // Apply manual overrides for HODL, cash, debt
    const overrides = minerOverrides[v.ticker] || {};
    const hodl = overrides.hodl_value !== undefined ? overrides.hodl_value : (v.components.hodl_value || 0);
    const cash = overrides.cash !== undefined ? overrides.cash : (v.components.cash || 0);
    const debt = overrides.debt !== undefined ? overrides.debt : (v.components.debt || 0);

    // Store the effective values
    v.components.hodl_value = hodl;
    v.components.cash = cash;
    v.components.debt = debt;

    // Recalculate net_value with new lease/pipeline values and overrides
    v.components.net_value = (v.components.mining_ev || 0) + hodl +
      totals.lease + totals.pipeline + cash - debt;
    // Recalculate implied value per share
    if (v.per_share?.fd_shares_m > 0) {
      v.per_share.implied_value = v.components.net_value / v.per_share.fd_shares_m;
      if (v.per_share.current_price > 0) {
        v.per_share.upside_pct = ((v.per_share.implied_value / v.per_share.current_price) - 1) * 100;
      }
    }
  });

  const sorted = [...valuations].sort((a, b) => {
    const aVal = getValuationValue(a, valuationSort.col);
    const bVal = getValuationValue(b, valuationSort.col);
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
    return valuationSort.dir === 'asc' ? cmp : -cmp;
  });

  const tbody = document.getElementById('valuation-table');
  let html = '';

  sorted.forEach(v => {
    const ps = v.per_share || {};
    const isExpanded = expandedRows.has(v.ticker);
    const expandIcon = isExpanded ? '▼' : '▶';

    html += `<tr class="data-row ${isExpanded ? 'expanded' : ''}" onclick="toggleRow('${v.ticker}')">`;
    valuationColumns.forEach(col => {
      const width = columnWidths[`val_${col.key}`] || col.width;
      const alignClass = col.align === 'right' ? 'text-right' : '';
      let cellClass = col.class || '';
      let val = '';

      if (col.key === 'expand') {
        val = `<span class="expand-icon">${expandIcon}</span>`;
      } else if (col.key === 'ticker') {
        val = `<strong>${v.ticker}</strong>`;
      } else if (col.key === 'net_value') {
        const nv = v.components.net_value;
        cellClass = nv >= 0 ? 'text-success' : 'text-danger';
        val = `<strong>${fmtNum(nv, 1)}</strong>`;
      } else if (col.key === 'upside_pct') {
        const up = ps.upside_pct;
        if (up != null) {
          cellClass = up >= 0 ? 'text-success' : 'text-danger';
          val = `<strong>${up >= 0 ? '+' : ''}${up.toFixed(1)}%</strong>`;
        } else val = '-';
      } else if (col.hasSource && (col.key === 'hodl_value' || col.key === 'cash' || col.key === 'debt')) {
        const rawVal = v.components[col.key];
        const override = minerOverrides[v.ticker]?.[col.key];
        const source = minerOverrides[v.ticker]?.[col.key + '_source'] || getDefaultSource(v.ticker, col.key);
        const sourceUrl = minerOverrides[v.ticker]?.[col.key + '_url'] || getDefaultSourceUrl(v.ticker);
        const hasOverride = override !== undefined;
        const displayVal = hasOverride ? override : rawVal;
        val = `<span class="source-cell ${hasOverride ? 'has-override' : ''}" title="${source}">
          <span onclick="event.stopPropagation();showEditSourceModal('${v.ticker}', '${col.key}', ${displayVal || 0}, '${source.replace(/'/g, "\\'")}', '${sourceUrl}')">${fmtNum(displayVal, 1)}</span>
          <a href="${sourceUrl}" target="_blank" onclick="event.stopPropagation()" class="source-link-icon" title="View SEC Filing">🔗</a>
        </span>`;
      } else if (col.hasSource && col.key === 'fd_shares_m') {
        const rawVal = ps.fd_shares_m;
        const override = minerOverrides[v.ticker]?.fd_shares_m;
        const source = minerOverrides[v.ticker]?.fd_shares_m_source || 'Fully diluted shares from company filings';
        const sourceUrl = minerOverrides[v.ticker]?.fd_shares_m_url || getDefaultSourceUrl(v.ticker);
        const hasOverride = override !== undefined;
        const displayVal = hasOverride ? override : rawVal;
        val = `<span class="source-cell ${hasOverride ? 'has-override' : ''}" title="${source}">
          <span onclick="event.stopPropagation();showEditSourceModal('${v.ticker}', 'fd_shares_m', ${displayVal || 0}, '${source.replace(/'/g, "\\'")}', '${sourceUrl}')">${displayVal ? fmtNum(displayVal, 1) : '-'}</span>
          <a href="${sourceUrl}" target="_blank" onclick="event.stopPropagation()" class="source-link-icon" title="View SEC Filing">🔗</a>
        </span>`;
      } else if (col.format === 'money') {
        val = fmtNum(v.components[col.key], 1);
      } else if (col.format === 'number') {
        val = ps[col.key] ? fmtNum(ps[col.key], 1) : '-';
      } else if (col.format === 'price') {
        val = ps[col.key] ? '$' + ps[col.key].toFixed(2) : '-';
      }

      html += `<td style="width:${width}px" class="${alignClass} ${cellClass}">${val}</td>`;
    });
    html += `</tr>`;

    if (isExpanded) {
      html += renderExpandedMiner(v);
    }
  });

  tbody.innerHTML = html;
}

function renderExpandedMiner(v) {
  const minerProjects = projects.filter(p => p.ticker === v.ticker);
  const leaseProjects = minerProjects.filter(p => projectValuations[p.id]?.value_type === 'lease');
  const pipelineProjects = minerProjects.filter(p => projectValuations[p.id]?.value_type === 'pipeline');
  const colCount = valuationColumns.length;

  let html = `<tr class="expanded-content"><td colspan="${colCount}"><div class="expanded-inner">`;

  if (leaseProjects.length > 0) {
    html += `<h4>Contracted Leases (${leaseProjects.length})</h4><div class="project-grid">`;
    leaseProjects.forEach(p => {
      const pv = projectValuations[p.id] || {};
      html += `<div class="project-item">
        <div class="project-item-header">
          <span class="project-name">${p.site_name || 'Unnamed'}</span>
          <span class="project-value">$${fmtNum(pv.lease_value, 1)}M</span>
        </div>
        <div class="project-details">
          <span>${p.it_mw || 0} MW</span><span>${p.grid || '-'}</span>
          <span>${p.lessee || '-'}</span><span>NOI: $${(p.noi_annual_m || 0).toFixed(1)}M/yr</span>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (pipelineProjects.length > 0) {
    html += `<h4 style="margin-top:10px">Pipeline (${pipelineProjects.length})</h4><div class="project-grid">`;
    pipelineProjects.forEach(p => {
      const pv = projectValuations[p.id] || {};
      html += `<div class="project-item">
        <div class="project-item-header">
          <span class="project-name">${p.site_name || 'Unnamed'}</span>
          <span class="project-value text-warning">$${fmtNum(pv.pipeline_value, 1)}M</span>
        </div>
        <div class="project-details">
          <span>${p.it_mw || 0} MW</span><span>${p.grid || '-'}</span>
          <span>${p.site_phase || '-'}</span><span>Factor: ${(pv.factors?.combined || 1).toFixed(2)}x</span>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  if (leaseProjects.length === 0 && pipelineProjects.length === 0) {
    html += `<div class="text-muted">No projects with assigned value</div>`;
  }

  html += `</div></td></tr>`;
  return html;
}

function toggleRow(ticker) {
  expandedRows.has(ticker) ? expandedRows.delete(ticker) : expandedRows.add(ticker);
  renderValuationTable();
}

// ============== PROJECTS TABLE ==============

function getProjectValue(p, key) {
  if (key === 'value') return projectValuations[p.id]?.total_value || 0;
  if (key === 'factor') return projectValuations[p.id]?.factors?.combined || 0;
  return p[key];
}

function renderProjects() {
  const ticker = document.getElementById('project-filter-ticker').value;
  const status = document.getElementById('project-filter-status').value;
  const phase = document.getElementById('project-filter-phase').value;
  const search = document.getElementById('project-search').value.toLowerCase();

  let filtered = projects;
  if (ticker) filtered = filtered.filter(p => p.ticker === ticker);
  if (status) filtered = filtered.filter(p => p.status === status);
  if (phase) filtered = filtered.filter(p => p.site_phase === phase);
  if (search) filtered = filtered.filter(p =>
    p.site_name?.toLowerCase().includes(search) ||
    p.lessee?.toLowerCase().includes(search) ||
    p.state?.toLowerCase().includes(search)
  );

  // Sort
  filtered = [...filtered].sort((a, b) => {
    const aVal = getProjectValue(a, projectSort.col);
    const bVal = getProjectValue(b, projectSort.col);
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = typeof aVal === 'string' ? (aVal || '').localeCompare(bVal || '') : (aVal || 0) - (bVal || 0);
    return projectSort.dir === 'asc' ? cmp : -cmp;
  });

  const tbody = document.getElementById('projects-table');
  let html = '';

  filtered.slice(0, 300).forEach(p => {
    const pv = projectValuations[p.id] || {};
    const isExpanded = expandedProjects.has(p.id);
    const expandIcon = isExpanded ? '▼' : '▶';
    const hasFidoodle = pv.hasFidoodle;

    html += `<tr class="data-row ${isExpanded ? 'expanded' : ''} ${hasFidoodle ? 'fidoodle-override' : ''}" onclick="toggleProject(${p.id})">`;
    projectColumns.forEach(col => {
      const width = columnWidths[`proj_${col.key}`] || col.width;
      const alignClass = col.align === 'right' ? 'text-right' : '';
      let cellClass = col.class || '';
      let val = '';

      if (col.key === 'expand') {
        val = `<span class="expand-icon">${expandIcon}</span>`;
      } else if (col.key === 'ticker') {
        val = `<strong>${p.ticker}</strong>`;
      } else if (col.key === 'site_name') {
        val = `<span title="${p.site_name || ''}">${truncate(p.site_name, 18) || '-'}</span>`;
      } else if (col.key === 'site_phase') {
        val = `<span class="badge ${getPhaseClass(p.site_phase)}">${truncate(p.site_phase, 12) || '-'}</span>`;
      } else if (col.key === 'confidence') {
        val = `<span class="badge ${getConfidenceClass(p.confidence)}">${p.confidence || '-'}</span>`;
      } else if (col.key === 'value') {
        const v = pv.total_value || 0;
        cellClass = pv.value_type === 'lease' ? 'text-success' : 'text-warning';
        val = v > 0 ? fmtNum(v, 1) : '-';
      } else if (col.key === 'factor') {
        val = pv.factors?.combined ? pv.factors.combined.toFixed(2) : '-';
      } else if (col.key === 'actions') {
        val = `<button class="secondary" onclick="event.stopPropagation();showEditProjectModal(${p.id})" style="padding:2px 4px">Ed</button>`;
      } else if (col.format === 'number') {
        val = p[col.key] != null ? Math.round(p[col.key]) : '-';
      } else if (col.format === 'decimal') {
        val = p[col.key] != null ? p[col.key].toFixed(1) : '-';
      } else {
        val = truncate(p[col.key], 10) || '-';
      }

      html += `<td style="width:${width}px" class="${alignClass} ${cellClass}">${val}</td>`;
    });
    html += `</tr>`;

    if (isExpanded) {
      html += renderExpandedProject(p, pv);
    }
  });

  tbody.innerHTML = html;
}

function renderExpandedProject(p, pv) {
  const colCount = projectColumns.length;
  const f = pv.factors || {};

  let html = `<tr class="expanded-content"><td colspan="${colCount}"><div class="expanded-inner">
    <h4>Valuation Calculation</h4>
    <div class="calc-breakdown">`;

  if (pv.value_type === 'lease') {
    html += `
      <div class="calc-row"><span class="calc-label">Annual NOI (from data)</span><span class="calc-value">$${(pv.base_noi || 0).toFixed(2)}M</span></div>
      <div class="calc-row"><span class="calc-label">Cap Rate</span><span class="calc-value">${((pv.cap_rate || 0.12) * 100).toFixed(1)}%</span></div>
      <div class="calc-row"><span class="calc-label">Base Value (NOI / Cap Rate)</span><span class="calc-value">$${fmtNum((pv.base_noi || 0) / (pv.cap_rate || 0.12), 1)}M</span></div>
      <div class="calc-row" style="margin-top:6px"><span class="calc-label">Phase Factor (${p.site_phase || '-'})</span><span class="calc-value">${(f.phase || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Grid Factor (${p.grid || '-'})</span><span class="calc-value">${(f.grid || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Year Factor</span><span class="calc-value">${(f.year || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Size Factor (${p.it_mw || 0} MW)</span><span class="calc-value">${(f.size || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Country Factor (${p.country || '-'})</span><span class="calc-value">${(f.country || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Calculated Factor</span><span class="calc-value">${(f.calculated || 1).toFixed(3)}x</span></div>
      <div class="calc-row fidoodle-row"><span class="calc-label">Fidoodle Factor (override)</span><span class="calc-value">
        <input type="number" step="0.01" value="${f.fidoodle !== null ? f.fidoodle : ''}" placeholder="${(f.calculated || 1).toFixed(2)}"
          onclick="event.stopPropagation()" onchange="setFidoodleFactor(${p.id}, this.value)" style="width:60px;text-align:right">
        ${f.fidoodle !== null ? `<button onclick="event.stopPropagation();clearFidoodleFactor(${p.id})" style="margin-left:4px;padding:1px 4px">✕</button>` : ''}
      </span></div>
      <div class="calc-row"><span class="calc-label">Combined Factor ${pv.hasFidoodle ? '(fidoodle)' : ''}</span><span class="calc-value ${pv.hasFidoodle ? 'text-warning' : ''}">${(f.combined || 1).toFixed(3)}x</span></div>
      <div class="calc-row total"><span class="calc-label">Final Value</span><span class="calc-value text-success">$${fmtNum(pv.lease_value, 1)}M</span></div>
      <div class="calc-row"><span class="calc-formula">= $${(pv.base_noi || 0).toFixed(2)}M / ${((pv.cap_rate || 0.12) * 100).toFixed(1)}% × ${(f.combined || 1).toFixed(3)}</span></div>`;
  } else if (pv.value_type === 'pipeline') {
    html += `
      <div class="calc-row"><span class="calc-label">IT Capacity</span><span class="calc-value">${p.it_mw || 0} MW</span></div>
      <div class="calc-row"><span class="calc-label">NOI per MW/yr (factor)</span><span class="calc-value">$${(pv.noi_per_mw || 1.4).toFixed(2)}M</span></div>
      <div class="calc-row"><span class="calc-label">Utilization assumption</span><span class="calc-value">85%</span></div>
      <div class="calc-row"><span class="calc-label">Estimated Annual NOI</span><span class="calc-value">$${(pv.estimated_noi || 0).toFixed(2)}M</span></div>
      <div class="calc-row"><span class="calc-label">Cap Rate</span><span class="calc-value">${((pv.cap_rate || 0.12) * 100).toFixed(1)}%</span></div>
      <div class="calc-row"><span class="calc-label">Base Value (Est NOI / Cap Rate)</span><span class="calc-value">$${fmtNum((pv.estimated_noi || 0) / (pv.cap_rate || 0.12), 1)}M</span></div>
      <div class="calc-row" style="margin-top:6px"><span class="calc-label">Phase Factor (${p.site_phase || '-'})</span><span class="calc-value">${(f.phase || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Grid Factor (${p.grid || '-'})</span><span class="calc-value">${(f.grid || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Year Factor</span><span class="calc-value">${(f.year || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Size Factor (${p.it_mw || 0} MW)</span><span class="calc-value">${(f.size || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Country Factor (${p.country || '-'})</span><span class="calc-value">${(f.country || 1).toFixed(2)}x</span></div>
      <div class="calc-row"><span class="calc-label">Calculated Factor</span><span class="calc-value">${(f.calculated || 1).toFixed(3)}x</span></div>
      <div class="calc-row fidoodle-row"><span class="calc-label">Fidoodle Factor (override)</span><span class="calc-value">
        <input type="number" step="0.01" value="${f.fidoodle !== null ? f.fidoodle : ''}" placeholder="${(f.calculated || 1).toFixed(2)}"
          onclick="event.stopPropagation()" onchange="setFidoodleFactor(${p.id}, this.value)" style="width:60px;text-align:right">
        ${f.fidoodle !== null ? `<button onclick="event.stopPropagation();clearFidoodleFactor(${p.id})" style="margin-left:4px;padding:1px 4px">✕</button>` : ''}
      </span></div>
      <div class="calc-row"><span class="calc-label">Combined Factor ${pv.hasFidoodle ? '(fidoodle)' : ''}</span><span class="calc-value ${pv.hasFidoodle ? 'text-warning' : ''}">${(f.combined || 1).toFixed(3)}x</span></div>
      <div class="calc-row total"><span class="calc-label">Final Value</span><span class="calc-value text-warning">$${fmtNum(pv.pipeline_value, 1)}M</span></div>
      <div class="calc-row"><span class="calc-formula">= ${p.it_mw || 0} MW × $${(pv.noi_per_mw || 1.4).toFixed(2)}M × 85% / ${((pv.cap_rate || 0.12) * 100).toFixed(1)}% × ${(f.combined || 1).toFixed(3)}</span></div>`;
  } else {
    html += `<div class="calc-row"><span class="calc-label">No valuation data</span><span class="calc-value">-</span></div>`;
  }

  html += `</div></div></td></tr>`;
  return html;
}

function toggleProject(id) {
  expandedProjects.has(id) ? expandedProjects.delete(id) : expandedProjects.add(id);
  renderProjects();
}

// ============== FIDOODLE FACTOR ==============

function setFidoodleFactor(projectId, value) {
  if (value === '' || value === null) {
    delete fidoodleFactors[projectId];
  } else {
    fidoodleFactors[projectId] = parseFloat(value);
  }
  localStorage.setItem('fidoodleFactors', JSON.stringify(fidoodleFactors));
  calculateProjectValuations();
  renderProjects();
  renderValuationTable();
  renderMinerList();
}

function clearFidoodleFactor(projectId) {
  delete fidoodleFactors[projectId];
  localStorage.setItem('fidoodleFactors', JSON.stringify(fidoodleFactors));
  calculateProjectValuations();
  renderProjects();
  renderValuationTable();
  renderMinerList();
}

// ============== SOURCE TOOLTIPS & OVERRIDES ==============

// Default source URLs for each miner's SEC filings
const minerSourceUrls = {
  MARA: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001507605&type=10&dateb=&owner=include&count=40',
  RIOT: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001167419&type=10&dateb=&owner=include&count=40',
  CLSK: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001515816&type=10&dateb=&owner=include&count=40',
  CIFR: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989&type=10&dateb=&owner=include&count=40',
  CORZ: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001839341&type=10&dateb=&owner=include&count=40',
  WULF: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001783407&type=10&dateb=&owner=include&count=40',
  HUT: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001964789&type=10&dateb=&owner=include&count=40',
  IREN: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001878848&type=10&dateb=&owner=include&count=40',
  BITF: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001725079&type=10&dateb=&owner=include&count=40',
  HIVE: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001720424&type=10&dateb=&owner=include&count=40',
  BTDR: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001899123&type=10&dateb=&owner=include&count=40',
  APLD: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001144879&type=10&dateb=&owner=include&count=40',
  GLXY: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001825681&type=10&dateb=&owner=include&count=40',
  SLNH: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001816581&type=10&dateb=&owner=include&count=40',
  FUFU: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001957413&type=10&dateb=&owner=include&count=40'
};

// Detailed source snippets for each miner/field from HODL Value sheet and filings
const minerSourceSnippets = {
  MARA: { btc: '54,000 BTC', cash: '$826.4M', debt: '$3,640M (convertible notes)', shares: '378.18M basic / 437M FD' },
  RIOT: { btc: '18,005 BTC', cash: '$330.8M', debt: '$871.9M (convertible notes)', shares: '371.81M basic / 414M FD' },
  CLSK: { btc: '13,099 BTC', cash: '$43.0M', debt: '$825.7M (convertible notes)', shares: '255.58M basic / 318M FD' },
  CIFR: { btc: '1,500 BTC', cash: '$1,210M', debt: '$1,040M (AWS prepayment)', shares: '395.09M basic/FD' },
  CORZ: { btc: '2,350 BTC', cash: '$453.4M', debt: '$1,160M (convertible notes)', shares: '310.06M basic/FD' },
  WULF: { btc: '0 BTC (sold)', cash: '$712.8M', debt: '$1,500M (project financing)', shares: '418.68M basic / 575M FD' },
  HUT: { btc: '13,696 BTC', cash: '$33.5M', debt: '$390.7M (credit facilities)', shares: '108.04M basic / 110M FD' },
  IREN: { btc: '0 BTC', cash: '$1,030M', debt: '$973.5M (equipment financing)', shares: '328.34M basic/FD' },
  BITF: { btc: '1,827 BTC', cash: '$87.0M', debt: '$73.7M (equipment loans)', shares: '521M basic/FD' },
  HIVE: { btc: '435 BTC', cash: '$48.3M', debt: '$23.2M', shares: '180M basic/FD' },
  BTDR: { btc: '1,901 BTC', cash: '$202.3M', debt: '$916.0M (convertible notes)', shares: '236.82M basic/FD' },
  APLD: { btc: '0 BTC', cash: '$0M (pre-rev)', debt: '$0M', shares: '279.59M basic/FD' },
  GLXY: { btc: '6,894 BTC', cash: '$1.8M', debt: '$32M', shares: '324M basic/FD' },
  SLNH: { btc: '0 BTC', cash: '$51.4M', debt: '$23.3M', shares: '64.09M basic / 75M FD' },
  FUFU: { btc: '1,780 BTC', cash: '$32.6M', debt: '$141.8M', shares: '164.13M basic / 168M FD' }
};

function getDefaultSource(ticker, field) {
  const snippet = minerSourceSnippets[ticker];
  if (!snippet) return 'Company data (see SEC filings)';

  if (field === 'hodl_value') {
    return `BTC Holdings: ${snippet.btc} × BTC price`;
  } else if (field === 'cash') {
    return `Cash & Equivalents: ${snippet.cash}`;
  } else if (field === 'debt') {
    return `Total Debt: ${snippet.debt}`;
  } else if (field === 'fd_shares_m') {
    return `Shares: ${snippet.shares}`;
  }
  return 'Company data (see SEC filings)';
}

function getDefaultSourceUrl(ticker) {
  return minerSourceUrls[ticker] || `https://www.sec.gov/cgi-bin/browse-edgar?company=${ticker}&CIK=&type=10&owner=include&count=40&action=getcompany`;
}

function showEditSourceModal(ticker, field, currentValue, currentSource, currentUrl) {
  const fieldLabels = { hodl_value: 'HODL Value', cash: 'Cash', debt: 'Debt', fd_shares_m: 'FD Shares (M)' };
  const modal = document.getElementById('source-modal');
  document.getElementById('source-modal-title').textContent = `Edit ${fieldLabels[field]} - ${ticker}`;
  document.getElementById('source-edit-ticker').value = ticker;
  document.getElementById('source-edit-field').value = field;
  document.getElementById('source-value').value = currentValue || '';
  document.getElementById('source-note').value = currentSource || '';
  document.getElementById('source-url').value = currentUrl || '';
  modal.classList.add('active');
}

function closeSourceModal() {
  document.getElementById('source-modal').classList.remove('active');
}

function saveSourceOverride() {
  const ticker = document.getElementById('source-edit-ticker').value;
  const field = document.getElementById('source-edit-field').value;
  const value = parseFloat(document.getElementById('source-value').value);
  const source = document.getElementById('source-note').value;
  const url = document.getElementById('source-url').value;

  if (!minerOverrides[ticker]) minerOverrides[ticker] = {};
  minerOverrides[ticker][field] = value;
  minerOverrides[ticker][field + '_source'] = source;
  minerOverrides[ticker][field + '_url'] = url;

  localStorage.setItem('minerOverrides', JSON.stringify(minerOverrides));
  closeSourceModal();
  refreshValuations();
}

function clearSourceOverride() {
  const ticker = document.getElementById('source-edit-ticker').value;
  const field = document.getElementById('source-edit-field').value;

  if (minerOverrides[ticker]) {
    delete minerOverrides[ticker][field];
    delete minerOverrides[ticker][field + '_source'];
    delete minerOverrides[ticker][field + '_url'];
    if (Object.keys(minerOverrides[ticker]).length === 0) {
      delete minerOverrides[ticker];
    }
  }

  localStorage.setItem('minerOverrides', JSON.stringify(minerOverrides));
  closeSourceModal();
  refreshValuations();
}

// ============== MINERS SIDEBAR ==============

function renderMinerList() {
  const container = document.getElementById('miner-list');
  const minerValuations = {};
  valuations.forEach(v => { minerValuations[v.ticker] = v; });
  container.innerHTML = miners.map(m => {
    const v = minerValuations[m.ticker] || { components: { lease_value: 0 }, metrics: {} };
    const leaseVal = v.components?.lease_value || 0;
    const isSelected = selectedMiner === m.ticker;
    return `
      <div class="miner-card ${isSelected ? 'selected' : ''}" onclick="selectMiner('${m.ticker}')">
        <div class="miner-header">
          <span class="miner-ticker">${m.ticker}</span>
          <span class="miner-value">${leaseVal > 0 ? '$' + fmtNum(leaseVal, 0) + 'M' : ''}</span>
        </div>
        <div class="miner-metrics">
          <span>${m.hashrate_eh || 0} EH</span>
          <span>${v.metrics?.project_count || 0} proj</span>
        </div>
      </div>
    `;
  }).join('');
}

function selectMiner(ticker) {
  selectedMiner = ticker;
  renderMinerList();
  document.getElementById('project-filter-ticker').value = ticker;
  renderProjects();
  if (map) applyMapFilters();
}

// ============== MINER MODALS ==============

function showAddMinerModal() {
  document.getElementById('miner-modal-title').textContent = 'Add Miner';
  document.getElementById('miner-edit-ticker').value = '';
  document.getElementById('miner-ticker').value = '';
  document.getElementById('miner-ticker').disabled = false;
  document.getElementById('miner-name').value = '';
  document.getElementById('miner-hashrate').value = '';
  document.getElementById('miner-hashrate-type').value = 'Self';
  document.getElementById('miner-debt').value = '';
  document.getElementById('miner-cash').value = '';
  document.getElementById('miner-btc').value = '';
  document.getElementById('miner-eth').value = '';
  document.getElementById('miner-modal').classList.add('active');
}

function closeMinerModal() {
  document.getElementById('miner-modal').classList.remove('active');
}

async function saveMiner() {
  const editTicker = document.getElementById('miner-edit-ticker').value;
  const data = {
    ticker: document.getElementById('miner-ticker').value,
    name: document.getElementById('miner-name').value,
    hashrate_eh: parseFloat(document.getElementById('miner-hashrate').value) || 0,
    hashrate_type: document.getElementById('miner-hashrate-type').value,
    total_debt_m: parseFloat(document.getElementById('miner-debt').value) || 0,
    cash_m: parseFloat(document.getElementById('miner-cash').value) || 0,
    btc_holdings: parseFloat(document.getElementById('miner-btc').value) || 0,
    eth_holdings: parseFloat(document.getElementById('miner-eth').value) || 0
  };
  try {
    if (editTicker) {
      await fetch(`${API_BASE}/miners/${editTicker}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    } else {
      await fetch(`${API_BASE}/miners`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    }
    closeMinerModal();
    loadData();
  } catch (err) { console.error('Error saving miner:', err); }
}

// ============== PROJECT MODALS ==============

function populateFilters() {
  const tickerOptions = ['<option value="">All</option>'].concat(miners.map(m => `<option value="${m.ticker}">${m.ticker}</option>`)).join('');
  document.getElementById('project-filter-ticker').innerHTML = tickerOptions;
  document.getElementById('map-filter-miner').innerHTML = tickerOptions;
  document.getElementById('project-ticker').innerHTML = miners.map(m => `<option value="${m.ticker}">${m.ticker}</option>`).join('');

  const statuses = [...new Set(projects.map(p => p.status).filter(Boolean))];
  document.getElementById('project-filter-status').innerHTML = '<option value="">All</option>' + statuses.map(s => `<option value="${s}">${s}</option>`).join('');

  const phases = [...new Set(projects.map(p => p.site_phase).filter(Boolean))];
  document.getElementById('map-filter-phase').innerHTML = '<option value="">All</option>' + phases.map(p => `<option value="${p}">${p}</option>`).join('');
  document.getElementById('project-filter-phase').innerHTML = '<option value="">All</option>' + phases.map(p => `<option value="${p}">${p}</option>`).join('');
}

function showAddProjectModal() {
  document.getElementById('project-modal-title').textContent = 'Add Project';
  document.getElementById('project-edit-id').value = '';
  document.getElementById('btn-delete-project').style.display = 'none';
  ['project-ticker','project-site-name','project-site-phase','project-status','project-current-use','project-country','project-state','project-grid','project-gross-mw','project-it-mw','project-pue','project-power-authority','project-energization','project-lease-start','project-ownership-status','project-lessee','project-lease-value','project-lease-yrs','project-noi-pct','project-annual-rev','project-noi-annual','project-hpc-pipeline','project-confidence','project-lease-notes','project-notes','project-source-url'].forEach(id => {
    const el = document.getElementById(id);
    if (el.tagName === 'SELECT') el.selectedIndex = 0; else el.value = '';
  });
  document.getElementById('project-country').value = 'United States';
  document.getElementById('project-pue').value = '1.3';
  document.getElementById('project-modal').classList.add('active');
}

function showEditProjectModal(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  document.getElementById('project-modal-title').textContent = 'Edit Project';
  document.getElementById('project-edit-id').value = id;
  document.getElementById('btn-delete-project').style.display = 'block';
  document.getElementById('project-ticker').value = p.ticker || '';
  document.getElementById('project-site-name').value = p.site_name || '';
  document.getElementById('project-site-phase').value = p.site_phase || '';
  document.getElementById('project-status').value = p.status || '';
  document.getElementById('project-current-use').value = p.current_use || '';
  document.getElementById('project-country').value = p.country || 'United States';
  document.getElementById('project-state').value = p.state || '';
  document.getElementById('project-grid').value = p.grid || '';
  document.getElementById('project-gross-mw').value = p.gross_mw || '';
  document.getElementById('project-it-mw').value = p.it_mw || '';
  document.getElementById('project-pue').value = p.pue || '1.3';
  document.getElementById('project-power-authority').value = p.power_authority || '';
  document.getElementById('project-energization').value = p.energization_date ? p.energization_date.split('T')[0] : '';
  document.getElementById('project-lease-start').value = p.lease_start || '';
  document.getElementById('project-ownership-status').value = p.ownership_status || '';
  document.getElementById('project-lessee').value = p.lessee || '';
  document.getElementById('project-lease-value').value = p.lease_value_m || '';
  document.getElementById('project-lease-yrs').value = p.lease_yrs || '';
  document.getElementById('project-noi-pct').value = p.noi_pct || '';
  document.getElementById('project-annual-rev').value = p.annual_rev_m || '';
  document.getElementById('project-noi-annual').value = p.noi_annual_m || '';
  document.getElementById('project-hpc-pipeline').value = p.hpc_pipeline_mw_2028 || '';
  document.getElementById('project-confidence').value = p.confidence || '';
  document.getElementById('project-lease-notes').value = p.lease_notes || '';
  document.getElementById('project-notes').value = p.notes || '';
  document.getElementById('project-source-url').value = p.source_url || '';
  document.getElementById('project-modal').classList.add('active');
}

function closeProjectModal() { document.getElementById('project-modal').classList.remove('active'); }

async function saveProject() {
  const editId = document.getElementById('project-edit-id').value;
  const data = {
    ticker: document.getElementById('project-ticker').value,
    site_name: document.getElementById('project-site-name').value,
    site_phase: document.getElementById('project-site-phase').value,
    status: document.getElementById('project-status').value,
    current_use: document.getElementById('project-current-use').value,
    country: document.getElementById('project-country').value,
    state: document.getElementById('project-state').value,
    grid: document.getElementById('project-grid').value,
    gross_mw: parseFloat(document.getElementById('project-gross-mw').value) || null,
    it_mw: parseFloat(document.getElementById('project-it-mw').value) || null,
    pue: parseFloat(document.getElementById('project-pue').value) || null,
    power_authority: document.getElementById('project-power-authority').value || null,
    energization_date: document.getElementById('project-energization').value || null,
    lease_start: document.getElementById('project-lease-start').value || null,
    ownership_status: document.getElementById('project-ownership-status').value || null,
    lessee: document.getElementById('project-lessee').value || null,
    lease_value_m: parseFloat(document.getElementById('project-lease-value').value) || null,
    lease_yrs: parseFloat(document.getElementById('project-lease-yrs').value) || null,
    noi_pct: parseFloat(document.getElementById('project-noi-pct').value) || null,
    annual_rev_m: parseFloat(document.getElementById('project-annual-rev').value) || null,
    noi_annual_m: parseFloat(document.getElementById('project-noi-annual').value) || null,
    hpc_pipeline_mw_2028: parseFloat(document.getElementById('project-hpc-pipeline').value) || null,
    confidence: document.getElementById('project-confidence').value || null,
    lease_notes: document.getElementById('project-lease-notes').value || null,
    notes: document.getElementById('project-notes').value || null,
    source_url: document.getElementById('project-source-url').value || null
  };
  try {
    if (editId) await fetch(`${API_BASE}/projects/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    else await fetch(`${API_BASE}/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    closeProjectModal();
    loadData();
  } catch (err) { console.error('Error saving project:', err); }
}

async function deleteProject() {
  const id = document.getElementById('project-edit-id').value;
  if (!id || !confirm('Delete this project?')) return;
  try { await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' }); closeProjectModal(); loadData(); }
  catch (err) { console.error('Error deleting project:', err); }
}

document.getElementById('project-filter-ticker')?.addEventListener('change', renderProjects);
document.getElementById('project-filter-status')?.addEventListener('change', renderProjects);
document.getElementById('project-filter-phase')?.addEventListener('change', renderProjects);
document.getElementById('project-search')?.addEventListener('input', renderProjects);

// ============== FACTORS ==============

function renderFactors() {
  const container = document.getElementById('factors-container');
  const grouped = {};
  factors.forEach(f => { if (!grouped[f.category]) grouped[f.category] = []; grouped[f.category].push(f); });
  container.innerHTML = Object.entries(grouped).map(([cat, items]) => `
    <div class="factor-category">
      <div class="factor-category-header">${cat.replace(/_/g, ' ')}</div>
      <div class="factor-items">${items.map(f => `
        <div class="factor-item"><span>${f.factor_key}</span>
          <input type="number" value="${f.multiplier}" step="0.01" onchange="updateFactor(${f.id}, this.value)" style="width:60px;text-align:right">
        </div>`).join('')}
      </div>
    </div>`).join('');
}

async function updateFactor(id, value) {
  try { await fetch(`${API_BASE}/factors/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ multiplier: parseFloat(value) }) }); refreshValuations(); }
  catch (err) { console.error('Error updating factor:', err); }
}

// ============== MAP ==============

function initMap() {
  if (map) return;
  map = L.map('map').setView([39.8, -98.5], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© OSM, CartoDB', maxZoom: 19 }).addTo(map);
  renderMapMarkers();
  document.getElementById('map-filter-mw').addEventListener('input', e => { document.getElementById('mw-value').textContent = e.target.value; });
}

function renderMapMarkers(filteredProjects = null) {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  (filteredProjects || projects).forEach(p => {
    if (!p.lat || !p.lng) return;
    const color = p.lease_value_m > 0 ? '#00ff00' : p.status === 'Operational' ? '#ff6600' : '#ffcc00';
    const radius = Math.max(4, Math.min(15, Math.sqrt(p.it_mw || 10) * 1.5));
    const marker = L.circleMarker([p.lat, p.lng], { radius, fillColor: color, color: '#fff', weight: 1, opacity: 1, fillOpacity: 0.7 });
    marker.bindPopup(`<div style="min-width:200px;font-size:10px"><strong>${p.ticker}</strong> - ${p.site_name}<br><hr style="margin:4px 0;border-color:#333">Phase: ${p.site_phase || '-'}<br>Status: ${p.status || '-'}<br>IT MW: ${p.it_mw || '-'} | Grid: ${p.grid || '-'}<br>Lessee: ${p.lessee || '-'}<br>${p.lease_value_m ? `Lease: $${fmtNum(p.lease_value_m, 1)}M` : ''}</div>`);
    marker.addTo(map);
    markers.push(marker);
  });
}

function applyMapFilters() {
  let filtered = projects;
  const ticker = document.getElementById('map-filter-miner').value;
  const minMw = parseFloat(document.getElementById('map-filter-mw').value) || 0;
  const hasLease = document.getElementById('map-filter-lease').value;
  const phase = document.getElementById('map-filter-phase').value;
  if (ticker) filtered = filtered.filter(p => p.ticker === ticker);
  if (minMw > 0) filtered = filtered.filter(p => (p.it_mw || 0) >= minMw);
  if (hasLease === 'true') filtered = filtered.filter(p => p.lease_value_m > 0);
  if (hasLease === 'false') filtered = filtered.filter(p => !p.lease_value_m);
  if (phase) filtered = filtered.filter(p => p.site_phase === phase);
  renderMapMarkers(filtered);
}

// ============== STATS ==============

function renderStats(stats) {
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Miners</div><div class="stat-value">${stats.total_miners}</div></div>
    <div class="stat-card"><div class="stat-label">Projects</div><div class="stat-value">${stats.total_projects}</div></div>
    <div class="stat-card"><div class="stat-label">IT Capacity</div><div class="stat-value">${fmtNum(stats.total_it_mw, 0)} MW</div></div>
    <div class="stat-card"><div class="stat-label">Lease Value</div><div class="stat-value text-success">$${fmtNum(stats.total_lease_value, 0)}M</div></div>
    <div class="stat-card"><div class="stat-label">Contracted</div><div class="stat-value">${stats.contracted_projects}</div></div>`;
}

// ============== UTILITIES ==============

function fmtNum(n, decimals = 1) {
  if (n == null) return '-';
  if (decimals === 0) return Math.round(n).toLocaleString();
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function truncate(str, len) { return str && str.length > len ? str.substring(0, len) + '..' : (str || ''); }

function getPhaseClass(phase) {
  if (!phase) return 'badge-info';
  if (phase.includes('Online') || phase.includes('Energized')) return 'badge-success';
  if (phase.includes('construction')) return 'badge-warning';
  return 'badge-info';
}

function getConfidenceClass(c) {
  if (c === 'HIGH') return 'badge-success';
  if (c === 'MEDIUM') return 'badge-warning';
  return 'badge-info';
}

// ============== HPC VALUATION MODEL ==============

// HPC Projects stored in localStorage
let hpcProjects = JSON.parse(localStorage.getItem('hpcProjects') || '[]');

// Seed HPC projects with actual lease data if empty
function seedHpcProjects() {
  if (hpcProjects.length > 0) return; // Already has data

  const seedData = [
    // ========== APLD - CoreWeave $11B/400MW Deal ==========
    { id: 1001, name: 'Ellendale Bldg 1 (CoreWeave)', ticker: 'APLD', location: 'Ellendale, ND', tenant: 'CoreWeave',
      it_mw: 100, lease_value_stated: 2750, annual_rev: 183, noi_pct: 85, base_term: 15, start_date: '2025-11-01',
      status: 'Operational', notes: 'Part of $11B/400MW; Bldg 1',
      source_url: 'https://drive.google.com/file/d/1UhQsQqkob2KHu0I-jjosxlQqi854LSSD/view?usp=share_link',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 0, rent_model: 'per_kw', rent_kw: 152.5, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 15, power_margin: 0, service_margin: 0, pcod: 95, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 100, adder_ownership: 0, adder_market: 0, capex: 550, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 50, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1002, name: 'Ellendale Bldg 2 (CoreWeave)', ticker: 'APLD', location: 'Ellendale, ND', tenant: 'CoreWeave',
      it_mw: 150, lease_value_stated: 4125, annual_rev: 275, noi_pct: 85, base_term: 15, start_date: '2026-12-01',
      status: 'Contracted', notes: 'Part of $11B/400MW; Bldg 2',
      source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142/applied-digital-reports-fiscal-second-quarter-2026-results',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 1, rent_model: 'per_kw', rent_kw: 152.5, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 15, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 100, adder_ownership: 0, adder_market: 0, capex: 825, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 50, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1003, name: 'Ellendale Bldg 3 (CoreWeave)', ticker: 'APLD', location: 'Ellendale, ND', tenant: 'CoreWeave',
      it_mw: 150, lease_value_stated: 4125, annual_rev: 275, noi_pct: 85, base_term: 15, start_date: '2027-06-01',
      status: 'Contracted', notes: 'Part of $11B/400MW; Bldg 3',
      source_url: 'https://ir.applieddigital.com/news-events/press-releases/detail/142/applied-digital-reports-fiscal-second-quarter-2026-results',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 1.5, rent_model: 'per_kw', rent_kw: 152.5, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 15, power_margin: 0, service_margin: 0, pcod: 80, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 100, adder_ownership: 0, adder_market: 0, capex: 825, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 50, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },

    // ========== CIFR - AWS $5.5B/214MW + Fluidstack/Google ==========
    { id: 1010, name: 'AWS AI Hosting Contract', ticker: 'CIFR', location: 'Texas', tenant: 'AWS',
      it_mw: 214, lease_value_stated: 5500, annual_rev: 367, noi_pct: 87, base_term: 15, start_date: '2026-08-01',
      status: 'Contracted', notes: '$5.5B/15yr; 214MW',
      source_url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001819989&type=8-K',
      credit_backstop: 'hyperscaler', credit_score: 95, lease_type: 'nnn', delay_years: 0.5, rent_model: 'per_kw', rent_kw: 143, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 13, power_margin: 0, service_margin: 0, pcod: 90, base_cap: 7.5, adder_credit: 0, adder_lease: 0, adder_concentration: 75, adder_ownership: 0, adder_market: 0, capex: 1070, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 75, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 65, downtime: 6, retenant_capex: 35, reversion_cap: 8.5, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1011, name: 'Barber Lake (Fluidstack/Google)', ticker: 'CIFR', location: 'Barber Lake, TX', tenant: 'Fluidstack/Google',
      it_mw: 168, lease_value_stated: 3000, annual_rev: 300, noi_pct: 87, base_term: 10, start_date: '2026-09-01',
      status: 'Contracted', notes: '$3.0B/10yr; 168MW',
      source_url: 'https://investors.ciphermining.com/news-releases/news-release-details/cipher-mining-announces-fluidstack-ai-hosting-agreement',
      credit_backstop: 'hyperscaler', credit_score: 95, lease_type: 'nnn', delay_years: 0.75, rent_model: 'per_kw', rent_kw: 149, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 13, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 8, adder_credit: 0, adder_lease: 0, adder_concentration: 75, adder_ownership: 0, adder_market: 0, capex: 840, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 65, downtime: 6, retenant_capex: 40, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1012, name: 'Barber Lake Additional (Fluidstack)', ticker: 'CIFR', location: 'Barber Lake, TX', tenant: 'Fluidstack',
      it_mw: 39, lease_value_stated: 830, annual_rev: 83, noi_pct: 87, base_term: 10, start_date: '2027-01-01',
      status: 'Contracted', notes: '$0.8B/10yr; 39MW',
      source_url: 'https://investors.ciphermining.com/news-releases/news-release-details/cipher-mining-announces-fluidstack-ai-hosting-agreement',
      credit_backstop: 'hyperscaler', credit_score: 90, lease_type: 'nnn', delay_years: 1, rent_model: 'per_kw', rent_kw: 177, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 13, power_margin: 0, service_margin: 0, pcod: 80, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 50, adder_ownership: 0, adder_market: 0, capex: 195, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 65, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 40, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },

    // ========== CORZ - CoreWeave Multi-Site Deal ==========
    { id: 1020, name: 'Denton TX (CoreWeave)', ticker: 'CORZ', location: 'Denton, TX', tenant: 'CoreWeave',
      it_mw: 260, lease_value_stated: 3835, annual_rev: 320, noi_pct: 78, base_term: 12, start_date: '2026-12-01',
      status: 'Contracted', notes: '$3.8B/12yr; 260MW',
      source_url: 'https://investors.corescientific.com/news-events/press-releases/detail/110/core-scientific-and-coreweave-announce-1-2-billion-expansion-at-denton-tx-site',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 1, rent_model: 'per_kw', rent_kw: 103, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 22, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 75, adder_ownership: 0, adder_market: 0, capex: 1300, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 65, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 40, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1021, name: '5 Other Sites (CoreWeave)', ticker: 'CORZ', location: 'Multiple TX', tenant: 'CoreWeave',
      it_mw: 330, lease_value_stated: 4865, annual_rev: 405, noi_pct: 78, base_term: 12, start_date: '2026-12-01',
      status: 'Contracted', notes: '$4.9B/12yr; 330MW across 5 sites',
      source_url: 'https://investors.corescientific.com/news-events/press-releases/detail/110/core-scientific-and-coreweave-announce-1-2-billion-expansion-at-denton-tx-site',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 1, rent_model: 'per_kw', rent_kw: 102, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 22, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 50, adder_ownership: 0, adder_market: 0, capex: 1650, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 65, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 40, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1022, name: 'Austin TX (CoreWeave)', ticker: 'CORZ', location: 'Austin, TX', tenant: 'CoreWeave',
      it_mw: 16, lease_value_stated: 0, annual_rev: 0, noi_pct: 78, base_term: 12, start_date: '2024-04-01',
      status: 'Operational', notes: 'Initial 16MW contract',
      source_url: 'https://investors.corescientific.com/news-events/press-releases/detail/74/core-scientific-to-provide-approximately-200-mw-of-infrastructure-to-host-coreweaves-high-performance-computing-services-capturing-significant-ai-compute-opportunity',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 0, rent_model: 'per_kw', rent_kw: 100, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 22, power_margin: 0, service_margin: 0, pcod: 95, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 25, adder_ownership: 0, adder_market: 0, capex: 80, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 65, downtime: 6, retenant_capex: 30, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },

    // ========== GLXY - CoreWeave Helios $15B/526MW ==========
    { id: 1030, name: 'Helios Phase I (CoreWeave)', ticker: 'GLXY', location: 'Helios, TX', tenant: 'CoreWeave',
      it_mw: 200, lease_value_stated: 5714, annual_rev: 381, noi_pct: 90, base_term: 15, start_date: '2026-07-01',
      status: 'Contracted', notes: 'Part of $15B/526MW; Phase I',
      source_url: 'https://investor.galaxy.com/news-releases/news-release-details/galaxy-digital-announces-coreweave-helios-data-center',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 0.5, rent_model: 'per_kw', rent_kw: 159, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 10, power_margin: 0, service_margin: 0, pcod: 90, base_cap: 7.5, adder_credit: 25, adder_lease: 0, adder_concentration: 50, adder_ownership: 0, adder_market: 0, capex: 1000, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 75, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 65, downtime: 6, retenant_capex: 50, reversion_cap: 8.5, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1031, name: 'Helios Phase II (CoreWeave)', ticker: 'GLXY', location: 'Helios, TX', tenant: 'CoreWeave',
      it_mw: 200, lease_value_stated: 5714, annual_rev: 381, noi_pct: 90, base_term: 15, start_date: '2027-07-01',
      status: 'Contracted', notes: 'Part of $15B/526MW; Phase II',
      source_url: 'https://investor.galaxy.com/news-releases/news-release-details/galaxy-digital-announces-coreweave-helios-data-center',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 1.5, rent_model: 'per_kw', rent_kw: 159, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 10, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 7.5, adder_credit: 25, adder_lease: 0, adder_concentration: 50, adder_ownership: 0, adder_market: 0, capex: 1000, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 75, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 65, downtime: 6, retenant_capex: 50, reversion_cap: 8.5, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1032, name: 'Helios Phase III (CoreWeave)', ticker: 'GLXY', location: 'Helios, TX', tenant: 'CoreWeave',
      it_mw: 126, lease_value_stated: 3572, annual_rev: 238, noi_pct: 90, base_term: 15, start_date: '2028-07-01',
      status: 'Contracted', notes: 'Part of $15B/526MW; Phase III',
      source_url: 'https://investor.galaxy.com/news-releases/news-release-details/galaxy-digital-announces-coreweave-helios-data-center',
      credit_backstop: 'hyperscaler', credit_score: 85, lease_type: 'nnn', delay_years: 2.5, rent_model: 'per_kw', rent_kw: 157, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 10, power_margin: 0, service_margin: 0, pcod: 75, base_cap: 7.5, adder_credit: 25, adder_lease: 0, adder_concentration: 50, adder_ownership: 0, adder_market: 0, capex: 630, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 50, reversion_cap: 8.5, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },

    // ========== HUT - Fluidstack/Anthropic $7B/245MW ==========
    { id: 1040, name: 'River Bend (Fluidstack/Anthropic)', ticker: 'HUT', location: 'River Bend, LA', tenant: 'Fluidstack/Anthropic',
      it_mw: 245, lease_value_stated: 7000, annual_rev: 467, noi_pct: 98, base_term: 15, start_date: '2027-06-01',
      status: 'Contracted', notes: '$7.0B/15yr; 245MW; 98% NOI',
      source_url: 'https://www.prnewswire.com/news-releases/hut-8-signs-15-year-245-mw-ai-data-center-lease-at-river-bend-campus-with-total-contract-value-of-7-0-billion-302644600.html',
      credit_backstop: 'hyperscaler', credit_score: 80, lease_type: 'nnn', delay_years: 1.5, rent_model: 'per_kw', rent_kw: 159, direct_noi: 0, escalator: 2.5, passthrough: 98, opex: 0, reserve: 2, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 8.5, adder_credit: 50, adder_lease: 0, adder_concentration: 100, adder_ownership: 0, adder_market: 0, capex: 1225, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 60, downtime: 6, retenant_capex: 45, reversion_cap: 9.5, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },

    // ========== IREN - Microsoft $9.7B/200MW GPU Cloud ==========
    { id: 1050, name: 'Childress TX (Microsoft Horizon)', ticker: 'IREN', location: 'Childress, TX', tenant: 'Microsoft',
      it_mw: 200, lease_value_stated: 9700, annual_rev: 1940, noi_pct: 32, base_term: 5, start_date: '2026-12-25',
      status: 'Contracted', notes: 'GPU-as-a-service model; $9.7B/5yr',
      source_url: 'https://irisenergy.gcs-web.com/news-releases/news-release-details/iren-announces-multi-year-gpu-cloud-services-contract-microsoft',
      credit_backstop: 'hyperscaler', credit_score: 95, lease_type: 'nnn', delay_years: 1, rent_model: 'direct_noi', rent_kw: 0, direct_noi: 620, escalator: 3.0, passthrough: 100, opex: 0, reserve: 0, power_margin: 0, service_margin: 0, pcod: 90, base_cap: 9, adder_credit: 0, adder_lease: 50, adder_concentration: 100, adder_ownership: 0, adder_market: 0, capex: 1000, ti: 0, build_discount: 10, renewal_count: 3, renewal_years: 5, renewal_prob: 60, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 55, downtime: 9, retenant_capex: 60, reversion_cap: 10, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },

    // ========== WULF - Fluidstack/Google + Core42 ==========
    { id: 1060, name: 'Lake Mariner (Fluidstack/Google)', ticker: 'WULF', location: 'Lake Mariner, NY', tenant: 'Fluidstack/Google',
      it_mw: 366, lease_value_stated: 6700, annual_rev: 670, noi_pct: 85, base_term: 10, start_date: '2026-12-01',
      status: 'Contracted', notes: '$6.7B/10yr; 366MW',
      source_url: 'https://investors.terawulf.com/news-events/press-releases/detail/112/terawulf-signs-200-mw-10-year-ai-hosting-agreements-with',
      credit_backstop: 'hyperscaler', credit_score: 95, lease_type: 'nnn', delay_years: 1, rent_model: 'per_kw', rent_kw: 152, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 15, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 8, adder_credit: 0, adder_lease: 0, adder_concentration: 75, adder_ownership: 0, adder_market: 0, capex: 1830, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 70, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 65, downtime: 6, retenant_capex: 40, reversion_cap: 9, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1061, name: 'Lake Mariner (Core42/G42)', ticker: 'WULF', location: 'Lake Mariner, NY', tenant: 'Core42 (G42)',
      it_mw: 60, lease_value_stated: 0, annual_rev: 0, noi_pct: 85, base_term: 5, start_date: '2026-12-01',
      status: 'Contracted', notes: '60MW hosting agreement',
      source_url: 'https://investors.terawulf.com/news-events/press-releases/detail/99/terawulf-announces-60-mw-ai-data-center-hosting-agreement',
      credit_backstop: 'hyperscaler', credit_score: 80, lease_type: 'nnn', delay_years: 1, rent_model: 'per_kw', rent_kw: 140, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 15, power_margin: 0, service_margin: 0, pcod: 85, base_cap: 9, adder_credit: 50, adder_lease: 0, adder_concentration: 50, adder_ownership: 0, adder_market: 0, capex: 300, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 60, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 55, downtime: 6, retenant_capex: 45, reversion_cap: 10, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },
    { id: 1062, name: 'Abernathy TX (Fluidstack JV)', ticker: 'WULF', location: 'Abernathy, TX', tenant: 'Fluidstack (51% JV)',
      it_mw: 86, lease_value_stated: 4800, annual_rev: 192, noi_pct: 70, base_term: 25, start_date: '2026-12-01',
      status: 'Contracted', notes: '$4.8B/25yr; 86MW JV',
      source_url: 'https://investors.terawulf.com/news-events/press-releases/detail/121/terawulf-expands-strategic-partnership-with-fluidstack',
      credit_backstop: 'hyperscaler', credit_score: 90, lease_type: 'nnn', delay_years: 1, rent_model: 'per_kw', rent_kw: 186, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 30, power_margin: 0, service_margin: 0, pcod: 80, base_cap: 8, adder_credit: 25, adder_lease: 0, adder_concentration: 50, adder_ownership: 25, adder_market: 0, capex: 430, ti: 0, build_discount: 10, renewal_count: 1, renewal_years: 10, renewal_prob: 60, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 70, downtime: 6, retenant_capex: 35, reversion_cap: 8.5, salvage: 0, ownership: 'jv_51pct', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' },

    // ========== RIOT - AMD Servers (small) ==========
    { id: 1070, name: 'Rockdale AMD Servers', ticker: 'RIOT', location: 'Rockdale, TX', tenant: 'AMD',
      it_mw: 25, lease_value_stated: 311, annual_rev: 31.1, noi_pct: 80, base_term: 10, start_date: '2025-01-01',
      status: 'Operational', notes: 'AMD server hosting; 10yr contract',
      source_url: 'https://www.riotplatforms.com/bitcoin-mining/',
      credit_backstop: 'hyperscaler', credit_score: 90, lease_type: 'nnn', delay_years: 0, rent_model: 'per_kw', rent_kw: 104, direct_noi: 0, escalator: 2.5, passthrough: 95, opex: 0, reserve: 20, power_margin: 0, service_margin: 0, pcod: 95, base_cap: 9, adder_credit: 25, adder_lease: 0, adder_concentration: 25, adder_ownership: 0, adder_market: 0, capex: 125, ti: 0, build_discount: 10, renewal_count: 2, renewal_years: 5, renewal_prob: 60, expansion_mw: 0, expansion_date: '', expansion_prob: 0, residual_model: 'release', release_prob: 50, downtime: 6, retenant_capex: 30, reversion_cap: 10, salvage: 0, ownership: 'fee_simple', ground_rent: 0, single_tenant: 'yes', substation: 'yes', interconnect: 'yes' }
  ];

  hpcProjects = seedData;
  localStorage.setItem('hpcProjects', JSON.stringify(hpcProjects));
}

// Call seed on load
seedHpcProjects();

const hpcColumns = [
  { key: 'name', label: 'Project', width: 120, align: 'left' },
  { key: 'ticker', label: 'Ticker', width: 50, align: 'left' },
  { key: 'tenant', label: 'Tenant', width: 80, align: 'left' },
  { key: 'it_mw', label: 'IT MW', width: 50, align: 'right' },
  { key: 'cap_eff', label: 'Cap Eff', width: 55, align: 'right' },
  { key: 'noi1', label: 'NOI1 $M', width: 60, align: 'right' },
  { key: 'v_base', label: 'V Base', width: 70, align: 'right' },
  { key: 'v_options', label: 'Options', width: 65, align: 'right' },
  { key: 'v_residual', label: 'Residual', width: 65, align: 'right' },
  { key: 'v_capex', label: 'Capex', width: 60, align: 'right' },
  { key: 'v_total', label: 'V Total', width: 75, align: 'right' },
  { key: 'per_mw', label: '$/MW', width: 60, align: 'right' },
  { key: 'source', label: 'Src', width: 30, align: 'center' },
  { key: 'actions', label: '', width: 50, align: 'center' }
];

function toggleRentInputs() {
  const model = document.getElementById('hpc-rent-model').value;
  document.getElementById('hpc-rent-kw-group').style.display = model === 'per_kw' ? 'block' : 'none';
  document.getElementById('hpc-direct-noi-group').style.display = model === 'direct_noi' ? 'block' : 'none';
}

function showHpcProjectModal(id = null) {
  const modal = document.getElementById('hpc-modal');
  const title = document.getElementById('hpc-modal-title');
  const deleteBtn = document.getElementById('btn-delete-hpc');

  // Populate ticker dropdown
  const tickerSelect = document.getElementById('hpc-ticker');
  tickerSelect.innerHTML = miners.map(m => `<option value="${m.ticker}">${m.ticker}</option>`).join('');

  if (id !== null) {
    const p = hpcProjects.find(h => h.id === id);
    if (!p) return;
    title.textContent = 'Edit HPC Project';
    deleteBtn.style.display = 'block';
    document.getElementById('hpc-edit-id').value = p.id;
    // Fill all fields
    document.getElementById('hpc-name').value = p.name || '';
    document.getElementById('hpc-ticker').value = p.ticker || '';
    document.getElementById('hpc-location').value = p.location || '';
    document.getElementById('hpc-tenant').value = p.tenant || '';
    document.getElementById('hpc-it-mw').value = p.it_mw || '';
    document.getElementById('hpc-credit-backstop').value = p.credit_backstop || 'hyperscaler';
    document.getElementById('hpc-credit-score').value = p.credit_score || 90;
    document.getElementById('hpc-lease-type').value = p.lease_type || 'nnn';
    document.getElementById('hpc-base-term').value = p.base_term || 15;
    document.getElementById('hpc-start-date').value = p.start_date || '';
    document.getElementById('hpc-delay-years').value = p.delay_years || 0;
    document.getElementById('hpc-rent-model').value = p.rent_model || 'per_kw';
    document.getElementById('hpc-rent-kw').value = p.rent_kw || 120;
    document.getElementById('hpc-direct-noi').value = p.direct_noi || '';
    document.getElementById('hpc-escalator').value = p.escalator || 2.5;
    document.getElementById('hpc-passthrough').value = p.passthrough || 95;
    document.getElementById('hpc-opex').value = p.opex || 0;
    document.getElementById('hpc-reserve').value = p.reserve || 15;
    document.getElementById('hpc-power-margin').value = p.power_margin || 0;
    document.getElementById('hpc-service-margin').value = p.service_margin || 0;
    document.getElementById('hpc-pcod').value = p.pcod || 90;
    document.getElementById('hpc-base-cap').value = p.base_cap || 8;
    document.getElementById('hpc-adder-credit').value = p.adder_credit || 0;
    document.getElementById('hpc-adder-lease').value = p.adder_lease || 0;
    document.getElementById('hpc-adder-concentration').value = p.adder_concentration || 50;
    document.getElementById('hpc-adder-ownership').value = p.adder_ownership || 0;
    document.getElementById('hpc-adder-market').value = p.adder_market || 0;
    document.getElementById('hpc-capex').value = p.capex || 0;
    document.getElementById('hpc-ti').value = p.ti || 0;
    document.getElementById('hpc-build-discount').value = p.build_discount || 10;
    document.getElementById('hpc-renewal-count').value = p.renewal_count || 2;
    document.getElementById('hpc-renewal-years').value = p.renewal_years || 5;
    document.getElementById('hpc-renewal-prob').value = p.renewal_prob || 70;
    document.getElementById('hpc-expansion-mw').value = p.expansion_mw || 0;
    document.getElementById('hpc-expansion-date').value = p.expansion_date || '';
    document.getElementById('hpc-expansion-prob').value = p.expansion_prob || 50;
    document.getElementById('hpc-residual-model').value = p.residual_model || 'salvage';
    document.getElementById('hpc-release-prob').value = p.release_prob || 60;
    document.getElementById('hpc-downtime').value = p.downtime || 6;
    document.getElementById('hpc-retenant-capex').value = p.retenant_capex || 0;
    document.getElementById('hpc-reversion-cap').value = p.reversion_cap || 9;
    document.getElementById('hpc-salvage').value = p.salvage || 0;
    document.getElementById('hpc-ownership').value = p.ownership || 'fee_simple';
    document.getElementById('hpc-ground-rent').value = p.ground_rent || 0;
    document.getElementById('hpc-single-tenant').value = p.single_tenant || 'yes';
    document.getElementById('hpc-substation').value = p.substation || 'yes';
    document.getElementById('hpc-interconnect').value = p.interconnect || 'yes';
    document.getElementById('hpc-source-url').value = p.source_url || '';
  } else {
    title.textContent = 'Add HPC Project';
    deleteBtn.style.display = 'none';
    document.getElementById('hpc-edit-id').value = '';
    // Reset to defaults
    document.getElementById('hpc-name').value = '';
    document.getElementById('hpc-location').value = '';
    document.getElementById('hpc-tenant').value = '';
    document.getElementById('hpc-it-mw').value = '';
    document.getElementById('hpc-credit-backstop').value = 'hyperscaler';
    document.getElementById('hpc-credit-score').value = 90;
    document.getElementById('hpc-lease-type').value = 'nnn';
    document.getElementById('hpc-base-term').value = 15;
    document.getElementById('hpc-start-date').value = '';
    document.getElementById('hpc-delay-years').value = 0;
    document.getElementById('hpc-rent-model').value = 'per_kw';
    document.getElementById('hpc-rent-kw').value = 120;
    document.getElementById('hpc-direct-noi').value = '';
    document.getElementById('hpc-escalator').value = 2.5;
    document.getElementById('hpc-passthrough').value = 95;
    document.getElementById('hpc-opex').value = 0;
    document.getElementById('hpc-reserve').value = 15;
    document.getElementById('hpc-power-margin').value = 0;
    document.getElementById('hpc-service-margin').value = 0;
    document.getElementById('hpc-pcod').value = 90;
    document.getElementById('hpc-base-cap').value = 8;
    document.getElementById('hpc-adder-credit').value = 0;
    document.getElementById('hpc-adder-lease').value = 0;
    document.getElementById('hpc-adder-concentration').value = 50;
    document.getElementById('hpc-adder-ownership').value = 0;
    document.getElementById('hpc-adder-market').value = 0;
    document.getElementById('hpc-capex').value = 0;
    document.getElementById('hpc-ti').value = 0;
    document.getElementById('hpc-build-discount').value = 10;
    document.getElementById('hpc-renewal-count').value = 2;
    document.getElementById('hpc-renewal-years').value = 5;
    document.getElementById('hpc-renewal-prob').value = 70;
    document.getElementById('hpc-expansion-mw').value = 0;
    document.getElementById('hpc-expansion-date').value = '';
    document.getElementById('hpc-expansion-prob').value = 50;
    document.getElementById('hpc-residual-model').value = 'salvage';
    document.getElementById('hpc-release-prob').value = 60;
    document.getElementById('hpc-downtime').value = 6;
    document.getElementById('hpc-retenant-capex').value = 0;
    document.getElementById('hpc-reversion-cap').value = 9;
    document.getElementById('hpc-salvage').value = 0;
    document.getElementById('hpc-ownership').value = 'fee_simple';
    document.getElementById('hpc-ground-rent').value = 0;
    document.getElementById('hpc-single-tenant').value = 'yes';
    document.getElementById('hpc-substation').value = 'yes';
    document.getElementById('hpc-interconnect').value = 'yes';
    document.getElementById('hpc-source-url').value = '';
  }
  toggleRentInputs();
  modal.classList.add('active');
}

function closeHpcModal() {
  document.getElementById('hpc-modal').classList.remove('active');
}

function saveHpcProject() {
  const editId = document.getElementById('hpc-edit-id').value;
  const data = {
    id: editId ? parseInt(editId) : Date.now(),
    name: document.getElementById('hpc-name').value,
    ticker: document.getElementById('hpc-ticker').value,
    location: document.getElementById('hpc-location').value,
    tenant: document.getElementById('hpc-tenant').value,
    it_mw: parseFloat(document.getElementById('hpc-it-mw').value) || 0,
    credit_backstop: document.getElementById('hpc-credit-backstop').value,
    credit_score: parseFloat(document.getElementById('hpc-credit-score').value) || 90,
    lease_type: document.getElementById('hpc-lease-type').value,
    base_term: parseFloat(document.getElementById('hpc-base-term').value) || 15,
    start_date: document.getElementById('hpc-start-date').value,
    delay_years: parseFloat(document.getElementById('hpc-delay-years').value) || 0,
    rent_model: document.getElementById('hpc-rent-model').value,
    rent_kw: parseFloat(document.getElementById('hpc-rent-kw').value) || 120,
    direct_noi: parseFloat(document.getElementById('hpc-direct-noi').value) || 0,
    escalator: parseFloat(document.getElementById('hpc-escalator').value) || 2.5,
    passthrough: parseFloat(document.getElementById('hpc-passthrough').value) || 95,
    opex: parseFloat(document.getElementById('hpc-opex').value) || 0,
    reserve: parseFloat(document.getElementById('hpc-reserve').value) || 15,
    power_margin: parseFloat(document.getElementById('hpc-power-margin').value) || 0,
    service_margin: parseFloat(document.getElementById('hpc-service-margin').value) || 0,
    pcod: parseFloat(document.getElementById('hpc-pcod').value) || 90,
    base_cap: parseFloat(document.getElementById('hpc-base-cap').value) || 8,
    adder_credit: parseFloat(document.getElementById('hpc-adder-credit').value) || 0,
    adder_lease: parseFloat(document.getElementById('hpc-adder-lease').value) || 0,
    adder_concentration: parseFloat(document.getElementById('hpc-adder-concentration').value) || 50,
    adder_ownership: parseFloat(document.getElementById('hpc-adder-ownership').value) || 0,
    adder_market: parseFloat(document.getElementById('hpc-adder-market').value) || 0,
    capex: parseFloat(document.getElementById('hpc-capex').value) || 0,
    ti: parseFloat(document.getElementById('hpc-ti').value) || 0,
    build_discount: parseFloat(document.getElementById('hpc-build-discount').value) || 10,
    renewal_count: parseInt(document.getElementById('hpc-renewal-count').value) || 2,
    renewal_years: parseInt(document.getElementById('hpc-renewal-years').value) || 5,
    renewal_prob: parseFloat(document.getElementById('hpc-renewal-prob').value) || 70,
    expansion_mw: parseFloat(document.getElementById('hpc-expansion-mw').value) || 0,
    expansion_date: document.getElementById('hpc-expansion-date').value,
    expansion_prob: parseFloat(document.getElementById('hpc-expansion-prob').value) || 50,
    residual_model: document.getElementById('hpc-residual-model').value,
    release_prob: parseFloat(document.getElementById('hpc-release-prob').value) || 60,
    downtime: parseInt(document.getElementById('hpc-downtime').value) || 6,
    retenant_capex: parseFloat(document.getElementById('hpc-retenant-capex').value) || 0,
    reversion_cap: parseFloat(document.getElementById('hpc-reversion-cap').value) || 9,
    salvage: parseFloat(document.getElementById('hpc-salvage').value) || 0,
    ownership: document.getElementById('hpc-ownership').value,
    ground_rent: parseFloat(document.getElementById('hpc-ground-rent').value) || 0,
    single_tenant: document.getElementById('hpc-single-tenant').value,
    substation: document.getElementById('hpc-substation').value,
    interconnect: document.getElementById('hpc-interconnect').value,
    source_url: document.getElementById('hpc-source-url').value || ''
  };

  if (editId) {
    const idx = hpcProjects.findIndex(h => h.id === parseInt(editId));
    if (idx !== -1) hpcProjects[idx] = data;
  } else {
    hpcProjects.push(data);
  }

  localStorage.setItem('hpcProjects', JSON.stringify(hpcProjects));
  closeHpcModal();
  renderHpcTable();
}

function deleteHpcProject() {
  const id = parseInt(document.getElementById('hpc-edit-id').value);
  if (!id || !confirm('Delete this HPC project?')) return;
  hpcProjects = hpcProjects.filter(h => h.id !== id);
  localStorage.setItem('hpcProjects', JSON.stringify(hpcProjects));
  closeHpcModal();
  renderHpcTable();
}

// Core HPC Valuation Calculation
function calculateHpcValuation(p) {
  // Cap_eff = Base cap + sum of adders (in bps)
  const capEff = (p.base_cap / 100) + (p.adder_credit + p.adder_lease + p.adder_concentration + p.adder_ownership + p.adder_market) / 10000;
  const g = p.escalator / 100; // Growth rate
  const T = p.base_term;
  const delta = p.delay_years;
  const pCod = p.pcod / 100;

  // Calculate NOI1 (stabilized year 1 NOI)
  let noi1;
  if (p.rent_model === 'direct_noi') {
    noi1 = p.direct_noi;
  } else {
    // Rent in $/kW-month × IT_MW × 1000 kW/MW × 12 months / 1,000,000 = $M/yr
    const rentRevenue = (p.rent_kw * p.it_mw * 1000 * 12) / 1000000;
    const powerMarginRev = (p.power_margin * p.it_mw * 1000 * 12) / 1000000;
    const serviceMarginRev = p.service_margin;
    const reserveCost = (p.reserve * p.it_mw * 1000) / 1000000;
    const opexCost = p.opex;
    const groundRent = p.ground_rent;
    noi1 = rentRevenue + powerMarginRev + serviceMarginRev - reserveCost - opexCost - groundRent;
  }

  // Discount factor for delay
  const delayDiscount = Math.pow(1 + capEff + g, -delta);

  // Annuity factor for base term with growth
  // PV = NOI1 * (1 - ((1+g)/(1+r))^T) / (r - g)
  const annuityFactor = (1 - Math.pow((1 + g) / (1 + capEff), T)) / (capEff - g);

  // Base value
  const vBase = pCod * noi1 * annuityFactor * delayDiscount;

  // Capex PV (net of TI)
  const netCapex = p.capex - p.ti;
  const buildRate = p.build_discount / 100;
  const vCapex = netCapex / Math.pow(1 + buildRate, delta);

  // Renewal options value
  let vRenewals = 0;
  let renewalStartYear = T;
  for (let i = 0; i < p.renewal_count; i++) {
    const renewalProb = Math.pow(p.renewal_prob / 100, i + 1);
    const renewalDelay = renewalStartYear + delta;
    const renewalAnnuity = (1 - Math.pow((1 + g) / (1 + capEff), p.renewal_years)) / (capEff - g);
    const noiAtRenewal = noi1 * Math.pow(1 + g, renewalStartYear);
    const renewalPv = renewalProb * pCod * noiAtRenewal * renewalAnnuity / Math.pow(1 + capEff, renewalDelay);
    vRenewals += renewalPv;
    renewalStartYear += p.renewal_years;
  }

  // Expansion option value
  let vExpansion = 0;
  if (p.expansion_mw > 0 && p.expansion_date) {
    const expansionYears = Math.max(0, (new Date(p.expansion_date).getFullYear() - new Date().getFullYear()));
    const expansionProb = p.expansion_prob / 100;
    // Assume similar economics to base
    const expansionNoi = noi1 * (p.expansion_mw / p.it_mw);
    const expansionAnnuity = (1 - Math.pow((1 + g) / (1 + capEff), T)) / (capEff - g);
    vExpansion = expansionProb * pCod * expansionNoi * expansionAnnuity / Math.pow(1 + capEff, expansionYears + delta);
  }

  // Residual value
  let vResidual = 0;
  const endYear = T + (p.renewal_count * p.renewal_years * (p.renewal_prob / 100));
  if (p.residual_model === 'salvage') {
    vResidual = p.salvage / Math.pow(1 + capEff, endYear + delta);
  } else {
    // Re-lease model
    const releaseProb = p.release_prob / 100;
    const downtimeYears = p.downtime / 12;
    const reversionCap = p.reversion_cap / 100;
    const noiAtEnd = noi1 * Math.pow(1 + g, endYear);
    const releaseValue = (noiAtEnd / reversionCap) - p.retenant_capex;
    vResidual = releaseProb * releaseValue / Math.pow(1 + capEff, endYear + delta + downtimeYears);
  }

  const vOptions = vRenewals + vExpansion;
  const vTotal = vBase + vOptions + vResidual - vCapex;
  const perMw = p.it_mw > 0 ? vTotal / p.it_mw : 0;
  const perKwMonth = p.it_mw > 0 ? (vTotal * 1000000) / (p.it_mw * 1000 * 12 * T) : 0;

  return {
    noi1,
    cap_eff: capEff * 100,
    v_base: vBase,
    v_options: vOptions,
    v_renewals: vRenewals,
    v_expansion: vExpansion,
    v_residual: vResidual,
    v_capex: vCapex,
    v_total: vTotal,
    per_mw: perMw,
    per_kw_month: perKwMonth
  };
}

function renderHpcHeader() {
  const tr = document.getElementById('hpcval-header');
  tr.innerHTML = hpcColumns.map(col => {
    const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
    return `<th style="width:${col.width}px" class="${alignClass}">${col.label}</th>`;
  }).join('');
}

function renderHpcTable() {
  renderHpcHeader();
  const tbody = document.getElementById('hpcval-table');
  let html = '';
  let totalValue = 0, totalMw = 0;

  // Group by ticker for company summaries
  const tickerSummary = {};

  hpcProjects.forEach(p => {
    const val = calculateHpcValuation(p);
    totalValue += val.v_total;
    totalMw += p.it_mw;

    // Track by ticker
    if (!tickerSummary[p.ticker]) {
      tickerSummary[p.ticker] = { mw: 0, value: 0, projects: 0 };
    }
    tickerSummary[p.ticker].mw += p.it_mw;
    tickerSummary[p.ticker].value += val.v_total;
    tickerSummary[p.ticker].projects += 1;

    html += `<tr class="data-row" onclick="showHpcProjectModal(${p.id})">`;
    hpcColumns.forEach(col => {
      const alignClass = col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : '';
      let cellVal = '';

      if (col.key === 'name') cellVal = `<strong>${truncate(p.name, 18)}</strong>`;
      else if (col.key === 'ticker') cellVal = p.ticker;
      else if (col.key === 'tenant') cellVal = truncate(p.tenant, 10);
      else if (col.key === 'it_mw') cellVal = p.it_mw;
      else if (col.key === 'cap_eff') cellVal = val.cap_eff.toFixed(1) + '%';
      else if (col.key === 'noi1') cellVal = '$' + val.noi1.toFixed(1);
      else if (col.key === 'v_base') cellVal = '$' + fmtNum(val.v_base, 1);
      else if (col.key === 'v_options') cellVal = '$' + fmtNum(val.v_options, 1);
      else if (col.key === 'v_residual') cellVal = '$' + fmtNum(val.v_residual, 1);
      else if (col.key === 'v_capex') cellVal = `<span class="text-danger">-$${fmtNum(val.v_capex, 1)}</span>`;
      else if (col.key === 'v_total') cellVal = `<strong class="text-success">$${fmtNum(val.v_total, 1)}</strong>`;
      else if (col.key === 'per_mw') cellVal = '$' + fmtNum(val.per_mw, 1) + 'M';
      else if (col.key === 'source') cellVal = p.source_url ? `<a href="${p.source_url}" target="_blank" onclick="event.stopPropagation()" title="${p.source_url}" class="source-link">🔗</a>` : '-';
      else if (col.key === 'actions') cellVal = `<button class="secondary" onclick="event.stopPropagation();showHpcProjectModal(${p.id})" style="padding:2px 4px">Ed</button>`;

      html += `<td class="${alignClass}">${cellVal}</td>`;
    });
    html += `</tr>`;
  });

  tbody.innerHTML = html;

  // Company-level breakdown
  const companyBreakdown = Object.entries(tickerSummary)
    .sort((a, b) => b[1].value - a[1].value)
    .map(([ticker, data]) => `
      <div class="company-hpc-row">
        <span class="company-ticker">${ticker}</span>
        <span class="company-mw">${data.mw} MW</span>
        <span class="company-value text-success">$${fmtNum(data.value, 0)}M</span>
        <span class="company-per-mw">$${fmtNum(data.value / data.mw, 1)}M/MW</span>
      </div>
    `).join('');

  // Summary
  document.getElementById('hpcval-summary').innerHTML = `
    <div class="hpc-summary-grid">
      <div class="hpc-totals">
        <div class="stat"><div class="stat-label">Projects</div><div class="stat-value">${hpcProjects.length}</div></div>
        <div class="stat"><div class="stat-label">Total IT MW</div><div class="stat-value">${fmtNum(totalMw, 0)}</div></div>
        <div class="stat"><div class="stat-label">Total Value</div><div class="stat-value text-success">$${fmtNum(totalValue, 0)}M</div></div>
        <div class="stat"><div class="stat-label">Avg $/MW</div><div class="stat-value">${totalMw > 0 ? '$' + fmtNum(totalValue / totalMw, 1) + 'M' : '-'}</div></div>
      </div>
      <div class="hpc-by-company">
        <h4>Value by Company</h4>
        ${companyBreakdown}
      </div>
    </div>
  `;
}

// Reset HPC projects to seed data
function resetHpcProjects() {
  if (!confirm('Reset all HPC projects to default data? This will remove any custom projects.')) return;
  localStorage.removeItem('hpcProjects');
  hpcProjects = [];
  seedHpcProjects();
  renderHpcTable();
}

// Initialize HPC table when tab is shown
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(renderHpcTable, 100);
});
