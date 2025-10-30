// supervisor.js - Versão completa e corrigida com novo design e relatório de HE
import { state, loadState, saveState, addLog } from './common.js';

// Garantir estado carregado
loadState();

/* ---------- Utils ---------- */
function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeNotice(text, icon = 'ℹ️') {
  const div = document.createElement('div');
  div.className = 'empty-state';
  div.innerHTML = `
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-text">${text}</div>
    <div class="empty-state-subtext">Use o botão "Reset Demo" para criar dados de exemplo</div>
  `;
  return div;
}

function formatMinutes(minutes) {
  if (!minutes || minutes === 0) return '0 min';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function calculateEligibilityScore(collaborator) {
  let score = 0;
  if (collaborator.bancoHoras && collaborator.bancoHoras < 0) score += 3;
  if (collaborator.produtividade && collaborator.produtividade >= 80) score += 2;
  if (!collaborator.restricoes || collaborator.restricoes.length === 0) score += 1;
  return score;
}

function getEligibilityLevel(score) {
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

/* ---------- Group stats ---------- */
function computeGroupStats(groupKey) {
  const recs = (state.records || []).filter(
    (r) => `${r.date}|${r.segment || ''}|${r.operation || ''}` === groupKey
  );

  const he_total_min = recs.reduce((s, r) => s + (r.he_minutes || 0), 0);
  const hc_total = recs.reduce((s, r) => s + (r.hc_requested || 0), 0);
  const hc_with_he = recs.reduce((s, r) => s + ((r.he_minutes && r.he_minutes > 0) ? (r.hc_requested || 0) : 0), 0);

  let assignedHC = 0;
  let assignedMinutes = 0;
  recs.forEach((r) => {
    const arr = (state.assignments && state.assignments[r.id]) || [];
    assignedHC += arr.length;
    assignedMinutes += arr.reduce((sum, a) => sum + (a.heMinutes || 0), 0);
  });

  const remainingMinutes = he_total_min - assignedMinutes;
  const progressPercentage = he_total_min > 0 ? (assignedMinutes / he_total_min) * 100 : 0;

  return {
    recs,
    he_total_min,
    hc_total,
    hc_with_he,
    assignedHC,
    assignedMinutes,
    remainingMinutes,
    remainingHC: hc_total - assignedHC,
    progressPercentage
  };
}

/* ---------- Render: Grupos validados (NOVO DESIGN) ---------- */
export function renderSupervisor() {
  loadState();
  const container = document.getElementById('validated_groups');
  if (!container) return;
  container.innerHTML = '';

  if (!Array.isArray(state.records) || !state.records.length) {
    container.appendChild(makeNotice('Nenhum registro encontrado', '📋'));
    renderAssignedCollaborators();
    renderHEReport();
    return;
  }
  if (!state.validations || Object.keys(state.validations).length === 0) {
    container.appendChild(makeNotice('Nenhum grupo validado encontrado', '⏳'));
    renderAssignedCollaborators();
    renderHEReport();
    return;
  }

  const start = document.getElementById('s_start')?.value;
  const end = document.getElementById('s_end')?.value;
  const segFilter = document.getElementById('s_segment')?.value;

  const keys = Object.keys(state.validations || {});
  keys.sort((a,b) => b.localeCompare(a));

  keys.forEach((key) => {
    const [date, segment, operation] = key.split('|');
    if (start && date < start) return;
    if (end && date > end) return;
    if (segFilter && segment !== segFilter) return;

    const stats = computeGroupStats(key);

    // Novo Card Design
    const card = document.createElement('div');
    card.className = 'group-card-modern';

    // Header
    const header = document.createElement('div');
    header.className = 'group-header-modern';
    
    const info = document.createElement('div');
    info.className = 'group-info-modern';
    
    const title = document.createElement('div');
    title.className = 'group-title-modern';
    title.textContent = `${segment} | ${operation}`;
    
    const subtitle = document.createElement('div');
    subtitle.className = 'group-subtitle-modern';
    subtitle.innerHTML = `
      <span> ${date}</span>
      <span>•</span>
      <span> Validado por: ${state.validations[key]?.validatedBy || 'Sistema'}</span>
    `;
    
    info.appendChild(title);
    info.appendChild(subtitle);
    header.appendChild(info);
    
    const availabilityBadge = document.createElement('div');
    availabilityBadge.className = `availability-badge-modern ${stats.remainingMinutes > 0 ? 'availability-high' : 'availability-low'}`;
    availabilityBadge.textContent = stats.remainingMinutes > 0 ? 'Disponível' : 'Completo';
    header.appendChild(availabilityBadge);
    
    card.appendChild(header);

    // Statistics Grid
    const statsGrid = document.createElement('div');
    statsGrid.className = 'group-stats-modern';
    
    const statItems = [
      { label: 'HE Total', value: formatMinutes(stats.he_total_min) },
      { label: 'HC Total', value: stats.hc_total },
      { label: 'Atribuídas', value: stats.assignedHC },
      { label: 'Restante', value: stats.remainingHC }
    ];
    
    statItems.forEach((s) => {
      const stat = document.createElement('div');
      stat.className = 'stat-modern';
      const value = document.createElement('div');
      value.className = 'stat-value-modern';
      value.textContent = String(s.value);
      const label = document.createElement('div');
      label.className = 'stat-label-modern';
      label.textContent = s.label;
      stat.appendChild(value);
      stat.appendChild(label);
      statsGrid.appendChild(stat);
    });
    
    card.appendChild(statsGrid);

    // Progress Bar
    const progressSection = document.createElement('div');
    progressSection.className = 'progress-section';
    
    const progressHeader = document.createElement('div');
    progressHeader.className = 'progress-header';
    
    const progressLabel = document.createElement('div');
    progressLabel.className = 'progress-label';
    progressLabel.textContent = 'Progresso da Atribuição';
    
    const progressValue = document.createElement('div');
    progressValue.className = 'progress-value';
    progressValue.textContent = `${Math.round(stats.progressPercentage)}%`;
    
    progressHeader.appendChild(progressLabel);
    progressHeader.appendChild(progressValue);
    
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.width = `${stats.progressPercentage}%`;
    
    progressBar.appendChild(progressFill);
    progressSection.appendChild(progressHeader);
    progressSection.appendChild(progressBar);
    card.appendChild(progressSection);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'group-actions-modern';
    
    const summary = document.createElement('div');
    summary.innerHTML = `
      <div style="font-size: 0.875rem; color: var(--text-muted);">
        <strong>${formatMinutes(stats.assignedMinutes)}</strong> de <strong>${formatMinutes(stats.he_total_min)}</strong> atribuídos
      </div>
    `;
    
    const btnAssign = document.createElement('button');
    btnAssign.className = 'btn btn-primary';
    btnAssign.innerHTML = ' Atribuir Colaboradores';
    btnAssign.addEventListener('click', () => openAssignModal(key));
    
    actions.appendChild(summary);
    actions.appendChild(btnAssign);
    card.appendChild(actions);

    container.appendChild(card);
  });

  renderAssignedCollaborators();
  renderHEReport();
}

/* ---------- Render: Colaboradores atribuídos (NOVO DESIGN) ---------- */
export function renderAssignedCollaborators() {
  loadState();
  const container = document.getElementById('assigned_collaborators');
  if (!container) return;
  container.innerHTML = '';

  // Aggregate assignments
  const assignments = state.assignments || {};
  const recsById = (state.records || []).reduce((acc, r) => {
    acc[r.id] = r;
    return acc;
  }, {});

  const byColl = {};
  Object.keys(assignments).forEach((recId) => {
    (assignments[recId] || []).forEach((a) => {
      if (!byColl[a.matricula]) {
        byColl[a.matricula] = { totalMinutes: 0, items: [] };
      }
      byColl[a.matricula].totalMinutes += (a.heMinutes || 0);
      const rec = recsById[recId];
      byColl[a.matricula].items.push({
        recId,
        assignmentId: a.id,
        interval: rec?.interval_start || '-',
        heMinutes: a.heMinutes || 0,
        groupKey: `${rec?.date}|${rec?.segment||''}|${rec?.operation||''}`,
        date: rec?.date
      });
    });
  });

  const mats = Object.keys(byColl).sort();

  if (mats.length === 0) {
    container.appendChild(makeNotice('Nenhum colaborador com HE atribuída', '👥'));
    return;
  }

  const collaboratorIndex = (state.collaborators || []).reduce((acc, coll) => {
    acc[String(coll.matricula)] = coll;
    return acc;
  }, {});

  const assignedItems = mats.map((mat) => {
    const coll = collaboratorIndex[String(mat)];
    const data = byColl[mat];
    const coordinatorIdRaw = coll?.coordenadorId || null;
    const supervisorIdRaw = coll?.supervisorId || null;
    const coordinatorId = coordinatorIdRaw || 'none';
    const supervisorId = supervisorIdRaw || 'none';
    const coordinatorName = coordinatorIdRaw && collaboratorIndex[String(coordinatorIdRaw)]
      ? collaboratorIndex[String(coordinatorIdRaw)].nome
      : 'Sem Coordenador';
    const supervisorName = supervisorIdRaw && collaboratorIndex[String(supervisorIdRaw)]
      ? collaboratorIndex[String(supervisorIdRaw)].nome
      : 'Sem Supervisor';

    return {
      matricula: mat,
      coll,
      data,
      coordinatorId,
      supervisorId,
      coordinatorName,
      supervisorName,
      searchText: normalizeText(`${coll?.nome || ''} ${mat} ${coordinatorName} ${supervisorName}`)
    };
  });

  const coordinatorOptions = Array.from(
    assignedItems.reduce((map, item) => {
      if (!map.has(item.coordinatorId)) {
        map.set(item.coordinatorId, item.coordinatorName);
      }
      return map;
    }, new Map())
  ).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { sensitivity: 'base' }));

  const filtersCard = document.createElement('div');
  filtersCard.className = 'assigned-filters';

  let selectedCoordinator = 'all';
  let selectedSupervisor = 'all';
  let searchTerm = '';

  const coordinatorGroup = document.createElement('div');
  coordinatorGroup.className = 'assigned-filter-group';
  const coordinatorLabel = document.createElement('label');
  coordinatorLabel.textContent = 'Coordenador';
  const coordinatorSelect = document.createElement('select');
  coordinatorSelect.className = 'assigned-filter-select';

  const supervisorGroup = document.createElement('div');
  supervisorGroup.className = 'assigned-filter-group';
  const supervisorLabel = document.createElement('label');
  supervisorLabel.textContent = 'Supervisor';
  const supervisorSelect = document.createElement('select');
  supervisorSelect.className = 'assigned-filter-select';

  const searchGroup = document.createElement('div');
  searchGroup.className = 'assigned-filter-group';
  const searchLabel = document.createElement('label');
  searchLabel.textContent = 'Buscar';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Nome, matrícula ou hierarquia';
  searchInput.className = 'assigned-filter-search';

  const actionsGroup = document.createElement('div');
  actionsGroup.className = 'assigned-filter-actions';
  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'assigned-filter-clear';
  clearButton.textContent = 'Limpar filtros';

  const assignedGrid = document.createElement('div');
  assignedGrid.className = 'assigned-grid';

  function populateCoordinatorOptions() {
    coordinatorSelect.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Todos os coordenadores';
    coordinatorSelect.appendChild(allOption);

    coordinatorOptions.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      coordinatorSelect.appendChild(option);
    });

    coordinatorSelect.value = selectedCoordinator;
  }

  function getSupervisorOptions(coordId) {
    const optionsMap = assignedItems.reduce((map, item) => {
      if (coordId !== 'all' && item.coordinatorId !== coordId) return map;
      if (!map.has(item.supervisorId)) {
        map.set(item.supervisorId, item.supervisorName);
      }
      return map;
    }, new Map());

    return Array.from(optionsMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], 'pt-BR', { sensitivity: 'base' })
    );
  }

  function populateSupervisorOptions() {
    const options = getSupervisorOptions(selectedCoordinator);
    supervisorSelect.innerHTML = '';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Todos os supervisores';
    supervisorSelect.appendChild(allOption);

    options.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      supervisorSelect.appendChild(option);
    });

    if (selectedSupervisor !== 'all' && !options.some(([value]) => value === selectedSupervisor)) {
      selectedSupervisor = 'all';
    }

    supervisorSelect.value = selectedSupervisor;
  }

  function renderCards() {
    assignedGrid.innerHTML = '';

    const filteredItems = assignedItems.filter((item) => {
      if (selectedCoordinator !== 'all' && item.coordinatorId !== selectedCoordinator) return false;
      if (selectedSupervisor !== 'all' && item.supervisorId !== selectedSupervisor) return false;
      if (searchTerm && !item.searchText.includes(searchTerm)) return false;
      return true;
    });

    if (!filteredItems.length) {
      const empty = document.createElement('div');
      empty.className = 'assigned-empty';
      empty.innerHTML = `
        <div class="assigned-empty-title">Nenhum colaborador encontrado</div>
        <div class="assigned-empty-subtitle">Ajuste os filtros ou limpe para visualizar novamente.</div>
      `;
      assignedGrid.appendChild(empty);
      return;
    }

    filteredItems.forEach((item) => {
      const { coll, data, matricula } = item;

      const card = document.createElement('div');
      card.className = 'assigned-card';

      const header = document.createElement('div');
      header.className = 'assigned-header';

      const avatar = document.createElement('div');
      avatar.className = 'assigned-avatar';
      const avatarSource = coll?.nome || `Colaborador ${matricula}`;
      avatar.textContent = avatarSource.trim().charAt(0).toUpperCase() || 'C';

      const info = document.createElement('div');
      info.className = 'assigned-info';

      const name = document.createElement('div');
      name.className = 'assigned-name';
      name.textContent = coll?.nome || `Colaborador ${matricula}`;

      const meta = document.createElement('div');
      meta.className = 'assigned-meta';
      meta.innerHTML = `
        <div>Matrícula: <strong>${matricula}</strong></div>
        <div>${data.items.length} intervalo(s) atribuído(s)</div>
      `;

      const hierarchy = document.createElement('div');
      hierarchy.className = 'assigned-hierarchy';
      hierarchy.innerHTML = `
        <span class="hierarchy-node">${item.coordinatorName}</span>
        <span class="hierarchy-separator">›</span>
        <span class="hierarchy-node">${item.supervisorName}</span>
      `;

      info.appendChild(name);
      info.appendChild(meta);
      info.appendChild(hierarchy);
      header.appendChild(avatar);
      header.appendChild(info);
      card.appendChild(header);

      const stats = document.createElement('div');
      stats.className = 'assigned-stats';

      const average = data.items.length > 0
        ? Math.round(data.totalMinutes / data.items.length)
        : 0;

      const statItems = [
        { label: 'HE Total', value: formatMinutes(data.totalMinutes) },
        { label: 'Intervalos', value: data.items.length },
        { label: 'Média/HE', value: formatMinutes(average) }
      ];

      statItems.forEach((s) => {
        const stat = document.createElement('div');
        stat.className = 'assigned-stat';
        const value = document.createElement('div');
        value.className = 'assigned-stat-value';
        value.textContent = String(s.value);
        const label = document.createElement('div');
        label.className = 'assigned-stat-label';
        label.textContent = s.label;
        stat.appendChild(value);
        stat.appendChild(label);
        stats.appendChild(stat);
      });

      card.appendChild(stats);

      const intervals = document.createElement('div');
      intervals.className = 'assigned-intervals';

      data.items.slice(0, 3).forEach((it) => {
        const interval = document.createElement('div');
        interval.className = 'interval-item';

        const time = document.createElement('div');
        time.className = 'interval-time';
        time.textContent = `${it.date} - ${it.interval}`;

        const minutes = document.createElement('div');
        minutes.className = 'interval-minutes';
        minutes.textContent = formatMinutes(it.heMinutes);

        interval.appendChild(time);
        interval.appendChild(minutes);
        intervals.appendChild(interval);
      });

      if (data.items.length > 3) {
        const more = document.createElement('div');
        more.className = 'interval-item';
        more.style.textAlign = 'center';
        more.style.color = 'var(--text-muted)';
        more.textContent = `... e mais ${data.items.length - 3} intervalo(s)`;
        intervals.appendChild(more);
      }

      card.appendChild(intervals);

      const actions = document.createElement('div');
      actions.className = 'assigned-actions';

      const btnEdit = document.createElement('button');
      btnEdit.className = 'btn btn-warning';
      btnEdit.innerHTML = '✏️ Editar';
      btnEdit.addEventListener('click', () => {
        if (data.items.length > 0) {
          editAssignment(data.items[0].recId, data.items[0].assignmentId, matricula);
        }
      });

      const btnRemove = document.createElement('button');
      btnRemove.className = 'btn btn-danger';
      btnRemove.innerHTML = ' Remover';
      btnRemove.addEventListener('click', () => {
        if (confirm(`Remover todas as atribuições de ${coll?.nome || matricula}?`)) {
          data.items.forEach((it) => {
            removeAssignment(it.recId, it.assignmentId, matricula);
          });
        }
      });

      const btnView = document.createElement('button');
      btnView.className = 'btn btn-secondary';
      btnView.innerHTML = ' Detalhes';
      btnView.addEventListener('click', () => {
        alert(`Detalhes de ${coll?.nome || matricula}:\n\n` +
          data.items.map(it =>
            `${it.date} - ${it.interval}: ${formatMinutes(it.heMinutes)}`
          ).join('\n')
        );
      });

      actions.appendChild(btnEdit);
      actions.appendChild(btnRemove);
      actions.appendChild(btnView);
      card.appendChild(actions);

      assignedGrid.appendChild(card);
    });
  }

  populateCoordinatorOptions();
  populateSupervisorOptions();

  coordinatorSelect.addEventListener('change', () => {
    selectedCoordinator = coordinatorSelect.value;
    selectedSupervisor = 'all';
    populateSupervisorOptions();
    renderCards();
  });

  supervisorSelect.addEventListener('change', () => {
    selectedSupervisor = supervisorSelect.value;
    renderCards();
  });

  searchInput.addEventListener('input', () => {
    searchTerm = normalizeText(searchInput.value);
    renderCards();
  });

  clearButton.addEventListener('click', () => {
    selectedCoordinator = 'all';
    selectedSupervisor = 'all';
    searchTerm = '';
    coordinatorSelect.value = 'all';
    populateSupervisorOptions();
    supervisorSelect.value = 'all';
    searchInput.value = '';
    renderCards();
  });

  coordinatorGroup.appendChild(coordinatorLabel);
  coordinatorGroup.appendChild(coordinatorSelect);
  supervisorGroup.appendChild(supervisorLabel);
  supervisorGroup.appendChild(supervisorSelect);
  searchGroup.appendChild(searchLabel);
  searchGroup.appendChild(searchInput);
  actionsGroup.appendChild(clearButton);

  filtersCard.appendChild(coordinatorGroup);
  filtersCard.appendChild(supervisorGroup);
  filtersCard.appendChild(searchGroup);
  filtersCard.appendChild(actionsGroup);

  container.appendChild(filtersCard);
  container.appendChild(assignedGrid);

  renderCards();
}

