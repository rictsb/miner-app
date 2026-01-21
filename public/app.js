// Global state
let miners = [];
let projects = [];
let valuations = [];
let factors = [];
let projectValuations = {}; // Store per-project valuations
let map = null;
let markers = [];
let selectedMiner = null;
let expandedRows = new Set(); // Track expanded rows

const API_BASE = '/api';

// ============== INITIALIZATION ==============

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadData();
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
    renderProjects();
    renderFactors();
    refreshValuations();
  } catch (err) {
    console.error('Error loading data:', err);
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
    renderValuationTable();
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
  // Build factor lookup
  const factorLookup = {};
  factors.forEach(f => {
    if (!factorLookup[f.category]) factorLookup[f.category] = {};
    factorLookup[f.category][f.factor_key] = f.multiplier;
  });

  const capRate = factorLookup['valuation']?.['cap_rate'] || 0.12;
  const noiPerMwYr = factorLookup['valuation']?.['noi_per_mw_yr'] || 1.4;

  projectValuations = {};

  projects.forEach(p => {
    // Get applicable factors
    let phaseFactor = 1;
    if (factorLookup['phase']) {
      phaseFactor = factorLookup['phase'][p.site_phase] || 0.5;
    }

    let gridFactor = 1;
    if (factorLookup['grid'] && p.grid) {
      const gridKey = p.grid.split(' ')[0];
      gridFactor = factorLookup['grid'][gridKey] || 0.9;
    }

    let yearFactor = 1;
    if (factorLookup['year'] && p.energization_date) {
      const yearMatch = p.energization_date.match(/20\d{2}/);
      if (yearMatch) {
        yearFactor = factorLookup['year'][yearMatch[0]] || 0.5;
      }
    }

    let sizeFactor = 1;
    if (factorLookup['size'] && p.it_mw) {
      if (p.it_mw >= 500) sizeFactor = factorLookup['size']['500'] || 1.1;
      else if (p.it_mw >= 250) sizeFactor = factorLookup['size']['250'] || 1.0;
      else if (p.it_mw >= 100) sizeFactor = factorLookup['size']['100'] || 0.95;
      else sizeFactor = factorLookup['size']['99'] || 0.85;
    }

    const combinedFactor = phaseFactor * gridFactor * yearFactor * sizeFactor;

    let leaseValue = 0;
    let pipelineValue = 0;
    let valueType = 'none';

    if (p.noi_annual_m && p.noi_annual_m > 0) {
      leaseValue = (p.noi_annual_m / capRate) * combinedFactor;
      valueType = 'lease';
    } else if (p.it_mw && p.it_mw > 0) {
      const estimatedNoi = p.it_mw * noiPerMwYr * 0.85;
      pipelineValue = (estimatedNoi / capRate) * combinedFactor;
      valueType = 'pipeline';
    }

    projectValuations[p.id] = {
      lease_value: Math.round(leaseValue),
      pipeline_value: Math.round(pipelineValue),
      total_value: Math.round(leaseValue + pipelineValue),
      value_type: valueType,
      factors: {
        phase: phaseFactor,
        grid: gridFactor,
        year: yearFactor,
        size: sizeFactor,
        combined: combinedFactor
      }
    };
  });
}

function toggleRow(ticker) {
  if (expandedRows.has(ticker)) {
    expandedRows.delete(ticker);
  } else {
    expandedRows.add(ticker);
  }
  renderValuationTable();
}

