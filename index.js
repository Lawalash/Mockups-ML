// ======================
// index.js — versão completa corrigida (mockup funcional)
// ======================

// Storage Keys
const STORAGE_KEYS = {
  records: 'tabi_records_v3',
  validations: 'tabi_validations_v3',
  assignments: 'tabi_assignments_v3',
  logs: 'tabi_logs_v3',
  collaborators: 'tabi_collabs_v1'
};

// ---------- Helpers ----------
function generateId() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,9); }
function formatDateTime(iso) { return new Date(iso).toLocaleString('pt-BR'); }

// Gera matrícula numérica de 6 dígitos, garantindo unicidade
function generateMatricula(existingSet = new Set()) {
  let n;
  do {
    n = String(Math.floor(100000 + Math.random() * 900000)); // 100000-999999
  } while (existingSet.has(n));
  existingSet.add(n);
  return n;
}

// Escapar HTML para evitar XSS (usado ao renderizar logs)
function esc(str) {
  return String(str || '').replace(/[&<>"']/g, s =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[s])
  );
}

// ---------- Build initial collaborators with unique names and matriculas ----------
function buildInitialCollaborators() {
  const used = new Set();

  // Gerentes
  const g1 = { matricula: generateMatricula(used), nome: 'Ana Paula Martins', role: 'Gerente' };
  const g2 = { matricula: generateMatricula(used), nome: 'José Carlos Ferreira', role: 'Gerente' };

  // Coordenadores
  const c1 = { matricula: generateMatricula(used), nome: 'Bruno Henrique Silva', role: 'Coordenador', gerenteId: g1.matricula };
  const c2 = { matricula: generateMatricula(used), nome: 'Paula Regina Mendes', role: 'Coordenador', gerenteId: g2.matricula };
  const c3 = { matricula: generateMatricula(used), nome: 'Roberto Lima Santos', role: 'Coordenador', gerenteId: g1.matricula };

  // Supervisores
  const s1 = { matricula: generateMatricula(used), nome: 'Carlos Eduardo Oliveira', role: 'Supervisor', gerenteId: g1.matricula, coordenadorId: c1.matricula };
  const s2 = { matricula: generateMatricula(used), nome: 'Diana Cristina Costa', role: 'Supervisor', gerenteId: g1.matricula, coordenadorId: c1.matricula };
  const s3 = { matricula: generateMatricula(used), nome: 'Eduardo Antônio Lima', role: 'Supervisor', gerenteId: g2.matricula, coordenadorId: c2.matricula };
  const s4 = { matricula: generateMatricula(used), nome: 'Fernanda Beatriz Alves', role: 'Supervisor', gerenteId: g2.matricula, coordenadorId: c2.matricula };
  const s5 = { matricula: generateMatricula(used), nome: 'Marcos Vinícius Rocha', role: 'Supervisor', gerenteId: g1.matricula, coordenadorId: c3.matricula };

  // Colaboradores
  const collabs = [
    { nome: 'Carla Beatriz Pereira', sup: s1 },
    { nome: 'Felipe Augusto Santos', sup: s1 },
    { nome: 'Lucas Gabriel Almeida', sup: s2 },
    { nome: 'Mariana Fernanda Rocha', sup: s2 },
    { nome: 'Rafael Alessandro Souza', sup: s3 },
    { nome: 'Patrícia Helena Gomes', sup: s3 },
    { nome: 'Thiago Rodrigo Castro', sup: s4 },
    { nome: 'Amanda Cristiane Lima', sup: s4 },
    { nome: 'Marcos Paulo da Silva Junior', sup: s4 },
    { nome: 'Gabriela Vitória Nunes', sup: s2 },
    { nome: 'André Luís Barbosa', sup: s5 },
    { nome: 'Juliana Aparecida Costa', sup: s5 },
    { nome: 'Ricardo Henrique Alves', sup: s1 },
    { nome: 'Vanessa Caroline Oliveira', sup: s3 }
  ].map(c => ({
    matricula: generateMatricula(used),
    nome: c.nome,
    role: 'Colaborador',
    gerenteId: c.sup.gerenteId,
    coordenadorId: c.sup.coordenadorId,
    supervisorId: c.sup.matricula
  }));

  return [
    g1, g2,
    c1, c2, c3,
    s1, s2, s3, s4, s5,
    ...collabs
  ];
}

// ---------- Global state ----------
let state = {
  records: [],
  validations: {},
  assignments: {},
  logs: [],
  collaborators: buildInitialCollaborators(),
  importBuffer: [],
  currentUser: 'Demo User'
};

let nocChart = null;
let dashboardCharts = {}; // to keep refs to dashboard charts so we can destroy them

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  loadState();
  // ensureNOCFilterUI(); // REMOVIDO: HTML já contém os filtros — evita duplicação
  initNOCSupervisorFilters();
  initializeIntervals();
  initializeClock();
  initializeTabs();
  renderAll();
});

// ---------- Persistence ----------
function loadState() {
  try {
    const savedCollabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.collaborators) || 'null');
    if (Array.isArray(savedCollabs) && savedCollabs.length > 0) {
      const existingMatriculas = new Set();
      // preserve saved names, but ensure matriculas unique
      state.collaborators = savedCollabs.map(c => {
        const result = {
          matricula: c.matricula || generateMatricula(existingMatriculas),
          nome: c.nome || 'Nome Não Definido',
          role: c.role || 'Colaborador',
          gerenteId: c.gerenteId || null,
          coordenadorId: c.coordenadorId || null,
          supervisorId: c.supervisorId || null
        };
        if (result.matricula) existingMatriculas.add(result.matricula);
        return result;
      });
    } else {
      // first-run: save generated collaborators
      localStorage.setItem(STORAGE_KEYS.collaborators, JSON.stringify(state.collaborators));
    }

    state.records = JSON.parse(localStorage.getItem(STORAGE_KEYS.records) || '[]') || [];
    state.validations = JSON.parse(localStorage.getItem(STORAGE_KEYS.validations) || '{}') || {};
    state.assignments = JSON.parse(localStorage.getItem(STORAGE_KEYS.assignments) || '{}') || {};
    state.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.logs) || '[]') || [];
  } catch (e) {
    console.error('loadState error', e);
  }

  // Seed if none
  if (!state.records || state.records.length === 0) {
    seedSampleRecords();
    saveState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(state.records));
    localStorage.setItem(STORAGE_KEYS.validations, JSON.stringify(state.validations));
    localStorage.setItem(STORAGE_KEYS.assignments, JSON.stringify(state.assignments));
    localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(state.logs));
    localStorage.setItem(STORAGE_KEYS.collaborators, JSON.stringify(state.collaborators));
  } catch (e) {
    console.error('saveState error', e);
  }
}

function addLog(action, details) {
  state.logs.push({ timestamp: new Date().toISOString(), user: state.currentUser, action, details });
  saveState();
  renderLogs();
}

// ---------- Seed sample records for MANHÃ / TARDE / NOITE ----------
function seedSampleRecords() {
  const today = new Date();
  const pad = n => String(n).padStart(2,'0');
  const yyyy = today.getFullYear();
  const mm = pad(today.getMonth()+1);
  const dd = pad(today.getDate());
  const date = `${yyyy}-${mm}-${dd}`;

  function pushRec(segment, operation, time, hc, status='Publicado') {
    state.records.push({
      id: generateId(),
      date,
      dmm: '1°',
      operation,
      segment,
      interval_start: time,
      hc_requested: hc,
      he_minutes: hc * 10,
      motivo: 'Seed - demonstração',
      status,
      created_at: new Date().toISOString()
    });
  }

  // MANHÃ (07:00-12:00)
  pushRec('CONTROLE FRONT MOC', 'VIVO', '07:00:00', 4);
  pushRec('CONTROLE FRONT MOC', 'VIVO', '08:10:00', 3);
  pushRec('CONTROLE GRE BH', 'TIM', '09:20:00', 2);
  pushRec('LABS LAB', 'OI', '10:30:00', 3);
  pushRec('PRÉ PAGO ESE BH', 'CLARO', '11:40:00', 2);

  // TARDE (13:00-17:00)
  pushRec('PRÉ PAGO ESE BH', 'CLARO', '13:10:00', 5);
  pushRec('PRÉ PAGO ESE BH', 'CLARO', '14:30:00', 3);
  pushRec('LABS LAB', 'OI', '15:40:00', 4);
  pushRec('CONTROLE GRE BH', 'TIM', '16:50:00', 2);

  // NOITE (18:00-22:00)
  pushRec('CONTROLE FRONT MOC', 'VIVO', '18:00:00', 4);
  pushRec('CONTROLE GRE BH', 'TIM', '19:10:00', 3);
  pushRec('LABS LAB', 'OI', '20:20:00', 5);
  pushRec('PRÉ PAGO ESE BH', 'CLARO', '21:30:00', 2);

  addLog('Seed', 'Registros de demonstração criados (manhã/tarde/noite)');
}

