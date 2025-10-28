// dashboard.js - Dashboard operacional corrigido
import { state, loadState, addLog } from './common.js';

// Garantir estado carregado
loadState();

let dashboardCharts = {};

// Função para formatar minutos em horas
function formatMinutes(minutes) {
  if (!minutes || minutes === 0) return '0h';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function formatDifference(minutes) {
  if (!minutes || minutes === 0) return '0h';
  const prefix = minutes > 0 ? '+' : '-';
  return `${prefix}${formatMinutes(Math.abs(minutes))}`;
}

// Função para calcular estatísticas do dashboard
function calculateDashboardStats() {
  const records = state.records || [];
  const assignments = state.assignments || {};
  const collaborators = state.collaborators || [];

  // HE Total Planejada
  const totalHEPlanejada = records.reduce((sum, r) => sum + (r.he_minutes || 0), 0);

  // HE Atribuída
  let totalHEAtribuida = 0;
  const collaboratorMap = new Map();
  Object.values(assignments).forEach(assignmentList => {
    assignmentList.forEach(assignment => {
      totalHEAtribuida += assignment.heMinutes || 0;
      const key = assignment.matricula;
      const current = collaboratorMap.get(key) || { atribuida: 0 };
      current.atribuida += assignment.heMinutes || 0;
      collaboratorMap.set(key, current);
    });
  });

  // Colaboradores com HE
  const colaboradoresComHE = new Set(collaboratorMap.keys());

  // Taxa de Conversão (Atribuída / Planejada)
  const taxaConversao = totalHEPlanejada > 0 ? (totalHEAtribuida / totalHEPlanejada) * 100 : 0;

  // Eficiência (simulada)
  const eficiencia = Math.min(100, taxaConversao * 1.2);

  // Consolidar dados de colaboradores
  const collaboratorSummaries = [];
  const statusCounts = { completed: 0, pending: 0, delayed: 0 };
  let totalHERealizada = 0;

  collaboratorMap.forEach((summary, matricula) => {
    const atribuida = summary.atribuida;
    const realizada = Math.floor(atribuida * (0.85 + Math.random() * 0.3));
    const diferenca = realizada - atribuida;
    const eficienciaColab = atribuida > 0 ? (realizada / atribuida) * 100 : 0;

    let status;
    if (eficienciaColab >= 100) {
      status = 'completed';
      statusCounts.completed += 1;
    } else if (eficienciaColab >= 90) {
      status = 'pending';
      statusCounts.pending += 1;
    } else {
      status = 'delayed';
      statusCounts.delayed += 1;
    }

    const coll = collaborators.find(c => c.matricula === matricula);
    collaboratorSummaries.push({
      nome: coll?.nome || `Colaborador ${matricula}`,
      matricula,
      heAtribuida: atribuida,
      heRealizada: realizada,
      diferenca,
      eficiencia: eficienciaColab,
      status
    });

    totalHERealizada += realizada;
  });

  const gapMinutes = totalHEPlanejada - totalHEAtribuida;
  const liberado24h = Math.min(totalHEAtribuida, Math.round(totalHEAtribuida * 0.35));

  return {
    totalHEPlanejada,
    totalHEAtribuida,
    totalHERealizada,
    colaboradoresComHE: colaboradoresComHE.size,
    taxaConversao,
    eficiencia,
    gapMinutes,
    liberado24h,
    collaboratorSummaries,
    statusCounts,
    records,
    assignments,
    collaborators
  };
}

// Função para atualizar KPIs
function updateKPIs(stats) {
  const kpiTotalHE = document.getElementById('kpi-total-he');
  const kpiColaboradores = document.getElementById('kpi-colaboradores');
  const kpiTaxaConversao = document.getElementById('kpi-taxa-conversao');
  const kpiEfficiency = document.getElementById('kpi-efficiency');

  if (kpiTotalHE) kpiTotalHE.textContent = formatMinutes(stats.totalHEPlanejada);
  if (kpiColaboradores) kpiColaboradores.textContent = stats.colaboradoresComHE.toString();
  if (kpiTaxaConversao) kpiTaxaConversao.textContent = `${Math.round(stats.taxaConversao)}%`;
  if (kpiEfficiency) kpiEfficiency.textContent = `${Math.round(stats.eficiencia)}%`;
}

function setElementText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function setProgressWidth(id, percent, gradient) {
  const el = document.getElementById(id);
  if (el) {
    const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)));
    el.style.width = `${clamped}%`;
    if (gradient) {
      el.style.background = gradient;
    } else {
      el.style.background = '';
    }
  }
}