/* ---------- NOVA FUNÇÃO: Relatório de HE ---------- */
export function renderHEReport() {
  loadState();
  const container = document.getElementById('he_report');
  if (!container) return;
  container.innerHTML = '';

  // Dados de exemplo para o relatório (em produção, viria do backend)
  const reportData = generateReportData();

  if (reportData.length === 0) {
    container.appendChild(makeNotice('Nenhum dado de relatório disponível', ''));
    return;
  }

  // Tabela de Relatório
  const table = document.createElement('table');
  table.className = 'report-table';

  // Cabeçalho
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>Colaborador</th>
      <th>Matrícula</th>
      <th>HE Atribuída</th>
      <th>HE Realizada</th>
      <th>Diferença</th>
      <th>Status</th>
      <th>Última HE</th>
    </tr>
  `;
  table.appendChild(thead);

  // Corpo da tabela
  const tbody = document.createElement('tbody');
  
  reportData.forEach(item => {
    const tr = document.createElement('tr');
    
    const difference = item.heRealizada - item.heAtribuida;
    const differenceClass = difference > 0 ? 'difference-positive' : 
                           difference < 0 ? 'difference-negative' : 'difference-zero';
    const differenceText = difference > 0 ? `+${formatMinutes(difference)}` : 
                          difference < 0 ? `${formatMinutes(difference)}` : '0 min';
    
    const status = item.heRealizada >= item.heAtribuida ? 'completed' : 
                  item.heRealizada > 0 ? 'pending' : 'overdue';
    const statusText = status === 'completed' ? 'Concluída' : 
                      status === 'pending' ? 'Pendente' : 'Em Atraso';
    
    tr.innerHTML = `
      <td>
        <div style="font-weight: 600;">${item.nome}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${item.equipe}</div>
      </td>
      <td>${item.matricula}</td>
      <td style="font-weight: 600;">${formatMinutes(item.heAtribuida)}</td>
      <td style="font-weight: 600;">${formatMinutes(item.heRealizada)}</td>
      <td class="${differenceClass}">${differenceText}</td>
      <td><span class="status-badge status-${status}">${statusText}</span></td>
      <td>${item.ultimaHE}</td>
    `;
    
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);

  // Resumo do Relatório
  const summary = document.createElement('div');
  summary.className = 'report-summary';
  
  const totalAtribuida = reportData.reduce((sum, item) => sum + item.heAtribuida, 0);
  const totalRealizada = reportData.reduce((sum, item) => sum + item.heRealizada, 0);
  const totalDiferenca = totalRealizada - totalAtribuida;
  const concluidas = reportData.filter(item => item.heRealizada >= item.heAtribuida).length;
  
  const summaryItems = [
    { label: 'HE Total Atribuída', value: formatMinutes(totalAtribuida) },
    { label: 'HE Total Realizada', value: formatMinutes(totalRealizada) },
    { label: 'Diferença Total', value: formatMinutes(totalDiferenca) },
    { label: 'Colaboradores Concluídos', value: `${concluidas}/${reportData.length}` }
  ];
  
  summaryItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <div class="summary-value">${item.value}</div>
      <div class="summary-label">${item.label}</div>
    `;
    summary.appendChild(card);
  });
  
  container.appendChild(summary);
}