// ---------- Reset Demo ----------
function resetDemo() {
  if (!confirm('Esta ação irá limpar todos os dados e recriar os colaboradores e registros de demonstração. Continuar?')) {
    return;
  }

  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));

  state = {
    records: [],
    validations: {},
    assignments: {},
    logs: [],
    collaborators: buildInitialCollaborators(),
    importBuffer: [],
    currentUser: 'Demo User'
  };

  seedSampleRecords();
  saveState();
  renderAll();
  alert('Demo resetado com sucesso! Novos colaboradores e registros foram criados.');
  addLog('Reset Demo', 'Sistema resetado com novos colaboradores e registros');
}

// ---------- UI Init ----------
function initializeClock() {
  const el = document.getElementById('clock');
  function tick() { if (el) el.textContent = new Date().toLocaleString('pt-BR'); }
  tick(); setInterval(tick, 1000);
}

function initializeTabs() {
  const tabs = document.querySelectorAll('.tabs button');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById(btn.dataset.tab);
      if (pane) pane.classList.add('active');
      if (btn.dataset.tab === 'tatico') renderTatico();
      if (btn.dataset.tab === 'noc') renderNOC();
      if (btn.dataset.tab === 'supervisor') renderSupervisor();
      if (btn.dataset.tab === 'logs') renderLogs();
      if (btn.dataset.tab === 'dashboard') renderDashboard();
    });
  });
}

function initializeIntervals() {
  const select = document.getElementById('t_intervals');
  if (!select) return;
  select.innerHTML = '';
  for (let h=0; h<24; h++) for (let m=0; m<60; m+=10) {
    const hh = String(h).padStart(2,'0'), mm = String(m).padStart(2,'0');
    const opt = document.createElement('option');
    opt.value = `${hh}:${mm}:00`;
    opt.textContent = `${hh}:${mm}:00`;
    select.appendChild(opt);
  }
}

// ---------- TÁTICO ----------
function taticoAdd() {
  const date = document.getElementById('t_date').value;
  const dmm = document.getElementById('t_dmm').value;
  const operacao = document.getElementById('t_operation').value;
  const segmento = document.getElementById('t_segment').value;
  const hc = parseInt(document.getElementById('t_hc').value) || 1;
  const motivo = document.getElementById('t_motivo').value;
  const intervals = Array.from(document.getElementById('t_intervals').selectedOptions).map(o=>o.value);

  if (!date || intervals.length===0) return alert('Preencha data e selecione pelo menos um intervalo.');

  intervals.forEach(interval => {
    state.records.push({
      id: generateId(),
      date,
      dmm,
      operation: operacao,
      segment: segmento,
      interval_start: interval,
      hc_requested: hc,
      he_minutes: hc * 10,
      motivo,
      status: 'Rascunho',
      created_at: new Date().toISOString()
    });
  });

  saveState();
  renderTatico();
  addLog('Adicionar registro', `${intervals.length} intervalo(s) adicionado(s)`);
  taticoClear();
}

function taticoClear() {
  document.getElementById('t_date').value = '';
  document.getElementById('t_dmm').value = '';
  document.getElementById('t_operation').value = '';
  document.getElementById('t_segment').value = '';
  document.getElementById('t_hc').value = '1';
  document.getElementById('t_motivo').value = '';
  document.getElementById('t_intervals').selectedIndex = -1;
}

function taticoPublish() {
  const drafts = state.records.filter(r=>r.status==='Rascunho');
  if (!drafts.length) return alert('Não há rascunhos para publicar.');
  drafts.forEach(r => { r.status = 'Publicado'; r.published_at = new Date().toISOString(); });
  saveState();
  renderTatico();
  addLog('Publicar rascunhos', `${drafts.length} registro(s) publicado(s)`);
  alert(`${drafts.length} registro(s) publicado(s).`);
}

function editRecord(id) {
  const r = state.records.find(x=>x.id===id);
  if(!r) return;
  document.getElementById('t_date').value = r.date;
  document.getElementById('t_dmm').value = r.dmm || '';
  document.getElementById('t_operation').value = r.operation || '';
  document.getElementById('t_segment').value = r.segment || '';
  const opts = document.getElementById('t_intervals').options;
  for (let i=0;i<opts.length;i++) opts[i].selected = opts[i].value===r.interval_start;
  removeRecord(id, false);
}

function removeRecord(id, ask=true) {
  if (ask && !confirm('Deseja remover este registro?')) return;
  state.records = state.records.filter(r => r.id !== id);
  delete state.assignments[id];
  saveState();
  renderTatico();
  if (ask) addLog('Remover registro', `ID: ${id}`);
}

function renderTatico() {
  const tbody = document.querySelector('#table_tatico tbody');
  if(!tbody) return;

  tbody.innerHTML = '';

  state.records.forEach(record => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td'); tdDate.textContent = record.date;
    const tdOp = document.createElement('td'); tdOp.textContent = record.operation || '-';
    const tdSeg = document.createElement('td'); tdSeg.textContent = record.segment || '-';
    const tdDmm = document.createElement('td'); tdDmm.textContent = record.dmm || '-';
    const tdInterval = document.createElement('td'); tdInterval.textContent = record.interval_start;
    const tdHC = document.createElement('td'); tdHC.textContent = record.hc_requested;
    const tdHE = document.createElement('td'); tdHE.textContent = record.he_minutes;
    const tdStatus = document.createElement('td');
    let statusText = '';
    if (record.status==='Rascunho') statusText = 'Rascunho';
    else if (record.status==='Publicado') statusText = 'Publicado';
    else if (record.status==='Validado pelo NOC') statusText = 'Validado';
    else if (record.status==='Atribuído (Supervisor)') statusText = 'Atribuído';
    tdStatus.textContent = statusText;

    const tdActions = document.createElement('td');
    const btnEdit = document.createElement('button'); btnEdit.className='btn btn-secondary'; btnEdit.textContent='Editar'; btnEdit.onclick = ()=> editRecord(record.id);
    const btnRemove = document.createElement('button'); btnRemove.className='btn btn-danger'; btnRemove.textContent='Remover'; btnRemove.onclick = ()=> removeRecord(record.id);
    tdActions.appendChild(btnEdit); tdActions.appendChild(btnRemove);

    tr.appendChild(tdDate); tr.appendChild(tdOp); tr.appendChild(tdSeg); tr.appendChild(tdDmm);
    tr.appendChild(tdInterval); tr.appendChild(tdHC); tr.appendChild(tdHE); tr.appendChild(tdStatus); tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });

  const totalEl = document.getElementById('sum_total');
  const draftEl = document.getElementById('sum_draft');
  const publishedEl = document.getElementById('sum_published');
  const validatedEl = document.getElementById('sum_validated');

  if (totalEl) totalEl.textContent = state.records.length;
  if (draftEl) draftEl.textContent = state.records.filter(r=>r.status==='Rascunho').length;
  if (publishedEl) publishedEl.textContent = state.records.filter(r=>r.status==='Publicado').length;
  if (validatedEl) validatedEl.textContent = state.records.filter(r=>r.status==='Validado pelo NOC').length;
}

// ---------- Import / Export ----------
function downloadTemplate() {
  const csv = [
    'date,dmm,segment,operation,interval_start,hc_requested,motivo',
    `${new Date().toISOString().split('T')[0]},1°,CONTROLE FRONT MOC,VIVO,07:00:00,4,Pico matutino`,
    `${new Date().toISOString().split('T')[0]},1°,PRÉ PAGO ESE BH,CLARO,14:00:00,3,Demanda tarde`
  ].join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'template_tabi.csv'; a.click(); URL.revokeObjectURL(url);
}

