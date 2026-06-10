/* NFS-e Monitor - App principal */

// Utilitario: atrasa execucao ate o usuario parar de digitar
function debounce(fn, ms) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

// Estado
let empresas = [], activeId = null, notas = [], curPanel = 'dashboard', empCertData = null;
let calFilter = null;
let empApiData = null;
let tPage = 1, tPerPage = 15;

// Estado - NFS-e Tomadas (Recebidas)
let notasRec = [], calFilterRec = null, tPageRec = 1;

// Cache: evita re-buscar notas ao trocar de aba sem mudar empresa ou filtros
let _dashCachedId = null, _recCachedId = null;

// Status do portal NFS-e
let _portalStatusCheckedOnce = false;
let _portalStatusInterval = null;
let _portalLastCheck = null;

const PORTAL_COLORS = { green: '#16a34a', yellow: '#ca8a04', red: '#dc2626', checking: '#aaa' };

function _applyPortalStatus(level, message) {
  const wrap = document.getElementById('portalStatusWrap');
  const path = document.getElementById('portalStatusPath');
  const title = document.getElementById('portalStatusTitle');
  if (!wrap || !path || !title) return;
  wrap.className = 'portal-status-wrap status-' + level;
  path.style.fill = PORTAL_COLORS[level] || '#aaa';
  title.textContent = message;
  _portalLastCheck = Date.now();
  _updatePortalTime();
}

