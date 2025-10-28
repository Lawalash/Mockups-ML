/* merged.js - Versão corrigida e com reset ao recarregar (1 grupo Pendente)
   - Reintroduzida regra: ao F5 / reload => limpa registros e cria 1 grupo Pendente
   - Correções em filtros, validações e demais melhorias mantidas
*/
(() => {
  // ---------- Config / Estado ----------
  const STORAGE_KEY = 'tabi_state_v1';
  const IMPORTER_NAME = 'RICARDO ALEXANDRE BRASIL JUNIOR';
  const IMPORTER_MATRICULA = '289853';
  const MAX_ASSIGN_MIN = 105; // 1h45 em minutos por chunk
  const MAX_GROUPS_ALLOWED = 3;

  let state = {
    records: [],
    collaborators: [
      { matricula: IMPORTER_MATRICULA, nome: IMPORTER_NAME, role: 'planner' },
      { matricula: '289854', nome: 'Planner Bruno', role: 'planner' },
      { matricula: '289860', nome: 'Supervisor Ana', role: 'supervisor' },
      { matricula: '289861', nome: 'Supervisor Carlos', role: 'supervisor' },
      { matricula: '289870', nome: 'João Silva', role: 'operador' },
      { matricula: '289871', nome: 'Maria Santos', role: 'operador' },
      { matricula: '289872', nome: 'Pedro Oliveira', role: 'operador' },
      { matricula: '289873', nome: 'Luiza Costa', role: 'operador' },
      { matricula: '289874', nome: 'Rafael Sousa', role: 'operador' },
      { matricula: '289875', nome: 'Camila Ribeiro', role: 'operador' }
    ],
    notifications: [],
    importBuffer: []
  };

  // ---------- Utilities ----------
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge conservatively: keep default collaborators if none in stored state
        state = Object.assign({}, state, parsed);
        if (!Array.isArray(state.records)) state.records = [];
        if (!Array.isArray(state.notifications)) state.notifications = [];
        if (!Array.isArray(state.importBuffer)) state.importBuffer = [];
      }
    } catch (e) { console.warn('loadState error', e); }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn('saveState error', e); }
  }

  function uid(prefix = '') { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
  function parseDateStr(v){ if(!v) return null; const p = String(v).split('-').map(Number); if(p.length!==3) return null; return new Date(p[0], p[1]-1, p[2]); }

  // Determine if a record is expired relative to today (end_date < today)
  function isExpired(rec){
    if(!rec || !rec.end_date) return false;
    const end = parseDateStr(rec.end_date);
    if(!end) return false;
    const t = new Date(); t.setHours(0,0,0,0);
    return end < t;
  }

  // minutes -> human readable (e.g. "1h05")
  function minutesToHuman(min){ min = Number(min)||0; if(min<=0) return '0h'; const h = Math.floor(min/60); const m = min%60; return m===0?`${h}h`:`${h}h${String(m).padStart(2,'0')}`; }
  function hcToMinutes(hc){ return Math.round(Number(hc)||0) * 10; }
  function td(text){ const c = document.createElement('td'); c.textContent = (text===undefined||text===null)?'':String(text); return c; }

  // Normalize time strings for comparison.
  // Accepts "07:00", "07:00:00", "7:0", etc -> returns "07:00"
  function timeToHHMM(t){
    if(!t) return '';
    const s = String(t).trim();
    // If includes seconds, strip
    const parts = s.split(':').map(p => p.padStart(2,'0'));
    if(parts.length === 1) return parts[0].slice(0,2);
    return `${parts[0].slice(-2)}:${parts[1].slice(0,2)}`;
  }

  // ---------- Clock + Intervals ----------
  function initializeClock(){ const el = document.getElementById('clock'); if(!el) return; function tick(){ el.textContent = new Date().toLocaleString(); } tick(); setInterval(tick,1000); }

  // Populate a multi-select 't_intervals' if exists (keeps dropdown optional)
  function initIntervals(){
    const select = document.getElementById('t_intervals');
    if(!select) return;
    select.innerHTML = '';
    for(let h=0; h<24; h++){
      for(let m=0; m<60; m+=10){
        const hh = String(h).padStart(2,'0'); const mm = String(m).padStart(2,'0');
        const opt = document.createElement('option'); opt.value = `${hh}:${mm}:00`; opt.textContent = `${hh}:${mm}`; select.appendChild(opt);
      }
    }
  }

  // ---------- Filters ----------
  function getFilters(){
    return {
      start: document.getElementById('f_start')?.value || '',
      end: document.getElementById('f_end')?.value || '',
      // normalize to HH:MM (user input from <input type="time"> usually is "HH:MM")
      interval: timeToHHMM(document.getElementById('f_interval')?.value || ''),
      operation: (document.getElementById('f_operation')?.value || '').trim(),
      segment: (document.getElementById('f_segment')?.value || '').trim(),
      hc_min: (() => { const el = document.getElementById('f_hc_min'); if(!el) return null; const v = Number(el.value); return (el.value === '' || isNaN(v)) ? null : v; })(),
      status: (document.getElementById('f_status')?.value || '').trim()
    };
  }

  // Returns true if rec date-range intersects filter range
  function dateRangeIntersects(recStart, recEnd, fStart, fEnd){
    // All params are Date or null
    if(!recStart || !recEnd) return false;
    if(fStart && fEnd) {
      // intersect if recEnd >= fStart && recStart <= fEnd
      return !(recEnd < fStart || recStart > fEnd);
    } else if(fStart) {
      return !(recEnd < fStart);
    } else if(fEnd) {
      return !(recStart > fEnd);
    }
    return true;
  }

  function applyFilters(records){
    const f = getFilters();
    return (records || []).filter(r => {
      // status (case-insensitive, allow empty = any)
      if (f.status) {
        if(!r.status) return false;
        if(String(r.status).toLowerCase() !== String(f.status).toLowerCase()) return false;
      }

      if (f.operation) {
        if(!r.operation) return false;
        if((r.operation||'').toLowerCase() !== f.operation.toLowerCase()) return false;
      }

      if (f.segment) {
        if(!r.segment) return false;
        if((r.segment||'').toLowerCase() !== f.segment.toLowerCase()) return false;
      }

      if (f.interval) {
        const recInterval = timeToHHMM(r.interval_start || r.interval || '');
        if(!recInterval) return false;
        if(recInterval !== f.interval) return false;
      }

      if (f.hc_min !== null) {
        const rc = Number(r.hc_requested || r.hc || 0);
        if(rc < f.hc_min) return false;
      }

      // Date filters: we consider overlap between record [start_date,end_date] and filter window
      const recStart = parseDateStr(r.start_date);
      const recEnd = parseDateStr(r.end_date);
      const fStart = f.start ? parseDateStr(f.start) : null;
      const fEnd = f.end ? parseDateStr(f.end) : null;

      if((fStart || fEnd) && !dateRangeIntersects(recStart, recEnd, fStart, fEnd)) return false;

      return true;
    });
  }

  // ---------- Render Groups ----------
  let groupsChart = null;
  function renderGroups(){
    const tbody = document.querySelector('#table_groups tbody');
    if(!tbody) return;
    tbody.innerHTML = '';

    // base records: exclude expired
    let records = (state.records || []).filter(r => !isExpired(r));
    // apply filters
    const filtered = applyFilters(records);

    if(!filtered.length){
      const tr = document.createElement('tr');
      const tdc = document.createElement('td'); tdc.colSpan = 11; tdc.className='muted'; tdc.style.textAlign='center'; tdc.style.padding='1.5rem'; tdc.textContent = 'Nenhum registro ativo.';
      tr.appendChild(tdc); tbody.appendChild(tr); renderChart([]); renderSummary(); renderPlanningCharts(); return;
    }

    // group by key (start|end|segment|operation)
    const groups = {};
    filtered.forEach(r => {
      const key = `${r.start_date}|${r.end_date}|${r.segment||''}|${r.operation||''}`;
      if(!groups[key]) groups[key] = {
        key, start_date: r.start_date, end_date: r.end_date, segment: r.segment, operation: r.operation,
        records: [], he_total_minutes:0, hc_total:0, assigned_hc_total:0, assigned_he_minutes_total:0, created_by_set: new Set()
      };
      groups[key].records.push(r);
      groups[key].he_total_minutes += (Number(r.he_minutes) || 0);
      groups[key].hc_total += (Number(r.hc_requested) || Number(r.hc) || 0);
      groups[key].assigned_hc_total += (Number(r.assigned_hc) || 0);
      groups[key].assigned_he_minutes_total += (Number(r.assigned_he_minutes) || 0);
      if(r.created_by) groups[key].created_by_set.add(r.created_by);
    });

    Object.keys(groups).sort().forEach(key => {
      const g = groups[key];
      const trHead = document.createElement('tr'); trHead.className='group-header'; trHead.dataset.group = key;
      const tdExp = document.createElement('td'); const btn = document.createElement('button'); btn.className='btn'; btn.textContent='+'; btn.title='Expandir/Recolher';
      btn.addEventListener('click', ()=>toggleGroupDetails(key, btn)); tdExp.appendChild(btn);
      trHead.appendChild(tdExp);
      trHead.appendChild(td(g.start_date||'-'));
      trHead.appendChild(td(g.end_date||'-'));
      trHead.appendChild(td('—'));
      trHead.appendChild(td(g.operation||'-'));
      trHead.appendChild(td(g.segment||'-'));
      trHead.appendChild(td(minutesToHuman(g.he_total_minutes)));
      trHead.appendChild(td(`${g.assigned_hc_total} HC • ${minutesToHuman(g.assigned_he_minutes_total)}`));
      trHead.appendChild(td(g.hc_total));

      // aggregate status precedence: Validado > Publicado > Pendente
      const statuses = new Set(g.records.map(r => r.status || 'Pendente'));
      let badgeHtml = '<span class="status-badge draft">Pendente</span>';
      if(statuses.has('Validado')) badgeHtml = '<span class="status-badge validated">Validado</span>';
      else if(statuses.has('Publicado')) badgeHtml = '<span class="status-badge published">Publicado</span>';
      const tdStatus = document.createElement('td'); tdStatus.innerHTML = badgeHtml; trHead.appendChild(tdStatus);

      const tdActions = document.createElement('td');
      const chk = document.createElement('input'); chk.type='checkbox'; chk.className='group-checkbox'; chk.dataset.group = key; tdActions.appendChild(chk);

      const btnVal = document.createElement('button'); btnVal.className='btn success'; btnVal.textContent='Validar Grupo';
      btnVal.addEventListener('click', ()=>validateGroup(key));
      tdActions.appendChild(btnVal);

      const btnView = document.createElement('button'); btnView.className='btn'; btnView.textContent='Ver';
      btnView.addEventListener('click', ()=>openGroupModal(key));
      tdActions.appendChild(btnView);

      trHead.appendChild(tdActions);
      tbody.appendChild(trHead);

      // details per record
      g.records.sort((a,b)=> (a.interval_start||'').localeCompare(b.interval_start||'')).forEach(rec=>{
        const tr = document.createElement('tr'); tr.className='group-detail'; tr.dataset.group = key;
        tr.appendChild(td(' '));
        tr.appendChild(td(rec.start_date||'-'));
        tr.appendChild(td(rec.end_date||'-'));
        tr.appendChild(td(rec.interval_start||rec.interval||'-'));
        tr.appendChild(td(rec.operation||'-'));
        tr.appendChild(td(rec.segment||'-'));
        tr.appendChild(td(minutesToHuman(rec.he_minutes||0)));
        tr.appendChild(td(`${rec.assigned_hc||0} HC • ${minutesToHuman(rec.assigned_he_minutes||0)}`));
        tr.appendChild(td(rec.hc_requested||rec.hc||'-'));
        tr.appendChild(td(rec.status||'-'));
        const tdAction = document.createElement('td');
        const btnRem = document.createElement('button'); btnRem.className='btn danger'; btnRem.textContent='Remover';
        btnRem.addEventListener('click', ()=>removeRecord(rec.id,true));
        tdAction.appendChild(btnRem);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
      });
    });

    // select all binding
    const chkAll = document.getElementById('chkAllGroups');
    if (chkAll) chkAll.onchange = (e) => document.querySelectorAll('.group-checkbox').forEach(cb => cb.checked = e.target.checked);

    // chart by segment
    const segmentsAgg = {};
    Object.values(groups).forEach(g => {
      const seg = g.segment || 'Sem segmento';
      segmentsAgg[seg] = (segmentsAgg[seg] || 0) + ((g.he_total_minutes || 0) / 60);
    });
    const chartData = Object.keys(segmentsAgg).map(s => ({ segment: s, hours: Number((segmentsAgg[s] || 0).toFixed(2)) }));
    renderChart(chartData);

    renderSummary();
    renderPlanningCharts();
  }

  function toggleGroupDetails(groupKey, btn){
    const details = document.querySelectorAll(`tr.group-detail[data-group="${groupKey}"]`);
    if(!details.length) return;
    // use attribute 'data-expanded' on header row for deterministic state
    const expanded = details[0].classList.contains('expanded');
    details.forEach(d => d.classList.toggle('expanded', !expanded));
    btn.textContent = expanded ? '+' : '−';
  }

  // ---------- Modal open / render header / assignments ----------
  function openGroupModal(groupKey){
    const recs = state.records.filter(r => !isExpired(r) && `${r.start_date}|${r.end_date}|${r.segment||''}|${r.operation||''}` === groupKey);
    if(!recs.length) return alert('Grupo vazio.');

    const [start_date, end_date, segment, operation] = groupKey.split('|');
    const title = `Horários · ${start_date} → ${end_date} • ${segment || '—'} • ${operation || '—'}`;
    const titleEl = document.getElementById('groupModalTitle'); if(titleEl) titleEl.textContent = title;

    const createdSorted = recs.slice().sort((a,b)=> (a.created_at||'').localeCompare(b.created_at||''));
    const creatorRecord = createdSorted[0];
    const creatorName = (creatorRecord && creatorRecord.created_by) ? creatorRecord.created_by : `${IMPORTER_NAME} (${IMPORTER_MATRICULA})`;
    const createdAtText = (creatorRecord && creatorRecord.created_at) ? `em ${new Date(creatorRecord.created_at).toLocaleString('pt-BR')}` : '';

    const modalImportedByEl = document.getElementById('modalImportedBy'); if(modalImportedByEl) modalImportedByEl.textContent = creatorName;
    const modalCreatedAtEl = document.getElementById('modalCreatedAt'); if(modalCreatedAtEl) modalCreatedAtEl.textContent = createdAtText;

    const totalHC = recs.reduce((s,x)=> s + (Number(x.hc_requested)||Number(x.hc)||0), 0);
    const totalHEmin = recs.reduce((s,x)=> s + (Number(x.he_minutes)||0), 0);
    const totalAssignedHC = recs.reduce((s,x)=> s + (Number(x.assigned_hc)||0), 0);
    const totalAssignedHEmin = recs.reduce((s,x)=> s + (Number(x.assigned_he_minutes)||0), 0);

    const modalTotalHC = document.getElementById('modalTotalHC'); if(modalTotalHC) modalTotalHC.textContent = totalHC;
    const modalTotalHE = document.getElementById('modalTotalHE'); if(modalTotalHE) modalTotalHE.textContent = minutesToHuman(totalHEmin);
    const modalAssignedHC = document.getElementById('modalAssignedHC'); if(modalAssignedHC) modalAssignedHC.textContent = totalAssignedHC;
    const modalAssignedHE = document.getElementById('modalAssignedHE'); if(modalAssignedHE) modalAssignedHE.textContent = minutesToHuman(totalAssignedHEmin);

    ensureIntervalHeader('#assignmentsSummaryTable'); ensureIntervalHeader('#simulationTable');
    renderAssignmentsSummary(recs); renderAssignmentHistory(recs);

    const simWrap = document.getElementById('simulationWrapper'); if(simWrap) simWrap.classList.add('hidden');
    const simTbody = document.querySelector('#simulationTable tbody'); if(simTbody) simTbody.innerHTML = '';

    const simBtn = document.getElementById('btnSimulateAssign'); if(simBtn) simBtn.dataset.group = groupKey;

    try {
      localStorage.setItem('tabi_last_viewed_group', JSON.stringify({
        key: groupKey, start_date, end_date, segment, operation,
        viewed_at: new Date().toISOString(), created_by: creatorName, created_at: creatorRecord && creatorRecord.created_at ? creatorRecord.created_at : null
      }));
      localStorage.setItem('tabi_last_viewed_flag', String(Date.now()));
    } catch(e){}

    showModal('groupModal');
  }

  function ensureIntervalHeader(selector) {
    const table = document.querySelector(selector); if(!table) return;
    const thead = table.querySelector('thead'); if(!thead) return;
    const headers = Array.from(thead.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
    if(!headers.includes('intervalo')) {
      const tr = thead.querySelector('tr'); if(tr){ const th = document.createElement('th'); th.textContent = 'Intervalo'; tr.appendChild(th); }
    }
  }

  // ---------- Assignments summary & history ----------
  function renderAssignmentsSummary(recs){
    const tbody = document.querySelector('#assignmentsSummaryTable tbody'); if(!tbody) return; tbody.innerHTML = '';
    const flat = [];
    recs.forEach(r => { (r.assignments||[]).forEach(a => {
      flat.push({
        assigneeMat: a.to_matricula || a.to || '—',
        assigneeName: a.to_name || a.to_name || '—',
        operation: r.operation || '—',
        segment: r.segment || '—',
        assignerMat: a.by_matricula || a.by || '—',
        assignerName: a.by_name || a.by || '—',
        minutes: Number(a.minutes) || 0,
        interval: a.interval || r.interval_start || '—'
      });
    }); });

    if(!flat.length){
      const tr = document.createElement('tr'); const tdc = document.createElement('td'); tdc.colSpan = 8; tdc.className='muted'; tdc.textContent = 'Sem atribuições registradas neste grupo.'; tr.appendChild(tdc); tbody.appendChild(tr); return;
    }

    const agg = {};
    flat.forEach(x => {
      const key = `${x.assigneeMat}|${x.assigneeName}|${x.operation}|${x.segment}|${x.assignerMat}|${x.assignerName}|${x.interval}`;
      if(!agg[key]) agg[key] = {...x, totalMinutes:0};
      agg[key].totalMinutes += x.minutes;
    });

    Object.values(agg).forEach(row => {
      const tr = document.createElement('tr');
      tr.appendChild(td(row.assigneeMat)); tr.appendChild(td(row.assigneeName)); tr.appendChild(td(row.operation)); tr.appendChild(td(row.segment));
      tr.appendChild(td(row.assignerMat)); tr.appendChild(td(row.assignerName)); tr.appendChild(td(minutesToHuman(row.totalMinutes))); tr.appendChild(td(row.interval));
      tbody.appendChild(tr);
    });
  }

  function renderAssignmentHistory(recs){
    const allEvents = [];
    recs.forEach(r => { (r.assignments||[]).forEach(a => {
      allEvents.push({
        assigneeMat: a.to_matricula || a.to || '—',
        assigneeName: a.to_name || a.to_name || '—',
        operation: r.operation || '—',
        segment: r.segment || '—',
        assignerMat: a.by_matricula || a.by || '—',
        assignerName: a.by_name || a.by || '—',
        minutes: Number(a.minutes) || 0,
        interval: a.interval || r.interval_start || '—',
        ts: a.ts || ''
      });
    }); });

    const tbody = document.querySelector('#simulationTable tbody'); if(!tbody) return; tbody.innerHTML = '';
    if(!allEvents.length) return;

    allEvents.sort((a,b) => (a.ts||'').localeCompare(b.ts||''));
    allEvents.forEach(e => {
      const tr = document.createElement('tr');
      tr.appendChild(td(e.assigneeMat)); tr.appendChild(td(e.assigneeName)); tr.appendChild(td(e.operation)); tr.appendChild(td(e.segment));
      tr.appendChild(td(e.assignerMat)); tr.appendChild(td(e.assignerName)); tr.appendChild(td(minutesToHuman(e.minutes))); tr.appendChild(td(e.interval));
      tbody.appendChild(tr);
    });

    const wrap = document.getElementById('simulationWrapper'); if(wrap) wrap.classList.remove('hidden');
  }

  // ---------- Simulation for a group (respects HE) ----------
  function simulateAssignmentsForGroup(groupKey){
    const recs = state.records.filter(r => !isExpired(r) && `${r.start_date}|${r.end_date}|${r.segment||''}|${r.operation||''}` === groupKey);
    if(!recs.length) return alert('Grupo vazio.');

    const operators = state.collaborators.filter(c => c.role === 'operador');
    const supervisors = state.collaborators.filter(c => c.role === 'supervisor');
    const planners = state.collaborators.filter(c => c.role === 'planner');

    const defaultOp = { matricula: '289999', nome: 'Operador Sim' };
    const defaultSup = { matricula: '289998', nome: 'Supervisor Sim' };
    const defaultPln = { matricula: IMPORTER_MATRICULA, nome: IMPORTER_NAME };

    let opIdx=0, supIdx=0, plnIdx=0, totalAssignedChunks=0;

    recs.forEach(rec => {
      if(!rec.he_minutes) rec.he_minutes = hcToMinutes(rec.hc_requested||rec.hc||0);
      rec.assigned_he_minutes = Number(rec.assigned_he_minutes||0);
      rec.assigned_hc = Number(rec.assigned_hc||0);

      let available = Math.max(0, Math.floor(rec.he_minutes - rec.assigned_he_minutes));
      if(available <= 0) return;

      while(available > 0){
        const chunk = Math.min(available, MAX_ASSIGN_MIN);
        const op = operators.length ? operators[opIdx % operators.length] : defaultOp;
        const sup = supervisors.length ? supervisors[supIdx % supervisors.length] : defaultSup;
        const pln = planners.length ? planners[plnIdx % planners.length] : defaultPln;

        const assignEvent = {
          id: uid('asm_'),
          by_matricula: pln.matricula || sup.matricula || defaultPln.matricula,
          by_name: pln.nome || sup.nome || defaultPln.nome,
          to_matricula: op.matricula,
          to_name: op.nome,
          minutes: chunk,
          interval: rec.interval_start || `${rec.start_date} → ${rec.end_date}`,
          ts: new Date().toISOString()
        };

        rec.assignments = rec.assignments || [];
        rec.assignments.push(assignEvent);

        rec.assigned_he_minutes = Math.min(rec.he_minutes, (rec.assigned_he_minutes||0) + chunk);
        rec.assigned_hc = Math.min(rec.hc_requested||0, Math.floor((rec.assigned_he_minutes||0)/10));

        available = Math.max(0, Math.floor(rec.he_minutes - rec.assigned_he_minutes));
        totalAssignedChunks++; opIdx++; supIdx++; plnIdx++;
      }
    });

    if(totalAssignedChunks > 0){
      state.notifications = state.notifications || [];
      state.notifications.unshift({
        id: uid('n_'),
        type: 'SIM',
        text: `${totalAssignedChunks} atribuição(ões) simuladas no grupo ${groupKey.split('|')[0]} → ${groupKey.split('|')[1]}`,
        ts: new Date().toISOString(), seen: false
      });
      saveState(); renderGroups(); openGroupModal(groupKey); alert('Simulação realizada e atribuída (persistida).');
    } else {
      alert('Não havia HE disponível para atribuir neste(s) registro(s).');
    }
  }

  // ---------- Validate group ----------
  function validateGroup(groupKey){
    const aprovador = state.collaborators.find(c => c.role === 'planner') || state.collaborators[0];
    if(!aprovador) return alert('Nenhum aprovador cadastrado.');
    if(!confirm(`Confirma validar o grupo ${groupKey.split('|')[0]} • ${groupKey.split('|')[1] || '—'}? Aprovador: ${aprovador.nome}`)) return;
    const recs = state.records.filter(r => ['Pendente','Publicado'].includes(r.status||'Pendente') && `${r.start_date}|${r.end_date}|${r.segment||''}|${r.operation||''}` === groupKey);
    recs.forEach(r => { r.status = 'Validado'; r.validated_at = new Date().toISOString(); r.validated_by = aprovador.nome; });
    state.notifications = state.notifications || [];
    state.notifications.unshift({ id: uid('n_'), type: 'VAL', text: `Grupo ${groupKey.split('|')[0]} → ${groupKey.split('|')[1]} validado por ${aprovador.nome}`, ts: new Date().toISOString(), seen:false });
    saveState(); renderGroups(); try { localStorage.setItem('tabi_last_validated_group', JSON.stringify({ key: groupKey, validated_at: new Date().toISOString(), validated_by: aprovador.nome })); localStorage.setItem('tabi_last_viewed_flag', String(Date.now())); } catch(e){}
    alert('Grupo validado com sucesso.');
  }

  // ---------- Remove / Delete ----------
  let pendingDeleteId = null;
  function showDeleteConfirm(id){ pendingDeleteId = id; const txt = document.getElementById('deleteModalText'); if(txt) txt.textContent = `Deseja remover o registro ID: ${id}?`; showModal('deleteModal'); }
  function confirmDelete(){ if(!pendingDeleteId){ hideModal('deleteModal'); return; } state.records = state.records.filter(r => r.id !== pendingDeleteId); pendingDeleteId = null; saveState(); hideModal('deleteModal'); renderGroups(); }
  function cancelDelete(){ pendingDeleteId = null; hideModal('deleteModal'); }
  function removeRecord(id, ask = true){ if(ask){ showDeleteConfirm(id); return; } state.records = state.records.filter(r => r.id !== id); saveState(); renderGroups(); }

  // ---------- Import / Export / Template ----------
  function downloadTemplate(){ const csv = ['start_date,end_date,dmm,segment,operation,interval_start,hc_requested,motivo,created_by', `${todayStr()},${todayStr()},1°,PRÉ PAGO ESE BH,TIM,07:00:00,4,Pico matutino,${IMPORTER_NAME} (${IMPORTER_MATRICULA})`].join('\n'); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'template_tabi.csv'; a.click(); URL.revokeObjectURL(url); }

  function handleImportFile(e){ const file = e.target.files && e.target.files[0]; if(!file) return; const reader = new FileReader(); reader.onload = (ev) => parseCSVImport(ev.target.result); reader.readAsText(file,'UTF-8'); e.target.value = ''; }

  // Simple CSV parser (works for simple CSVs without complex quoting). Keep as-is for demo.
  function parseCSVToObjects(text){ const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean); if(!lines.length) return []; const headers = lines.shift().split(',').map(h=>h.trim()); return lines.map(line=>{ const cols = line.split(',').map(c=>c.replace(/^"|"$/g,'').trim()); const obj = {}; headers.forEach((h,i)=>obj[h]=cols[i]||''); return obj; }); }

  function parseCSVImport(text){
    const objs = parseCSVToObjects(text);
    state.importBuffer = objs.filter(o=>o.start_date&&o.end_date&&o.interval_start&&o.hc_requested).map(o=>({
      start_date:o.start_date,
      end_date:o.end_date,
      dmm:o.dmm||'',
      segment:o.segment||'',
      operation:o.operation||'',
      interval_start:(o.interval_start || o.interval || '').trim(),
      hc_requested:parseInt(o.hc_requested,10)||1,
      motivo:o.motivo||'',
      created_by:o.created_by||`${IMPORTER_NAME} (${IMPORTER_MATRICULA})`
    }));
    showImportPreview();
  }

  function showImportPreview(){
    if(!state.importBuffer||!state.importBuffer.length) return alert('Nenhum registro válido para importar.');
    const preview = document.getElementById('import_preview'); if(!preview) return;
    preview.innerHTML='';
    const p = document.createElement('p'); p.textContent = `Registros a importar: ${state.importBuffer.length}`; preview.appendChild(p);
    const tbl = document.createElement('table'); tbl.className='schedule-table';
    const thead = document.createElement('thead'); thead.innerHTML = '<tr><th>Início</th><th>Fim</th><th>Operação</th><th>Segmento</th><th>Intervalo</th><th>HC</th></tr>'; tbl.appendChild(thead);
    const tbody = document.createElement('tbody');
    state.importBuffer.forEach(r=>{
      const tr = document.createElement('tr');
      tr.appendChild(td(r.start_date)); tr.appendChild(td(r.end_date)); tr.appendChild(td(r.operation||'-')); tr.appendChild(td(r.segment||'-')); tr.appendChild(td(r.interval_start)); tr.appendChild(td(r.hc_requested));
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody); preview.appendChild(tbl); showModal('importModal');
  }

  function confirmImport(){
    if(!state.importBuffer||!state.importBuffer.length) return alert('Nada para importar.');
    state.importBuffer.forEach(b=>{
      state.records.push({
        id: uid('r_'),
        start_date: b.start_date,
        end_date: b.end_date,
        dmm: b.dmm,
        segment: b.segment,
        operation: b.operation,
        interval_start: b.interval_start,
        hc_requested: b.hc_requested,
        he_minutes: hcToMinutes(b.hc_requested),
        assigned_hc:0,
        assigned_he_minutes:0,
        assignments:[],
        status:'Pendente',
        created_at: new Date().toISOString(),
        created_by: b.created_by || `${IMPORTER_NAME} (${IMPORTER_MATRICULA})`
      });
    });
    const count = state.importBuffer.length;
    state.importBuffer = [];
    saveState();
    renderGroups();
    hideModal('importModal');
    alert(`${count} registro(s) importado(s) como PENDENTE.`);
  }

  function exportData(){
    if(!state.records.length) return alert('Não há registros para exportar.');
    const headers = ['id','start_date','end_date','dmm','segment','operation','interval_start','hc_requested','he_minutes','assigned_hc','assigned_he_minutes','created_by','status'];
    const rows = [headers].concat(state.records.map(r=>[r.id, r.start_date||'', r.end_date||'', r.dmm||'', r.segment||'', r.operation||'', r.interval_start||'', r.hc_requested||0, r.he_minutes||0, r.assigned_hc||0, r.assigned_he_minutes||0, r.created_by||'', r.status||'']));
    const csv = rows.map(row => row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `tabi_export_${todayStr()}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  // ---------- Chart / Summary / Bell ----------
  function renderChart(data){
    const ctx = document.getElementById('chart_groups');
    if(!ctx) return;
    const labels = (data || []).map(d=>d.segment);
    const values = (data || []).map(d=>Number(d.hours || 0));
    if(groupsChart) try{ groupsChart.destroy(); } catch(e){}
    groupsChart = new Chart(ctx, { type:'doughnut', data:{ labels, datasets:[{ data: values, hoverOffset:8 }] }, options:{ plugins:{ legend:{ position:'bottom' } }, maintainAspectRatio:false } });
  }

  function renderSummary(){
    document.getElementById('sum_total') && (document.getElementById('sum_total').textContent = state.records.length);
    document.getElementById('sum_draft') && (document.getElementById('sum_draft').textContent = state.records.filter(r=>r.status==='Rascunho').length);
    document.getElementById('sum_published') && (document.getElementById('sum_published').textContent = state.records.filter(r=>r.status==='Publicado').length);
    document.getElementById('sum_validated') && (document.getElementById('sum_validated').textContent = state.records.filter(r=>r.status==='Validado').length);
  }

  function renderBell(){
    const badge = document.getElementById('bellBadge'); const popup = document.getElementById('bellPopup'); if(!badge||!popup) return;
    const unseen = (state.notifications || []).filter(n=>!n.seen).length;
    if(unseen){ badge.textContent = String(unseen); badge.classList.remove('hidden'); } else badge.classList.add('hidden');
    popup.innerHTML = '';
    if(!(state.notifications || []).length){ const p = document.createElement('div'); p.className = 'bell-item'; p.textContent = 'Nenhuma notificação'; popup.appendChild(p); return; }
    (state.notifications || []).slice(0,20).forEach(n=>{
      const div = document.createElement('div'); div.className = 'bell-item';
      const left = document.createElement('div'); left.innerHTML = `<div><strong>${n.type}</strong></div><div class="meta">${n.text}</div>`;
      const right = document.createElement('div'); const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = n.seen ? 'Vista' : 'Marcar como vista'; btn.disabled = !!n.seen;
      btn.addEventListener('click', ()=>{ n.seen = true; saveState(); renderBell(); });
      right.appendChild(btn); div.appendChild(left); div.appendChild(right); popup.appendChild(div);
    });
  }

  // ---------- Modal helpers ----------
  function showModal(id){ const el = document.getElementById(id); if(el) el.classList.remove('hidden'); try{ setTimeout(()=>{ const modal = document.getElementById(id); if(modal){ const focusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'); if(focusable) focusable.focus(); } },80); }catch(e){} }
  function hideModal(id){ const el = document.getElementById(id); if(el) el.classList.add('hidden'); }

  // ---------- Sidebar add/clear ----------
  function addFromSidebar(){
    const start_date = (document.getElementById('t_start_date')?.value || '').trim();
    const end_date = (document.getElementById('t_end_date')?.value || '').trim();
    const dmm = document.getElementById('t_dmm')?.value || '';
    const operation = document.getElementById('t_operation')?.value || '';
    const segment = document.getElementById('t_segment')?.value || '';
    const hc = parseInt(document.getElementById('t_hc')?.value,10) || 1;
    const motivo = document.getElementById('t_motivo')?.value || '';

    // Intervals support:
    // - Prefer multi-select with id 't_intervals' (select multiple)
    // - Otherwise accept single time input 's_interval' (type=time)
    let intervals = [];
    const multi = document.getElementById('t_intervals');
    const single = document.getElementById('s_interval') || document.getElementById('t_interval') || document.getElementById('t_interval_input');
    if(multi && multi.options){
      intervals = Array.from(multi.selectedOptions).map(o => (o.value || '').trim()).filter(Boolean);
    } else if(single && single.value) {
      // If single provided in "HH:MM" convert to "HH:MM:SS" for storage consistency
      const hhmm = timeToHHMM(single.value);
      if(hhmm) intervals = [`${hhmm}:00`];
    }

    if(!start_date||!end_date||intervals.length===0) return alert('Preencha Data inicial, Data final e selecione/insira pelo menos um intervalo.');

    intervals.forEach(interval=>{
      const rec = {
        id: uid('r_'),
        start_date,
        end_date,
        dmm,
        operation,
        segment,
        interval_start: interval,
        hc_requested: hc,
        he_minutes: hcToMinutes(hc),
        assigned_hc:0,
        assigned_he_minutes:0,
        assignments:[],
        status:'Pendente',
        created_at: new Date().toISOString(),
        created_by: `${IMPORTER_NAME} (${IMPORTER_MATRICULA})`
      };
      state.records.push(rec);
    });

    saveState();
    renderGroups();
    clearSidebar();
  }

  function clearSidebar(){
    ['t_start_date','t_end_date','t_dmm','t_operation','t_segment','t_hc','t_motivo'].forEach(id=>{ const el = document.getElementById(id); if(el) el.value=''; });
    const sel = document.getElementById('t_intervals'); if(sel) Array.from(sel.options).forEach(o=>o.selected=false);
    const single = document.getElementById('s_interval'); if(single) single.value = '';
  }

  // ---------- Bind UI ----------
  function bindUI(){
    document.getElementById('btnToggleForm')?.addEventListener('click', ()=>document.getElementById('sidebarForm').classList.toggle('open'));
    document.getElementById('btnCloseSidebar')?.addEventListener('click', ()=>document.getElementById('sidebarForm').classList.remove('open'));
    document.getElementById('btnAdd')?.addEventListener('click', addFromSidebar);
    document.getElementById('btnClear')?.addEventListener('click', clearSidebar);
    document.getElementById('btnTpl')?.addEventListener('click', downloadTemplate);
    document.getElementById('fileImport')?.addEventListener('change', handleImportFile);
    document.getElementById('btnImport')?.addEventListener('click', ()=>document.getElementById('fileImport').click());
    document.getElementById('btnConfirmImport')?.addEventListener('click', confirmImport);
    document.getElementById('btnCancelImport')?.addEventListener('click', ()=>hideModal('importModal'));
    document.getElementById('btnExport')?.addEventListener('click', exportData);

    // Simular grupos (gera até que existam MAX_GROUPS_ALLOWED grupos no total)
    document.getElementById('btnSimulateGroups')?.addEventListener('click', ()=> { simulateCreateGroups(); });

    document.getElementById('btnSimulateAssign')?.addEventListener('click', (e) => {
      const key = e.target.dataset.group;
      if (key) simulateAssignmentsForGroup(key);
    });

    document.getElementById('btnCloseGroup')?.addEventListener('click', ()=>hideModal('groupModal'));
    document.getElementById('btnConfirmDelete')?.addEventListener('click', confirmDelete);
    document.getElementById('btnCancelDelete')?.addEventListener('click', cancelDelete);
    document.getElementById('btnBell')?.addEventListener('click', ()=>document.getElementById('bellPopup').classList.toggle('hidden'));
    document.getElementById('btnValidateSelected')?.addEventListener('click', ()=> {
      const selected = Array.from(document.querySelectorAll('.group-checkbox:checked')).map(cb=>cb.dataset.group);
      if(!selected.length) return alert('Selecione ao menos um grupo para validar.');
      selected.forEach(k=>validateGroup(k));
    });

    // filters
    document.getElementById('btnApplyFilters')?.addEventListener('click', ()=>renderGroups());
    document.getElementById('btnClearFilters')?.addEventListener('click', ()=>{
      ['f_start','f_end','f_interval','f_operation','f_segment','f_hc_min','f_status'].forEach(id=>{
        const el = document.getElementById(id); if(el) el.value = '';
      });
      renderGroups();
    });

    // Interval input validation (both filter and sidebar single input)
    const intervalInput = document.getElementById('f_interval');
    const sidebarIntervalInput = document.getElementById('s_interval');

    [intervalInput, sidebarIntervalInput].forEach(inp=>{
      if(!inp) return;
      inp.addEventListener('change', function(){
        validateTimeInput(this);
        // If value contains seconds (HH:MM:SS) reduce to HH:MM for UI consistency
        if(this.value && this.value.length >= 5){
          const hhmm = timeToHHMM(this.value);
          if(hhmm && this.tagName.toLowerCase() !== 'select'){
            // keep input as "HH:MM" for time inputs (browser manages seconds)
            this.value = hhmm;
          }
        }
      });
      inp.addEventListener('blur', function(){ validateTimeInput(this); });
      inp.addEventListener('input', function(e){
        const value = e.target.value;
        if (value.length === 2 && !value.includes(':')) { e.target.value = value + ':'; }
      });
    });

    // Bell popup: click outside hides
    document.addEventListener('click', (ev) => {
      const bell = document.getElementById('btnBell');
      const popup = document.getElementById('bellPopup');
      if(!popup) return;
      if(bell && bell.contains(ev.target)) return;
      if(popup.contains(ev.target)) return;
      popup.classList.add('hidden');
    });
  }

  // ---------- Simular criação de grupos (máx MAX_GROUPS_ALLOWED grupos distintos) ----------
  function simulateCreateGroups(){
    const existingGroupKeys = new Set(state.records.filter(r => !isExpired(r)).map(r => `${r.start_date}|${r.end_date}|${r.segment||''}|${r.operation||''}`));
    const existingCount = existingGroupKeys.size;

    const MAX_GROUPS_CREATE = MAX_GROUPS_ALLOWED - existingCount;
    if (MAX_GROUPS_CREATE <= 0) { alert(`Já existem o número máximo de grupos simulados (${MAX_GROUPS_ALLOWED}).`); return; }

    const MAX_TOTAL_RECORDS = 8;
    const currentTotalRecords = state.records.length;
    const remainingRecordSlots = Math.max(0, MAX_TOTAL_RECORDS - currentTotalRecords);
    if (remainingRecordSlots <= 0) return alert(`Limite total de registros atingido (${MAX_TOTAL_RECORDS}). Limpe a lista para gerar novos grupos.`);

    const ops = ['TIM','VIVO','CLARO','OI'];
    const segs = ['PRÉ PAGO ESE BH','CONTROLE FRONT MOC','CONTROLE GRE BH','LABS LAB'];
    const intervalsPool = ['07:00:00','07:10:00','07:20:00','08:00:00','08:10:00','09:00:00','10:00:00','11:00:00'];

    const today = new Date();
    let createdRecords = 0;
    for (let g = 0; g < MAX_GROUPS_CREATE; g++) {
      if (state.records.length >= MAX_TOTAL_RECORDS) break;

      const s = new Date(today); s.setDate(s.getDate() + g);
      const e = new Date(s); e.setDate(s.getDate() + 2);
      const start_date = `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}-${String(s.getDate()).padStart(2,'0')}`;
      const end_date = `${e.getFullYear()}-${String(e.getMonth()+1).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}`;
      const operation = ops[(existingCount + g) % ops.length];
      const segment = segs[(existingCount + g) % segs.length];

      const maxSlotsLeft = MAX_TOTAL_RECORDS - state.records.length;
      const desiredIntervals = Math.min(3, maxSlotsLeft);
      for (let i = 0; i < desiredIntervals; i++) {
        const interval = intervalsPool[(i + g) % intervalsPool.length];
        const hc = 1 + Math.floor(Math.random() * 8);
        const rec = {
          id: uid('r_'),
          start_date, end_date,
          dmm: `${1+g}°`,
          operation, segment,
          interval_start: interval,
          hc_requested: hc,
          he_minutes: hcToMinutes(hc),
          assigned_hc: 0,
          assigned_he_minutes: 0,
          assignments: [],
          status: 'Pendente',
          created_at: new Date().toISOString(),
          created_by: `${IMPORTER_NAME} (${IMPORTER_MATRICULA})`
        };
        state.records.push(rec);
        createdRecords++;
        if (state.records.length >= MAX_TOTAL_RECORDS) break;
      }
    }

    if (createdRecords > 0) {
      saveState();
      renderGroups();
      alert(`${createdRecords} registro(s) simulados em até ${MAX_GROUPS_CREATE} grupo(s). (Limite total: ${MAX_TOTAL_RECORDS})`);
    } else {
      alert('Não foi possível criar novos grupos: limite atingido ou nenhum slot disponível.');
    }
  }

  // ---------- Start ----------
  function start(){
    loadState();

    // === Regra solicitada: ao recarregar a página limpar registros e criar 1 grupo Pendente ===
    // Mantemos colaboradores/notifications, mas resetamos os registros para um único registro pendente.
    state.records = [];
    // seed single demo (pendente) — garante comportamento antigo (F5 => 1 grupo Pendente)
    state.records.push({
      id: uid('r_'),
      start_date: todayStr(),
      end_date: todayStr(),
      operation: 'TIM',
      segment: 'PRÉ PAGO ESE BH',
      interval_start: '07:00:00',
      hc_requested: 4,
      he_minutes: hcToMinutes(4),
      assigned_he_minutes: 0,
      assigned_hc: 0,
      assignments: [],
      status: 'Pendente',
      created_at: new Date().toISOString(),
      created_by: `${IMPORTER_NAME} (${IMPORTER_MATRICULA})`
    });
    saveState();
    // ===================================================================================

    initializeClock();
    initIntervals();
    bindUI();

    renderGroups();
    renderBell();
  }

  // ---------- Planning charts (demonstrativo) ----------
  let _planningCharts = { a: null, b: null, c: null };

  function renderPlanningCharts(){
    const recs = state.records || [];

    // HE por segmento
    const segMap = {};
    recs.forEach(r => {
      const seg = r.segment || 'Sem segmento';
      segMap[seg] = (segMap[seg] || 0) + ((Number(r.he_minutes) || 0) / 60);
    });
    const segLabels = Object.keys(segMap);
    const segValues = segLabels.map(l => Number((segMap[l] || 0).toFixed(2)));

    // Tendência HE Atribuída por dia (últimos 7 dias)
    const dayMap = {};
    for(let i=6;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0,10);
      dayMap[key] = 0;
    }
    recs.forEach(r => {
      const assigned = Number(r.assigned_he_minutes || 0);
      const created = r.created_at ? r.created_at.slice(0,10) : null;
      if (created && dayMap.hasOwnProperty(created)) dayMap[created] += assigned / 60;
    });
    const trendLabels = Object.keys(dayMap);
    const trendValues = trendLabels.map(k => Number((dayMap[k] || 0).toFixed(2)));

    // Distribuição HC por operação
    const opMap = {};
    recs.forEach(r => {
      const op = r.operation || 'Sem operação';
      opMap[op] = (opMap[op] || 0) + (Number(r.hc_requested) || 0);
    });
    const opLabels = Object.keys(opMap);
    const opValues = opLabels.map(l => opMap[l]);

    try { if(_planningCharts.a) _planningCharts.a.destroy(); if(_planningCharts.b) _planningCharts.b.destroy(); if(_planningCharts.c) _planningCharts.c.destroy(); } catch(e){}

    const ctxA = document.getElementById('chart_he_by_segment');
    if(ctxA) _planningCharts.a = new Chart(ctxA, {
      type: 'doughnut',
      data: { labels: segLabels, datasets: [{ data: segValues }] },
      options: { plugins: { legend: { position: 'bottom' } }, maintainAspectRatio: false }
    });

    const ctxB = document.getElementById('chart_he_trend');
    if(ctxB) _planningCharts.b = new Chart(ctxB, {
      type: 'line',
      data: { labels: trendLabels, datasets: [{ label: 'HE Atribuída (h)', data: trendValues, fill: false, tension: 0.3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } }, maintainAspectRatio: false }
    });

    const ctxC = document.getElementById('chart_hc_by_operation');
    if(ctxC) _planningCharts.c = new Chart(ctxC, {
      type: 'bar',
      data: { labels: opLabels, datasets: [{ label: 'HC solicitadas', data: opValues }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } }, maintainAspectRatio: false }
    });
  }

  // ---------- Input time validation ----------
  function validateTimeInput(input) {
    if (!input) return true;
    if (!input.value) { input.setCustomValidity(''); return true; }

    // Accept "HH:MM" or "HH:MM:SS"
    const val = String(input.value).trim();
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;
    if (!timeRegex.test(val)) {
      input.setCustomValidity('Formato inválido. Use HH:MM (ex: 13:10) ou HH:MM:SS');
      return false;
    }

    const parts = val.split(':').map(Number);
    const minutes = parts[1] || 0;
    if (minutes % 10 !== 0) {
      input.setCustomValidity('Os minutos devem ser múltiplos de 10 (00, 10, 20, 30, 40, 50)');
      return false;
    }

    input.setCustomValidity('');
    return true;
  }

  // ---------- Expose helpers for debug ----------
  window._TABI = { state, renderGroups, openGroupModal, simulateAssignmentsForGroup, saveState, simulateCreateGroups, renderPlanningCharts };

  // ---------- Bootstrap on DOM ready ----------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

})();