/* ---------- Gerar dados de exemplo para o relatório ---------- */
function generateReportData() {
  const collaborators = state.collaborators || [];
  const assignments = state.assignments || {};
  
  // Agregar HE atribuída por colaborador
  const heAtribuidaPorColl = {};
  Object.values(assignments).forEach(assignmentList => {
    assignmentList.forEach(assignment => {
      if (!heAtribuidaPorColl[assignment.matricula]) {
        heAtribuidaPorColl[assignment.matricula] = 0;
      }
      heAtribuidaPorColl[assignment.matricula] += assignment.heMinutes || 0;
    });
  });

  // Gerar dados de relatório
  return collaborators.map(coll => {
    const heAtribuida = heAtribuidaPorColl[coll.matricula] || 0;
    // Simular HE realizada (em produção, viria do sistema de ponto)
    const heRealizada = Math.floor(heAtribuida * (0.7 + Math.random() * 0.6));
    const equipes = ['Manhã', 'Tarde', 'Noite'];
    const datas = ['15/03/2024', '16/03/2024', '17/03/2024', '18/03/2024', '19/03/2024'];
    
    return {
      nome: coll.nome,
      matricula: coll.matricula,
      equipe: equipes[Math.floor(Math.random() * equipes.length)],
      heAtribuida: heAtribuida,
      heRealizada: heRealizada,
      ultimaHE: datas[Math.floor(Math.random() * datas.length)]
    };
  }).filter(item => item.heAtribuida > 0); // Apenas colaboradores com HE atribuída
}