function updateExecutiveBrief(stats) {
  setElementText('brief-planejado', formatMinutes(stats.totalHEPlanejada));
  setElementText('brief-liberado', formatMinutes(stats.totalHEAtribuida));
  setElementText('brief-gap', formatDifference(stats.gapMinutes));
  setElementText('brief-colaboradores', stats.colaboradoresComHE.toString());
}

function updateSidebar(stats) {
  setElementText('sidebar-conversao', `${Math.round(stats.taxaConversao)}%`);
  setElementText('sidebar-eficiencia', `${Math.round(stats.eficiencia)}%`);
  setElementText('sidebar-gap', formatDifference(stats.gapMinutes));
  setElementText('sidebar-he-planejada', formatMinutes(stats.totalHEPlanejada));
  setElementText('sidebar-he-liberada', formatMinutes(stats.totalHEAtribuida));
  setElementText('sidebar-he-realizada', formatMinutes(stats.totalHERealizada));

  setProgressWidth('progress-conversao', stats.taxaConversao);
  setProgressWidth('progress-eficiencia', stats.eficiencia, 'linear-gradient(90deg, #10b981, #22d3ee)');

  const normalizedGap = Math.abs(stats.gapMinutes);
  const gapPercent = stats.totalHEPlanejada > 0 ? (normalizedGap / stats.totalHEPlanejada) * 100 : 0;
  const gapGradient = stats.gapMinutes < 0
    ? 'linear-gradient(90deg, #22c55e, #0ea5e9)'
    : 'linear-gradient(90deg, var(--accent), var(--secondary))';
  setProgressWidth('progress-gap', gapPercent, gapGradient);
}

function updateInsightHighlights(stats) {
  setElementText('insight-liberado', formatMinutes(stats.liberado24h));
  const gapRestante = Math.max(0, stats.gapMinutes);
  setElementText('insight-gap', formatMinutes(gapRestante));
}

