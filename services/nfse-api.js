const fs = require('fs');
const https = require('https');
const axios = require('axios');

const BASE = 'https://www.nfse.gov.br/EmissorNacional';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36 Edg/147.0.0.0';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createHttpsAgent(certPath, certPassword) {
  const pfxData = fs.readFileSync(certPath);
  return new https.Agent({
    pfx: pfxData,
    passphrase: certPassword,
    rejectUnauthorized: false,
    keepAlive: true
  });
}

// Cria sessao autenticada com certificado digital
async function createSession(empresa) {
  const agent = createHttpsAgent(empresa.cert_path, empresa.cert_password);
  const cookies = {};

  function extractCookies(resp) {
    const setCookie = resp.headers['set-cookie'];
    if (setCookie) {
      for (const c of (Array.isArray(setCookie) ? setCookie : [setCookie])) {
        const pair = c.split(';')[0];
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) {
          const name = pair.substring(0, eqIdx).trim();
          const val = pair.substring(eqIdx + 1);
          cookies[name] = val;
        }
      }
    }
  }

  function cookieHeader() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  // Segue redirects manualmente para capturar cookies
  async function manualGet(url, depth = 0) {
    if (depth > 10) throw new Error('Redirecionamentos demais');
    const resp = await axios.get(url, {
      httpsAgent: agent,
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cookie': cookieHeader(),
        'Cache-Control': 'no-cache'
      }
    });
    extractCookies(resp);
    if ((resp.status === 301 || resp.status === 302) && resp.headers.location) {
      let loc = resp.headers.location;
      if (loc.startsWith('/')) loc = 'https://www.nfse.gov.br' + loc;
      if (depth === 0) console.log('[nfse-api] Redirect ->', loc);
      return manualGet(loc, depth + 1);
    }
    return resp;
  }

  // Passo 1: Pega pagina de login (pode setar cookies iniciais)
  console.log('[nfse-api] Autenticando via certificado...');
  await manualGet(`${BASE}/Login`);

  // Passo 2: Endpoint de certificado (autenticacao TLS acontece aqui)
  const authResp = await manualGet(`${BASE}/Certificado`);
  if (authResp.status >= 400) {
    throw new Error(`Autenticacao falhou, status: ${authResp.status}`);
  }

  console.log('[nfse-api] Sessao autenticada, cookies:', Object.keys(cookies).join(', '));

  // Sessao autenticada - metodo get
  return {
    get: async (url, opts = {}) => {
      if (opts.responseType === 'arraybuffer') {
        // Requisicao direta para dados binarios (ex: PDF)
        const resp = await axios.get(url, {
          httpsAgent: agent,
          timeout: 30000,
          maxRedirects: 5,
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': UA,
            'Cookie': cookieHeader(),
          }
        });
        return resp;
      }
      return manualGet(url);
    },
    cookies,
    agent
  };
}