/* ---------- Modal: Atribuição Aprimorada ---------- */
function openAssignModal(groupKey) {
  loadState();
  const modal = document.getElementById('assignModal');
  const content = document.getElementById('assign_content');
  if (!modal || !content) return alert('Modal de atribuição não encontrado.');
  content.innerHTML = '';

  const stats = computeGroupStats(groupKey);
  const recs = stats.recs;

  // Header do modal
  const hTitle = document.createElement('div');
  hTitle.style.marginBottom = '1.5rem';
  hTitle.innerHTML = `
    <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary-dark); margin-bottom: 0.5rem;">
      Atribuição de Horas Extras
    </div>
    <div style="font-size: 1.125rem; color: var(--text-primary);">
      ${groupKey}
    </div>
  `;
  content.appendChild(hTitle);

  // Resumo do Grupo
  const summary = document.createElement('div');
  summary.className = 'group-summary';
  summary.innerHTML = `
    <div class="summary-card">
      <div class="summary-label">HE Total Disponível</div>
      <div class="summary-value">${formatMinutes(stats.he_total_min)}</div>
      <div class="summary-sub">Horas Extras</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">HC Necessário</div>
      <div class="summary-value">${stats.hc_total}</div>
      <div class="summary-sub">Colaboradores</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">HC com HE</div>
      <div class="summary-value">${stats.hc_with_he}</div>
      <div class="summary-sub">Atribuições</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Disponível</div>
      <div class="summary-value">${formatMinutes(stats.remainingMinutes)}</div>
      <div class="summary-sub">${stats.remainingHC} HC restante</div>
    </div>
  `;
  content.appendChild(summary);

  // Layout principal
  const main = document.createElement('div');
  main.style.display = 'grid';
  main.style.gridTemplateColumns = '1fr 400px';
  main.style.gap = '2rem';
  main.style.marginBottom = '1.5rem';

  // LEFT: Turnos organizados em accordion
  const left = document.createElement('div');
  left.className = 'modal-accordion-column';

  const accordion = document.createElement('div');
  accordion.className = 'shifts-accordion';

  // Organizar por turnos
  const buckets = { manha: [], tarde: [], noite: [] };
  recs.forEach((r) => {
    const hh = parseInt((r.interval_start || '00:00:00').slice(0,2), 10);
    if (hh >= 6 && hh <= 11) buckets.manha.push(r);
    else if (hh >= 12 && hh <= 17) buckets.tarde.push(r);
    else buckets.noite.push(r);
  });

  const shiftDefs = [
    { id:'manha', label: ' Manhã', hours: '06:00-11:59', color: '#FCD34D' },
    { id:'tarde', label: ' Tarde', hours: '12:00-17:59', color: '#FB923C' },
    { id:'noite', label: ' Noite', hours: '18:00-05:59', color: '#A78BFA' }
  ];

  shiftDefs.forEach((sd, index) => {
    const items = buckets[sd.id] || [];
    if (!items.length) return;

    const accordionItem = document.createElement('div');
    accordionItem.className = `accordion-item ${index === 0 ? 'expanded' : ''}`;
    
    const header = document.createElement('div');
    header.className = 'accordion-header';
    header.style.background = `linear-gradient(135deg, ${sd.color} 0%, ${sd.color}dd 100%)`;
    header.innerHTML = `
      <div class="accordion-title">
        <span>${sd.label}</span>
        <small style="opacity: 0.9;">${sd.hours}</small>
      </div>
      <div class="accordion-icon">▼</div>
    `;
    
    const content = document.createElement('div');
    content.className = 'accordion-content';
    
    const intervalsGrid = document.createElement('div');
    intervalsGrid.className = 'intervals-grid';
    
    items.forEach((r) => {
      const assignedArr = (state.assignments && state.assignments[r.id]) || [];
      const assignedSum = assignedArr.reduce((s,a) => s + (a.heMinutes || 0), 0);
      const remaining = Math.max(0, (r.he_minutes || 0) - assignedSum);

      const card = document.createElement('div');
      card.className = 'interval-card';
      card.dataset.recordId = r.id;
      
      const header = document.createElement('div');
      header.className = 'interval-header';
      
      const time = document.createElement('div');
      time.className = 'interval-time';
      time.textContent = r.interval_start?.slice(0,5) || '-';
      
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'interval-checkbox';
      cb.dataset.recordId = r.id;
      
      cb.addEventListener('change', () => {
        card.classList.toggle('selected', cb.checked);
        updateSelectionSummary();
      });
      
      header.appendChild(time);
      header.appendChild(cb);
      
      const info = document.createElement('div');
      info.className = 'interval-info';
      
      const meta = document.createElement('div');
      meta.className = 'interval-meta';
      meta.innerHTML = `
        <div class="meta-item">
          <span>👥</span>
          <span>${r.hc_requested || 0} HC</span>
        </div>
        <div class="meta-item">
          <span>⏱️</span>
          <span>${formatMinutes(r.he_minutes || 0)}</span>
        </div>
      `;
      
      const motivo = document.createElement('div');
      motivo.className = 'interval-motivo';
      motivo.textContent = r.motivo || 'Sem motivo especificado';
      
      info.appendChild(meta);
      info.appendChild(motivo);
      
      const controls = document.createElement('div');
      controls.className = 'interval-controls';
      
      const inputGroup = document.createElement('div');
      inputGroup.className = 'minutes-input-group';
      
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(remaining);
      input.value = '0';
      input.className = 'minutes-input';
      input.dataset.recordId = r.id;
      input.dataset.maxMinutes = remaining;
      
      input.addEventListener('change', updateSelectionSummary);
      
      const label = document.createElement('span');
      label.className = 'minutes-label';
      label.textContent = 'minutos';
      
      inputGroup.appendChild(input);
      inputGroup.appendChild(label);
      
      const badge = document.createElement('div');
      badge.className = 'availability-badge';
      badge.textContent = `Disponível: ${formatMinutes(remaining)}`;
      badge.style.background = remaining > 0 ? 'var(--success)' : 'var(--danger)';
      
      controls.appendChild(inputGroup);
      controls.appendChild(badge);
      
      card.appendChild(header);
      card.appendChild(info);
      card.appendChild(controls);
      intervalsGrid.appendChild(card);
    });
    
    content.appendChild(intervalsGrid);
    accordionItem.appendChild(header);
    accordionItem.appendChild(content);
    
    header.addEventListener('click', () => {
      accordionItem.classList.toggle('expanded');
    });
    
    accordion.appendChild(accordionItem);
  });

  left.appendChild(accordion);

  const selectionSummary = document.createElement('div');
  selectionSummary.className = 'selection-summary-enhanced';
  selectionSummary.id = 'selection-summary-enhanced';
  left.appendChild(selectionSummary);

  main.appendChild(left);

  // RIGHT: Lista de colaboradores com filtros
  const right = document.createElement('div');
  
  // Filtros de colaboradores
  const filters = document.createElement('div');
  filters.className = 'collaborator-filters-enhanced';
  
  const filterRow = document.createElement('div');
  filterRow.className = 'filter-row';
  
  // Filtro de Hierarquia
  const hierarchySection = document.createElement('div');
  const hierarchyLabel = document.createElement('div');
  hierarchyLabel.textContent = 'Hierarquia:';
  hierarchyLabel.style.fontSize = '0.875rem';
  hierarchyLabel.style.color = 'var(--text-muted)';
  hierarchyLabel.style.marginBottom = '0.5rem';
  hierarchyLabel.style.fontWeight = '600';
  
  const hierarchyFilters = document.createElement('div');
  hierarchyFilters.className = 'hierarchy-filters';
  
  const hierarchyOptions = [
    { id: 'all', label: 'Todos' },
    { id: 'gerente', label: 'Gerente' },
    { id: 'coordenador', label: 'Coordenador' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'colaborador', label: 'Colaborador' }
  ];
  
  let currentHierarchyFilter = 'all';
  
  hierarchyOptions.forEach(option => {
    const filter = document.createElement('button');
    filter.className = `hierarchy-filter ${option.id === 'all' ? 'active' : ''}`;
    filter.textContent = option.label;
    filter.dataset.role = option.id;
    
    filter.addEventListener('click', () => {
      hierarchyFilters.querySelectorAll('.hierarchy-filter').forEach(f => f.classList.remove('active'));
      filter.classList.add('active');
      currentHierarchyFilter = option.id;
      renderModalColls();
    });
    
    hierarchyFilters.appendChild(filter);
  });
  
  hierarchySection.appendChild(hierarchyLabel);
  hierarchySection.appendChild(hierarchyFilters);
  
  // Busca
  const searchSection = document.createElement('div');
  const searchBox = document.createElement('div');
  searchBox.className = 'search-box-enhanced';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Buscar colaborador...';
  search.className = 'search-input-enhanced';
  searchBox.appendChild(search);
  searchSection.appendChild(searchBox);
  
  // Filtros de Elegibilidade
  const tagsSection = document.createElement('div');
  const filterTags = document.createElement('div');
  filterTags.className = 'filter-tags-enhanced';
  
  const tagOptions = [
    { id: 'negative-hours', label: ' Banco Negativo', icon: '' },
    { id: 'high-productivity', label: ' Baixa Produtividade', icon: '' },
    { id: 'no-restrictions', label: ' Sem Restrições', icon: '' }
  ];
  
  tagOptions.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'filter-tag-enhanced';
    btn.innerHTML = `${tag.icon} ${tag.label}`;
    btn.dataset.tagId = tag.id;
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      renderModalColls();
    });
    filterTags.appendChild(btn);
  });
  
  tagsSection.appendChild(filterTags);
  
  filterRow.appendChild(hierarchySection);
  filterRow.appendChild(searchSection);
  filterRow.appendChild(tagsSection);
  filters.appendChild(filterRow);
  right.appendChild(filters);
  
  // Lista de colaboradores
  const collCard = document.createElement('div');
  collCard.className = 'collaborator-list-enhanced';
  
  const collList = document.createElement('div');
  collList.className = 'collaborator-items-enhanced';
  collList.id = 'modal_coll_list';
  
  let selectedCollaborators = new Set();
  
  function renderModalColls() {
    collList.innerHTML = '';
    let allColls = state.collaborators || [];
    
    // Calcular elegibilidade para cada colaborador
    allColls = allColls.map(c => ({
      ...c,
      eligibilityScore: calculateEligibilityScore(c),
      eligibilityLevel: getEligibilityLevel(calculateEligibilityScore(c))
    }));
    
    // Ordenar por elegibilidade (maior score primeiro)
    allColls.sort((a, b) => b.eligibilityScore - a.eligibilityScore);
    
    // Aplicar filtros
    const q = (search.value || '').toLowerCase().trim();
    const activeTags = Array.from(filterTags.querySelectorAll('.filter-tag-enhanced.active')).map(t => t.dataset.tagId);
    
    const filtered = allColls.filter((c) => {
      // Filtro de hierarquia
      if (currentHierarchyFilter !== 'all' && c.role !== currentHierarchyFilter) {
        return false;
      }
      
      // Filtro de busca
      if (q) {
        const searchable = `${c.nome || ''} ${c.matricula || ''}`.toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      
      // Filtros de tags
      if (activeTags.includes('negative-hours') && (!c.bancoHoras || c.bancoHoras >= 0)) return false;
      if (activeTags.includes('high-productivity') && (!c.produtividade || c.produtividade < 80)) return false;
      if (activeTags.includes('no-restrictions') && (c.restricoes && c.restricoes.length > 0)) return false;
      
      return true;
    });

    if (!filtered.length) {
      collList.innerHTML = '<div style="padding: 2rem; text-align: center;" class="text-muted">Nenhum colaborador encontrado</div>';
      return;
    }

    filtered.forEach((c) => {
      const item = document.createElement('div');
      item.className = `collaborator-item-enhanced ${selectedCollaborators.has(c.matricula) ? 'selected' : ''}`;
      
      const indicator = document.createElement('div');
      indicator.className = `eligibility-indicator-enhanced eligibility-${c.eligibilityLevel}`;
      item.appendChild(indicator);
      
      const avatar = document.createElement('div');
      avatar.className = 'collaborator-avatar-enhanced';
      avatar.textContent = (c.nome || 'C')[0].toUpperCase();
      
      const info = document.createElement('div');
      info.className = 'collaborator-info-enhanced';
      
      const name = document.createElement('div');
      name.className = 'collaborator-name-enhanced';
      name.textContent = c.nome || c.matricula;
      
      const role = document.createElement('div');
      role.className = 'collaborator-role';
      role.textContent = c.role || 'Colaborador';
      
      const meta = document.createElement('div');
      meta.className = 'collaborator-meta-enhanced';
      meta.innerHTML = `
        <span> ${c.matricula}</span>
        ${c.bancoHoras ? `<span> ${c.bancoHoras}h</span>` : ''}
        ${c.produtividade ? `<span> ${c.produtividade}%</span>` : ''}
      `;
      
      info.appendChild(name);
      info.appendChild(role);
      info.appendChild(meta);
      
      const badges = document.createElement('div');
      badges.className = 'eligibility-badges-enhanced';
      
      if (c.bancoHoras && c.bancoHoras < 0) {
        const badge = document.createElement('div');
        badge.className = 'eligibility-badge-enhanced badge-negative-hours';
        badge.title = 'Banco de horas negativo';
        badge.textContent = 'B';
        badges.appendChild(badge);
      }
      
      if (c.produtividade && c.produtividade >= 80) {
        const badge = document.createElement('div');
        badge.className = 'eligibility-badge-enhanced badge-productivity';
        badge.title = 'Produtividade adequada';
        badge.textContent = 'P';
        badges.appendChild(badge);
      }
      
      if (!c.restricoes || c.restricoes.length === 0) {
        const badge = document.createElement('div');
        badge.className = 'eligibility-badge-enhanced badge-no-restrictions';
        badge.title = 'Sem restrições';
        badge.textContent = 'R';
        badges.appendChild(badge);
      }
      
      item.appendChild(avatar);
      item.appendChild(info);
      item.appendChild(badges);
      
      item.addEventListener('click', () => {
        if (selectedCollaborators.has(c.matricula)) {
          selectedCollaborators.delete(c.matricula);
          item.classList.remove('selected');
        } else {
          selectedCollaborators.add(c.matricula);
          item.classList.add('selected');
        }
        updateSelectionSummary();
      });
      
      collList.appendChild(item);
    });
  }
  
  search.addEventListener('input', renderModalColls);
  renderModalColls();
  
  collCard.appendChild(collList);
  right.appendChild(collCard);
  main.appendChild(right);
  content.appendChild(main);

  function updateSelectionSummary() {
    const selectedIntervals = Array.from(content.querySelectorAll('.interval-checkbox:checked'));
    const totalMinutes = selectedIntervals.reduce((sum, cb) => {
      const input = content.querySelector(`.minutes-input[data-record-id="${cb.dataset.recordId}"]`);
      return sum + (parseInt(input?.value || '0', 10));
    }, 0);
    
    selectionSummary.innerHTML = `
      <div class="summary-grid">
        <div class="summary-item">
          <div class="summary-item-label">Intervalos Selecionados</div>
          <div class="summary-item-value">${selectedIntervals.length}</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-label">Colaboradores Selecionados</div>
          <div class="summary-item-value">${selectedCollaborators.size}</div>
        </div>
        <div class="summary-item">
          <div class="summary-item-label">Total de Minutos</div>
          <div class="summary-item-value">${formatMinutes(totalMinutes)}</div>
        </div>
      </div>
    `;
  }
  
  updateSelectionSummary();

  // Footer com botões de ação
  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'space-between';
  footer.style.alignItems = 'center';
  footer.style.marginTop = '1.5rem';
  
  const infoText = document.createElement('div');
  infoText.style.fontSize = '0.875rem';
  infoText.style.color = 'var(--text-muted)';
  infoText.textContent = ` Selecione os intervalos e colaboradores para atribuição`;
  
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '0.5rem';
  
  const btnCancel = document.createElement('button');
  btnCancel.className = 'btn btn-secondary';
  btnCancel.textContent = 'Cancelar';
  
  const btnAssign = document.createElement('button');
  btnAssign.className = 'btn btn-success';
  btnAssign.innerHTML = ' Confirmar Atribuição';

  btnCancel.addEventListener('click', () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });

  btnAssign.addEventListener('click', () => {
    const selectedIntervals = Array.from(content.querySelectorAll('.interval-checkbox:checked')).map(cb => cb.dataset.recordId);
    if (!selectedIntervals.length) {
      alert('⚠️ Selecione pelo menos um intervalo.');
      return;
    }

    if (!selectedCollaborators.size) {
      alert('⚠️ Selecione pelo menos um colaborador.');
      return;
    }

    const toAssign = [];
    for (const recId of selectedIntervals) {
      const input = content.querySelector(`.minutes-input[data-record-id="${recId}"]`);
      if (!input) continue;
      const minutes = parseInt(input.value || '0', 10);
      const max = parseInt(input.dataset.maxMinutes || '0', 10);
      
      if (!minutes || minutes <= 0) {
        alert(` Informe os minutos para o intervalo selecionado.`);
        return;
      }
      if (minutes > max) {
        alert(` Valor excede o disponível (máx: ${max} min).`);
        return;
      }
      toAssign.push({ recId, minutes, max });
    }

    // Distribuir minutos entre colaboradores
    const collaboratorsArray = Array.from(selectedCollaborators);
    toAssign.forEach((item) => {
      const { recId, minutes } = item;
      const K = collaboratorsArray.length;
      const base = Math.floor(minutes / K);
      let remainder = minutes % K;
      
      for (let i = 0; i < K; i++) {
        const assignedPart = base + (remainder > 0 ? 1 : 0);
        if (remainder > 0) remainder--;
        
        if (!state.assignments) state.assignments = {};
        if (!state.assignments[recId]) state.assignments[recId] = [];
        
        state.assignments[recId].push({
          id: uid('a_'),
          matricula: collaboratorsArray[i],
          heMinutes: assignedPart,
          assignedAt: new Date().toISOString(),
          assignedBy: 'Supervisor'
        });
      }
      
      const rec = (state.records || []).find(r => r.id === recId);
      if (rec) {
        rec.status = 'Atribuído';
        rec.assigned_at = new Date().toISOString();
        rec.assigned_by = 'Supervisor';
      }
    });

    saveState();
    addLog('Atribuição', `${toAssign.length} intervalo(s) para ${collaboratorsArray.length} colaborador(es)`);
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    renderSupervisor();
    alert(' Atribuições realizadas com sucesso!');
  });

  actions.appendChild(btnCancel);
  actions.appendChild(btnAssign);
  footer.appendChild(infoText);
  footer.appendChild(actions);
  content.appendChild(footer);

  // Close button handlers
  document.getElementById('btnCloseAssign2')?.addEventListener('click', () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });
  
  document.getElementById('btnCloseAssignFooter2')?.addEventListener('click', () => {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  });

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