function handleImport(e) {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => parseCSV(ev.target.result);
  reader.readAsText(file); e.target.value = '';
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length < 2) return alert('CSV vazio ou inválido.');
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const required = ['date','interval_start','hc_requested'];
  const missing = required.filter(h=>!headers.includes(h));
  if (missing.length) return alert('Colunas faltando: ' + missing.join(', '));

  state.importBuffer = [];
  for (let i=1;i<lines.length;i++) {
    const values = lines[i].split(',').map(v=>v.trim());
    const obj = {}; headers.forEach((h,idx)=> obj[h] = values[idx] || '');
    if (obj.date && obj.interval_start && obj.hc_requested) {
      state.importBuffer.push({
        date: obj.date,
        dmm: obj.dmm || '',
        segment: obj.segment || '',
        operation: obj.operation || '',
        interval_start: obj.interval_start,
        hc_requested: parseInt(obj.hc_requested) || 1,
        motivo: obj.motivo || ''
      });
    }
  }
  showImportPreview();
}

function showImportPreview() {
  if (!state.importBuffer.length) return alert('Nenhum registro válido para importar.');
  const preview = document.getElementById('import_preview');
  const container = document.createElement('div');
  const summary = document.createElement('p');
  summary.textContent = `Registros a importar: ${state.importBuffer.length}`;
  container.appendChild(summary);

  const table = document.createElement('table'); table.style.width = '100%';
  const thead = document.createElement('thead'); const headerRow = document.createElement('tr');
  ['Data', 'Operação', 'Segmento', 'Intervalo', 'HC'].forEach(header => { const th = document.createElement('th'); th.textContent = header; headerRow.appendChild(th); });
  thead.appendChild(headerRow); table.appendChild(thead);

  const tbody = document.createElement('tbody');
  state.importBuffer.forEach(r => {
    const row = document.createElement('tr');
    [r.date, r.operation || '-', r.segment || '-', r.interval_start, r.hc_requested.toString()].forEach(cellText => {
      const td = document.createElement('td'); td.textContent = cellText; row.appendChild(td);
    });
    tbody.appendChild(row);
  });
  table.appendChild(tbody); container.appendChild(table);

  preview.innerHTML = ''; preview.appendChild(container);
  document.getElementById('importModal').classList.add('active');
}

function closeImportModal() { document.getElementById('importModal').classList.remove('active'); state.importBuffer = []; }

function confirmImport() {
  state.importBuffer.forEach(b => {
    state.records.push({
      id: generateId(),
      date: b.date, dmm: b.dmm, segment: b.segment, operation: b.operation,
      interval_start: b.interval_start, hc_requested: b.hc_requested, he_minutes: b.hc_requested*10,
      motivo: b.motivo, status: 'Rascunho', created_at: new Date().toISOString()
    });
  });
  const count = state.importBuffer.length;
  saveState(); renderTatico(); addLog('Importar CSV', `${count} registro(s) importado(s)`); closeImportModal(); alert(`${count} registro(s) importado(s).`);
}