function renderValuationTable() {
  const tbody = document.getElementById('valuation-table');
  let html = '';

  valuations.forEach(v => {
    const ps = v.per_share || {};
    const upsideClass = ps.upside_pct !== null ? (ps.upside_pct >= 0 ? 'text-success' : 'text-danger') : '';
    const upsideSign = ps.upside_pct !== null && ps.upside_pct >= 0 ? '+' : '';
    const isExpanded = expandedRows.has(v.ticker);
    const expandIcon = isExpanded ? '▼' : '▶';

    // Main row
    html += `
    <tr class="data-row ${isExpanded ? 'expanded' : ''}" onclick="toggleRow('${v.ticker}')">
      <td><span class="expand-icon">${expandIcon}</span></td>
      <td><strong>${v.ticker}</strong></td>
      <td class="text-right">${formatNum(v.components.mining_ev)}</td>
      <td class="text-right">${formatNum(v.components.hodl_value)}</td>
      <td class="text-right text-success">${formatNum(v.components.lease_value)}</td>
      <td class="text-right text-warning">${formatNum(v.components.pipeline_value)}</td>
      <td class="text-right">${formatNum(v.components.cash)}</td>
      <td class="text-right text-danger">${formatNum(v.components.debt)}</td>
      <td class="text-right"><strong class="${v.components.net_value >= 0 ? 'text-success' : 'text-danger'}">${formatNum(v.components.net_value)}</strong></td>
      <td class="text-right text-muted">${ps.fd_shares_m ? formatNum(ps.fd_shares_m) : '-'}</td>
      <td class="text-right">${ps.current_price ? '$' + ps.current_price.toFixed(2) : '-'}</td>
      <td class="text-right">${ps.implied_value ? '$' + ps.implied_value.toFixed(2) : '-'}</td>
      <td class="text-right ${upsideClass}"><strong>${ps.upside_pct !== null ? upsideSign + ps.upside_pct.toFixed(1) + '%' : '-'}</strong></td>
    </tr>`;

    // Expanded content
    if (isExpanded) {
      const minerProjects = projects.filter(p => p.ticker === v.ticker);
      const leaseProjects = minerProjects.filter(p => projectValuations[p.id]?.value_type === 'lease');
      const pipelineProjects = minerProjects.filter(p => projectValuations[p.id]?.value_type === 'pipeline');

      html += `
      <tr class="expanded-content">
        <td colspan="13">
          <div class="expanded-inner">`;

      // Lease projects
      if (leaseProjects.length > 0) {
        html += `<h4>Contracted Leases (${leaseProjects.length})</h4>
        <div class="project-grid">`;
        leaseProjects.forEach(p => {
          const pv = projectValuations[p.id] || {};
          html += `
          <div class="project-item">
            <div class="project-item-header">
              <span class="project-name">${p.site_name || 'Unnamed'}</span>
              <span class="project-value">$${formatNum(pv.lease_value)}M</span>
            </div>
            <div class="project-details">
              <span>${p.it_mw || 0} MW</span>
              <span>${p.grid || '-'}</span>
              <span>${p.lessee || '-'}</span>
              <span>NOI: $${p.noi_annual_m?.toFixed(1) || 0}M/yr</span>
            </div>
          </div>`;
        });
        html += `</div>`;
      }

      // Pipeline projects
      if (pipelineProjects.length > 0) {
        html += `<h4 style="margin-top: 10px;">Pipeline Projects (${pipelineProjects.length})</h4>
        <div class="project-grid">`;
        pipelineProjects.forEach(p => {
          const pv = projectValuations[p.id] || {};
          html += `
          <div class="project-item">
            <div class="project-item-header">
              <span class="project-name">${p.site_name || 'Unnamed'}</span>
              <span class="project-value text-warning">$${formatNum(pv.pipeline_value)}M</span>
            </div>
            <div class="project-details">
              <span>${p.it_mw || 0} MW</span>
              <span>${p.grid || '-'}</span>
              <span>${p.site_phase || '-'}</span>
              <span>Factor: ${(pv.factors?.combined || 1).toFixed(2)}x</span>
            </div>
          </div>`;
        });
        html += `</div>`;
      }

      if (leaseProjects.length === 0 && pipelineProjects.length === 0) {
        html += `<div class="text-muted">No projects with assigned value</div>`;
      }

      html += `</div></td></tr>`;
    }
  });

  tbody.innerHTML = html;
}

// ============== MINERS ==============