/* ---------- Edit / Remove ---------- */
function editAssignment(recId, assignmentId, matricula) {
  const arr = state.assignments[recId] || [];
  const a = arr.find(x => x.id === assignmentId);
  if (!a) return alert('Atribuição não encontrada.');

  const rec = (state.records || []).find(r => r.id === recId);
  const assignedOther = arr.filter(x => x.id !== assignmentId).reduce((s,x) => s + (x.heMinutes||0), 0);
  const maxAllowed = (rec?.he_minutes || 0) - assignedOther;

  const currentFormatted = formatMinutes(a.heMinutes);
  const maxFormatted = formatMinutes(maxAllowed);
  
  const newValStr = prompt(
    `Editar HE para ${matricula}\nAtual: ${currentFormatted}\nMáximo disponível: ${maxFormatted}\n\nInforme os novos minutos:`,
    String(a.heMinutes)
  );
  
  if (newValStr === null) return;
  const newVal = parseInt(newValStr, 10);
  
  if (isNaN(newVal) || newVal < 0) return alert(' Valor inválido.');
  if (newVal > maxAllowed) return alert(` Excede o disponível (máx: ${maxAllowed} min).`);

  a.heMinutes = newVal;
  saveState();
  addLog('Edição HE', `${matricula}: ${formatMinutes(newVal)}`);
  renderAssignedCollaborators();
  renderSupervisor();
  alert(' HE atualizada com sucesso!');
}

