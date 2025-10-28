// dashboard.js - Dashboard operacional corrigido
import { state, loadState, saveState, addLog } from './common.js';

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

// Função para calcular estatísticas do dashboard
function calculateDashboardStats() {
  const records = state.records || [];
  const assignments = state.assignments || {};
  const collaborators = state.collaborators || [];

  // HE Total Planejada
  const totalHEPlanejada = records.reduce((sum, r) => sum + (r.he_minutes || 0), 0);

  // HE Atribuída
  let totalHEAtribuida = 0;
  Object.values(assignments).forEach(assignmentList => {
    assignmentList.forEach(assignment => {
      totalHEAtribuida += assignment.heMinutes || 0;
    });
  });

  // Colaboradores com HE
  const colaboradoresComHE = new Set();
  Object.values(assignments).forEach(assignmentList => {
    assignmentList.forEach(assignment => {
      colaboradoresComHE.add(assignment.matricula);
    });
  });

  // Taxa de Conversão (Atribuída / Planejada)
  const taxaConversao = totalHEPlanejada > 0 ? (totalHEAtribuida / totalHEPlanejada) * 100 : 0;

  // Eficiência (simulada)
  const eficiencia = Math.min(100, taxaConversao * 1.2);

  return {
    totalHEPlanejada,
    totalHEAtribuida,
    colaboradoresComHE: colaboradoresComHE.size,
    taxaConversao,
    eficiencia,
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

// Função para popular tabela de detalhes
function populateDetailsTable(stats) {
  const tbody = document.getElementById('table-detalhes-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  const collaboratorsWithHE = new Map();
  
  // Agregar HE por colaborador
  Object.values(stats.assignments).forEach(assignmentList => {
    assignmentList.forEach(assignment => {
      const current = collaboratorsWithHE.get(assignment.matricula) || { atribuida: 0, realizada: 0 };
      current.atribuida += assignment.heMinutes || 0;
      // Simular HE realizada (80-120% da atribuída)
      current.realizada = Math.floor(current.atribuida * (0.8 + Math.random() * 0.4));
      collaboratorsWithHE.set(assignment.matricula, current);
    });
  });

  const tableData = [];
  collaboratorsWithHE.forEach((heData, matricula) => {
    const coll = stats.collaborators.find(c => c.matricula === matricula);
    const diferenca = heData.realizada - heData.atribuida;
    const eficiencia = heData.atribuida > 0 ? (heData.realizada / heData.atribuida) * 100 : 0;
    const status = eficiencia >= 100 ? 'completed' : eficiencia >= 80 ? 'pending' : 'delayed';

    tableData.push({
      nome: coll?.nome || `Colaborador ${matricula}`,
      matricula,
      heAtribuida: heData.atribuida,
      heRealizada: heData.realizada,
      diferenca,
      eficiencia,
      status
    });
  });

  // Ordenar por HE realizada (desc)
  tableData.sort((a, b) => b.heRealizada - a.heRealizada);

  tableData.forEach(item => {
    const tr = document.createElement('tr');
    
    const statusText = item.status === 'completed' ? 'Concluído' : 
                      item.status === 'pending' ? 'Pendente' : 'Atrasado';
    
    const statusClass = item.status === 'completed' ? 'status-completed' : 
                       item.status === 'pending' ? 'status-pending' : 'status-delayed';

    const diferencaClass = item.diferenca >= 0 ? 'difference-positive' : 'difference-negative';
    const diferencaText = item.diferenca >= 0 ? `+${formatMinutes(item.diferenca)}` : formatMinutes(item.diferenca);

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
            backgroundColor: '#3B82F6',
            borderColor: '#3B82F6',
            borderWidth: 1
          },
          {
            label: 'HE Atribuída',
            data: [2950, 2600, 1750, 950],
            backgroundColor: '#10B981',
            borderColor: '#10B981',
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
            borderColor: '#3B82F6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.3,
            fill: true
          },
          {
            label: 'HE Realizada',
            data: [3850, 3550, 4200, 3800, 3650, 2950, 2450],
            borderColor: '#10B981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
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
            borderColor: '#EF4444',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
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
          data: [65, 25, 10],
          backgroundColor: ['#10B981', '#F59E0B', '#EF4444'],
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