// Cria sessao autenticada com CNPJ + senha (login portal)
async function createSessionByPassword(empresa) {
  const cookies = {};

  function extractCookies(resp) {
    const setCookie = resp.headers['set-cookie'];
    if (setCookie) {
      for (const c of (Array.isArray(setCookie) ? setCookie : [setCookie])) {
        const pair = c.split(';')[0];
        const eqIdx = pair.indexOf('=');
        if (eqIdx > 0) {
          const name = pair.substring(0, eqIdx).trim();
          const val = pair.substring(eqIdx + 1);
          cookies[name] = val;
        }
      }
    }
  }

  function cookieHeader() {
    return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  }

  const defaultHeaders = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Cache-Control': 'no-cache'
  };

  // Passo 1: Pega pagina de login para extrair token CSRF e cookies
  console.log('[nfse-api] Autenticando via senha do portal...');
  const loginUrl = `${BASE}/Login?ReturnUrl=%2FEmissorNacional%2FNotas%2FEmitidas`;
  const loginResp = await axios.get(loginUrl, {
    timeout: 30000,
    maxRedirects: 5,
    headers: { ...defaultHeaders, 'Cookie': cookieHeader() }
  });
  extractCookies(loginResp);

  // Extrai token CSRF do HTML
  const tokenMatch = loginResp.data.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
  if (!tokenMatch) {
    throw new Error('Nao foi possivel extrair token de verificacao da pagina de login');
  }
  const csrfToken = tokenMatch[1];

  // Passo 2: POST login com CNPJ + Senha + Token
  const cnpj = empresa.cnpj; // ja formatado como 29.036.800/0001-44
  const postData = `__RequestVerificationToken=${encodeURIComponent(csrfToken)}&Inscricao=${encodeURIComponent(cnpj)}&Senha=${encodeURIComponent(empresa.portal_senha)}`;

  const postResp = await axios.post(loginUrl, postData, {
    timeout: 30000,
    maxRedirects: 0,
    validateStatus: () => true,
    headers: {
      ...defaultHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieHeader(),
      'Origin': 'https://www.nfse.gov.br',
      'Referer': loginUrl
    }
  });
  extractCookies(postResp);

  // Verifica redirect (302 = login ok)
  if (postResp.status === 302 && postResp.headers.location) {
    // Segue redirect para abrir sessao
    let loc = postResp.headers.location;
    if (loc.startsWith('/')) loc = 'https://www.nfse.gov.br' + loc;
    console.log('[nfse-api] Login por senha OK, redirect ->', loc);

    const dashResp = await axios.get(loc, {
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: () => true,
      headers: { ...defaultHeaders, 'Cookie': cookieHeader() }
    });
    extractCookies(dashResp);
  } else if (postResp.status === 200) {
    // 200 = login falhou (voltou pra mesma pagina com erro)
    throw new Error('Login falhou - senha ou CNPJ incorretos');
  } else {
    throw new Error(`Login falhou, status: ${postResp.status}`);
  }

  console.log('[nfse-api] Sessao autenticada por senha, cookies:', Object.keys(cookies).join(', '));

  // Retorna sessao no mesmo formato da sessao por certificado
  async function manualGet(url, depth = 0) {
    if (depth > 10) throw new Error('Redirecionamentos demais');
    const resp = await axios.get(url, {
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { ...defaultHeaders, 'Cookie': cookieHeader() }
    });
    extractCookies(resp);
    if ((resp.status === 301 || resp.status === 302) && resp.headers.location) {
      let loc = resp.headers.location;
      if (loc.startsWith('/')) loc = 'https://www.nfse.gov.br' + loc;
      return manualGet(loc, depth + 1);
    }
    return resp;
  }

  return {
    get: async (url, opts = {}) => {
      if (opts.responseType === 'arraybuffer') {
        const resp = await axios.get(url, {
          timeout: 30000,
          maxRedirects: 5,
          responseType: 'arraybuffer',
          headers: { 'User-Agent': UA, 'Cookie': cookieHeader() }
        });
        return resp;
      }
      return manualGet(url);
    },
    cookies,
    agent: null
  };
}

// Seleciona tipo de sessao automatico pelo auth_type
async function createSessionAuto(empresa) {
  if (empresa.auth_type === 'senha') {
    if (!empresa.portal_senha) throw new Error('Senha do portal nao configurada');
    return createSessionByPassword(empresa);
  }
  // Padrao: certificado
  if (!empresa.cert_path) throw new Error('Certificado nao configurado');
  return createSession(empresa);
}

async function fetchEmitidas(empresa, dataInicio, dataFim, progressCallback) {
  if (progressCallback) progressCallback(empresa.auth_type === 'senha' ? 'Autenticando com senha do portal...' : 'Autenticando com certificado...');

  const session = await createSessionAuto(empresa);
  const allNotas = [];
  let pagina = 1;

  while (pagina <= 100) {
    try {
      if (progressCallback) {
        progressCallback(`Buscando pagina ${pagina}...`);
      }

      const dtIniEnc = encodeURIComponent(dataInicio);
      const dtFimEnc = encodeURIComponent(dataFim);
      const url = `${BASE}/Notas/Emitidas?pg=${pagina}&busca=&datainicio=${dtIniEnc}&datafim=${dtFimEnc}`;

      const response = await session.get(url);

      const html = response.data;

      // Detecta se caiu na pagina de login
      if (typeof html === 'string' && html.includes('Login?ReturnUrl=') && !html.includes('accessToken')) {
        console.error('[nfse-api] Sessao expirou, redirecionado ao login');
        if (pagina === 1) throw new Error('Falha na autenticacao - redirecionado ao login');
        break;
      }

      const notas = parseNotasFromHtml(html, empresa.id);
      console.log(`[nfse-api] Pagina ${pagina}: ${notas.length} notas encontradas`);
      if (notas.length === 0) break;

      for (const nota of notas) {
        if (!allNotas.some(n => n.chave_acesso === nota.chave_acesso)) {
          allNotas.push(nota);
        }
      }

      if (progressCallback) {
        progressCallback(`Pagina ${pagina}: ${notas.length} notas (total: ${allNotas.length})`);
      }

      if (notas.length < 15) break;
      pagina++;
      await sleep(500);
    } catch (e) {
      console.error('[nfse-api] Erro ao buscar pagina', pagina, e.message);
      if (pagina === 1) throw e;
      break;
    }
  }
  return { notas: allNotas, session };
}

