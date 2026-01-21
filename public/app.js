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

const API_BASE = '/api';

// ============== COLUMN DEFINITIONS ==============

const valuationColumns = [
  { key: 'expand', label: '', width: 20, sortable: false },
  { key: 'ticker', label: 'Ticker', width: 60, sortable: true, align: 'left' },
  { key: 'mining_ev', label: 'Mining', width: 70, sortable: true, align: 'right', format: 'money' },
  { key: 'hodl_value', label: 'HODL', width: 70, sortable: true, align: 'right', format: 'money' },
  { key: 'lease_value', label: 'Lease', width: 70, sortable: true, align: 'right', format: 'money', class: 'text-success' },
  { key: 'pipeline_value', label: 'Pipeline', width: 70, sortable: true, align: 'right', format: 'money', class: 'text-warning' },
  { key: 'cash', label: 'Cash', width: 60, sortable: true, align: 'right', format: 'money' },
  { key: 'debt', label: 'Debt', width: 60, sortable: true, align: 'right', format: 'money', class: 'text-danger' },
  { key: 'net_value', label: 'Net Val', width: 80, sortable: true, align: 'right', format: 'money' },
  { key: 'fd_shares_m', label: 'Shares', width: 60, sortable: true, align: 'right', format: 'number' },
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

    const combinedFactor = phaseFactor * gridFactor * yearFactor * sizeFactor * countryFactor;
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
      factors: { phase: phaseFactor, grid: gridFactor, year: yearFactor, size: sizeFactor, country: countryFactor, combined: combinedFactor }
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

    html += `<tr class="data-row ${isExpanded ? 'expanded' : ''}" onclick="toggleProject(${p.id})">`;
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
      <div class="calc-row"><span class="calc-label">Combined Factor</span><span class="calc-value">${(f.combined || 1).toFixed(3)}x</span></div>
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
      <div class="calc-row"><span class="calc-label">Combined Factor</span><span class="calc-value">${(f.combined || 1).toFixed(3)}x</span></div>
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
