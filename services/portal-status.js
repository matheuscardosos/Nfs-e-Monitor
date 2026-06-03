const axios = require('axios');

const LOGIN_URL  = 'https://www.nfse.gov.br/EmissorNacional/Login?ReturnUrl=%2FDashboard';
const CANARY_URL = 'https://1.1.1.1';
const SAMPLES = 10;
const TIMEOUT = 10000;
const FAST_MS = 3000;

// Pontuação: ok+rápida=2pts | ok+lenta=1pt | falha=0pts. Max=20
// green>=18 | yellow>=10 | red<10
// offline: canary falhou junto com todos probes — não salva no histórico

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0';

async function probe() {
  const t = Date.now();
  try {
    const res = await axios.get(LOGIN_URL, {
      timeout: TIMEOUT,
      maxRedirects: 5,
      validateStatus: s => s < 600,
      headers: { 'User-Agent': UA },
    });
    return { ok: res.status >= 200 && res.status < 400, ms: Date.now() - t, status: res.status };
  } catch (e) {
    return { ok: false, ms: Date.now() - t, status: e.code || e.message };
  }
}

async function canaryOk() {
  try {
    await axios.head(CANARY_URL, { timeout: 4000, validateStatus: s => s < 600 });
    return true;
  } catch {
    return false;
  }
}

async function checkPortalStatus() {
  const [results, online] = await Promise.all([
    Promise.all(Array.from({ length: SAMPLES }, () => probe())),
    canaryOk(),
  ]);

  const failed = results.filter(r => !r.ok).length;

  console.log('[portal-status] canary ok:', online);
  results.forEach((r, i) => {
    console.log(`[portal-status] probe ${i + 1}: status=${r.status} ms=${r.ms} ok=${r.ok}`);
  });

  if (!online && failed === SAMPLES) {
    console.log('[portal-status] resultado: offline (sem internet)');
    return { level: 'offline', message: 'Sem conexao com a internet.', offline: true, samples: null, checkedAt: Date.now() };
  }

  const good  = results.filter(r => r.ok && r.ms < FAST_MS).length;
  const slow  = results.filter(r => r.ok && r.ms >= FAST_MS).length;
  const score = good * 2 + slow;

  const okResults = results.filter(r => r.ok);
  const avgMs = okResults.length
    ? Math.round(okResults.reduce((s, r) => s + r.ms, 0) / okResults.length)
    : null;

  console.log(`[portal-status] good=${good} slow=${slow} failed=${failed} score=${score}/${SAMPLES * 2} avgMs=${avgMs}`);

  let level, message;
  if (score >= 18) {
    level = 'green'; message = 'Servico operando normalmente.';
  } else if (score >= 10) {
    level = 'yellow'; message = 'Funcionamento parcial com impacto limitado.';
  } else {
    level = 'red';
    message = failed === SAMPLES ? 'Servico indisponivel.' : 'Indisponibilidade detectada em componentes essenciais.';
  }

  console.log(`[portal-status] resultado: ${level}`);

  return {
    level,
    message,
    samples: { good, slow, failed, score, maxScore: SAMPLES * 2, avgMs },
    checkedAt: Date.now(),
  };
}

module.exports = { checkPortalStatus };