async function downloadXml(chaveAcesso, session) {
  try {
    const url = `${BASE}/Notas/Download/NFSe/${chaveAcesso}`;
    const response = await session.get(url, { responseType: 'text' });
    return response.data;
  } catch (e) {
    console.error('[nfse-api] Erro download XML:', chaveAcesso, e.message);
    return null;
  }
}

function parseNotasFromHtml(html, empresaId) {
  const notas = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  // Detecta ordem das colunas do cabecalho
  let colMap = null;
  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  if (theadMatch) {
    const thRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let thMatch;
    const headers = [];
    while ((thMatch = thRegex.exec(theadMatch[1])) !== null) {
      headers.push(thMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase());
    }
    if (headers.length >= 4) {
      colMap = {};
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        if (h.includes('numero') || h.includes('nº') || h.includes('num')) colMap.numero = i;
        else if (h.includes('gera')) colMap.data = i;
        else if (h === 'emissão' || h === 'emissao' || h === 'data') colMap.data = i;
        else if (h.includes('emitida para') || h.includes('tomador') || h.includes('destinat')) colMap.tomador = i;
        else if (h.includes('compet')) colMap.competencia = i;
        else if (h.includes('munic')) colMap.municipio = i;
        else if (h.includes('pre') && h.includes('o') && h.includes('r$')) colMap.valor = i;
        else if (h.includes('valor') || h.includes('total')) colMap.valor = i;
        else if (h.includes('situac') || h.includes('status') || h.includes('situa')) colMap.status = i;
      }
      console.log('[nfse-api] Colunas detectadas:', JSON.stringify(colMap), 'de', headers);
    }
  }

  // Fallback: indices fixos de coluna
  const iNumero = colMap?.numero ?? 0;
  const iData = colMap?.data ?? 1;
  const iTomador = colMap?.tomador ?? 2;
  const iValor = colMap?.valor ?? 3;
  const iCompetencia = colMap?.competencia ?? null;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    const tds = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      tds.push(tdMatch[1].replace(/<[^>]+>/g, '').trim());
    }

    if (tds.length >= 4) {
      const vizMatch = trContent.match(/href="([^"]*\/Visualizar\/[^"]*)"/i);
      let chave = '';
      if (vizMatch) {
        const parts = vizMatch[1].split('/');
        chave = parts[parts.length - 1];
      }

      const situacaoImg = trContent.match(/data-original-title="([^"]*)"/i)
        || trContent.match(/title="([^"]*)"/i);
      let status = 'Autorizada';
      if (situacaoImg) {
        const tip = situacaoImg[1].toLowerCase();
        if (tip.includes('cancelad')) status = 'Cancelada';
        else if (tip.includes('substitui')) status = 'Substituida';
      }

      const rawNumero = tds[iNumero] || '';
      const rawData = tds[iData] || '';
      const rawTomador = tds[iTomador] || '';
      const rawValor = tds[iValor] || '';

      // Limpa data e pega primeiro dd/mm/yyyy
      const cleanedData = rawData.replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();
      const dateMatch = cleanedData.match(/(\d{2}\/\d{2}\/\d{4})/);
      const dataStr = dateMatch ? dateMatch[1] : '';

      // Competencia: usa coluna dedicada ou tira da data
      let competencia = '';
      if (iCompetencia !== null && tds[iCompetencia]) {
        competencia = tds[iCompetencia].replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();
      } else if (dataStr) {
        const parts = dataStr.split('/');
        if (parts.length >= 3) {
          competencia = `${parts[1]}/${parts[2]}`;
        }
      }

      // Pula linhas que nao parecem notas (sem data)
      if (!dataStr) {
        console.log('[nfse-api] Linha ignorada (sem data):', JSON.stringify(rawData), '| cols:', tds.slice(0, 6).join(' | '));
        continue;
      }

      // Limpa tomador: remove CPF/CNPJ prefixo
      const cleanTomador = rawTomador.replace(/[\r\n]+/g, ' ').replace(/^\d[\d.\/-]+\s*-?\s*/, '').trim();

      notas.push({
        empresa_id: empresaId,
        numero: rawNumero,
        chave_acesso: chave,
        data_emissao: dataStr,
        competencia,
        tomador_razao: cleanTomador || rawTomador,
        valor_servico: parseValor(rawValor),
        status
      });
    }
  }
  return notas;
}