function exportTatico() {
  if (!state.records.length) return alert('Não há registros para exportar.');
  const headers = ['id','date','segment','operation','dmm','interval_start','hc_requested','he_minutes','motivo','status'];
  const rows = [headers].concat(state.records.map(r => [r.id, r.date, r.segment||'', r.operation||'', r.dmm||'', r.interval_start, r.hc_requested, r.he_minutes, r.motivo||'', r.status]));
  const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `tabi_export_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(url);
  addLog('Exportar dados', `${state.records.length} registro(s) exportado(s)`);
}

// ---------- NOC ----------
function getFilteredRecords() {
  let filtered = state.records.filter(r => r.status !== 'Rascunho');
  const start = document.getElementById('n_start')?.value;
  const end = document.getElementById('n_end')?.value;
  const seg = document.getElementById('n_segment')?.value;
  const op = document.getElementById('n_operation')?.value;

  if (start) filtered = filtered.filter(r => r.date >= start);
  if (end) filtered = filtered.filter(r => r.date <= end);
  if (seg) filtered = filtered.filter(r => r.segment === seg);
  if (op) filtered = filtered.filter(r => r.operation === op);

  return filtered;
}

function groupRecords(records) {
  const groups = {};
  records.forEach(r => {
    const key = `${r.date}|${r.segment||''}|${r.operation||''}`;
    if (!groups[key]) groups[key] = { key, date: r.date, segment: r.segment||'', operation: r.operation||'', records: []};
    groups[key].records.push(r);
  });
  return Object.values(groups);
}

function renderNOC() {
  const filtered = getFilteredRecords();
  const groups = groupRecords(filtered);
  const tbody = document.querySelector('#table_noc tbody'); if(!tbody) return;
  tbody.innerHTML = '';

  groups.forEach(group => {
    const totalHE = group.records.reduce((s,r)=>s+r.he_minutes,0);
    const totalHC = group.records.reduce((s,r)=>s+r.hc_requested,0);
    const validation = state.validations[group.key];

    const tr = document.createElement('tr');

    const checkboxTd = document.createElement('td');
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'group-check'; cb.dataset.key = group.key;
    checkboxTd.appendChild(cb);

    const tdDate = document.createElement('td'); tdDate.textContent = group.date;
    const tdOp = document.createElement('td'); tdOp.textContent = group.operation || '-';
    const tdSeg = document.createElement('td'); tdSeg.textContent = group.segment || '-';
    const tdHE = document.createElement('td'); tdHE.textContent = (totalHE/60).toFixed(2);
    const tdHC = document.createElement('td'); tdHC.textContent = totalHC;
    const tdStatus = document.createElement('td'); tdStatus.textContent = validation ? 'Validado' : 'Pendente';
    const tdActions = document.createElement('td'); const detBtn = document.createElement('button'); detBtn.className='btn btn-secondary'; detBtn.textContent='Detalhes'; detBtn.addEventListener('click', ()=> toggleGroupDetails(group.key));
    tdActions.appendChild(detBtn);

    tr.appendChild(checkboxTd); tr.appendChild(tdDate); tr.appendChild(tdOp); tr.appendChild(tdSeg); tr.appendChild(tdHE); tr.appendChild(tdHC); tr.appendChild(tdStatus); tr.appendChild(tdActions);
    tbody.appendChild(tr);

    // details row
    const detailsTr = document.createElement('tr'); detailsTr.id = `details-${group.key}`; detailsTr.style.display='none'; detailsTr.className='details-row';
    const td = document.createElement('td'); td.colSpan = 8;
    const detailsContainer = document.createElement('div'); detailsContainer.className = 'details-content';
    const title = document.createElement('h4'); title.textContent = 'Intervalos do Grupo'; detailsContainer.appendChild(title);
    const detailsTable = document.createElement('table'); detailsTable.style.width = '100%';
    const detailsHead = document.createElement('thead'); const detailsHeaderRow = document.createElement('tr');
    ['Intervalo', 'HC', 'HE (min)', 'Status'].forEach(header => { const th = document.createElement('th'); th.textContent = header; detailsHeaderRow.appendChild(th); });
    detailsHead.appendChild(detailsHeaderRow); detailsTable.appendChild(detailsHead);
    const detailsBody = document.createElement('tbody');
    group.records.sort((a,b)=>a.interval_start.localeCompare(b.interval_start)).forEach(r=>{
      const detailRow = document.createElement('tr');
      [r.interval_start, r.hc_requested.toString(), r.he_minutes.toString(), r.status].forEach(cellText => { const cell = document.createElement('td'); cell.textContent = cellText; detailRow.appendChild(cell); });
      detailsBody.appendChild(detailRow);
    });
    detailsTable.appendChild(detailsBody); detailsContainer.appendChild(detailsTable);
    td.appendChild(detailsContainer); detailsTr.appendChild(td); tbody.appendChild(detailsTr);
  });

  updateNOCChart(groupRecords(getFilteredRecords()));
}

function toggleGroupDetails(key) {
  const el = document.getElementById(`details-${key}`);
  if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}
function toggleAllGroups(cb) { document.querySelectorAll('.group-check').forEach(c => c.checked = cb.checked); }
function nocApplyFilter() { renderNOC(); }
function nocClearFilter() {
  document.getElementById('n_start').value = '';
  document.getElementById('n_end').value = '';
  document.getElementById('n_segment').value = '';
  document.getElementById('n_operation').value = '';
  renderNOC();
}

function nocValidateSelected() {
  const selected = Array.from(document.querySelectorAll('.group-check:checked')).map(cb => cb.dataset.key);
  if (!selected.length) return alert('Selecione pelo menos um grupo.');
  const supervisors = Array.from(document.querySelectorAll('#supervisor_list input[type="checkbox"]:checked')).map(cb=>cb.value);
  const aprovador = document.getElementById('aprovador_select')?.value;
  if (!supervisors.length || !aprovador) return alert('Selecione supervisores e aprovador.');

  selected.forEach(key => {
    state.validations[key] = { validatedAt: new Date().toISOString(), validatedBy: state.currentUser, supervisors, aprovador };
    state.records.forEach(record => {
      const rk = `${record.date}|${record.segment||''}|${record.operation||''}`;
      if (rk === key) { record.status = 'Validado pelo NOC'; record.validation_key = key; }
    });
    addLog('Validar grupo', `Grupo ${key} validado por ${state.currentUser}`);
  });

  saveState(); renderNOC(); renderTatico(); renderSupervisor(); alert(`${selected.length} grupo(s) validado(s).`);
}

// Chart
function updateNOCChart(groups) {
  const ctx = document.getElementById('chart_noc');
  if (!ctx) return;
  const labels = groups.map(g => `${g.date} | ${g.segment||'-'}`);
  const heHours = groups.map(g => Number((g.records.reduce((s,r)=>s+r.he_minutes,0)/60).toFixed(2)));
  const hcUnits = groups.map(g => g.records.reduce((s,r)=>s+r.hc_requested,0));
  if (nocChart) nocChart.destroy();
  nocChart = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        { type:'line', label:'HE (h)', data: heHours, fill:false, yAxisID:'y' },
        { type:'bar', label:'HC (un)', data: hcUnits, yAxisID:'y1' }
      ]
    },
    options: {
      responsive:true,
      interaction:{mode:'index'},
      scales:{ y:{ type:'linear', position:'left', title:{display:true, text:'HE (horas)'} }, y1:{ type:'linear', position:'right', title:{display:true, text:'HC (unidades)'}, grid:{drawOnChartArea:false} } },
      plugins:{ legend:{ position:'top' } }
    }
  });
}

// ---------- Supervisors / Collaborators ----------

// Add supervisor (lightweight)
function addSupervisor() {
  const input = document.getElementById('sup_input');
  const name = input.value.trim();
  if (!name) return;
  const existing = new Set(state.collaborators.map(c=>c.matricula));
  const mat = generateMatricula(existing);
  const rec = { matricula: mat, nome: name, role: 'Supervisor', gerenteId: null, coordenadorId: null, supervisorId: null };
  state.collaborators.push(rec);
  saveState();
  renderSupervisorList();
  populateAprovadorSelect();
  input.value = '';
  addLog('Adicionar supervisor', name);
}

// Render supervisor list (aplicável ao NOC sidebar) — versão com filtros e search
function renderSupervisorList() {
  const container = document.getElementById('supervisor_list');
  if (!container) return;
  container.innerHTML = '';

  // read filters (injected UI)
  const opFilter = document.getElementById('noc_filter_operation')?.value || '';
  const segFilter = document.getElementById('noc_filter_segment')?.value || '';
  const gerenteFilter = document.getElementById('noc_filter_gerente')?.value || '';
  const coordFilter = document.getElementById('noc_filter_coordenador')?.value || '';
  const supFilter = document.getElementById('noc_filter_supervisor')?.value || '';
  const search = (document.getElementById('noc_sup_search')?.value || '').trim().toLowerCase();

  let shown = state.collaborators.filter(c => ['Gerente','Coordenador','Supervisor'].includes(c.role));

  if (gerenteFilter) shown = shown.filter(c => c.gerenteId === gerenteFilter || c.matricula === gerenteFilter);
  if (coordFilter) shown = shown.filter(c => c.coordenadorId === coordFilter || c.matricula === coordFilter);
  if (supFilter) shown = shown.filter(c => c.matricula === supFilter);

  if (opFilter || segFilter) {
    const matchedRecords = state.records.filter(r => {
      if (opFilter && r.operation !== opFilter) return false;
      if (segFilter && r.segment !== segFilter) return false;
      return r.status && r.status !== 'Rascunho';
    });
    const assignedMats = new Set();
    matchedRecords.forEach(r => {
      const assigns = state.assignments[r.id] || [];
      assigns.forEach(a => assignedMats.add(a.matricula));
    });
    const supervisorMatsFromAssignments = new Set();
    assignedMats.forEach(mat => {
      const coll = state.collaborators.find(c => c.matricula === mat);
      if (coll && coll.supervisorId) supervisorMatsFromAssignments.add(coll.supervisorId);
    });
    if (supervisorMatsFromAssignments.size > 0) {
      shown = shown.filter(c => supervisorMatsFromAssignments.has(c.matricula));
    }
  }

  if (search) {
    shown = shown.filter(c => (c.nome || '').toLowerCase().includes(search) || String(c.matricula).includes(search));
  }

  if (!shown.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'text-small text-muted';
    emptyDiv.textContent = 'Nenhum supervisor/gerente/coordenador encontrado para os filtros selecionados.';
    container.appendChild(emptyDiv);
    return;
  }

  shown.forEach(c => {
    const label = document.createElement('label'); label.style.display = 'block';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = c.matricula;
    const roleText = c.role ? ` - ${c.role}` : '';
    const text = document.createTextNode(` (${c.matricula}) ${c.nome}${roleText}`);
    label.appendChild(cb); label.appendChild(text); container.appendChild(label);
  });
}

// populate aprovador select with Gerente / Coordenador
function populateAprovadorSelect() {
  const sel = document.getElementById('aprovador_select');
  if (!sel) return;
  sel.innerHTML = '';
  const placeholder = document.createElement('option'); placeholder.value=''; placeholder.textContent='Selecione...'; sel.appendChild(placeholder);
  state.collaborators.filter(c => ['Gerente','Coordenador'].includes(c.role)).forEach(c => {
    const opt = document.createElement('option'); opt.value = c.matricula; opt.textContent = `(${c.matricula}) ${c.nome} - ${c.role}`; sel.appendChild(opt);
  });
}

// ---------- Supervisor tab & assignment ----------
function supervisorFilter() { renderSupervisor(); }

function renderSupervisor() {
  const container = document.getElementById('validated_groups'); if(!container) return;
  container.innerHTML = '';
  const validatedKeys = Object.keys(state.validations);
  if (!validatedKeys.length) {
    const emptyMsg = document.createElement('p'); emptyMsg.className = 'text-muted'; emptyMsg.textContent = 'Nenhum grupo validado disponível para atribuição.'; container.appendChild(emptyMsg); return;
  }

  const start = document.getElementById('s_start')?.value;
  const end = document.getElementById('s_end')?.value;
  const segFilter = document.getElementById('s_segment')?.value;

  validatedKeys.forEach(key => {
    const [date, seg, op] = key.split('|');
    if (start && date < start) return;
    if (end && date > end) return;
    if (segFilter && seg !== segFilter) return;
    const records = state.records.filter(r=>`${r.date}|${r.segment||''}|${r.operation||''}`===key).sort((a,b)=>a.interval_start.localeCompare(b.interval_start));

    const totalHC = records.reduce((s,r)=>s+r.hc_requested,0);
    const assignedUnits = records.reduce((s,r)=>s + (state.assignments[r.id] || []).reduce((ss,a)=>ss + (a.hc_assigned || 0),0),0);
    const totalHE_hours = (totalHC * 10) / 60;
    const assignedHE_hours = (assignedUnits * 10) / 60;
    const availableHE_hours = Math.max(0, totalHE_hours - assignedHE_hours);
    const peopleNeeded = Math.ceil(totalHE_hours / 1.75);
    const distinctAssigned = new Set();
    records.forEach(r => { (state.assignments[r.id] || []).forEach(a => distinctAssigned.add(a.matricula)); });
    const peopleAssignedCount = distinctAssigned.size;

    const card = document.createElement('div'); card.className='card mb-2';
    const cardHeader = document.createElement('div'); cardHeader.className = 'card-header';
    const title = document.createElement('h4'); title.textContent = `${date} - ${seg||'N/A'} - ${op||'N/A'}`; cardHeader.appendChild(title);
    const summary1 = document.createElement('div'); summary1.className = 'text-small text-muted'; summary1.textContent = `HC Total: ${totalHC} | Atribuído: ${assignedUnits} | Disponível: ${Math.max(0, totalHC - assignedUnits)}`; cardHeader.appendChild(summary1);
    const summary2 = document.createElement('div'); summary2.className = 'text-small text-muted'; summary2.style.marginTop = '6px'; summary2.textContent = `HE Total: ${totalHE_hours.toFixed(2)}h | HE Atribuída: ${assignedHE_hours.toFixed(2)}h | HE Disponível: ${availableHE_hours.toFixed(2)}h | Pessoas necessárias: ${peopleNeeded} | Pessoas atribuídas: ${peopleAssignedCount}`; cardHeader.appendChild(summary2);
    const cardBody = document.createElement('div'); cardBody.className = 'card-body';
    const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.textContent = 'Atribuir Colaboradores'; btn.addEventListener('click', ()=> openAssignModal(key)); cardBody.appendChild(btn);
    card.appendChild(cardHeader); card.appendChild(cardBody); container.appendChild(card);
  });
}

/* ---------- Assignment modal (Supervisor) ----------
   Lógica robusta para dividir unidades (HC) por colaborador e por períodos.
*/
function openAssignModal(groupKey) {
  const modal = document.getElementById('assignModal');
  const content = document.getElementById('assign_content');
  const summary = document.getElementById('assign_summary');

  const records = state.records.filter(r=>`${r.date}|${r.segment||''}|${r.operation||''}`===groupKey).sort((a,b)=>a.interval_start.localeCompare(b.interval_start));
  if (!records.length) {
    content.innerHTML = ''; const emptyMsg = document.createElement('p'); emptyMsg.className='text-muted'; emptyMsg.textContent='Nenhum registro no grupo.'; content.appendChild(emptyMsg); summary.textContent=''; modal.classList.add('active'); return;
  }

  const totalHC = records.reduce((s,r)=>s+r.hc_requested,0);
  const totalHE = (totalHC * 10)/60;
  const assignedHC = records.reduce((s,r)=>s + (state.assignments[r.id] || []).reduce((ss,a)=>ss + (a.hc_assigned || 0),0),0);
  const assignedHE = (assignedHC * 10)/60;
  const availableHE = Math.max(0, totalHE - assignedHE);
  summary.textContent = `HORAS NECESSÁRIAS: ${totalHE.toFixed(2)}h  /  HORAS ATRIBUÍDAS: ${assignedHE.toFixed(2)}h  /  HORAS DISPONÍVEIS: ${availableHE.toFixed(2)}h`;

  const toMinutes = t => { const [hh,mm] = t.split(':'); return parseInt(hh,10)*60 + parseInt(mm,10); };
  const periods = [
    { id: 'manha', label: 'MANHÃ (07:00–12:00)', start: toMinutes('07:00:00'), end: toMinutes('12:00:00') },
    { id: 'tarde', label: 'TARDE (13:00–17:00)', start: toMinutes('13:00:00'), end: toMinutes('17:00:00') },
    { id: 'noite', label: 'NOITE (18:00–22:00)', start: toMinutes('18:00:00'), end: toMinutes('22:00:00') }
  ];

  // periodMap
  const periodMap = {}; periods.forEach(p => { periodMap[p.id] = { meta: p, records: [], totalUnits: 0, assignedUnits: 0 }; });
  records.forEach(rec => {
    const mins = toMinutes(rec.interval_start);
    periods.forEach(p => {
      if (mins >= p.start && mins < p.end) {
        periodMap[p.id].records.push(rec);
        periodMap[p.id].totalUnits += rec.hc_requested;
        const assigned = (state.assignments[rec.id] || []).reduce((s,a)=>s + (a.hc_assigned || 0), 0);
        periodMap[p.id].assignedUnits += assigned;
      }
    });
  });

  // build modal DOM
  content.innerHTML = '';
  const wrapper = document.createElement('div'); wrapper.className='assignment-panel'; wrapper.style.display='flex'; wrapper.style.gap='20px';
  // LEFT: periods
  const left = document.createElement('div'); left.style.flex='1'; const leftTitle = document.createElement('h4'); leftTitle.textContent='PERÍODOS'; left.appendChild(leftTitle);
  const intervalList = document.createElement('div'); intervalList.className='interval-list';
  periods.forEach(p => {
    const data = periodMap[p.id];
    const heTotal = (data.totalUnits * 10) / 60;
    const heAssigned = (data.assignedUnits * 10) / 60;
    const heAvailable = Math.max(0, heTotal - heAssigned);
    const item = document.createElement('div'); item.className='interval-item'; item.style.display='flex'; item.style.alignItems='center'; item.style.justifyContent='space-between'; item.style.padding='8px 0';
    const leftInfo = document.createElement('div'); leftInfo.style.display='flex'; leftInfo.style.flexDirection='column';
    const strong = document.createElement('strong'); strong.textContent = p.label;
    const meta = document.createElement('div'); meta.className='text-small text-muted'; meta.textContent = `HE: ${heTotal.toFixed(2)}h • Atribuído: ${heAssigned.toFixed(2)}h • Disponível: ${heAvailable.toFixed(2)}h`;
    leftInfo.appendChild(strong); leftInfo.appendChild(meta);
    const rightBox = document.createElement('div'); rightBox.style.display='flex'; rightBox.style.alignItems='center'; rightBox.style.gap='12px';
    const chk = document.createElement('input'); chk.type='checkbox'; chk.className='period-check'; chk.dataset.period = p.id;
    const avail = document.createElement('div'); avail.className='text-small'; avail.id = `availh_${p.id}`; avail.textContent = `Horas disp: ${heAvailable.toFixed(2)}h`;
    rightBox.appendChild(chk); rightBox.appendChild(avail);
    item.appendChild(leftInfo); item.appendChild(rightBox); intervalList.appendChild(item);
  });
  left.appendChild(intervalList); wrapper.appendChild(left);

  // RIGHT: hierarchy selects + collab list + controls
  const right = document.createElement('div'); right.style.flex='1';
  const rightTitle = document.createElement('h4'); rightTitle.textContent='COLABORADORES'; right.appendChild(rightTitle);

  const filtersRow = document.createElement('div'); filtersRow.style.display='flex'; filtersRow.style.gap='8px'; filtersRow.style.marginBottom='8px';
  const selGer = document.createElement('select'); selGer.id = 'sel_gerente'; selGer.style.width='100%';
  const selCoord = document.createElement('select'); selCoord.id = 'sel_coordenador'; selCoord.style.width='100%';
  const selSup = document.createElement('select'); selSup.id = 'sel_supervisor'; selSup.style.width='100%';
  const wrapSelGer = document.createElement('div'); wrapSelGer.style.flex='1'; const lblGer = document.createElement('label'); lblGer.className='text-small'; lblGer.textContent='Gerente'; wrapSelGer.appendChild(lblGer); wrapSelGer.appendChild(selGer);
  const wrapSelCoord = document.createElement('div'); wrapSelCoord.style.flex='1'; const lblCoord = document.createElement('label'); lblCoord.className='text-small'; lblCoord.textContent='Coordenador'; wrapSelCoord.appendChild(lblCoord); wrapSelCoord.appendChild(selCoord);
  const wrapSelSup = document.createElement('div'); wrapSelSup.style.flex='1'; const lblSup = document.createElement('label'); lblSup.className='text-small'; lblSup.textContent='Supervisor'; wrapSelSup.appendChild(lblSup); wrapSelSup.appendChild(selSup);
  filtersRow.appendChild(wrapSelGer); filtersRow.appendChild(wrapSelCoord); filtersRow.appendChild(wrapSelSup); right.appendChild(filtersRow);

  // global time controls
  const globalRow = document.createElement('div'); globalRow.style.display='flex'; globalRow.style.gap='8px'; globalRow.style.alignItems='end'; globalRow.style.marginBottom='8px';
  const globalBox = document.createElement('div'); globalBox.style.flex='1';
  const globalLabel = document.createElement('label'); globalLabel.className='text-small'; globalLabel.textContent='Aplicar tempo para selecionados'; globalBox.appendChild(globalLabel);
  const globalControls = document.createElement('div'); globalControls.style.display='flex'; globalControls.style.gap='6px';
  const globalHours = document.createElement('input'); globalHours.id='global_hours'; globalHours.type='number'; globalHours.min='0'; globalHours.max='1'; globalHours.step='1'; globalHours.placeholder='h'; globalHours.style.width='70px';
  const globalMinutes = document.createElement('input'); globalMinutes.id='global_minutes'; globalMinutes.type='number'; globalMinutes.min='0'; globalMinutes.max='59'; globalMinutes.step='5'; globalMinutes.placeholder='min'; globalMinutes.style.width='90px';
  const applyBtn = document.createElement('button'); applyBtn.className='btn btn-info'; applyBtn.id='apply_global_time_btn'; applyBtn.type='button'; applyBtn.textContent='Aplicar aos selecionados';
  globalControls.appendChild(globalHours); globalControls.appendChild(globalMinutes); globalControls.appendChild(applyBtn);
  const globalHelper = document.createElement('div'); globalHelper.className='text-small text-muted'; globalHelper.textContent='Informe horas + minutos (min step 5). Máx 1h45 por colaborador.';
  globalBox.appendChild(globalControls); globalBox.appendChild(globalHelper); globalRow.appendChild(globalBox); right.appendChild(globalRow);

  const collabArea = document.createElement('div'); collabArea.id = 'collab_list_area'; collabArea.style.maxHeight='300px'; collabArea.style.overflow='auto'; collabArea.style.border='1px solid #e0e0e0'; collabArea.style.borderRadius='8px'; collabArea.style.padding='8px';
  right.appendChild(collabArea);

  const footerActions = document.createElement('div'); footerActions.style.marginTop='10px'; footerActions.style.display='flex'; footerActions.style.gap='0.5rem'; footerActions.style.justifyContent='flex-end';
  const cancelBtn = document.createElement('button'); cancelBtn.className='btn btn-secondary'; cancelBtn.textContent='Cancelar'; cancelBtn.addEventListener('click', closeAssignModal);
  const confirmBtn = document.createElement('button'); confirmBtn.className = 'btn btn-primary'; confirmBtn.id='confirm_assign_btn_modal'; confirmBtn.textContent='Confirmar Atribuição';
  footerActions.appendChild(cancelBtn); footerActions.appendChild(confirmBtn); right.appendChild(footerActions);

  wrapper.appendChild(right); content.appendChild(wrapper);

  // fillSelect helper
  function fillSelect(sel, items, placeholder='Todos') {
    sel.innerHTML = '';
    const opt = document.createElement('option'); opt.value=''; opt.textContent = placeholder; sel.appendChild(opt);
    items.forEach(it => { const o = document.createElement('option'); o.value = it.matricula; o.textContent = `(${it.matricula}) ${it.nome}`; sel.appendChild(o); });
  }

  const gerentes = state.collaborators.filter(c => c.role === 'Gerente');
  const coordenadores = state.collaborators.filter(c => c.role === 'Coordenador');
  const supervisores = state.collaborators.filter(c => c.role === 'Supervisor');

  fillSelect(selGer, gerentes, 'Todos Gerentes');
  fillSelect(selCoord, coordenadores, 'Todos Coordenadores');
  fillSelect(selSup, supervisores, 'Todos Supervisores');

  function renderCollabList() {
    collabArea.innerHTML = '';
    const gid = selGer.value || null;
    const cid = selCoord.value || null;
    const sid = selSup.value || null;
    let collabs = state.collaborators.filter(x => x.role === 'Colaborador');
    if (gid) collabs = collabs.filter(x => x.gerenteId === gid);
    if (cid) collabs = collabs.filter(x => x.coordenadorId === cid);
    if (sid) collabs = collabs.filter(x => x.supervisorId === sid);
    if (!collabs.length) { const none = document.createElement('div'); none.className='text-small text-muted'; none.textContent='Nenhum colaborador encontrado para o filtro selecionado.'; collabArea.appendChild(none); return; }

    collabs.forEach(c => {
      const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.justifyContent='space-between'; row.style.padding='6px'; row.style.borderBottom='1px solid #eee';
      const left = document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='10px';
      const chk = document.createElement('input'); chk.type='checkbox'; chk.className='collab-select'; chk.dataset.matricula = c.matricula; chk.dataset.nome = c.nome;
      const info = document.createElement('div'); const title = document.createElement('div'); title.style.fontWeight='600'; title.textContent = `(${c.matricula}) ${c.nome}`; const meta = document.createElement('div'); meta.className='text-small text-muted'; meta.textContent = `Mat: ${c.matricula}`; info.appendChild(title); info.appendChild(meta); left.appendChild(chk); left.appendChild(info);
      const rightBox = document.createElement('div'); rightBox.style.display='flex'; rightBox.style.gap='8px'; rightBox.style.alignItems='center';
      const hInp = document.createElement('input'); hInp.type='number'; hInp.min='0'; hInp.max='1'; hInp.step='1'; hInp.className='collab-hours-h'; hInp.dataset.matricula = c.matricula; hInp.style.width='60px'; hInp.style.display='none';
      const mInp = document.createElement('input'); mInp.type='number'; mInp.min='0'; mInp.max='59'; mInp.step='5'; mInp.className='collab-hours-m'; mInp.dataset.matricula = c.matricula; mInp.style.width='80px'; mInp.style.display='none';
      const lbl = document.createElement('div'); lbl.className='text-small text-muted'; lbl.id = `collab_max_${c.matricula}`; lbl.style.display='none'; lbl.textContent='Max: 1h45';
      rightBox.appendChild(hInp); rightBox.appendChild(mInp); rightBox.appendChild(lbl);
      row.appendChild(left); row.appendChild(rightBox); collabArea.appendChild(row);

      chk.addEventListener('change', () => updateCollabInputs());
    });

    collabArea._updateCollabInputs = () => {
      const checked = collabArea.querySelectorAll('.collab-select:checked');
      collabArea.querySelectorAll('.collab-hours-h').forEach(el=>el.style.display='none');
      collabArea.querySelectorAll('.collab-hours-m').forEach(el=>el.style.display='none');
      collabArea.querySelectorAll('[id^="collab_max_"]').forEach(el=>el.style.display='none');
      if (checked.length === 1) {
        const mat = checked[0].dataset.matricula;
        const h = collabArea.querySelector(`.collab-hours-h[data-matricula="${mat}"]`);
        const m = collabArea.querySelector(`.collab-hours-m[data-matricula="${mat}"]`);
        const lbl = collabArea.querySelector(`#collab_max_${mat}`);
        if (h) { h.style.display = ''; if (h.value === '') h.value = 0; }
        if (m) { m.style.display = ''; if (m.value === '') m.value = 0; }
        if (lbl) lbl.style.display = '';
      }
    };
  }

  selGer.addEventListener('change', () => {
    const gid = selGer.value;
    const coords = gid ? state.collaborators.filter(c => c.role==='Coordenador' && c.gerenteId === gid) : state.collaborators.filter(c => c.role==='Coordenador');
    const sups = gid ? state.collaborators.filter(c => c.role==='Supervisor' && c.gerenteId === gid) : state.collaborators.filter(c => c.role==='Supervisor');
    fillSelect(selCoord, coords, 'Todos Coordenadores');
    fillSelect(selSup, sups, 'Todos Supervisores');
    renderCollabList();
  });
  selCoord.addEventListener('change', () => {
    const cid = selCoord.value;
    const sups = cid ? state.collaborators.filter(s => s.role==='Supervisor' && s.coordenadorId === cid) : (selGer.value ? state.collaborators.filter(s => s.role==='Supervisor' && s.gerenteId === selGer.value) : state.collaborators.filter(s => s.role==='Supervisor'));
    fillSelect(selSup, sups, 'Todos Supervisores');
    renderCollabList();
  });
  selSup.addEventListener('change', () => { renderCollabList(); });

  renderCollabList();

  // GLOBAL APPLY logic
  applyBtn.addEventListener('click', () => {
    const hVal = parseInt(document.getElementById('global_hours')?.value || 0, 10);
    const mVal = parseInt(document.getElementById('global_minutes')?.value || 0, 10);
    if (isNaN(hVal) || isNaN(mVal)) return alert('Informe horas e minutos válidos.');
    const totalHours = hVal + (mVal / 60);
    if (totalHours <= 0) return alert('Informe um tempo maior que 0.');
    if (totalHours > 1.75) return alert('Máximo permitido por colaborador é 1h45 (1.75h).');

    const checked = Array.from(collabArea.querySelectorAll('.collab-select:checked'));
    if (!checked.length) return alert('Marque ao menos um colaborador para aplicar o tempo.');

    checked.forEach(cb => {
      const mat = cb.dataset.matricula;
      const hInput = collabArea.querySelector(`.collab-hours-h[data-matricula="${mat}"]`);
      const mInput = collabArea.querySelector(`.collab-hours-m[data-matricula="${mat}"]`);
      if (hInput) { hInput.style.display = ''; hInput.value = Math.floor(totalHours); }
      if (mInput) { mInput.style.display = ''; mInput.value = Math.round((totalHours - Math.floor(totalHours)) * 60); }
      const label = collabArea.querySelector(`#collab_max_${mat}`);
      if (label) label.style.display = '';
    });

    alert(`Aplicado ${hVal}h ${mVal}min para ${checked.length} colaborador(es).`);
  });

  // Confirm assignments
  confirmBtn.addEventListener('click', () => {
    const selectedPeriods = Array.from(content.querySelectorAll('.period-check:checked')).map(el => el.dataset.period);
    if (!selectedPeriods.length) return alert('Selecione pelo menos um período.');
    const checkedCollabs = Array.from(collabArea.querySelectorAll('.collab-select:checked'));
    if (!checkedCollabs.length) return alert('Selecione pelo menos um colaborador e informe horas.');

    const collabAssignments = [];
    for (const cb of checkedCollabs) {
      const mat = cb.dataset.matricula; const nome = cb.dataset.nome;
      const hEl = collabArea.querySelector(`.collab-hours-h[data-matricula="${mat}"]`);
      const mEl = collabArea.querySelector(`.collab-hours-m[data-matricula="${mat}"]`);
      const hours = parseFloat(hEl?.value || 0); const minutes = parseInt(mEl?.value || 0);
      const total = hours + (minutes / 60);
      if (total <= 0) return alert(`Colaborador ${nome}: informe um tempo maior que 0.`);
      if (total > 1.75) return alert(`Colaborador ${nome}: máximo permitido por dia é 1h45 (1.75h).`);
      collabAssignments.push({ matricula: mat, nome, hours: total, exactUnits: total * 6 });
    }

    for (const pid of selectedPeriods) {
      const data = periodMap[pid];
      const recsInPeriod = data.records.slice();
      const recCaps = recsInPeriod.map(r => {
        const assigned = (state.assignments[r.id] || []).reduce((s,a)=>s + (a.hc_assigned || 0), 0);
        return { id: r.id, available: Math.max(0, r.hc_requested - assigned), record: r };
      });

      const totalAvailableUnits = recCaps.reduce((s,c)=>s + c.available, 0);
      const totalExactUnits = collabAssignments.reduce((s,c)=>s + c.exactUnits, 0);
      const totalUnitsToAllocate = Math.round(totalExactUnits);

      if (totalUnitsToAllocate > totalAvailableUnits + 1e-6) {
        return alert(`Período ${pid.toUpperCase()}: não há horas suficientes. Disponível: ${(totalAvailableUnits*10/6).toFixed(2)}h, solicitado: ${(totalExactUnits*10/6).toFixed(2)}h`);
      }

      const collabUnits = collabAssignments.map(c => {
        const flo = Math.floor(c.exactUnits);
        const frac = c.exactUnits - flo;
        return { matricula: c.matricula, nome: c.nome, exact: c.exactUnits, floor: flo, frac, assignedUnits: flo };
      });
      const sumFloor = collabUnits.reduce((s,c)=>s + c.floor, 0);
      let remainingUnits = Math.round(totalExactUnits) - sumFloor;
      if (remainingUnits > 0) {
        collabUnits.sort((a,b) => b.frac - a.frac);
        for (let i=0; i<collabUnits.length && remainingUnits>0; i++) { collabUnits[i].assignedUnits += 1; remainingUnits -= 1; }
      }

      for (const c of collabUnits) {
        let unitsLeft = c.assignedUnits;
        if (unitsLeft <= 0) continue;
        for (let i=0; i<recCaps.length && unitsLeft>0; i++) {
          const slot = recCaps[i];
          if (slot.available <= 0) continue;
          const take = Math.min(slot.available, unitsLeft);
          if (!state.assignments[slot.id]) state.assignments[slot.id] = [];
          state.assignments[slot.id].push({
            matricula: c.matricula,
            nome: c.nome,
            hc_assigned: take,
            assignedAt: new Date().toISOString(),
            assignedBy: state.currentUser
          });
          slot.available -= take;
          unitsLeft -= take;
        }
        if (unitsLeft > 0) {
          return alert(`Erro: capacidade insuficiente ao alocar ${c.nome} no período ${pid.toUpperCase()}.`);
        }
      }

      recCaps.forEach(rc => {
        const r = state.records.find(rr => rr.id === rc.id);
        if (r && (state.assignments[rc.id] || []).length > 0) r.status = 'Atribuído (Supervisor)';
      });
    }

    saveState(); addLog('Atribuir colaboradores', `Atribuições criadas para grupo ${groupKey} por ${state.currentUser}`);
    renderTatico(); renderNOC(); renderSupervisor(); renderLogs(); closeAssignModal(); alert('Atribuições realizadas com sucesso!');
  });

  modal.classList.add('active');
}