function _updatePortalTime() {
  const el = document.getElementById('portalStatusTime');
  if (!el || !_portalLastCheck) return;
  const min = Math.floor((Date.now() - _portalLastCheck) / 60000);
  el.textContent = min < 1 ? 'Atualizado ha poucos segundos' : `Atualizado ha ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
}

async function refreshPortalStatus() {
  _applyPortalStatus('checking', 'Verificando...');
  try {
    const r = await window.api.checkPortalStatus();
    _applyPortalStatus(r.level, r.message);
  } catch(e) {
    _applyPortalStatus('red', 'Servico indisponivel.');
  }
}

// Polling a cada 5 minutos — inicia uma unica vez
(function startPortalPolling() {
  if (_portalStatusInterval) return;
  _portalStatusInterval = setInterval(() => {
    refreshPortalStatus();
    setInterval(_updatePortalTime, 30000);
  }, 5 * 60 * 1000);
})();

// Notificacoes de update
let updateAnimation = null;

if (window.api.onUpdateReady) {
  window.api.onUpdateReady((version) => {
    showUpdateModal(version);
  });
}

function showUpdateModal(version) {
  const modal = document.getElementById('updateModal');
  modal.classList.remove('hidden');

  // Carrega animacao
  if (!updateAnimation) {
    try {
      console.log('Carregando animação server-update.json...');
      
      // Verifica se container existe
      const container = document.getElementById('updateLottie');
      if (!container) {
        console.error('Container updateLottie não encontrado!');
        return;
      }
      
      updateAnimation = lottie.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'renderer/server-update.json',
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet'
        }
      });
      
      updateAnimation.addEventListener('DOMLoaded', function() {
        console.log('Animação de update carregada com sucesso');
      });
      
      updateAnimation.addEventListener('error', function(error) {
        console.error('Erro ao carregar animação:', error);
      });
      
    } catch (error) {
      console.error('Erro ao inicializar animação:', error);
    }
  }
}

function installUpdateAndRestart() {
  document.getElementById('btnRestartUpdate').textContent = 'Reiniciando...';
  document.getElementById('btnRestartUpdate').disabled = true;
  window.api.installUpdate();
}

// ── Teste de animacao (somente console) ──
window.testUpdateAnimation = function() {
  console.log('🧪 Testando animação de update...');
  showUpdateModal('1.1.7-test');
};

// ── Utilitarios ──
async function showAlert(msg) { await window.api.showMessage(msg); }
const fmtM = v => 'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCnpj = v => { const d = String(v).replace(/\D/g, '').padStart(14, '0'); return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); };
const initials = n => { if (!n) return '--'; const w = n.split(' ').filter(x => x.length > 1); return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : n.substring(0, 2).toUpperCase(); };
const COLORS = ['#0078d4', '#1078c10', '#ca8a04', '#d13438', '#8764b8', '#038387', '#e3008c', '#00b7c3'];
const getCol = i => COLORS[i % COLORS.length];

// ── Animacao de contagem ──
function animateCountUp(elementId, endValue, isCurrency = false, duration = 800) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const startValue = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const current = startValue + (endValue - startValue) * easeProgress;

    if (isCurrency) {
      el.textContent = fmtM(current);
    } else {
      el.textContent = Math.floor(current).toLocaleString('pt-BR');
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    } else {
      // Garante valor final exato
      if (isCurrency) {
        el.textContent = fmtM(endValue);
      } else {
        el.textContent = endValue.toLocaleString('pt-BR');
      }
    }
  }
  requestAnimationFrame(update);
}

const SVG_CERT_OK = '<svg viewBox="0 0 344.963 344.963" width="14" height="14" fill="#238b3d"><path d="M321.847,86.242l-40.026-23.11l-23.104-40.02h-46.213l-40.026-23.11l-40.026,23.11H86.239l-23.11,40.026L23.11,86.242v46.213L0,172.481l23.11,40.026v46.213l40.026,23.11l23.11,40.026h46.213l40.02,23.104l40.026-23.11h46.213l23.11-40.026l40.026-23.11v-46.213l23.11-40.026l-23.11-40.026V86.242H321.847z M156.911,243.075c-3.216,3.216-7.453,4.779-11.671,4.72c-4.219,0.06-8.455-1.504-11.671-4.72l-50.444-50.444c-6.319-6.319-6.319-16.57,0-22.889l13.354-13.354c6.319-6.319,16.57-6.319,22.889,0l25.872,25.872l80.344-80.35c6.319-6.319,16.57-6.319,22.889,0l13.354,13.354c6.319,6.319,6.319,16.57,0,22.889L156.911,243.075z"/></svg>';
const SVG_CERT_ERR = '<svg viewBox="0 0 24 24" width="14" height="14" fill="#be2d2d"><path d="M11 7h2v7h-2zm0 8h2v2h-2z"/><path d="m21.707 7.293-5-5A.996.996 0 0 0 16 2H8a.996.996 0 0 0-.707.293l-5 5A.996.996 0 0 0 2 8v8c0 .266.105.52.293.707l5 5A.996.996 0 0 0 8 22h8c.266 0 .52-.105.707-.293l5-5A.996.996 0 0 0 22 16V8a.996.996 0 0 0-.293-.707zM20 15.586 15.586 20H8.414L4 15.586V8.414L8.414 4h7.172L20 8.414v7.172z"/></svg>';

function certSt(c) {
  if (!c.cert_validade) return { cls: 'none', text: 'Sem certificado', svg: '' };
  const d = (new Date(c.cert_validade) - new Date()) / (864e5);
  if (d < 0) return { cls: 'err', text: 'Vencido', svg: SVG_CERT_ERR };
  if (d < 30) return { cls: 'warn', text: 'Vence em ' + Math.ceil(d) + ' dias', svg: SVG_CERT_ERR };
  return { cls: 'ok', text: 'Valido', svg: SVG_CERT_OK };
}

// ── Termos de uso ──
async function checkTerms() {
  const accepted = await window.api.checkTermsAccepted();
  if (!accepted) document.getElementById('termsModal').classList.remove('hidden');
  else { await checkAviso(); checkWhatsNew(); }
}

async function aceitarTermos() {
  await window.api.acceptTerms();
  document.getElementById('termsModal').classList.add('hidden');
  await checkAviso();
  checkWhatsNew();
}

// ── Aviso pontual ──
function closeAviso() {
  document.getElementById('avisoModal').classList.add('hidden');
  window.api.markAvisoSeen();
}

async function checkAviso() {
  const seen = await window.api.checkAvisoSeen();
  if (!seen) document.getElementById('avisoModal').classList.remove('hidden');
}

async function recusarTermos() {
  await showAlert('Voce precisa aceitar os Termos de Uso e a Politica de Privacidade para usar o NFS-e Monitor. O aplicativo sera fechado. Para nao ver esta mensagem novamente, desinstale o programa.');
  window.api.quitApp();
}

// ── Novidades da versao ──
function inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="#" onclick="window.api.openExternal(\'$2\');return false">$1</a>');
}

function renderMarkdown(md) {
  if (!md) return '';
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let html = '', inList = false;
  for (let line of lines) {
    line = line.trim();
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += '<li>' + inlineMd(escape(line.replace(/^[-*]\s+/, ''))) + '</li>';
      continue;
    }
    if (inList) { html += '</ul>'; inList = false; }
    if (line === '') continue;
    if (/^### /.test(line)) { html += '<h4>' + inlineMd(escape(line.slice(4))) + '</h4>'; continue; }
    if (/^## /.test(line)) { html += '<h3>' + inlineMd(escape(line.slice(3))) + '</h3>'; continue; }
    if (/^# /.test(line)) { html += '<h2>' + inlineMd(escape(line.slice(2))) + '</h2>'; continue; }
    html += '<p>' + inlineMd(escape(line)) + '</p>';
  }
  if (inList) html += '</ul>';
  return html;
}

function closeWhatsNew() {
  document.getElementById('whatsNewModal').classList.add('hidden');
}

async function checkWhatsNew() {
  const data = await window.api.getWhatsNew();
  if (!data) return;
  document.getElementById('whatsNewTitle').textContent = data.name || ('Novidades da versão ' + data.version);
  document.getElementById('whatsNewBody').innerHTML = renderMarkdown(data.body) || '<p>Confira as novidades desta versão.</p>';
  document.getElementById('whatsNewModal').classList.remove('hidden');
}

// ── Inicializacao ──
async function init() {
  empresas = await window.api.getEmpresas();
  renderDD();
  initCalendar();
  if (empresas.length > 0) selectComp(empresas[0].id);
}

// ── Calendario ──
function initCalendar() {
  const tipo = document.getElementById('fTipo').value;
  calFilter = new NfseCalendar('calendarSlot', {
    mode: tipo === 'competencia' ? 'month' : 'range',
    onSelect: () => { applyFilters(); }
  });
}

function onFilterTypeChange() {
  const tipo = document.getElementById('fTipo').value;
  calFilter = new NfseCalendar('calendarSlot', {
    mode: tipo === 'competencia' ? 'month' : 'range',
    onSelect: () => { applyFilters(); }
  });
  applyFilters();
}

// ── Filtros e Dashboard ──
async function applyFilters() {
  if (!activeId) return;
  const tipo = document.getElementById('fTipo').value;
  const status = document.getElementById('fStatus').value;
  const range = calFilter ? calFilter.getRange() : null;

  if (range) {
    notas = await window.api.getNotasByRange(activeId, tipo, range.inicio, range.fim, status);
  } else {
    notas = await window.api.getNotas(activeId, 'todas', status);
  }

  let totalServico = 0, totalLiquido = 0, autorizadas = 0, canceladas = 0, substituidas = 0;
  for (const n of notas) {
    if (n.status === 'Autorizada') {
      autorizadas++;
      totalServico += n.valor_servico || 0;
      totalLiquido += n.valor_liquido || 0;
    } else if (n.status === 'Substituida') { substituidas++; }
    else { canceladas++; }
  }
  // Anima contagem progressiva nos cards do dashboard
  animateCountUp('sTotal', notas.length, false, 600);
  document.getElementById('sTotalSub').textContent = range ? `${range.inicio} a ${range.fim}` : 'Todas';
  animateCountUp('sValor', totalServico, true, 800);
  document.getElementById('sValorSub').textContent = 'Valor bruto dos servicos';
  animateCountUp('sOk', autorizadas, false, 600);
  document.getElementById('sOkSub').textContent = notas.length > 0 ? ((autorizadas / notas.length * 100).toFixed(1) + '%') : '-';
  animateCountUp('sCanc', canceladas + substituidas, false, 600);
  document.getElementById('sCancSub').textContent = `${canceladas} canc. / ${substituidas} subst.`;
  tPage = 1;
  _dashCachedId = activeId;
  renderTable(notas);
}

async function loadDash(force = false) {
  if (!force && _dashCachedId === activeId) { renderTable(notas); return; }
  await applyFilters();
}

// ── Tabela com paginacao ──
const SM = { Autorizada: { cls: 'ok', dot: 'var(--success)' }, Cancelada: { cls: 'err', dot: 'var(--danger)' }, Substituida: { cls: 'err', dot: 'var(--danger)' } };

// SVGs de status inlados — sem IDs para evitar conflito quando multiplas badges iguais aparecem na mesma pagina
const STATUS_BADGES = {
  'Autorizada': `<svg viewBox="0 0 240 72" xmlns="http://www.w3.org/2000/svg" style="height:24px;width:auto;user-select:none;pointer-events:none;" draggable="false"><rect x="0" y="0" width="240" height="72" rx="36" fill="#00b850"/><rect x="0" y="0" width="240" height="36" rx="18" fill="white" opacity="0.1"/><g transform="translate(14,14) scale(0.367)"><path fill="white" opacity="0.9" d="M99.5,52.8l-1.9,4.7c-0.6,1.6-0.6,3.3,0,4.9l1.9,4.7c1.1,2.8,0.2,6-2.3,7.8L93,77.8c-1.4,1-2.3,2.5-2.7,4.1l-0.9,5c-0.6,3-3.1,5.2-6.1,5.3l-5.1,0.2c-1.7,0.1-3.3,0.8-4.5,2l-3.5,3.7c-2.1,2.2-5.4,2.7-8,1.2l-4.4-2.6c-1.5-0.9-3.2-1.1-4.9-0.7l-5,1.2c-2.9,0.7-6-0.7-7.4-3.4l-2.3-4.6c-0.8-1.5-2.1-2.7-3.7-3.2l-4.8-1.6c-2.9-1-4.7-3.8-4.4-6.8l0.5-5.1c0.2-1.7-0.3-3.4-1.4-4.7l-3.2-4c-1.9-2.4-1.9-5.7,0-8.1l3.2-4c1.1-1.3,1.6-3,1.4-4.7l-0.5-5.1c-0.3-3,1.5-5.8,4.4-6.8l4.8-1.6c1.6-0.5,2.9-1.7,3.7-3.2l2.3-4.6c1.4-2.7,4.4-4.1,7.4-3.4l5,1.2c1.6,0.4,3.4,0.2,4.9-0.7l4.4-2.6c2.6-1.5,5.9-1.1,8,1.2l3.5,3.7c1.2,1.2,2.8,2,4.5,2l5.1,0.2c3,0.1,5.6,2.3,6.1,5.3l0.9,5c0.3,1.7,1.3,3.2,2.7,4.1l4.2,2.9C99.7,46.8,100.7,50,99.5,52.8z"/><path fill="#00D566" d="M53.5,75.3c-1.4,0-2.8-0.6-3.8-1.7L37.2,59.3c-1.8-2.1-1.6-5.2,0.4-7.1c2.1-1.8,5.2-1.6,7.1,0.4l9.4,10.7l21.9-17.6c2.1-1.7,5.3-1.4,7,0.8c1.7,2.2,1.4,5.3-0.8,7L56.6,74.2C55.7,74.9,54.6,75.3,53.5,75.3z"/></g><line x1="58" y1="16" x2="58" y2="56" stroke="white" stroke-opacity="0.35" stroke-width="1.2"/><text x="150" y="36" font-family="'Segoe UI',Arial,sans-serif" font-size="24" font-weight="800" fill="white" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5">Autorizada</text></svg>`,
  'Cancelada': `<svg viewBox="0 0 240 72" xmlns="http://www.w3.org/2000/svg" style="height:24px;width:auto;user-select:none;pointer-events:none;" draggable="false"><rect x="0" y="0" width="240" height="72" rx="36" fill="#e02020"/><rect x="0" y="0" width="240" height="36" rx="18" fill="white" opacity="0.1"/><g transform="translate(14,14) scale(0.367)"><path fill="white" opacity="0.9" d="M99.5,52.8l-1.9,4.7c-0.6,1.6-0.6,3.3,0,4.9l1.9,4.7c1.1,2.8,0.2,6-2.3,7.8L93,77.8c-1.4,1-2.3,2.5-2.7,4.1l-0.9,5c-0.6,3-3.1,5.2-6.1,5.3l-5.1,0.2c-1.7,0.1-3.3,0.8-4.5,2l-3.5,3.7c-2.1,2.2-5.4,2.7-8,1.2l-4.4-2.6c-1.5-0.9-3.2-1.1-4.9-0.7l-5,1.2c-2.9,0.7-6-0.7-7.4-3.4l-2.3-4.6c-0.8-1.5-2.1-2.7-3.7-3.2l-4.8-1.6c-2.9-1-4.7-3.8-4.4-6.8l0.5-5.1c0.2-1.7-0.3-3.4-1.4-4.7l-3.2-4c-1.9-2.4-1.9-5.7,0-8.1l3.2-4c1.1-1.3,1.6-3,1.4-4.7l-0.5-5.1c-0.3-3,1.5-5.8,4.4-6.8l4.8-1.6c1.6-0.5,2.9-1.7,3.7-3.2l2.3-4.6c1.4-2.7,4.4-4.1,7.4-3.4l5,1.2c1.6,0.4,3.4,0.2,4.9-0.7l4.4-2.6c2.6-1.5,5.9-1.1,8,1.2l3.5,3.7c1.2,1.2,2.8,2,4.5,2l5.1,0.2c3,0.1,5.6,2.3,6.1,5.3l0.9,5c0.3,1.7,1.3,3.2,2.7,4.1l4.2,2.9C99.7,46.8,100.7,50,99.5,52.8z"/><line x1="42" y1="42" x2="78" y2="78" stroke="#FF3B3B" stroke-width="10" stroke-linecap="round"/><line x1="78" y1="42" x2="42" y2="78" stroke="#FF3B3B" stroke-width="10" stroke-linecap="round"/></g><line x1="58" y1="16" x2="58" y2="56" stroke="white" stroke-opacity="0.35" stroke-width="1.2"/><text x="150" y="36" font-family="'Segoe UI',Arial,sans-serif" font-size="24" font-weight="800" fill="white" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5">Cancelada</text></svg>`,
  'Substituida': `<svg viewBox="0 0 260 72" xmlns="http://www.w3.org/2000/svg" style="height:24px;width:auto;user-select:none;pointer-events:none;" draggable="false"><rect x="0" y="0" width="260" height="72" rx="36" fill="#7c22d4"/><rect x="0" y="0" width="260" height="36" rx="18" fill="white" opacity="0.1"/><g transform="translate(10,12) scale(2.0)"><path d="M12.984 4.99268C12.984 4.44039 13.4318 3.99268 13.984 3.99268C14.3414 3.99268 14.655 4.18016 14.8319 4.46214L17.5195 7.14976C17.91 7.54029 17.91 8.17345 17.5195 8.56398C17.129 8.9545 16.4958 8.9545 16.1053 8.56398L14.984 7.44275V14.9927C14.984 15.545 14.5363 15.9927 13.984 15.9927C13.4318 15.9927 12.984 15.545 12.984 14.9927V5.04213C12.9839 5.033 12.9839 5.02388 12.984 5.01476V4.99268Z" fill="white"/><path d="M11.0158 19.0076C11.0158 19.5599 10.5681 20.0076 10.0158 20.0076C9.65844 20.0076 9.34484 19.8201 9.16801 19.5381L6.48039 16.8505C6.08987 16.46 6.08987 15.8268 6.48039 15.4363C6.87092 15.0457 7.50408 15.0457 7.89461 15.4363L9.01583 16.5575V9.00757C9.01583 8.45528 9.46355 8.00757 10.0158 8.00757C10.5681 8.00757 11.0158 8.45528 11.0158 9.00757V18.9581C11.016 18.9672 11.016 18.9764 11.0158 18.9855V19.0076Z" fill="white"/></g><line x1="62" y1="16" x2="62" y2="56" stroke="white" stroke-opacity="0.35" stroke-width="1.2"/><text x="162" y="36" font-family="'Segoe UI',Arial,sans-serif" font-size="24" font-weight="800" fill="white" text-anchor="middle" dominant-baseline="middle" letter-spacing="1.5">Substituída</text></svg>`
};
function getStatusBadge(status) {
  if (STATUS_BADGES[status]) return STATUS_BADGES[status];
  const st = SM[status] || { cls: 'warn', dot: 'var(--warning)' };
  return `<span class="badge ${st.cls}"><span class="badge-dot" style="background:${st.dot}"></span>${status}</span>`;
}

