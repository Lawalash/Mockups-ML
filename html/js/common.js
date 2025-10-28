// js/common.js
export const STORAGE_KEYS = {
  records: 'tabi_records_v3',
  validations: 'tabi_validations_v3',
  assignments: 'tabi_assignments_v3',
  logs: 'tabi_logs_v3',
  collaborators: 'tabi_collabs_v1'
};

export function generateId(){ return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2,9); }

export function generateMatricula(existingSet = new Set()){
  let n;
  do { n = String(Math.floor(100000 + Math.random() * 900000)); } while (existingSet.has(n));
  existingSet.add(n);
  return n;
}

export function esc(str){ return String(str||'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[s])); }

export function formatDateTime(iso){ return new Date(iso).toLocaleString('pt-BR'); }

function buildInitialCollaborators() {
  const used = new Set();
  const g1 = { matricula: generateMatricula(used), nome: 'Ana Paula Martins', role: 'Gerente' };
  const g2 = { matricula: generateMatricula(used), nome: 'José Carlos Ferreira', role: 'Gerente' };
  const c1 = { matricula: generateMatricula(used), nome: 'Bruno Henrique Silva', role: 'Coordenador', gerenteId: g1.matricula };
  const c2 = { matricula: generateMatricula(used), nome: 'Paula Regina Mendes', role: 'Coordenador', gerenteId: g2.matricula };
  const c3 = { matricula: generateMatricula(used), nome: 'Roberto Lima Santos', role: 'Coordenador', gerenteId: g1.matricula };
  const s1 = { matricula: generateMatricula(used), nome: 'Carlos Eduardo Oliveira', role: 'Supervisor', gerenteId: g1.matricula, coordenadorId: c1.matricula };
  const s2 = { matricula: generateMatricula(used), nome: 'Diana Cristina Costa', role: 'Supervisor', gerenteId: g1.matricula, coordenadorId: c1.matricula };
  const s3 = { matricula: generateMatricula(used), nome: 'Eduardo Antônio Lima', role: 'Supervisor', gerenteId: g2.matricula, coordenadorId: c2.matricula };
  const s4 = { matricula: generateMatricula(used), nome: 'Fernanda Beatriz Alves', role: 'Supervisor', gerenteId: g2.matricula, coordenadorId: c2.matricula };
  const s5 = { matricula: generateMatricula(used), nome: 'Marcos Vinícius Rocha', role: 'Supervisor', gerenteId: g1.matricula, coordenadorId: c3.matricula };

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

  return [g1,g2,c1,c2,c3,s1,s2,s3,s4,s5,...collabs];
}

export let state = {
  records: [], validations: {}, assignments: {}, logs: [], collaborators: buildInitialCollaborators(), importBuffer: [], currentUser: 'Demo User'
};

export function saveState(){
  try{
    localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(state.records));
    localStorage.setItem(STORAGE_KEYS.validations, JSON.stringify(state.validations));
    localStorage.setItem(STORAGE_KEYS.assignments, JSON.stringify(state.assignments));
    localStorage.setItem(STORAGE_KEYS.logs, JSON.stringify(state.logs));
    localStorage.setItem(STORAGE_KEYS.collaborators, JSON.stringify(state.collaborators));
  }catch(e){ console.error('saveState',e); }
}

export function addLog(action, details){
  state.logs.push({ timestamp: new Date().toISOString(), user: state.currentUser, action, details });
  saveState();
  renderLogs();
}

export function loadState(){
  try {
    const savedCollabs = JSON.parse(localStorage.getItem(STORAGE_KEYS.collaborators) || 'null');
    if (Array.isArray(savedCollabs) && savedCollabs.length>0) {
      const existing = new Set();
      state.collaborators = savedCollabs.map(c => {
        const r = {
          matricula: c.matricula || generateMatricula(existing),
          nome: c.nome || 'Nome Não Definido',
          role: c.role || 'Colaborador',
          gerenteId: c.gerenteId || null,
          coordenadorId: c.coordenadorId || null,
          supervisorId: c.supervisorId || null
        };
        existing.add(r.matricula);
        return r;
      });
    } else {
      localStorage.setItem(STORAGE_KEYS.collaborators, JSON.stringify(state.collaborators));
    }

    state.records = JSON.parse(localStorage.getItem(STORAGE_KEYS.records) || '[]') || [];
    state.validations = JSON.parse(localStorage.getItem(STORAGE_KEYS.validations) || '{}') || {};
    state.assignments = JSON.parse(localStorage.getItem(STORAGE_KEYS.assignments) || '{}') || {};
    state.logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.logs) || '[]') || [];
  } catch (e) { console.error('loadState error', e); }

  if (!state.records || state.records.length === 0) {
    seedSampleRecords();
    saveState();
  }
}