function closeAssignModal() {
  const modal = document.getElementById('assignModal');
  if (modal) modal.classList.remove('active');
  const summary = document.getElementById('assign_summary');
  if (summary) summary.textContent = '';
}

// ---------- Logs ----------
function renderLogs() {
  const tbody = document.querySelector('#table_logs tbody'); if(!tbody) return;
  tbody.innerHTML = '';
  state.logs.slice().reverse().forEach(log => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = formatDateTime(log.timestamp);
    const td2 = document.createElement('td'); td2.textContent = esc(log.user);
    const td3 = document.createElement('td'); td3.textContent = esc(log.action);
    const td4 = document.createElement('td'); td4.textContent = esc(log.details);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
    tbody.appendChild(tr);
  });
}

function clearLogs() {
  if (!confirm('Limpar todos os logs?')) return;
  state.logs = []; saveState(); renderLogs(); addLog('Limpar logs', 'Logs limpos manualmente');
}

// ---------- Ensure NOC Supervisor Filters UI exists (inject if missing) ----------
function ensureNOCFilterUI() {
  // find Supervisores card in NOC sidebar
  const supCard = document.querySelector('#noc .card .card-header')?.parentElement;
  // better target: the card that has a h4 "Supervisores"
  const cards = document.querySelectorAll('#noc .card');
  let supervisorsCard = null;
  cards.forEach(c => {
    const h4 = c.querySelector('h4');
    if (h4 && h4.textContent.trim().toLowerCase() === 'supervisores') supervisorsCard = c;
  });
  if (!supervisorsCard) return;

  // if UI already has our filter row, do nothing
  if (supervisorsCard.querySelector('#noc_filter_row')) return;

  // create a filter header (selects + search + buttons)
  const filterRow = document.createElement('div'); filterRow.id = 'noc_filter_row'; filterRow.style.marginTop = '8px';

  // operation & segment reuse (if exist) else create hidden placeholders
  const op = document.getElementById('n_operation');
  const seg = document.getElementById('n_segment');

  // create selects for gerente/coordenador/supervisor + search + actions
  const selGer = document.createElement('select'); selGer.id = 'noc_filter_gerente'; selGer.style.width = '100%'; selGer.style.marginBottom = '6px';
  const selCoord = document.createElement('select'); selCoord.id = 'noc_filter_coordenador'; selCoord.style.width = '100%'; selCoord.style.marginBottom = '6px';
  const selSup = document.createElement('select'); selSup.id = 'noc_filter_supervisor'; selSup.style.width = '100%'; selSup.style.marginBottom = '6px';
  const search = document.createElement('input'); search.id = 'noc_sup_search'; search.type = 'search'; search.placeholder = 'Pesquisar por nome ou matrícula'; search.style.width = '100%'; search.style.marginBottom = '6px';
  const btnApply = document.createElement('button'); btnApply.id = 'noc_sup_apply'; btnApply.className = 'btn btn-primary'; btnApply.textContent = 'Aplicar filtros'; btnApply.style.marginRight = '6px';
  const btnClear = document.createElement('button'); btnClear.id = 'noc_sup_clear'; btnClear.className = 'btn btn-secondary'; btnClear.textContent = 'Limpar';
  const btnRefresh = document.createElement('button'); btnRefresh.id = 'noc_sup_refresh'; btnRefresh.className = 'btn btn-info'; btnRefresh.textContent = 'Atualizar'; btnRefresh.style.marginLeft = '6px';

  // assemble
  filterRow.appendChild(selGer);
  filterRow.appendChild(selCoord);
  filterRow.appendChild(selSup);
  filterRow.appendChild(search);
  const actions = document.createElement('div'); actions.style.marginTop = '6px';
  actions.appendChild(btnApply); actions.appendChild(btnClear); actions.appendChild(btnRefresh);
  filterRow.appendChild(actions);

  // insert at top of supervisorsCard body
  const body = supervisorsCard.querySelector('.card-body') || supervisorsCard;
  body.insertBefore(filterRow, body.firstChild);
}