// Retorna lista filtrada atual pra exportacao
function getFilteredNotas() {
  const q = (document.getElementById('fSearch')?.value || '').toLowerCase();
  return q ? notas.filter(n => (n.numero || '').toLowerCase().includes(q) || (n.tomador_razao || '').toLowerCase().includes(q) || (n.prestador_razao || '').toLowerCase().includes(q)) : notas;
}

function renderTable(list) {
  const f = getFilteredNotas();
  const total = f.length;
  const totalPages = Math.max(1, Math.ceil(total / tPerPage));
  if (tPage > totalPages) tPage = totalPages;
  const start = (tPage - 1) * tPerPage;
  const slice = f.slice(start, start + tPerPage);

  document.getElementById('tCount').textContent = total + ' registros';
  document.getElementById('tPageInfo').textContent = total > 0 ? `Pagina ${tPage} de ${totalPages}` : 'Nenhuma nota';
  document.getElementById('tPrev').disabled = tPage <= 1;
  document.getElementById('tNext').disabled = tPage >= totalPages;
  document.getElementById('navCount').textContent = total;

  const tbody = document.getElementById('tBody');
  if (!slice.length) { tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhuma nota encontrada. Sincronize para buscar notas do portal.</td></tr>'; return; }
  tbody.innerHTML = slice.map(n => {
    const hasXml = n.has_xml || n.chave_acesso;
    const xmlBtn = hasXml ? `<img src="renderer/icons/botao-xml.svg" onclick="downloadNotaXml(${n.id})" title="Baixar XML" class="action-btn" draggable="false" style="height:26px;width:auto;cursor:pointer;user-select:none;">` : '';
    const pdfBtn = hasXml ? `<img src="renderer/icons/botao-danfse.svg" onclick="downloadNotaDanfe(${n.id})" title="Baixar DANFSe" class="action-btn" draggable="false" style="height:26px;width:auto;cursor:pointer;user-select:none;">` : '';
    return `<tr>
      <td>${n.data_emissao || '-'}</td>
      <td class="fw600">${n.numero || '-'}</td>
      <td title="${(n.tomador_razao || '').replace(/"/g,'&quot;')}">${n.tomador_razao || '-'}</td>
      <td>${n.municipio_prestacao || '-'}</td>
      <td>${n.competencia || '-'}</td>
      <td class="money">${fmtM(n.valor_servico)}</td>
      <td class="money">${fmtM(n.valor_liquido)}</td>
      <td>${getStatusBadge(n.status)}</td>
      <td style="white-space:nowrap;overflow:visible;max-width:none;min-width:150px">${xmlBtn}<span style="width:4px;display:inline-block"></span>${pdfBtn}</td>
    </tr>`;
  }).join('');
}

function prevPage() { if (tPage > 1) { tPage--; renderTable(notas); } }
function nextPage() { tPage++; renderTable(notas); }
const filterTable = debounce(function() { tPage = 1; renderTable(notas); }, 150);

// ── Seletor de empresa ──
let ddOpen = false;
function toggleDD() {
  ddOpen = !ddOpen;
  document.getElementById('compDD').classList.toggle('open', ddOpen);
  document.getElementById('chevron').classList.toggle('open', ddOpen);
  if (ddOpen) { const si = document.getElementById('ddSearchInput'); if (si) { si.value = ''; filterDD(); setTimeout(() => si.focus(), 50); } }
}
function closeDD() { ddOpen = false; document.getElementById('compDD').classList.remove('open'); document.getElementById('chevron').classList.remove('open'); const si = document.getElementById('ddSearchInput'); if (si) { si.value = ''; filterDD(); } }

function renderDD() {
  const dd = document.getElementById('compDD');
  const pauseSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M5.5 3.5A1.5 1.5 0 017 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5zm5 0A1.5 1.5 0 0112 5v6a1.5 1.5 0 01-3 0V5a1.5 1.5 0 011.5-1.5z"/></svg>';
  const playSvg = '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 010 1.393z"/></svg>';
  const searchHtml = `<div class="dd-search"><input type="text" class="input" id="ddSearchInput" placeholder="Buscar empresa..." oninput="filterDD()" onclick="event.stopPropagation()" style="width:100%;height:30px;font-size:12px"></div>`;
  const itemsHtml = empresas.map((c, i) => {
    const cs = certSt(c);
    const isSenha = c.auth_type === 'senha';
    const senhaErro = isSenha && c.senha_status === 'erro';
    const statusCs = isSenha ? { cls: senhaErro ? 'err' : (c.portal_senha ? 'ok' : 'err') } : cs;
    const paused = c.autosync_paused;
    const pauseBtn = `<button onclick="event.stopPropagation();togglePause(${c.id})" title="${paused ? 'Ativar busca automatica' : 'Pausar busca automatica'}" style="background:none;border:1px solid var(--border);border-radius:4px;cursor:pointer;padding:2px 4px;display:flex;align-items:center;color:${paused ? 'var(--danger)' : 'var(--success)'}">${paused ? playSvg : pauseSvg}</button>`;
    return `<div class="dd-item ${c.id === activeId ? 'active' : ''}" onclick="selectComp(${c.id})" data-search="${(c.razao_social + ' ' + c.cnpj).toLowerCase()}">
      <div class="topbar-cert-dot ${statusCs.cls}" style="width:8px;height:8px"></div>
      <div style="flex:1;min-width:0"><div class="dd-name">${c.razao_social}</div><div class="dd-cnpj">${c.cnpj}</div></div>
      ${c.uf ? '<span class="dd-uf">[' + c.uf + ']</span>' : ''}
      ${pauseBtn}
    </div>`;
  }).join('');
  dd.innerHTML = searchHtml + `<div id="ddItemsList">${itemsHtml}</div>` + `<div class="dd-add" onclick="closeDD();openEmpModal()"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5H2.75a.75.75 0 010-1.5h4.5V2.75A.75.75 0 018 2z"/></svg> Adicionar Empresa</div>`;
}

function filterDD() {
  const q = (document.getElementById('ddSearchInput')?.value || '').toLowerCase();
  document.querySelectorAll('#ddItemsList .dd-item').forEach(el => {
    el.style.display = !q || el.dataset.search.includes(q) ? '' : 'none';
  });
}

async function togglePause(empresaId) {
  const r = await window.api.toggleAutoSyncPause(empresaId);
  if (r.error) { showAlert(r.error); return; }
  empresas = await window.api.getEmpresas();
  renderDD();
}

async function selectComp(id) {
  if (id !== activeId) { _dashCachedId = null; _recCachedId = null; }
  activeId = id; const c = empresas.find(e => e.id === id); if (!c) return;
  document.getElementById('compName').textContent = c.razao_social;
  document.getElementById('compCnpj').textContent = c.cnpj;
  const ufEl = document.getElementById('compUf');
  if (c.uf) { ufEl.textContent = '[' + c.uf + ']'; ufEl.style.display = ''; } else { ufEl.style.display = 'none'; }
  const isSenha = c.auth_type === 'senha';
  const senhaErro = isSenha && c.senha_status === 'erro';
  const cs = isSenha ? { cls: senhaErro ? 'err' : (c.portal_senha ? 'ok' : 'err'), text: senhaErro ? 'Senha incorreta' : (c.portal_senha ? 'OK' : 'Sem senha') } : certSt(c);
  const dot = document.getElementById('compCertDot'); dot.className = 'topbar-cert-dot ' + cs.cls;
  const al = document.getElementById('certAlert');
  if (cs.cls === 'err' && !isSenha) { al.classList.remove('hidden'); document.getElementById('certAlertMsg').innerHTML = '<strong>Certificado Vencido</strong> - ' + c.razao_social; }
  else if (senhaErro) { al.classList.remove('hidden'); document.getElementById('certAlertMsg').innerHTML = '<strong>Senha do Portal Alterada</strong> - ' + c.razao_social + '. Clique na engrenagem para reconfigurar.'; }
  else al.classList.add('hidden');
  closeDD(); renderDD();
  if (curPanel === 'config') await loadCfg();
  else if (curPanel === 'relatorio') loadRel();
  else if (curPanel === 'alertas') loadAlertas();
  else if (curPanel === 'empresas') renderEmps();
  else if (curPanel === 'recebidas') await loadDashRecebidas();
  else await loadDash();
}

document.addEventListener('click', e => { if (ddOpen && !document.getElementById('compWrap').contains(e.target)) closeDD(); });

// ── Navegacao ──
function showPanel(p, el) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');
  curPanel = p;
  ['pDashboard', 'pNotas', 'pEmpresas', 'pRelatorio', 'pConfig', 'pAlertas', 'pRecebidas'].forEach(x => { const e = document.getElementById(x); if (e) e.classList.add('hidden'); });
  if (p === 'dashboard' || p === 'notas') { document.getElementById('pDashboard').classList.remove('hidden'); loadDash(); }
  else if (p === 'recebidas') { document.getElementById('pRecebidas').classList.remove('hidden'); loadDashRecebidas(); }
  else if (p === 'alertas') { document.getElementById('pAlertas').classList.remove('hidden'); loadAlertas(); }
  else if (p === 'empresas') { document.getElementById('pEmpresas').classList.remove('hidden'); renderEmps(); }
  else if (p === 'relatorio') { document.getElementById('pRelatorio').classList.remove('hidden'); loadRel(); }
  else if (p === 'config') { document.getElementById('pConfig').classList.remove('hidden'); loadCfg(); }
}