function parseXmlDetails(xmlText) {
  // Pega valor da tag XML (primeira ocorrencia)
  const get = (tag) => {
    const match = xmlText.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
    return match ? match[1].trim() : '';
  };
  const getNum = (tag) => parseFloat(get(tag)) || 0;

  // Pega de contexto especifico pra evitar ambiguidade
  const getIn = (parent, tag) => {
    const pMatch = xmlText.match(new RegExp(`<${parent}[^>]*>([\\s\\S]*?)</${parent}>`, 'i'));
    if (!pMatch) return '';
    const inner = pMatch[1];
    const tMatch = inner.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
    return tMatch ? tMatch[1].trim() : '';
  };

  // Converte dCompet (YYYY-MM-DD) pra competencia (MM/YYYY)
  const dCompet = get('dCompet');
  let competencia = '';
  if (dCompet) {
    const parts = dCompet.split('-');
    if (parts.length >= 2) competencia = `${parts[1]}/${parts[0]}`;
  }

  // dhEmi -> data emissao (DD/MM/YYYY)
  const dhEmi = get('dhEmi');
  let dataEmissao = '';
  if (dhEmi) {
    const d = new Date(dhEmi);
    if (!isNaN(d)) dataEmissao = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  // Tomador: CPF ou CNPJ
  const tomadorCnpj = getIn('toma', 'CNPJ') || getIn('toma', 'CPF') || '';
  const tomadorRazao = getIn('toma', 'xNome') || '';

  return {
    numero: get('nNFSe'),
    dataEmissao,
    competencia,
    prestadorCnpj: getIn('emit', 'CNPJ') || get('CNPJ'),
    prestadorRazao: getIn('emit', 'xNome') || get('xNome'),
    tomadorCnpj,
    tomadorRazao,
    descricaoServico: get('xDescServ').replace(/[\r\n]+/g, ' ').substring(0, 500),
    codigoTributacao: get('cTribNac'),
    valorServico: getNum('vServ'),
    valorIss: getNum('vISSQN'),
    issRetido: getNum('vRetISSQN') || 0,
    pisRetido: getNum('vRetPIS') || 0,
    cofinsRetido: getNum('vRetCOFINS') || 0,
    irRetido: getNum('vRetIRRF') || 0,
    csllRetido: getNum('vRetCSLL') || 0,
    inssRetido: getNum('vRetCP') || 0,
    valorLiquido: getNum('vLiq') || 0,
    municipioPrestacao: get('xLocPrestacao') || get('xLocEmi') || ''
  };
}

function parseValor(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[R$\s.]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

// Gera blocos de 30 dias entre duas datas (formato DD/MM/YYYY)
function generate30DayChunks(dataInicio, dataFim) {
  const [di, mi, yi] = dataInicio.split('/').map(Number);
  const [df, mf, yf] = dataFim.split('/').map(Number);
  const start = new Date(yi, mi - 1, di);
  const end = new Date(yf, mf - 1, df);
  const chunks = [];
  let cur = new Date(start);
  while (cur <= end) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + 29);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    chunks.push({ inicio: fmt(cur), fim: fmt(actualEnd) });
    cur = new Date(actualEnd);
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

async function fetchRecebidas(empresa, dataInicio, dataFim, progressCallback, existingSession = null) {
  if (!existingSession && progressCallback) progressCallback(empresa.auth_type === 'senha' ? 'Autenticando com senha do portal...' : 'Autenticando com certificado...');

  const session = existingSession || await createSessionAuto(empresa);
  const allNotas = [];
  let pagina = 1;

  while (pagina <= 100) {
    try {
      if (progressCallback) progressCallback(`Buscando pagina ${pagina}...`);

      const dtIniEnc = encodeURIComponent(dataInicio);
      const dtFimEnc = encodeURIComponent(dataFim);
      const url = `${BASE}/Notas/Recebidas?pg=${pagina}&executar=1&busca=&datainicio=${dtIniEnc}&datafim=${dtFimEnc}`;

      const response = await session.get(url);
      const html = response.data;

      if (typeof html === 'string' && html.includes('Login?ReturnUrl=') && !html.includes('accessToken')) {
        console.error('[nfse-api] Sessao expirou ao buscar recebidas');
        if (pagina === 1) throw new Error('Falha na autenticacao - redirecionado ao login');
        break;
      }

      const notas = parseRecebidasFromHtml(html, empresa.id);
      console.log(`[nfse-api] Recebidas pagina ${pagina}: ${notas.length} notas encontradas`);
      if (notas.length === 0) break;

      for (const nota of notas) {
        if (!allNotas.some(n => n.chave_acesso === nota.chave_acesso)) {
          allNotas.push(nota);
        }
      }

      if (progressCallback) progressCallback(`Pagina ${pagina}: ${notas.length} notas (total: ${allNotas.length})`);

      if (notas.length < 15) break;
      pagina++;
      await sleep(500);
    } catch (e) {
      console.error('[nfse-api] Erro ao buscar recebidas pagina', pagina, e.message);
      if (pagina === 1) throw e;
      break;
    }
  }
  return { notas: allNotas, session };
}

function parseRecebidasFromHtml(html, empresaId) {
  const notas = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const trContent = trMatch[1];
    const tds = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trContent)) !== null) {
      tds.push(tdMatch[1]);
    }

    if (tds.length < 4) continue;

    // chave_acesso extraida do link Visualizar
    const vizMatch = trContent.match(/href="([^"]*\/Visualizar\/[^"]*)"/i);
    if (!vizMatch) continue;
    const parts = vizMatch[1].split('/');
    const chave = parts[parts.length - 1];
    if (!chave || chave.length < 10) continue;

    // Status: detecta pelos nomes dos SVGs (tb-cancelada, tb-substituida, tb-gerada -> Autorizada)
    let status = 'Autorizada';
    if (/tb-cancelad/i.test(trContent)) status = 'Cancelada';
    else if (/tb-substitui/i.test(trContent)) status = 'Substituida';

    // Data de td[0]: "02/04/26 02:16" (ano 2 digitos) ou "DD/MM/YYYY"
    const rawData = tds[0].replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/\u00A0/g, ' ').replace(/[\r\n\t]+/g, ' ').trim();
    let dataStr = '';
    const m2d = rawData.match(/(\d{2})\/(\d{2})\/(\d{2})(?:\s|$)/);
    if (m2d) {
      dataStr = `${m2d[1]}/${m2d[2]}/20${m2d[3]}`;
    } else {
      const m4d = rawData.match(/(\d{2}\/\d{2}\/\d{4})/);
      dataStr = m4d ? m4d[1] : '';
    }
    if (!dataStr) continue;

    // prestador de td[1]: "06.990.590/0001-23 - GOOGLE BRASIL..."
    const rawPrestador = tds[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const cnpjMatch = rawPrestador.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || rawPrestador.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    const prestadorCnpj = cnpjMatch ? cnpjMatch[0] : '';
    const dashIdx = rawPrestador.indexOf(' - ');
    const prestadorRazao = dashIdx >= 0 ? rawPrestador.substring(dashIdx + 3).trim() : rawPrestador.replace(prestadorCnpj, '').replace(/^\s*-?\s*/, '').trim();

    // Competencia de td[2]
    const competencia = tds[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    // Valor de td[3]
    const valor = parseValor(tds[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());

    notas.push({
      empresa_id: empresaId,
      chave_acesso: chave,
      data_emissao: dataStr,
      competencia,
      prestador_cnpj: prestadorCnpj,
      prestador_razao: prestadorRazao,
      valor_servico: valor,
      status,
      tipo: 'recebida'
    });
  }
  return notas;
}

module.exports = { fetchEmitidas, fetchRecebidas, downloadXml, parseXmlDetails, sleep, generate30DayChunks, createSession, createSessionByPassword, createSessionAuto };