function renderMinerList() {
  const container = document.getElementById('miner-list');
  const minerValuations = {};
  valuations.forEach(v => { minerValuations[v.ticker] = v; });
  container.innerHTML = miners.map(m => {
    const v = minerValuations[m.ticker] || { components: { net_value: 0 }, metrics: {} };
    const isSelected = selectedMiner === m.ticker;
    return `
      <div class="miner-card ${isSelected ? 'selected' : ''}" onclick="selectMiner('${m.ticker}')">
        <div class="miner-header">
          <span class="miner-ticker">${m.ticker}</span>
          <span class="miner-value">$${formatNum(v.components.net_value)}M</span>
        </div>
        <div class="miner-metrics">
          <span>${m.hashrate_eh || 0} EH</span>
          <span>${v.metrics.project_count || 0} proj</span>
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
      await fetch(`${API_BASE}/miners/${editTicker}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      await fetch(`${API_BASE}/miners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    closeMinerModal();
    loadData();
  } catch (err) {
    console.error('Error saving miner:', err);
  }
}

// ============== PROJECTS ==============

function populateFilters() {
  const tickerOptions = ['<option value="">All</option>']
    .concat(miners.map(m => `<option value="${m.ticker}">${m.ticker}</option>`))
    .join('');
  document.getElementById('project-filter-ticker').innerHTML = tickerOptions;
  document.getElementById('map-filter-miner').innerHTML = tickerOptions;
  document.getElementById('project-ticker').innerHTML = miners.map(m => `<option value="${m.ticker}">${m.ticker}</option>`).join('');

  const statuses = [...new Set(projects.map(p => p.status).filter(Boolean))];
  document.getElementById('project-filter-status').innerHTML =
    '<option value="">All</option>' +
    statuses.map(s => `<option value="${s}">${s}</option>`).join('');

  const phases = [...new Set(projects.map(p => p.site_phase).filter(Boolean))];
  document.getElementById('map-filter-phase').innerHTML =
    '<option value="">All</option>' +
    phases.map(p => `<option value="${p}">${p}</option>`).join('');
  document.getElementById('project-filter-phase').innerHTML =
    '<option value="">All</option>' +
    phases.map(p => `<option value="${p}">${p}</option>`).join('');
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

  const tbody = document.getElementById('projects-table');
  tbody.innerHTML = filtered.slice(0, 200).map(p => `
    <tr>
      <td><strong>${p.ticker}</strong></td>
      <td class="truncate" title="${p.site_name || ''}">${p.site_name || '-'}</td>
      <td><span class="badge ${getPhaseClass(p.site_phase)}">${truncate(p.site_phase, 12) || '-'}</span></td>
      <td>${p.state || '-'}</td>
      <td class="text-right">${p.it_mw || '-'}</td>
      <td>${p.grid || '-'}</td>
      <td>${truncate(p.current_use, 8) || '-'}</td>
      <td><span class="badge ${getStatusClass(p.status)}">${truncate(p.status, 10) || '-'}</span></td>
      <td>${p.energization_date ? formatDate(p.energization_date) : '-'}</td>
      <td>${truncate(p.lessee, 10) || '-'}</td>
      <td class="text-right">${p.lease_value_m ? formatNum(p.lease_value_m) : '-'}</td>
      <td class="text-right">${p.noi_pct ? p.noi_pct + '%' : '-'}</td>
      <td><span class="badge ${getConfidenceClass(p.confidence)}">${p.confidence || '-'}</span></td>
      <td>
        <button class="secondary" onclick="showEditProjectModal(${p.id})" style="padding: 2px 4px;">Ed</button>
      </td>
    </tr>
  `).join('');
}

function getPhaseClass(phase) {
  if (!phase) return 'badge-info';
  if (phase.includes('Online') || phase.includes('Energized')) return 'badge-success';
  if (phase.includes('construction')) return 'badge-warning';
  return 'badge-info';
}

function getStatusClass(status) {
  if (!status) return 'badge-info';
  if (status === 'Operational' || status === 'Contracted') return 'badge-success';
  if (status.includes('Construction') || status.includes('Development')) return 'badge-warning';
  return 'badge-info';
}

function getConfidenceClass(confidence) {
  if (confidence === 'HIGH') return 'badge-success';
  if (confidence === 'MEDIUM') return 'badge-warning';
  if (confidence === 'LOW') return 'badge-info';
  return 'badge-info';
}

function showAddProjectModal() {
  document.getElementById('project-modal-title').textContent = 'Add Project';
  document.getElementById('project-edit-id').value = '';
  document.getElementById('btn-delete-project').style.display = 'none';

  const fields = [
    'project-ticker', 'project-site-name', 'project-site-phase', 'project-status',
    'project-current-use', 'project-country', 'project-state', 'project-grid',
    'project-gross-mw', 'project-it-mw', 'project-pue', 'project-power-authority',
    'project-energization', 'project-lease-start', 'project-ownership-status',
    'project-lessee', 'project-lease-value', 'project-lease-yrs', 'project-noi-pct',
    'project-annual-rev', 'project-noi-annual', 'project-hpc-pipeline',
    'project-confidence', 'project-lease-notes', 'project-notes', 'project-source-url'
  ];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el.tagName === 'SELECT') el.selectedIndex = 0;
    else el.value = '';
  });

  document.getElementById('project-country').value = 'United States';
  document.getElementById('project-pue').value = '1.3';
  document.getElementById('project-modal').classList.add('active');
}

function showEditProjectModal(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return;

  document.getElementById('project-modal-title').textContent = 'Edit Project';
  document.getElementById('project-edit-id').value = id;
  document.getElementById('btn-delete-project').style.display = 'block';

  document.getElementById('project-ticker').value = project.ticker || '';
  document.getElementById('project-site-name').value = project.site_name || '';
  document.getElementById('project-site-phase').value = project.site_phase || '';
  document.getElementById('project-status').value = project.status || '';
  document.getElementById('project-current-use').value = project.current_use || '';
  document.getElementById('project-country').value = project.country || 'United States';
  document.getElementById('project-state').value = project.state || '';
  document.getElementById('project-grid').value = project.grid || '';
  document.getElementById('project-gross-mw').value = project.gross_mw || '';
  document.getElementById('project-it-mw').value = project.it_mw || '';
  document.getElementById('project-pue').value = project.pue || '1.3';
  document.getElementById('project-power-authority').value = project.power_authority || '';
  document.getElementById('project-energization').value = project.energization_date ? project.energization_date.split('T')[0] : '';
  document.getElementById('project-lease-start').value = project.lease_start || '';
  document.getElementById('project-ownership-status').value = project.ownership_status || '';
  document.getElementById('project-lessee').value = project.lessee || '';
  document.getElementById('project-lease-value').value = project.lease_value_m || '';
  document.getElementById('project-lease-yrs').value = project.lease_yrs || '';
  document.getElementById('project-noi-pct').value = project.noi_pct || '';
  document.getElementById('project-annual-rev').value = project.annual_rev_m || '';
  document.getElementById('project-noi-annual').value = project.noi_annual_m || '';
  document.getElementById('project-hpc-pipeline').value = project.hpc_pipeline_mw_2028 || '';
  document.getElementById('project-confidence').value = project.confidence || '';
  document.getElementById('project-lease-notes').value = project.lease_notes || '';
  document.getElementById('project-notes').value = project.notes || '';
  document.getElementById('project-source-url').value = project.source_url || '';

  document.getElementById('project-modal').classList.add('active');
}

function closeProjectModal() {
  document.getElementById('project-modal').classList.remove('active');
}

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
    if (editId) {
      await fetch(`${API_BASE}/projects/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    closeProjectModal();
    loadData();
  } catch (err) {
    console.error('Error saving project:', err);
  }
}

async function deleteProject() {
  const id = document.getElementById('project-edit-id').value;
  if (!id) return;
  if (!confirm('Delete this project?')) return;
  try {
    await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
    closeProjectModal();
    loadData();
  } catch (err) {
    console.error('Error deleting project:', err);
  }
}

// Event listeners for project filters
document.getElementById('project-filter-ticker')?.addEventListener('change', renderProjects);
document.getElementById('project-filter-status')?.addEventListener('change', renderProjects);
document.getElementById('project-filter-phase')?.addEventListener('change', renderProjects);
document.getElementById('project-search')?.addEventListener('input', renderProjects);

// ============== FACTORS ==============

function renderFactors() {
  const container = document.getElementById('factors-container');
  const grouped = {};
  factors.forEach(f => {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  });

  container.innerHTML = Object.entries(grouped).map(([category, items]) => `
    <div class="factor-category">
      <div class="factor-category-header">${category.replace(/_/g, ' ')}</div>
      <div class="factor-items">
        ${items.map(f => `
          <div class="factor-item">
            <span>${f.factor_key}</span>
            <input type="number" value="${f.multiplier}" step="0.01"
              onchange="updateFactor(${f.id}, this.value)" style="width: 60px; text-align: right;">
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

async function updateFactor(id, value) {
  try {
    await fetch(`${API_BASE}/factors/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ multiplier: parseFloat(value) })
    });
    refreshValuations();
  } catch (err) {
    console.error('Error updating factor:', err);
  }
}

// ============== MAP ==============

function initMap() {
  if (map) return;
  map = L.map('map').setView([39.8, -98.5], 4);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OSM, CartoDB',
    maxZoom: 19
  }).addTo(map);
  renderMapMarkers();
  document.getElementById('map-filter-mw').addEventListener('input', (e) => {
    document.getElementById('mw-value').textContent = e.target.value;
  });
}

function renderMapMarkers(filteredProjects = null) {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  const projectsToShow = filteredProjects || projects;

  projectsToShow.forEach(p => {
    if (!p.lat || !p.lng) return;
    const color = p.lease_value_m > 0 ? '#00ff00' :
                  p.status === 'Operational' ? '#ff6600' : '#ffcc00';
    const radius = Math.max(4, Math.min(15, Math.sqrt(p.it_mw || 10) * 1.5));

    const marker = L.circleMarker([p.lat, p.lng], {
      radius: radius,
      fillColor: color,
      color: '#fff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.7
    });

    marker.bindPopup(`
      <div style="min-width: 200px; font-size: 10px;">
        <strong>${p.ticker}</strong> - ${p.site_name}<br>
        <hr style="margin: 4px 0; border-color: #333;">
        Phase: ${p.site_phase || '-'}<br>
        Status: ${p.status || '-'}<br>
        IT MW: ${p.it_mw || '-'} | Grid: ${p.grid || '-'}<br>
        Lessee: ${p.lessee || '-'}<br>
        ${p.lease_value_m ? `Lease: $${formatNum(p.lease_value_m)}M` : ''}
      </div>
    `);
    marker.addTo(map);
    markers.push(marker);
  });
}

function applyMapFilters() {
  const ticker = document.getElementById('map-filter-miner').value;
  const minMw = parseFloat(document.getElementById('map-filter-mw').value) || 0;
  const hasLease = document.getElementById('map-filter-lease').value;
  const phase = document.getElementById('map-filter-phase').value;

  let filtered = projects;
  if (ticker) filtered = filtered.filter(p => p.ticker === ticker);
  if (minMw > 0) filtered = filtered.filter(p => (p.it_mw || 0) >= minMw);
  if (hasLease === 'true') filtered = filtered.filter(p => p.lease_value_m > 0);
  if (hasLease === 'false') filtered = filtered.filter(p => !p.lease_value_m || p.lease_value_m === 0);
  if (phase) filtered = filtered.filter(p => p.site_phase === phase);

  renderMapMarkers(filtered);
}

// ============== STATS ==============

function renderStats(stats) {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Miners</div>
      <div class="stat-value">${stats.total_miners}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Projects</div>
      <div class="stat-value">${stats.total_projects}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">IT Capacity</div>
      <div class="stat-value">${formatNum(stats.total_it_mw)} MW</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Lease Value</div>
      <div class="stat-value text-success">$${formatNum(stats.total_lease_value)}M</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Contracted</div>
      <div class="stat-value">${stats.contracted_projects}</div>
    </div>
  `;
}

// ============== UTILITIES ==============

function formatNum(n) {
  if (n === null || n === undefined) return '-';
  return Math.round(n).toLocaleString();
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  if (dateStr.includes('-') && dateStr.length >= 7) {
    const d = new Date(dateStr);
    if (!isNaN(d)) return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  }
  return dateStr;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '..' : str;
}