// ── Lista de empresas ──
async function renderEmps() {
  empresas = await window.api.getEmpresas();
  const g = document.getElementById('empGrid');
  if (!empresas.length) { g.innerHTML = `<div class="empty" style="grid-column:span 2"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12H4V4zm2 2v2h2V6H6zm4 0v2h2V6h-2zm-4 4v2h2v-2H6zm4 0v2h2v-2h-2z"/></svg><h3>Nenhuma empresa</h3><p>Adicione uma empresa para comecar</p><button class="btn primary" onclick="openEmpModal()">Adicionar</button></div>`; return; }
  g.innerHTML = empresas.map((c, i) => {
    const isSenha = c.auth_type === 'senha';
    const senhaErro = isSenha && c.senha_status === 'erro';
    const cs = isSenha ? { cls: senhaErro ? 'err' : (c.portal_senha ? 'ok' : 'err'), text: senhaErro ? 'Senha incorreta - Reconfigure' : (c.portal_senha ? 'Senha configurada' : 'Senha nao configurada') } : certSt(c);
    const cor = c.cor || getCol(i), borderCol = cs.cls === 'err' ? 'var(--danger)' : cs.cls === 'warn' ? 'var(--warning)' : 'var(--accent)';
    const authIcon = isSenha ? '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="var(--text-muted)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' : '<svg viewBox="0 0 16 16" width="12" height="12" fill="var(--text-muted)"><path d="M12.5 0H5.914a1.5 1.5 0 00-1.06.44L2.439 2.853A1.5 1.5 0 002 3.914V14.5A1.5 1.5 0 003.5 16h9a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0012.5 0z"/></svg>';
    const authLabel = isSenha ? 'Senha do Portal' : 'Certificado Digital';
    return `<div class="card" style="border-left:3px solid ${borderCol}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="avatar" style="width:36px;height:36px;font-size:13px;background:${cor}">${initials(c.razao_social)}</div>
        <div style="flex:1;min-width:0"><div style="font-weight:700">${c.razao_social}</div><div style="font-size:12px;color:var(--text-muted)">${c.cnpj}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px">
        <div><span class="field-label">Municipio</span>${c.municipio || '-'}</div>
        <div><span class="field-label">Regime</span>${c.regime || '-'}</div>
        <div><span class="field-label">Autenticacao</span><span style="display:inline-flex;align-items:center;gap:4px">${authIcon} ${authLabel}</span></div>
        <div><span class="field-label">Status</span><span class="cert-tag ${cs.cls}">${cs.text}</span></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button class="btn" style="flex:1;justify-content:center" onclick="selectComp(${c.id});showPanel('dashboard',document.querySelector('[data-p=dashboard]'))">NFS-e Emitidas</button>
        <button class="btn" style="flex:1;justify-content:center" onclick="selectComp(${c.id});showPanel('recebidas',document.querySelector('[data-p=recebidas]'))">NFS-e Tomadas</button>
        <button class="btn danger" onclick="delEmpresa(${c.id})">Excluir</button>
      </div>
    </div>`;
  }).join('');
}

// ── Modal de empresa ──
let empAuthType = null;

function openEmpModal() {
  empCertData = null; empApiData = null; empAuthType = null;
  document.getElementById('eCertPath').value = '';
  document.getElementById('eCertPass').value = '';
  document.getElementById('eCertRes').classList.add('hidden');
  document.getElementById('eApiLoading').classList.add('hidden');
  document.getElementById('eApiRes').classList.add('hidden');
  document.getElementById('eApiErr').classList.add('hidden');
  document.getElementById('eStepAuth').classList.remove('hidden');
  document.getElementById('eStepCert').classList.add('hidden');
  document.getElementById('eStepSenha').classList.add('hidden');
  document.getElementById('empBackBtn').style.display = 'none';
  document.getElementById('empSaveBtn').style.display = 'none';
  document.getElementById('empModalTitle').textContent = 'Nova Empresa';
  document.getElementById('empModal').classList.remove('hidden');
}

function closeEmpModal() { document.getElementById('empModal').classList.add('hidden'); }

function selectAuthType(type) {
  empAuthType = type;
  document.getElementById('eStepAuth').classList.add('hidden');
  document.getElementById('empBackBtn').style.display = '';
  document.getElementById('empSaveBtn').style.display = '';
  if (type === 'certificado') {
    document.getElementById('eStepCert').classList.remove('hidden');
    document.getElementById('empModalTitle').textContent = 'Nova Empresa — Certificado Digital';
  } else {
    document.getElementById('eStepSenha').classList.remove('hidden');
    document.getElementById('empModalTitle').textContent = 'Nova Empresa — Senha do Portal';
    document.getElementById('eSenhaCnpj').value = '';
    document.getElementById('eSenhaPass').value = '';
  }
}