function removeAssignment(recId, assignmentId, matricula) {
  if (!confirm(`Remover atribuição de ${matricula}?`)) return;
  
  const arr = state.assignments[recId] || [];
  const idx = arr.findIndex(x => x.id === assignmentId);
  if (idx === -1) return alert('Atribuição não encontrada.');
  
  arr.splice(idx, 1);
  if (!arr.length) delete state.assignments[recId];

  const rec = (state.records || []).find(r => r.id === recId);
  if (rec && (!state.assignments[recId] || !state.assignments[recId].length)) {
    rec.status = 'Publicado';
    delete rec.assigned_at;
    delete rec.assigned_by;
  }

  saveState();
  addLog('Remoção HE', `Removida atribuição de ${matricula}`);
  renderAssignedCollaborators();
  renderSupervisor();
  alert(' Atribuição removida!');
}

/* ---------- Reset Demo ---------- */
function resetDemo() {
  if (!confirm('Criar dados de demonstração?')) return;
  
  // Limpar todas as chaves atuais do state para evitar leftovers
  Object.keys(state).forEach(k => delete state[k]);

  // Colaboradores com dados de elegibilidade
  state.collaborators = [
    { matricula:'1001', nome:'Ana Silva', role:'Colaborador', bancoHoras: -15, produtividade: 92, restricoes: [] },
    { matricula:'1002', nome:'Bruno Souza', role:'Colaborador', bancoHoras: -8, produtividade: 85, restricoes: [] },
    { matricula:'1003', nome:'Carla Pereira', role:'Colaborador', bancoHoras: 5, produtividade: 78, restricoes: ['médica'] },
    { matricula:'1004', nome:'Daniel Costa', role:'Colaborador', bancoHoras: -20, produtividade: 88, restricoes: [] },
    { matricula:'1005', nome:'Elena Ferreira', role:'Colaborador', bancoHoras: -12, produtividade: 95, restricoes: [] },
    { matricula:'1006', nome:'Felipe Santos', role:'Colaborador', bancoHoras: 2, produtividade: 70, restricoes: ['horário'] }
  ];

  // Records com múltiplos horários (usa uid para ids únicas)
  const today = new Date().toISOString().split('T')[0];
  function gid(s) { return uid('r_' + s + '_'); }
  
  state.records = [
    { id: gid('a'), date: today, dmm:'1°', operation:'TIM', segment:'CONTROLE GRE BH', interval_start:'07:30:00', hc_requested:2, he_minutes:60, motivo:'Pico matutino', status:'Publicado' },
    { id: gid('b'), date: today, dmm:'1°', operation:'TIM', segment:'CONTROLE GRE BH', interval_start:'09:00:00', hc_requested:1, he_minutes:30, motivo:'Reforço manhã', status:'Publicado' },
    { id: gid('c'), date: today, dmm:'1°', operation:'TIM', segment:'CONTROLE GRE BH', interval_start:'14:00:00', hc_requested:2, he_minutes:45, motivo:'Pico vespertino', status:'Publicado' },
    { id: gid('d'), date: today, dmm:'1°', operation:'TIM', segment:'CONTROLE GRE BH', interval_start:'16:30:00', hc_requested:1, he_minutes:30, motivo:'Reforço tarde', status:'Publicado' },
    { id: gid('e'), date: today, dmm:'1°', operation:'TIM', segment:'CONTROLE GRE BH', interval_start:'19:00:00', hc_requested:2, he_minutes:90, motivo:'Pico noturno', status:'Publicado' },
    { id: gid('f'), date: today, dmm:'1°', operation:'TIM', segment:'CONTROLE GRE BH', interval_start:'22:00:00', hc_requested:1, he_minutes:60, motivo:'Cobertura noturna', status:'Publicado' }
  ];

  // Validação do grupo
  const groupKey = `${today}|CONTROLE GRE BH|TIM`;
  state.validations = {};
  state.validations[groupKey] = { validatedAt: new Date().toISOString(), validatedBy: 'NOC System' };

  state.assignments = {};

  // Salvar e atualizar UI
  saveState();
  addLog('Reset Demo', 'Dados de demonstração criados com sucesso.');
  renderSupervisor();
  renderAssignedCollaborators();
  renderHEReport();
  alert(' Dados de demonstração criados!');
}