// ---------- Initialize NOC Supervisor Filters (populate selects & bind events) ----------
function initNOCSupervisorFilters() {
  const selGer = document.getElementById('noc_filter_gerente');
  const selCoord = document.getElementById('noc_filter_coordenador');
  const selSup = document.getElementById('noc_filter_supervisor');
  const btnApply = document.getElementById('noc_sup_apply');
  const btnClear = document.getElementById('noc_sup_clear');
  const btnRefresh = document.getElementById('noc_sup_refresh');
  const search = document.getElementById('noc_sup_search');

  if (!selGer || !selCoord || !selSup) return;

  function fillSelectSimple(sel, items, placeholder) {
    sel.innerHTML = '';
    const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = placeholder || 'Todos'; sel.appendChild(opt0);
    items.forEach(it => { const o = document.createElement('option'); o.value = it.matricula; o.textContent = `(${it.matricula}) ${it.nome}`; sel.appendChild(o); });
  }

  function populateHierarchy() {
    const gerentes = state.collaborators.filter(c => c.role === 'Gerente');
    const coordenadores = state.collaborators.filter(c => c.role === 'Coordenador');
    const supervisores = state.collaborators.filter(c => c.role === 'Supervisor');
    fillSelectSimple(selGer, gerentes, 'Todos Gerentes');
    fillSelectSimple(selCoord, coordenadores, 'Todos Coordenadores');
    fillSelectSimple(selSup, supervisores, 'Todos Supervisores');
  }

  selGer.addEventListener('change', () => {
    const gid = selGer.value;
    const coords = gid ? state.collaborators.filter(c => c.role === 'Coordenador' && c.gerenteId === gid) : state.collaborators.filter(c => c.role === 'Coordenador');
    const sups = gid ? state.collaborators.filter(c => c.role === 'Supervisor' && c.gerenteId === gid) : state.collaborators.filter(c => c.role === 'Supervisor');
    fillSelectSimple(selCoord, coords, 'Todos Coordenadores');
    fillSelectSimple(selSup, sups, 'Todos Supervisores');
  });

  selCoord.addEventListener('change', () => {
    const cid = selCoord.value;
    const sups = cid ? state.collaborators.filter(s => s.role==='Supervisor' && s.coordenadorId === cid) : (selGer.value ? state.collaborators.filter(s => s.role==='Supervisor' && s.gerenteId === selGer.value) : state.collaborators.filter(s => s.role==='Supervisor'));
    fillSelectSimple(selSup, sups, 'Todos Supervisores');
  });

  if (btnApply) btnApply.addEventListener('click', () => renderSupervisorList());
  if (btnClear) btnClear.addEventListener('click', () => { selGer.value=''; selCoord.value=''; selSup.value=''; if (search) search.value=''; renderSupervisorList(); });
  if (btnRefresh) btnRefresh.addEventListener('click', () => { populateHierarchy(); renderSupervisorList(); });
  populateHierarchy();
  renderSupervisorList();
}