function empModalBack() {
  empCertData = null; empApiData = null; empAuthType = null;
  document.getElementById('eStepCert').classList.add('hidden');
  document.getElementById('eStepSenha').classList.add('hidden');
  document.getElementById('eCertRes').classList.add('hidden');
  document.getElementById('eApiRes').classList.add('hidden');
  document.getElementById('eApiErr').classList.add('hidden');
  document.getElementById('eApiLoading').classList.add('hidden');
  document.getElementById('empBackBtn').style.display = 'none';
  document.getElementById('empSaveBtn').style.display = 'none';
  document.getElementById('empModalTitle').textContent = 'Nova Empresa';
  document.getElementById('eStepAuth').classList.remove('hidden');
}

async function selEmpCert() { const f = await window.api.selectCertificate(); if (f) document.getElementById('eCertPath').value = f; }

async function readEmpCert() {
  const f = document.getElementById('eCertPath').value, p = document.getElementById('eCertPass').value;
  if (!f) { showAlert('Selecione o arquivo'); return; }
  if (!p) { showAlert('Informe a senha'); return; }
  const r = await window.api.parseCertificate(f, p);
  if (r.error) { showAlert(r.error); return; }
  // Bloqueia se certificado estiver vencido
  if (r.vencido) {
    showAlert('Certificado vencido em ' + r.validadeFormatted + '. Nao e possivel cadastrar empresa com certificado vencido.');
    empCertData = null;
    return;
  }
  empCertData = r;
  document.getElementById('eCertRes').classList.remove('hidden');
  document.getElementById('eCertCN').textContent = r.razaoSocial;
  document.getElementById('eCertCNPJ').textContent = 'CNPJ: ' + r.cnpj;
  document.getElementById('eCertVal').innerHTML = '<span style="color:var(--success)">Valido ate ' + r.validadeFormatted + '</span>';
  // Consulta automatica na Receita Federal
  document.getElementById('eApiLoading').classList.remove('hidden');
  document.getElementById('eApiRes').classList.add('hidden');
  document.getElementById('eApiErr').classList.add('hidden');
  empApiData = null;
  const api = await window.api.fetchCnpjData(r.cnpj);
  document.getElementById('eApiLoading').classList.add('hidden');
  if (api.error) {
    document.getElementById('eApiErr').classList.remove('hidden');
    document.getElementById('eApiErr').textContent = api.error;
  } else {
    empApiData = api;
    document.getElementById('eApiRes').classList.remove('hidden');
    document.getElementById('eApiRazao').textContent = api.razao_social;
    document.getElementById('eApiFantasia').textContent = api.nome_fantasia || '-';
    document.getElementById('eApiMun').textContent = `${api.municipio} / ${api.uf}`;
    document.getElementById('eApiRegime').textContent = api.regime || 'Nao identificado';
    document.getElementById('eApiSit').textContent = api.situacao;
    document.getElementById('eApiCnae').textContent = api.cnae;
  }
}

async function readEmpSenha() {
  const cnpj = document.getElementById('eSenhaCnpj').value.trim();
  const senha = document.getElementById('eSenhaPass').value;
  if (!cnpj) { showAlert('Informe o CNPJ'); return; }
  if (!senha) { showAlert('Informe a senha do portal'); return; }
  // Consulta automatica na Receita Federal pelo CNPJ
  document.getElementById('eCertRes').classList.add('hidden');
  document.getElementById('eApiLoading').classList.remove('hidden');
  document.getElementById('eApiRes').classList.add('hidden');
  document.getElementById('eApiErr').classList.add('hidden');
  empApiData = null;
  empCertData = { cnpj: cnpj, razaoSocial: '', cn: '', validade: '', emissao: '' };
  const api = await window.api.fetchCnpjData(cnpj);
  document.getElementById('eApiLoading').classList.add('hidden');
  if (api.error) {
    document.getElementById('eApiErr').classList.remove('hidden');
    document.getElementById('eApiErr').textContent = api.error;
  } else {
    empApiData = api;
    document.getElementById('eApiRes').classList.remove('hidden');
    document.getElementById('eApiRazao').textContent = api.razao_social;
    document.getElementById('eApiFantasia').textContent = api.nome_fantasia || '-';
    document.getElementById('eApiMun').textContent = `${api.municipio} / ${api.uf}`;
    document.getElementById('eApiRegime').textContent = api.regime || 'Nao identificado';
    document.getElementById('eApiSit').textContent = api.situacao;
    document.getElementById('eApiCnae').textContent = api.cnae;
  }
}

async function saveEmpresa() {
  const saveBtn = document.getElementById('empSaveBtn');
  if (empAuthType === 'certificado') {
    if (!empCertData || !empCertData.cn) { showAlert('Leia o certificado antes'); return; }
    const d = {
      razao_social: empApiData?.razao_social || empCertData.razaoSocial,
      cnpj: empCertData.cnpj,
      cert_path: document.getElementById('eCertPath').value,
      cert_password: document.getElementById('eCertPass').value,
      cert_cn: empCertData.cn,
      cert_validade: empCertData.validade,
      cert_emissao: empCertData.emissao,
      auth_type: 'certificado',
      portal_senha: '',
      inscricao_municipal: '',
      municipio: empApiData?.municipio || '',
      uf: empApiData?.uf || '',
      regime: empApiData?.regime || '',
      cor: getCol(empresas.length)
    };
    const r = await window.api.addEmpresa(d);
    if (r.error) { showAlert(r.error); return; }
    closeEmpModal();
    empresas = await window.api.getEmpresas();
    renderDD(); renderEmps();
    if (!activeId && empresas.length > 0) selectComp(empresas[0].id);
  } else if (empAuthType === 'senha') {
    const cnpj = document.getElementById('eSenhaCnpj').value.trim();
    const senha = document.getElementById('eSenhaPass').value;
    if (!cnpj || !senha) { showAlert('Informe CNPJ e senha'); return; }
    if (!empApiData) { showAlert('Consulte a empresa antes de salvar'); return; }
    // Testa login no portal antes de salvar
    saveBtn.disabled = true; saveBtn.textContent = 'Verificando senha...';
    const test = await window.api.testPortalLogin(cnpj, senha);
    saveBtn.disabled = false; saveBtn.textContent = 'Salvar';
    if (test.error) {
      document.getElementById('eApiErr').classList.remove('hidden');
      document.getElementById('eApiErr').textContent = 'Senha incorreta ou CNPJ invalido. Verifique e tente novamente.';
      return;
    }
    const d = {
      razao_social: empApiData.razao_social,
      cnpj: cnpj,
      cert_path: '',
      cert_password: '',
      cert_cn: '',
      cert_validade: '',
      cert_emissao: '',
      auth_type: 'senha',
      portal_senha: senha,
      inscricao_municipal: '',
      municipio: empApiData?.municipio || '',
      uf: empApiData?.uf || '',
      regime: empApiData?.regime || '',
      cor: getCol(empresas.length)
    };
    const r = await window.api.addEmpresa(d);
    if (r.error) { showAlert(r.error); return; }
    closeEmpModal();
    empresas = await window.api.getEmpresas();
    renderDD(); renderEmps();
    if (!activeId && empresas.length > 0) selectComp(empresas[0].id);
  }
}

async function delEmpresa(id) {
  if (!confirm('Excluir empresa e todas as notas?')) return;
  await window.api.deleteEmpresa(id);
  empresas = await window.api.getEmpresas();
  renderDD(); renderEmps();
  if (activeId === id) { activeId = empresas.length ? empresas[0].id : null; if (activeId) selectComp(activeId); }
}

// ── Competencias ──
async function loadRel() {
  if (!activeId) return;
  const r = await window.api.getReportByCompetencia(activeId), tb = document.getElementById('rBody');
  const countEl = document.getElementById('rCount');
  if (!r.length) { tb.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted)">Nenhuma nota sincronizada.</td></tr>'; if (countEl) countEl.textContent = '0 competencias'; return; }
  if (countEl) countEl.textContent = r.length + ' competencias';
  let tN = 0, tS = 0, tR = 0, tL = 0;
  tb.innerHTML = r.map(x => {
    tN += x.total_notas; tS += x.total_servico; tR += x.total_retencoes; tL += x.total_liquido;
    return `<tr><td class="fw600">${x.competencia}</td><td>${x.total_notas}</td><td style="color:var(--success)">${x.autorizadas}</td><td style="color:var(--danger)">${x.canceladas}</td><td class="money">${fmtM(x.total_servico)}</td><td style="color:var(--danger);font-weight:600">${fmtM(x.total_retencoes)}</td><td class="money">${fmtM(x.total_liquido)}</td><td><button class="btn" onclick="exportCompetencia('${x.competencia}')" style="padding:2px 8px;font-size:11px">Baixar</button></td></tr>`;
  }).join('') + `<tr style="background:var(--accent-light);font-weight:700"><td>TOTAL</td><td>${tN}</td><td></td><td></td><td class="money">${fmtM(tS)}</td><td style="color:var(--danger);font-weight:700">${fmtM(tR)}</td><td class="money">${fmtM(tL)}</td><td><button class="btn primary" onclick="exportAllCompetencias()" style="padding:2px 8px;font-size:11px">Baixar Resumo</button></td></tr>`;
}