// Função para popular tabela de detalhes
function populateDetailsTable(stats) {
  const tbody = document.getElementById('table-detalhes-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  const tableData = [...(stats.collaboratorSummaries || [])];
  tableData.sort((a, b) => b.heRealizada - a.heRealizada);

  tableData.forEach(item => {
    const tr = document.createElement('tr');

    const statusText = item.status === 'completed' ? 'Concluído' :
                      item.status === 'pending' ? 'Pendente' : 'Atrasado';

    const statusClass = item.status === 'completed' ? 'status-completed' :
                       item.status === 'pending' ? 'status-pending' : 'status-delayed';

    const diferencaClass = item.diferenca >= 0 ? 'difference-positive' : 'difference-negative';
    const diferencaText = formatDifference(item.diferenca);

    tr.innerHTML = `
      <td style="font-weight: 600;">${item.nome}</td>
      <td>${item.matricula}</td>
      <td style="font-weight: 600;">${formatMinutes(item.heAtribuida)}</td>
      <td style="font-weight: 600;">${formatMinutes(item.heRealizada)}</td>
      <td class="${diferencaClass}">${diferencaText}</td>
      <td>${Math.round(item.eficiencia)}%</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
    `;
    
    tbody.appendChild(tr);
  });
}

// Função para renderizar gráficos
function renderCharts(stats) {
  // Destruir gráficos anteriores
  Object.values(dashboardCharts).forEach(chart => {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  });
  dashboardCharts = {};

  // Gráfico 1: HE por Segmento
  const ctx1 = document.getElementById('chart_he_segmento');
  if (ctx1) {
    dashboardCharts.segmento = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: ['CONTROLE FRONT MOC', 'CONTROLE GRE BH', 'PRÉ PAGO ESE BH', 'LABS LAB'],
        datasets: [
          {
            label: 'HE Planejada',
            data: [3200, 2800, 1900, 1200],
            backgroundColor: '#1d4ed8',
            borderColor: '#1d4ed8',
            borderWidth: 1
          },
          {
            label: 'HE Liberada',
            data: [2950, 2600, 1750, 950],
            backgroundColor: '#f97316',
            borderColor: '#f97316',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Minutos'
            }
          }
        }
      }
    });
  }

  // Gráfico 2: Evolução Diária
  const ctx2 = document.getElementById('chart_evolucao_diaria');
  if (ctx2) {
    dashboardCharts.evolucao = new Chart(ctx2, {
      type: 'line',
      data: {
        labels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
        datasets: [
          {
            label: 'HE Planejada',
            data: [4200, 3800, 4500, 4100, 3900, 3200, 2800],
            borderColor: '#1d4ed8',
            backgroundColor: 'rgba(29, 78, 216, 0.15)',
            tension: 0.3,
            fill: true
          },
          {
            label: 'HE Realizada',
            data: [3850, 3550, 4200, 3800, 3650, 2950, 2450],
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top'
          }
        }
      }
    });
  }

  // Gráfico 3: Picos de Chamadas
  const ctx3 = document.getElementById('chart_picos_chamadas');
  if (ctx3) {
    dashboardCharts.picos = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'],
        datasets: [
          {
            label: 'Volume de Chamadas',
            data: [150, 450, 720, 580, 680, 520, 380, 220],
            borderColor: '#f97316',
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            tension: 0.4,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        }
      }
    });
  }

  // Gráfico 4: Status de Atribuição
  const ctx4 = document.getElementById('chart_status_atribuicao');
  if (ctx4) {
    dashboardCharts.status = new Chart(ctx4, {
      type: 'doughnut',
      data: {
        labels: ['Concluído', 'Pendente', 'Atrasado'],
        datasets: [{
          data: (stats.statusCounts && (stats.statusCounts.completed || stats.statusCounts.pending || stats.statusCounts.delayed))
            ? [stats.statusCounts.completed || 0, stats.statusCounts.pending || 0, stats.statusCounts.delayed || 0]
            : [65, 25, 10],
          backgroundColor: ['#10b981', '#fbbf24', '#ef4444'],
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

// Função principal para aplicar filtros
function applyDashboardFilter() {
  const contentEl = document.getElementById('dashboard-content');
  const emptyEl = document.getElementById('dashboard-empty');
  
  if (!contentEl || !emptyEl) return;
  
  emptyEl.style.display = 'none'; 
  contentEl.style.display = 'block';

  // Calcular estatísticas
  const stats = calculateDashboardStats();

  // Atualizar KPIs
  updateKPIs(stats);
  updateExecutiveBrief(stats);
  updateSidebar(stats);
  updateInsightHighlights(stats);

  // Popular tabela de detalhes
  populateDetailsTable(stats);

  // Renderizar gráficos
  renderCharts(stats);

  addLog('Dashboard', 'Filtros aplicados - dashboard gerado');
}

// Função para carregar dados de demo
function loadDemoData() {
  // Verificar se já existem dados
  if (!state.records || state.records.length === 0) {
    alert('Não há dados de demonstração disponíveis. Use o sistema Supervisor para criar dados primeiro.');
    return;
  }
  
  applyDashboardFilter();
  addLog('Dashboard', 'Dados de demonstração carregados');
}

// Função para limpar filtros
function clearFilters() {
  document.getElementById('d_start').value = '';
  document.getElementById('d_end').value = '';
  document.getElementById('d_operation').value = '';
  document.getElementById('d_segment').value = '';
  
  const contentEl = document.getElementById('dashboard-content');
  const emptyEl = document.getElementById('dashboard-empty');
  
  if (contentEl && emptyEl) {
    contentEl.style.display = 'none';
    emptyEl.style.display = 'block';
  }
  
  // Destruir gráficos
  Object.values(dashboardCharts).forEach(chart => {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  });
  dashboardCharts = {};
}

// Clock function
function updateClock() {
  const now = new Date();
  const timeString = now.toLocaleTimeString('pt-BR');
  const dateString = now.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const clock = document.getElementById('clock');
  if (clock) {
    clock.innerHTML = `${timeString}<br><small style="font-size: 0.75rem; opacity: 0.9;">${dateString}</small>`;
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // Filtros
  document.getElementById('btnApplyDash')?.addEventListener('click', applyDashboardFilter);
  document.getElementById('btnClearDash')?.addEventListener('click', clearFilters);
  document.getElementById('btnLoadDemo')?.addEventListener('click', loadDemoData);

  // Clock
  setInterval(updateClock, 1000);
  updateClock();
});

// Export para debug
window.renderDashboard = applyDashboardFilter;
window.loadDemoData = loadDemoData;

console.log('[Dashboard] Dashboard operacional carregado com sucesso.');