export function seedSampleRecords(){
  const today = new Date();
  const pad = n => String(n).padStart(2,'0');
  const yyyy = today.getFullYear(), mm = pad(today.getMonth()+1), dd = pad(today.getDate());
  const date = `${yyyy}-${mm}-${dd}`;
  function pushRec(segment, operation, time, hc, status='Publicado'){
    state.records.push({ id: generateId(), date, dmm: '1°', operation, segment, interval_start: time, hc_requested: hc, he_minutes: hc*10, motivo: 'Seed - demonstração', status, created_at: new Date().toISOString() });
  }
  // sample set (manhã/tarde/noite)
  pushRec('CONTROLE FRONT MOC','VIVO','07:00:00',4);
  pushRec('CONTROLE FRONT MOC','VIVO','08:10:00',3);
  pushRec('CONTROLE GRE BH','TIM','09:20:00',2);
  pushRec('LABS LAB','OI','10:30:00',3);
  pushRec('PRÉ PAGO ESE BH','CLARO','11:40:00',2);
  pushRec('PRÉ PAGO ESE BH','CLARO','13:10:00',5);
  pushRec('PRÉ PAGO ESE BH','CLARO','14:30:00',3);
  pushRec('LABS LAB','OI','15:40:00',4);
  pushRec('CONTROLE GRE BH','TIM','16:50:00',2);
  pushRec('CONTROLE FRONT MOC','VIVO','18:00:00',4);
  pushRec('CONTROLE GRE BH','TIM','19:10:00',3);
  pushRec('LABS LAB','OI','20:20:00',5);
  pushRec('PRÉ PAGO ESE BH','CLARO','21:30:00',2);
  addLog('Seed','Registros de demonstração criados (manhã/tarde/noite)');
}

export function resetDemo(){
  if (!confirm('Esta ação irá limpar todos os dados e recriar os colaboradores e registros de demonstração. Continuar?')) return;
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  state = { records:[], validations:{}, assignments:{}, logs:[], collaborators: buildInitialCollaborators(), importBuffer:[], currentUser:'Demo User' };
  seedSampleRecords(); saveState(); addLog('Reset Demo','Demo resetado');
  // try to rerender if page scripts exist
  try { window.renderTatico && window.renderTatico(); } catch(e){}
  alert('Demo reiniciado');
}

export function initializeClock(){
  const el = document.getElementById('clock');
  function tick(){ if (el) el.textContent = new Date().toLocaleString('pt-BR'); }
  tick(); setInterval(tick,1000);
}

// Import/Export helpers
export function toCSV(rows){
  return rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
}
export function downloadCSV(filename, text){
  const blob = new Blob([text], {type:'text/csv'}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
export function parseCSVToObjects(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim());
  if (lines.length<2) return [];
  const headers = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const objs = [];
  for (let i=1;i<lines.length;i++){
    const vals = lines[i].split(',').map(v=>v.trim());
    const o = {}; headers.forEach((h,idx)=> o[h]=vals[idx]||'');
    objs.push(o);
  }
  return objs;
}

// Logs rendering (used on pages that include #table_logs)
export function renderLogs(){
  const tbody = document.querySelector('#table_logs tbody');
  if(!tbody) return;
  tbody.innerHTML = '';
  state.logs.slice().reverse().forEach(log=>{
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = formatDateTime(log.timestamp);
    const td2 = document.createElement('td'); td2.textContent = esc(log.user);
    const td3 = document.createElement('td'); td3.textContent = esc(log.action);
    const td4 = document.createElement('td'); td4.textContent = esc(log.details);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
    tbody.appendChild(tr);
  });
}

// Supervisors helpers (used by NOC & Supervisor pages)
export function addSupervisorByName(name){
  if (!name) return null;
  const existing = new Set(state.collaborators.map(c=>c.matricula));
  const mat = generateMatricula(existing);
  const rec = { matricula: mat, nome: name, role: 'Supervisor', gerenteId: null, coordenadorId: null, supervisorId: null };
  state.collaborators.push(rec);
  saveState();
  addLog('Adicionar supervisor', name);
  return rec;
}

export function renderSupervisorList(){
  const container = document.getElementById('supervisor_list');
  if (!container) return;
  container.innerHTML = '';
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

  if (search) shown = shown.filter(c => (c.nome||'').toLowerCase().includes(search) || String(c.matricula).includes(search));

  if (!shown.length) { container.innerHTML = '<div class="text-small text-muted">Nenhum supervisor/gerente/coordenador encontrado para os filtros selecionados.</div>'; return; }

  shown.forEach(c => {
    const label = document.createElement('label'); label.style.display='block';
    const cb = document.createElement('input'); cb.type='checkbox'; cb.value = c.matricula;
    const roleText = c.role ? ` - ${c.role}` : '';
    const text = document.createTextNode(` (${c.matricula}) ${c.nome}${roleText}`);
    label.appendChild(cb); label.appendChild(text); container.appendChild(label);
  });
}

export function populateAprovadorSelect(){
  const sel = document.getElementById('aprovador_select');
  if (!sel) return;
  sel.innerHTML = '';
  const placeholder = document.createElement('option'); placeholder.value=''; placeholder.textContent='Selecione...'; sel.appendChild(placeholder);
  state.collaborators.filter(c => ['Gerente','Coordenador'].includes(c.role)).forEach(c => {
    const opt = document.createElement('option'); opt.value = c.matricula; opt.textContent = `(${c.matricula}) ${c.nome} - ${c.role}`; sel.appendChild(opt);
  });
}