// ── Configuracoes ──
async function loadDbStats() {
  try {
    const stats = await window.api.getDbStats();
    document.getElementById('dbSize').textContent = stats.sizeFormatted || '0 B';
  } catch (e) {
    document.getElementById('dbSize').textContent = '---';
  }
}

async function loadCfg() {
  await loadDbStats();
  loadNotifToggles();
  window.api.getAppVersion().then(v => {
    const el = document.getElementById('sobreVersion');
    if (el) el.textContent = 'NFS-e Monitor v' + v;
  }).catch(() => {});

  const c = empresas.find(e => e.id === activeId);
  if (!c) { document.getElementById('cfgInfo').textContent = 'Selecione uma empresa.'; document.getElementById('btnSwitchAuth').classList.add('hidden'); return; }
  document.getElementById('btnSwitchAuth').classList.remove('hidden');
  const isSenha = c.auth_type === 'senha';
  const senhaErro = isSenha && c.senha_status === 'erro';
  const authLabel = isSenha ? 'Senha do Portal' : 'Certificado Digital';
  const cs = isSenha ? { cls: senhaErro ? 'err' : (c.portal_senha ? 'ok' : 'err'), text: senhaErro ? 'Senha incorreta - Reconfigure' : (c.portal_senha ? 'Senha configurada' : 'Senha nao configurada') } : certSt(c);
  document.getElementById('cfgInfo').innerHTML = `<strong>${c.razao_social}</strong> - ${c.cnpj}<br><span class="cert-tag ${cs.cls}">${cs.text}</span> <span style="font-size:11px;color:var(--text-muted);margin-left:6px">(${authLabel})</span>`;
  document.getElementById('btnSwitchAuth').textContent = isSenha ? ' Trocar para Certificado Digital' : ' Trocar para Senha do Portal';
  // Alterna campos visiveis
  document.getElementById('cfgCertFields').classList.toggle('hidden', isSenha);
  document.getElementById('cfgSenhaFields').classList.toggle('hidden', !isSenha);
  if (isSenha) {
    document.getElementById('cfgSenhaCnpj').value = c.cnpj || '';
    const passEl = document.getElementById('cfgSenhaPass');
    if (!passEl.value) passEl.value = c.portal_senha || '';
  } else {
    document.getElementById('cfgPath').value = c.cert_path || '';
    document.getElementById('cfgPass').value = c.cert_password || '';
  }
  // Carrega status do auto-sync
  const cfg = await window.api.getAutoSyncConfig();
  if (cfg.minutes > 0) {
    document.getElementById('cfgAutoInterval').value = cfg.minutes;
    const status = document.getElementById('cfgAutoStatus');
    status.textContent = `Ativo: consulta a cada ${cfg.minutes} minuto(s)`;
    status.style.color = 'var(--success)';
  }
  // Carrega caminho do log
  const logPath = await window.api.getLogPath();
  const logEl = document.getElementById('logPathInfo');
  if (logEl && logPath) logEl.textContent = logPath;

  // Checa status do portal na primeira abertura da aba (polling gerenciado separadamente)
  if (!_portalStatusCheckedOnce) { _portalStatusCheckedOnce = true; refreshPortalStatus(); }
}

async function loadNotifToggles() {
  const cfg = await window.api.getNotifConfig();
  ['notif_sync_novas', 'notif_atualizacao', 'notif_offline', 'notif_portal_instavel', 'notif_sync_erro'].forEach(k => {
    const el = document.getElementById(k);
    if (el) el.checked = cfg[k] !== false;
  });
}

async function saveNotifToggle(el) {
  await window.api.setNotifConfig(el.id, el.checked);
}

async function openLogFolder() { await window.api.openLogFolder(); }

async function selCert() { const f = await window.api.selectCertificate(); if (f) document.getElementById('cfgPath').value = f; }

async function saveCert() {
  if (!activeId) { showAlert('Selecione uma empresa'); return; }
  const p = document.getElementById('cfgPath').value, s = document.getElementById('cfgPass').value;
  if (!p || !s) { showAlert('Preencha arquivo e senha'); return; }
  const r = await window.api.parseCertificate(p, s);
  if (r.error) { showAlert(r.error); return; }
  await window.api.updateEmpresa(activeId, { cert_path: p, cert_password: s, cert_cn: r.cn, cert_validade: r.validade, cert_emissao: r.emissao });
  empresas = await window.api.getEmpresas(); renderDD(); selectComp(activeId); showAlert('Certificado salvo!');
}

async function saveSenha() {
  if (!activeId) { showAlert('Selecione uma empresa'); return; }
  const s = document.getElementById('cfgSenhaPass').value;
  if (!s) { showAlert('Informe a senha do portal'); return; }
  const c = empresas.find(e => e.id === activeId);
  if (!c) return;
  // Valida senha antes de salvar
  const btn = document.querySelector('#cfgSenhaFields .btn.primary');
  btn.disabled = true; btn.textContent = 'Verificando...';
  const test = await window.api.testPortalLogin(c.cnpj.replace(/\D/g, ''), s);
  btn.disabled = false; btn.textContent = 'Salvar Senha';
  if (test.error) {
    showAlert('Senha invalida ou CNPJ incorreto. Nao foi possivel autenticar no portal.');
    return;
  }
  await window.api.updateEmpresa(activeId, { portal_senha: s, senha_status: 'ok' });
  empresas = await window.api.getEmpresas(); renderDD(); selectComp(activeId); showAlert('Senha do portal salva!');
}

async function switchAuthMethod() {
  if (!activeId) { showAlert('Selecione uma empresa'); return; }
  const c = empresas.find(e => e.id === activeId);
  if (!c) return;
  const newAuth = c.auth_type === 'senha' ? 'certificado' : 'senha';
  const label = newAuth === 'senha' ? 'Senha do Portal' : 'Certificado Digital';
  const ok = await window.api.showConfirmDialog(`Trocar autenticacao de "${c.razao_social}" para ${label}?`);
  if (!ok) return;
  await window.api.updateEmpresa(activeId, { auth_type: newAuth });
  empresas = await window.api.getEmpresas(); renderDD(); await selectComp(activeId); await loadCfg();
}


// ── Barra de progresso superior ──
function showTopSync(msg, pct, isHtml = false) {
  document.getElementById('topSyncBar').classList.remove('hidden');
  document.getElementById('topSyncProgress').style.width = (pct || 0) + '%';
  const el = document.getElementById('topSyncText');
  if (isHtml) {
    el.innerHTML = msg || '';
  } else {
    el.textContent = msg || 'Sincronizando...';
  }
}
function hideTopSync() { document.getElementById('topSyncBar').classList.add('hidden'); }

// ── Sync (empresa unica) ──
let syncCal = null, syncAllCal = null;

function openSyncModal() {
  if (!activeId) { showAlert('Selecione uma empresa'); return; }
  document.getElementById('syncProg').classList.add('hidden');
  document.getElementById('btnStartSync').disabled = false;
  document.getElementById('syncModal').classList.remove('hidden');
  // Inicializa calendario com mes atual pre-selecionado
  const now = new Date();
  syncCal = new NfseCalendar('syncCalSlot', { mode: 'range', onSelect: () => {} });
  syncCal.setRange(new Date(now.getFullYear(), now.getMonth(), 1), now);
}

function closeSyncModal() { document.getElementById('syncModal').classList.add('hidden'); }

async function startSync() {
  const range = syncCal ? syncCal.getRange() : null;
  if (!range) { showAlert('Selecione o periodo'); return; }
  document.getElementById('btnStartSync').disabled = true;
  closeSyncModal();
  showTopSync('Sincronizando...', 0);
  window.api.onSyncProgress(d => { showTopSync(d.message, d.progress); });
  const r = await window.api.syncEmpresa(activeId, range.inicio, range.fim);
  if (r.error) { showTopSync('Erro: ' + r.error, 100); }
  else { showTopSync(`Concluido! ${r.total} notas.`, 100); _dashCachedId = null; _recCachedId = null; await loadDash(true); setTimeout(hideTopSync, 4000); }
  document.getElementById('btnStartSync').disabled = false;
}