// ---------- Dashboard: render + apply/clear (mockup behavior) ----------
function renderDashboard() {
  const contentEl = document.getElementById('dashboard-content');
  const emptyEl = document.getElementById('dashboard-empty');
  if (!contentEl || !emptyEl) return;
  // ensure empty visible by default (unless already generated)
  if (contentEl.style.display === 'block') {
    emptyEl.style.display = 'none';
  } else {
    emptyEl.style.display = 'block';
    contentEl.style.display = 'none';
  }
}

function applyDashboardFilter() {
  const contentEl = document.getElementById('dashboard-content');
  const emptyEl = document.getElementById('dashboard-empty');
  if (!contentEl || !emptyEl) return;
  emptyEl.style.display = 'none';
  contentEl.style.display = 'block';

  // Destroy previous dashboard charts if exist
  try {
    if (dashboardCharts.segmento) dashboardCharts.segmento.destroy();
    if (dashboardCharts.picos) dashboardCharts.picos.destroy();
    if (dashboardCharts.evolucao) dashboardCharts.evolucao.destroy();
  } catch (e) {
    console.warn('Erro destruindo charts antigos', e);
  }
  dashboardCharts = {};

  try {
    // HE por segmento (mock)
    const ctx1 = document.getElementById('chart_he_segmento');
    if (ctx1) {
      dashboardCharts.segmento = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ['CONTROLE FRONT MOC','CONTROLE GRE BH','PRÉ PAGO ESE BH','LABS LAB'],
          datasets: [
            { label: 'Planejada (h)', data: [45,32,42,19] },
            { label: 'Distribuída (h)', data: [42,30,38,15] },
            { label: 'Atribuída (h)', data: [38,28,35,12] },
            { label: 'Realizada (h)', data: [35,26,32,10] }
          ]
        },
        options: { responsive:true, plugins:{ legend:{ position:'top' } } }
      });
    }

    // Picos de chamadas (mock mountain)
    const ctx2 = document.getElementById('chart_picos_chamadas');
    if (ctx2) {
      dashboardCharts.picos = new Chart(ctx2, {
        type: 'line',
        data: {
          labels: ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'],
          datasets: [
            { label:'Chamadas (volume)', data:[10,20,35,50,70,60,40,45,55,60,50,40,30,20,10], fill:true, tension:0.4 }
          ]
        },
        options: { responsive:true, plugins:{ legend:{ display:false } } }
      });
    }

    // Evolução diária (mock)
    const ctx3 = document.getElementById('chart_evolucao_diaria');
    if (ctx3) {
      dashboardCharts.evolucao = new Chart(ctx3, {
        type: 'line',
        data: {
          labels: ['-6','-5','-4','-3','-2','-1','Hoje'],
          datasets: [
            { label:'HE Planejada (h)', data:[120,130,140,150,148,145,145], tension:0.3 },
            { label:'HE Realizada (h)', data:[100,110,120,130,135,140,137], tension:0.3 }
          ]
        },
        options: { responsive:true, interaction:{mode:'index'}, plugins:{ legend:{ position:'top' } } }
      });
    }
  } catch (err) {
    console.warn('chart render error (dashboard demo)', err);
  }

  addLog('Dashboard', 'Filtros aplicados (mockup) — visão gerada');
}