/* ---------- Event Bindings (assegura DOM carregado) ---------- */
document.addEventListener('DOMContentLoaded', () => {
  // filtros / botões da UI principal
  document.getElementById('btnSupFilter')?.addEventListener('click', renderSupervisor);
  document.getElementById('btnSupClear')?.addEventListener('click', () => {
    const sStart = document.getElementById('s_start');
    const sEnd = document.getElementById('s_end');
    const sSegment = document.getElementById('s_segment');
    if (sStart) sStart.value = '';
    if (sEnd) sEnd.value = '';
    if (sSegment) sSegment.value = '';
    renderSupervisor();
  });

  // Novo: Botão do relatório
  document.getElementById('btnGenerateReport')?.addEventListener('click', renderHEReport);

  // Reset Demo (reconsulta o botão para garantir que exista)
  const btnReset = document.getElementById('btnResetDemo');
  if (btnReset) {
    btnReset.addEventListener('click', resetDemo);
  } else {
    console.warn('[Supervisor] btnResetDemo não encontrado no DOM.');
  }

  // Inicial render
  renderSupervisor();
  renderAssignedCollaborators();
  renderHEReport();
});

// Export para debug
window.renderSupervisor = renderSupervisor;
window.renderAssignedCollaborators = renderAssignedCollaborators;
window.renderHEReport = renderHEReport;
window.resetDemo = resetDemo;

console.log('[Supervisor] Interface completa e corrigida carregada com sucesso.');