// ── Sync de todas as empresas ──
function openSyncAllModal() {
  document.getElementById('syncAllProg').classList.add('hidden');
  document.getElementById('syncAllErrors').style.display = 'none';
  document.getElementById('btnStartSyncAll').disabled = false;
  document.getElementById('syncAllModal').classList.remove('hidden');
  // Inicializa calendario com ano atual pre-selecionado
  const now = new Date();
  syncAllCal = new NfseCalendar('syncAllCalSlot', { mode: 'range', onSelect: () => {} });
  syncAllCal.setRange(new Date(now.getFullYear(), 0, 1), now);
}

function closeSyncAllModal() { document.getElementById('syncAllModal').classList.add('hidden'); }

async function startSyncAll() {
  const range = syncAllCal ? syncAllCal.getRange() : null;
  if (!range) { showAlert('Selecione o periodo'); return; }
  document.getElementById('btnStartSyncAll').disabled = true;
  closeSyncAllModal();
  showTopSync('Sincronizando todas empresas...', 0);
  window.api.onSyncProgress(d => { showTopSync(d.message, d.progress); });
  const r = await window.api.syncAll(range.inicio, range.fim);
  if (r.error) {
    showTopSync('Erro: ' + r.error, 100);
  } else {
    showTopSync(`Concluido! ${r.total} notas de ${r.empresas} empresas.`, 100);
    _dashCachedId = null; _recCachedId = null; await loadDash(true);
    setTimeout(hideTopSync, 5000);
  }
  document.getElementById('btnStartSyncAll').disabled = false;
}

// ── Painel de alertas ──
async function loadAlertas() {
  const allRows = await window.api.getAlertas();
  // Filtra: apenas notas do mes atual ou anterior
  const now = new Date();
  const curMM = String(now.getMonth() + 1).padStart(2, '0');
  const curYY = String(now.getFullYear());
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMM = String(prev.getMonth() + 1).padStart(2, '0');
  const prevYY = String(prev.getFullYear());

  const rows = allRows.filter(n => {
    if (!n.data_emissao) return false;
    const emMM = n.data_emissao.substring(3, 5);
    const emYY = n.data_emissao.substring(6, 10);
    return (emMM === curMM && emYY === curYY) || (emMM === prevMM && emYY === prevYY);
  });

  document.getElementById('alertTCount').textContent = rows.length + ' registros';
  document.getElementById('navAlertCount').textContent = rows.length;
  document.getElementById('alertFoot').textContent = rows.length > 0 ? rows.length + ' notas com divergencia' : 'Nenhum alerta';
  const tbody = document.getElementById('alertTBody');
  if (!rows.length) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhuma divergencia encontrada no periodo recente.</td></tr>'; return; }
  tbody.innerHTML = rows.map(n => {
    const emComp = n.data_emissao ? n.data_emissao.substring(3, 5) + '/' + n.data_emissao.substring(6, 10) : '?';
    const comp = n.competencia || '?';
    return `<tr>
      <td>${n.empresa_nome || '-'}</td>
      <td>${n.data_emissao || '-'}</td>
      <td class="fw600">${n.numero || '-'}</td>
      <td title="${(n.tomador_razao || '').replace(/"/g,'&quot;')}">${n.tomador_razao || '-'}</td>
      <td>${comp}</td>
      <td class="money">${fmtM(n.valor_servico)}</td>
      <td>${getStatusBadge(n.status)}</td>
      <td><span style="color:var(--danger);font-weight:600;font-size:12px">Emitida na competencia ${emComp}, referente a ${comp}</span></td>
    </tr>`;
  }).join('');
}