function clearDashboardFilter() {
  const dStart = document.getElementById('d_start');
  const dEnd = document.getElementById('d_end');
  const dOperation = document.getElementById('d_operation');
  const dSegment = document.getElementById('d_segment');
  if (dStart) dStart.value = '';
  if (dEnd) dEnd.value = '';
  if (dOperation) dOperation.value = '';
  if (dSegment) dSegment.value = '';

  const contentEl = document.getElementById('dashboard-content');
  const emptyEl = document.getElementById('dashboard-empty');
  if (contentEl && emptyEl) {
    contentEl.style.display = 'none';
    emptyEl.style.display = 'block';
  }

  // destroy dashboard charts to free memory
  try {
    if (dashboardCharts.segmento) dashboardCharts.segmento.destroy();
    if (dashboardCharts.picos) dashboardCharts.picos.destroy();
    if (dashboardCharts.evolucao) dashboardCharts.evolucao.destroy();
  } catch (e) { /* ignore */ }
  dashboardCharts = {};

  addLog('Dashboard', 'Filtros limpos');
}

// ---------- Render all ----------
function renderAll() {
  try { renderTatico(); } catch(e){/*ignore*/}
  try { renderNOC(); } catch(e){/*ignore*/}
  try { renderSupervisor(); } catch(e){/*ignore*/}
  try { renderLogs(); } catch(e){/*ignore*/}
  try { renderSupervisorList(); } catch(e){/*ignore*/}
  try { populateAprovadorSelect(); } catch(e){/*ignore*/}
  try { renderDashboard(); } catch(e){/*ignore*/}
}