async function exportAlertas() {
  const allRows = await window.api.getAlertas();
  const now = new Date();
  const curMM = String(now.getMonth() + 1).padStart(2, '0'), curYY = String(now.getFullYear());
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMM = String(prev.getMonth() + 1).padStart(2, '0'), prevYY = String(prev.getFullYear());
  const rows = allRows.filter(n => {
    if (!n.data_emissao) return false;
    const emMM = n.data_emissao.substring(3, 5), emYY = n.data_emissao.substring(6, 10);
    return (emMM === curMM && emYY === curYY) || (emMM === prevMM && emYY === prevYY);
  });
  if (!rows.length) { showAlert('Nenhum alerta para exportar'); return; }
  showTopSync('Gerando planilha de alertas...', 30);
  try {
    const r = await window.api.exportAlertas(rows);
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}

// ── Exportacao (usa filtro ativo das NFS-e Emitidas) ──
function getActiveFilters() {
  const tipo = document.getElementById('fTipo')?.value || 'competencia';
  const status = document.getElementById('fStatus')?.value || 'todos';
  const range = calFilter ? calFilter.getRange() : null;
  const filters = { tipo, status };
  if (range) { filters.inicio = range.inicio; filters.fim = range.fim; }
  return filters;
}

async function exportExcel() {
  if (!activeId) { showAlert('Selecione empresa'); return; }
  const filters = getActiveFilters();
  showTopSync('Gerando planilha Excel...', 30);
  try {
    const r = await window.api.exportExcel(activeId, filters);
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}
async function downloadXmlZip() {
  if (!activeId) { showAlert('Selecione empresa'); return; }
  const filters = getActiveFilters();
  showTopSync('Comprimindo XMLs...', 30);
  try {
    const r = await window.api.downloadXmlZip(activeId, filters);
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}

async function exportRelatorio() {
  if (!activeId) { showAlert('Selecione empresa'); return; }
  showTopSync('Gerando relatorio...', 30);
  try {
    const r = await window.api.exportExcel(activeId, {});
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}

async function exportCompetencia(comp) {
  if (!activeId) { showAlert('Selecione empresa'); return; }
  showTopSync('Gerando PDF...', 20);
  try {
    const r = await window.api.exportPdf(activeId, { competencia: comp });
    if (r.canceled) return;
    if (r.error) showAlert(r.error);
    else showAlert('Relatorio PDF gerado com sucesso!');
  } finally { hideTopSync(); }
}

async function exportAllCompetencias() {
  if (!activeId) { showAlert('Selecione empresa'); return; }
  showTopSync('Gerando PDF...', 20);
  try {
    const r = await window.api.exportPdf(activeId, { resumo: true });
    if (r.canceled) return;
    if (r.error) showAlert(r.error);
    else showAlert('Relatorio PDF gerado com sucesso!');
  } finally { hideTopSync(); }
}

// ── Downloads por nota ──
async function downloadNotaXml(notaId) {
  showTopSync('Preparando XML...', 50);
  try {
    const r = await window.api.downloadNotaXml(notaId);
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}
async function downloadNotaDanfe(notaId) {
  showTopSync('Gerando DANFSe...', 20);
  try {
    const r = await window.api.downloadNotaDanfe(notaId);
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}

// ── Configuracao de auto-sync ──
async function loadAutoSyncConfig() {
  const cfg = await window.api.getAutoSyncConfig();
  const el = document.getElementById('cfgAutoInterval');
  const status = document.getElementById('cfgAutoStatus');
  if (el && cfg.minutes > 0) {
    el.value = cfg.minutes;
    status.textContent = `Ativo: consulta a cada ${cfg.minutes} minuto(s)`;
    status.style.color = 'var(--success)';
  } else if (status) {
    status.textContent = 'Desativado';
    status.style.color = 'var(--text-muted)';
  }
}

async function saveAutoSync() {
  const el = document.getElementById('cfgAutoInterval');
  const minutes = parseInt(el.value);
  if (!minutes || minutes < 1) { showAlert('Informe um intervalo valido (minimo 1 minuto)'); return; }
  const r = await window.api.setAutoSyncConfig(minutes);
  if (r.error) { showAlert(r.error); return; }
  const status = document.getElementById('cfgAutoStatus');
  status.textContent = `Ativo: consulta a cada ${minutes} minuto(s)`;
  status.style.color = 'var(--success)';
}

async function stopAutoSync() {
  await window.api.stopAutoSync();
  document.getElementById('cfgAutoInterval').value = '';
  const status = document.getElementById('cfgAutoStatus');
  status.textContent = 'Desativado';
  status.style.color = 'var(--text-muted)';
}

window.api.onAutoSyncAlert((data) => {
  showTopSync(`${data.empresa}: ${data.novas} nota(s) nova(s)!`, 100);
  setTimeout(hideTopSync, 8000);
  _dashCachedId = null; _recCachedId = null; loadDash(true);
  // Atualiza badge de alertas (filtrado)
  window.api.getAlertas().then(allRows => {
    const now = new Date();
    const curMM = String(now.getMonth() + 1).padStart(2, '0'), curYY = String(now.getFullYear());
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMM = String(prev.getMonth() + 1).padStart(2, '0'), prevYY = String(prev.getFullYear());
    const rows = allRows.filter(n => { if (!n.data_emissao) return false; const emMM = n.data_emissao.substring(3,5), emYY = n.data_emissao.substring(6,10); return (emMM===curMM&&emYY===curYY)||(emMM===prevMM&&emYY===prevYY); });
    document.getElementById('navAlertCount').textContent = rows.length;
  });
});

// ── Reparo de dados ──
let repairInProgress = false;

async function repairNotas() {
  if (repairInProgress) return;
  repairInProgress = true;

  const el = document.getElementById('repairResult');
  const btn = document.querySelector('button[onclick="repairNotas()"]');
  if (btn) btn.disabled = true;

  // Configura listener de progresso
  const progressHandler = (data) => {
    el.textContent = `Reparando... ${data.progress}% (${data.current}/${data.total})`;
    el.style.color = 'var(--accent)';
  };
  window.api.onRepairProgress(progressHandler);

  el.textContent = 'Iniciando...';
  el.style.color = 'var(--text-muted)';

  try {
    const r = await window.api.repairNotasFromXml();
    el.textContent = `Concluido: ${r.fixed} notas reparadas de ${r.total} com XML.`;
    el.style.color = 'var(--success)';
    if (curPanel === 'dashboard') { _dashCachedId = null; loadDash(true); }
  } catch (e) {
    el.textContent = 'Erro: ' + e.message;
    el.style.color = 'var(--danger)';
  } finally {
    repairInProgress = false;
    if (btn) btn.disabled = false;
  }
}

// ── NFS-e Tomadas (Recebidas) ──

function initCalendarRec() {
  const tipo = document.getElementById('fTipoRec').value;
  calFilterRec = new NfseCalendar('calendarSlotRec', {
    mode: tipo === 'competencia' ? 'month' : 'range',
    onSelect: () => { applyFiltersRec(); }
  });
}

function onFilterTypeChangeRec() {
  const tipo = document.getElementById('fTipoRec').value;
  calFilterRec = new NfseCalendar('calendarSlotRec', {
    mode: tipo === 'competencia' ? 'month' : 'range',
    onSelect: () => { applyFiltersRec(); }
  });
  applyFiltersRec();
}

async function applyFiltersRec() {
  if (!activeId) return;
  const tipo = document.getElementById('fTipoRec').value;
  const status = document.getElementById('fStatusRec').value;
  const range = calFilterRec ? calFilterRec.getRange() : null;

  if (range) {
    notasRec = await window.api.getNotasRecebidasByRange(activeId, tipo, range.inicio, range.fim, status);
  } else {
    notasRec = await window.api.getNotasRecebidas(activeId, 'todas', status);
  }

  let totalServico = 0, totalLiquido = 0, autorizadas = 0, canceladas = 0, substituidas = 0;
  for (const n of notasRec) {
    if (n.status === 'Autorizada') {
      autorizadas++;
      totalServico += n.valor_servico || 0;
      totalLiquido += n.valor_liquido || 0;
    } else if (n.status === 'Substituida') { substituidas++; }
    else { canceladas++; }
  }

  animateCountUp('sTotalRec', notasRec.length, false, 600);
  document.getElementById('sTotalSubRec').textContent = range ? `${range.inicio} a ${range.fim}` : 'Todas';
  animateCountUp('sValorRec', totalServico, true, 800);
  document.getElementById('sValorSubRec').textContent = 'Valor bruto dos servicos tomados';
  animateCountUp('sOkRec', autorizadas, false, 600);
  document.getElementById('sOkSubRec').textContent = notasRec.length > 0 ? ((autorizadas / notasRec.length * 100).toFixed(1) + '%') : '-';
  animateCountUp('sCancRec', canceladas + substituidas, false, 600);
  document.getElementById('sCancSubRec').textContent = `${canceladas} canc. / ${substituidas} subst.`;

  document.getElementById('navCountRec').textContent = notasRec.length;
  _recCachedId = activeId;
  tPageRec = 1;
  renderTableRec();
}

async function loadDashRecebidas(force = false) {
  if (!calFilterRec) initCalendarRec();
  if (!force && _recCachedId === activeId) { renderTableRec(); return; }
  await applyFiltersRec();
}

function getFilteredNotasRec() {
  const q = (document.getElementById('fSearchRec')?.value || '').toLowerCase();
  return q ? notasRec.filter(n => (n.numero || '').toLowerCase().includes(q) || (n.prestador_razao || '').toLowerCase().includes(q) || (n.tomador_razao || '').toLowerCase().includes(q)) : notasRec;
}

function renderTableRec() {
  const f = getFilteredNotasRec();
  const total = f.length;
  const totalPages = Math.max(1, Math.ceil(total / tPerPage));
  if (tPageRec > totalPages) tPageRec = totalPages;
  const start = (tPageRec - 1) * tPerPage;
  const slice = f.slice(start, start + tPerPage);

  document.getElementById('tCountRec').textContent = total + ' registros';
  document.getElementById('tPageInfoRec').textContent = total > 0 ? `Pagina ${tPageRec} de ${totalPages}` : 'Nenhuma nota';
  document.getElementById('tPrevRec').disabled = tPageRec <= 1;
  document.getElementById('tNextRec').disabled = tPageRec >= totalPages;

  const tbody = document.getElementById('tBodyRec');
  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted)">Nenhuma nota tomada encontrada. Clique em "Sincronizar Tomadas" para buscar.</td></tr>';
    return;
  }
  tbody.innerHTML = slice.map(n => {
    const hasXml = n.has_xml || n.chave_acesso;
    const xmlBtn = hasXml ? `<img src="renderer/icons/botao-xml.svg" onclick="downloadNotaXml(${n.id})" title="Baixar XML" class="action-btn" draggable="false" style="height:26px;width:auto;cursor:pointer;user-select:none;">` : '';
    const pdfBtn = hasXml ? `<img src="renderer/icons/botao-danfse.svg" onclick="downloadNotaDanfe(${n.id})" title="Baixar DANFSe" class="action-btn" draggable="false" style="height:26px;width:auto;cursor:pointer;user-select:none;">` : '';
    return `<tr>
      <td>${n.data_emissao || '-'}</td>
      <td class="fw600">${n.numero || '-'}</td>
      <td title="${(n.prestador_razao || '').replace(/"/g,'&quot;')}">${n.prestador_razao || '-'}</td>
      <td>${n.municipio_prestacao || '-'}</td>
      <td>${n.competencia || '-'}</td>
      <td class="money">${fmtM(n.valor_servico)}</td>
      <td class="money">${fmtM(n.valor_liquido)}</td>
      <td>${getStatusBadge(n.status)}</td>
      <td style="white-space:nowrap;overflow:visible;max-width:none;min-width:150px">${xmlBtn}<span style="width:4px;display:inline-block"></span>${pdfBtn}</td>
    </tr>`;
  }).join('');
}

function prevPageRec() { if (tPageRec > 1) { tPageRec--; renderTableRec(); } }
function nextPageRec() { tPageRec++; renderTableRec(); }
const filterTableRec = debounce(function() { tPageRec = 1; renderTableRec(); }, 150);

function getActiveFiltersRec() {
  const tipo = document.getElementById('fTipoRec')?.value || 'competencia';
  const status = document.getElementById('fStatusRec')?.value || 'todos';
  const range = calFilterRec ? calFilterRec.getRange() : null;
  const filters = { tipo, status };
  if (range) { filters.inicio = range.inicio; filters.fim = range.fim; }
  return filters;
}

async function exportExcelRec() {
  if (!activeId) { showAlert('Selecione empresa'); return; }
  const filters = getActiveFiltersRec();
  showTopSync('Gerando planilha Excel...', 30);
  try {
    const r = await window.api.exportExcelRecebidas(activeId, filters);
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}

async function downloadXmlZipRec() {
  if (!activeId) { showAlert('Selecione empresa'); return; }
  const filters = getActiveFiltersRec();
  showTopSync('Comprimindo XMLs...', 30);
  try {
    const r = await window.api.downloadXmlZipRecebidas(activeId, filters);
    if (r.error) showAlert(r.error);
  } finally { hideTopSync(); }
}

// ── Inicializacao ──
checkTerms();
init();
loadAutoSyncConfig();
// Carrega contagem de alertas ao iniciar (mesmo filtro de loadAlertas)
window.api.getAlertas().then(allRows => {
  const now = new Date();
  const curMM = String(now.getMonth() + 1).padStart(2, '0'), curYY = String(now.getFullYear());
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMM = String(prev.getMonth() + 1).padStart(2, '0'), prevYY = String(prev.getFullYear());
  const rows = allRows.filter(n => {
    if (!n.data_emissao) return false;
    const emMM = n.data_emissao.substring(3, 5), emYY = n.data_emissao.substring(6, 10);
    return (emMM === curMM && emYY === curYY) || (emMM === prevMM && emYY === prevYY);
  });
  document.getElementById('navAlertCount').textContent = rows.length;
});
