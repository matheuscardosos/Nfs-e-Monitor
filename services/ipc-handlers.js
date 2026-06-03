const fs = require('fs');
const path = require('path');
const { parsePfxCertificate, formatCnpj } = require('./certificate');
const { fetchEmitidas, fetchRecebidas, downloadXml, parseXmlDetails, sleep, generate30DayChunks } = require('./nfse-api');
const { checkPortalStatus } = require('./portal-status');

function setupIpcHandlers(ipcMain, db, getMainWindow, dialog, app) {

  ipcMain.handle('check-portal-status', async () => {
    const result = await checkPortalStatus();
    if (!result.offline) {
      try {
        db.prepare(
          'INSERT INTO portal_status_history (checked_at, level, score, avg_ms, good, slow, failed) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(
          result.checkedAt,
          result.level,
          result.samples.score,
          result.samples.avgMs,
          result.samples.good,
          result.samples.slow,
          result.samples.failed
        );
        // Purga entradas mais antigas que 30 dias
        db.prepare('DELETE FROM portal_status_history WHERE checked_at < ?').run(
          Date.now() - 30 * 24 * 60 * 60 * 1000
        );
      } catch (e) { /* silencioso */ }
    }
    return result;
  });

  ipcMain.handle('get-portal-status-history', () => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return db.prepare(
      'SELECT * FROM portal_status_history WHERE checked_at >= ? ORDER BY checked_at ASC'
    ).all(cutoff);
  });

  const NOTIF_KEYS = ['notif_sync_novas', 'notif_atualizacao', 'notif_offline', 'notif_portal_instavel', 'notif_sync_erro'];

  ipcMain.handle('get-notif-config', () => {
    const result = {};
    for (const k of NOTIF_KEYS) {
      const row = db.prepare("SELECT valor FROM config WHERE chave = ?").get(k);
      result[k] = row ? row.valor === '1' : true;
    }
    return result;
  });

  ipcMain.handle('set-notif-config', (_, key, value) => {
    if (!NOTIF_KEYS.includes(key)) return { error: 'Chave invalida' };
    db.prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)").run(key, value ? '1' : '0');
    return { success: true };
  });

  ipcMain.handle('refocus-window', () => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.focus();
  });

  ipcMain.handle('show-confirm-dialog', async (_, message) => {
    const win = getMainWindow();
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancelar', 'Confirmar'],
      defaultId: 1,
      cancelId: 0,
      message
    });
    return response === 1;
  });

  // --- EMPRESAS ---
  ipcMain.handle('get-empresas', () => {
    return db.prepare('SELECT * FROM empresas ORDER BY razao_social').all();
  });

  ipcMain.handle('get-empresa', (_, id) => {
    return db.prepare('SELECT * FROM empresas WHERE id = ?').get(id);
  });

  ipcMain.handle('add-empresa', (_, data) => {
    const cnpjFormatted = formatCnpj(data.cnpj);
    const existing = db.prepare('SELECT id FROM empresas WHERE cnpj = ?').get(cnpjFormatted);
    if (existing) return { error: `Ja existe uma empresa cadastrada com o CNPJ ${cnpjFormatted}.` };
    try {
      const stmt = db.prepare(`
        INSERT INTO empresas (razao_social, cnpj, inscricao_municipal, municipio, uf, regime, cert_path, cert_password, cert_cn, cert_validade, cert_emissao, cor, auth_type, portal_senha)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(
        data.razao_social, cnpjFormatted, data.inscricao_municipal || '',
        data.municipio || '', data.uf || '', data.regime || '',
        data.cert_path || '', data.cert_password || '', data.cert_cn || '',
        data.cert_validade || '', data.cert_emissao || '', data.cor || '#2563eb',
        data.auth_type || 'certificado', data.portal_senha || ''
      );
      return { id: result.lastInsertRowid };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('test-portal-login', async (_, cnpj, senha) => {
    try {
      const nfseApi = require('./nfse-api');
      await nfseApi.createSessionByPassword({ cnpj, portal_senha: senha });
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ipcMain.handle('update-empresa', (_, id, data) => {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(', ');
    const values = Object.values(data);
    db.prepare(`UPDATE empresas SET ${fields}, atualizado_em = datetime('now','localtime') WHERE id = ?`).run(...values, id);
    return true;
  });

  ipcMain.handle('delete-empresa', (_, id) => {
    db.prepare('DELETE FROM notas WHERE empresa_id = ?').run(id);
    db.prepare('DELETE FROM sync_log WHERE empresa_id = ?').run(id);
    db.prepare('DELETE FROM empresas WHERE id = ?').run(id);
    return true;
  });

  ipcMain.handle('toggle-autosync-pause', (_, empresaId) => {
    const emp = db.prepare('SELECT autosync_paused FROM empresas WHERE id = ?').get(empresaId);
    if (!emp) return { error: 'Empresa nao encontrada' };
    const newVal = emp.autosync_paused ? 0 : 1;
    db.prepare('UPDATE empresas SET autosync_paused = ? WHERE id = ?').run(newVal, empresaId);
    return { paused: !!newVal };
  });

  // --- CERTIFICADO ---
  ipcMain.handle('select-certificate', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      title: 'Selecionar Certificado Digital A1 (.pfx)',
      filters: [{ name: 'Certificado PFX', extensions: ['pfx', 'p12'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('parse-certificate', (_, filePath, password) => {
    return parsePfxCertificate(filePath, password);
  });

  ipcMain.handle('fetch-cnpj-data', async (_, cnpj) => {
    try {
      const cleanCnpj = cnpj.replace(/\D/g, '');
      const https = require('https');

      const fetchCnpj = (attempt = 0) => new Promise((resolve, reject) => {
        const opts = {
          hostname: 'brasilapi.com.br',
          path: `/api/cnpj/v1/${cleanCnpj}`,
          headers: { 'User-Agent': 'NFS-e Monitor/1.0' }
        };
        https.get(opts, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode === 200) {
              resolve(JSON.parse(body));
            } else if (res.statusCode === 429 && attempt < 3) {
              const delay = (attempt + 1) * 2000;
              setTimeout(() => fetchCnpj(attempt + 1).then(resolve, reject), delay);
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          });
        }).on('error', reject);
      });

      const data = await fetchCnpj();

      // Determina regime tributario
      let regime = '';
      if (data.opcao_pelo_simples === true) {
        regime = 'Simples Nacional';
      } else if (data.opcao_pelo_mei === true) {
        regime = 'MEI';
      } else if (data.regime_tributario && data.regime_tributario.length > 0) {
        const sorted = [...data.regime_tributario].sort((a, b) => b.ano - a.ano);
        const latest = sorted[0].forma_de_tributacao;
        if (latest.includes('PRESUMIDO')) regime = 'Lucro Presumido';
        else if (latest.includes('REAL')) regime = 'Lucro Real';
        else regime = latest;
      }

      return {
        razao_social: data.razao_social || '',
        nome_fantasia: data.nome_fantasia || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        regime,
        porte: data.porte || '',
        cnae: data.cnae_fiscal_descricao || '',
        situacao: data.descricao_situacao_cadastral || '',
        codigo_municipio_ibge: data.codigo_municipio_ibge || '',
      };
    } catch (e) {
      return { error: 'Nao foi possivel consultar CNPJ: ' + e.message };
    }
  });

  // --- NOTAS ---
  ipcMain.handle('get-notas', (_, empresaId, competencia, status) => {
    let sql = 'SELECT id, empresa_id, numero, chave_acesso, data_emissao, competencia, status, valor_servico, prestador_cnpj, prestador_razao, tomador_cnpj, tomador_razao, descricao_servico, codigo_tributacao, valor_iss, iss_retido, pis_retido, cofins_retido, ir_retido, csll_retido, inss_retido, valor_liquido, municipio_prestacao, (CASE WHEN xml_content IS NOT NULL THEN 1 ELSE 0 END) as has_xml FROM notas WHERE empresa_id = ? AND (tipo = \'emitida\' OR tipo IS NULL)';
    const params = [empresaId];

    if (competencia && competencia !== 'todas') {
      sql += ' AND competencia = ?';
      params.push(competencia);
    }
    if (status && status !== 'todos') {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY data_emissao DESC';
    return db.prepare(sql).all(params);
  });

  ipcMain.handle('get-competencias', (_, empresaId) => {
    return db.prepare(
      'SELECT DISTINCT competencia FROM notas WHERE empresa_id = ? AND (tipo = \'emitida\' OR tipo IS NULL) AND competencia IS NOT NULL AND competencia != "" ORDER BY substr(competencia,4,4) || substr(competencia,1,2) DESC'
    ).all(empresaId).map(r => r.competencia);
  });

  ipcMain.handle('get-stats', (_, empresaId, competencia) => {
    let where = 'WHERE empresa_id = ? AND (tipo = \'emitida\' OR tipo IS NULL)';
    const params = [empresaId];
    if (competencia && competencia !== 'todas') {
      where += ' AND competencia = ?';
      params.push(competencia);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM notas ${where}`).get(...params);
    const autorizadas = db.prepare(`SELECT COUNT(*) as count FROM notas ${where} AND status = 'Autorizada'`).get(...params);
    const canceladas = db.prepare(`SELECT COUNT(*) as count FROM notas ${where} AND (status = 'Cancelada' OR status = 'Substituida')`).get(...params);
    const valores = db.prepare(`
      SELECT COALESCE(SUM(valor_servico),0) as total_servico,
             COALESCE(SUM(valor_liquido),0) as total_liquido,
             COALESCE(SUM(iss_retido + pis_retido + cofins_retido + ir_retido + csll_retido + inss_retido),0) as total_retencoes
      FROM notas ${where} AND status = 'Autorizada'
    `).get(...params);

    return {
      total: total.count,
      autorizadas: autorizadas.count,
      canceladas: canceladas.count,
      totalServico: valores.total_servico,
      totalLiquido: valores.total_liquido,
      totalRetencoes: valores.total_retencoes
    };
  });

  ipcMain.handle('get-report-by-competencia', (_, empresaId) => {
    return db.prepare(`
      SELECT competencia,
        COUNT(*) as total_notas,
        SUM(CASE WHEN status = 'Autorizada' THEN valor_servico ELSE 0 END) as total_servico,
        SUM(CASE WHEN status = 'Autorizada' THEN valor_liquido ELSE 0 END) as total_liquido,
        SUM(CASE WHEN status = 'Autorizada' THEN iss_retido + pis_retido + cofins_retido + ir_retido + csll_retido + inss_retido ELSE 0 END) as total_retencoes,
        SUM(CASE WHEN status = 'Autorizada' THEN 1 ELSE 0 END) as autorizadas,
        SUM(CASE WHEN status != 'Autorizada' THEN 1 ELSE 0 END) as canceladas
      FROM notas WHERE empresa_id = ? AND (tipo = 'emitida' OR tipo IS NULL) AND competencia IS NOT NULL AND competencia != ''
      GROUP BY competencia ORDER BY substr(competencia,4,4) || substr(competencia,1,2) DESC
    `).all(empresaId);
  });

  // --- SYNC ---
  ipcMain.handle('sync-empresa', async (event, empresaId, dataInicio, dataFim) => {
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) return { error: 'Empresa nao encontrada' };
    if (empresa.auth_type === 'senha') {
      if (!empresa.portal_senha) return { error: 'Senha do portal nao configurada. Atualize nas configuracoes.' };
    } else {
      if (!empresa.cert_path || !fs.existsSync(empresa.cert_path)) {
        return { error: 'Certificado nao encontrado. Configure o certificado da empresa.' };
      }
    }

    try {
      const chunks = generate30DayChunks(dataInicio, dataFim);
      console.log(`[sync] Periodo dividido em ${chunks.length} bloco(s) de ate 30 dias`);
      event.sender.send('sync-progress', { message: `Buscando notas (${chunks.length} bloco(s))...`, progress: 5 });

      let allNotas = [];
      let session = null;

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const pctBase = 5 + Math.floor((ci / chunks.length) * 40);
        event.sender.send('sync-progress', { message: `Bloco ${ci + 1}/${chunks.length}: ${chunk.inicio} a ${chunk.fim}`, progress: pctBase });

        const result = await fetchEmitidas(empresa, chunk.inicio, chunk.fim, (msg) => {
          event.sender.send('sync-progress', { message: msg, progress: pctBase });
        });

        if (!session) session = result.session;

        for (const n of result.notas) {
          if (!allNotas.some(x => x.chave_acesso === n.chave_acesso)) {
            allNotas.push(n);
          }
        }
      }

      const notas = allNotas;

      event.sender.send('sync-progress', { message: `${notas.length} notas encontradas. Salvando...`, progress: 50 });

      const upsertNotas = db.transaction((items) => {
        for (const n of items) {
          const exists = db.prepare('SELECT id, xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
          if (exists) {
            if (exists.xml_content) {
              // XML ja existe - so atualiza status
              db.prepare(`UPDATE notas SET status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                .run(n.status, n.chave_acesso);
            } else {
              // Sem XML ainda - atualiza com dados do HTML
              db.prepare(`UPDATE notas SET data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                competencia = COALESCE(NULLIF(?, ''), competencia),
                tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
                status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`
              ).run(n.data_emissao, n.competencia, n.tomador_razao, n.status, n.chave_acesso);
            }
          } else {
            db.prepare(`INSERT INTO notas (empresa_id, numero, chave_acesso, data_emissao, competencia, tomador_razao, valor_servico, status, sincronizado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
            ).run(n.empresa_id, n.numero, n.chave_acesso, n.data_emissao, n.competencia, n.tomador_razao, n.valor_servico, n.status);
          }
        }
      });
      upsertNotas(notas);

      // Baixa XMLs em lote, pula notas que ja tem XML
      const notasNeedXml = notas.filter(n => {
        if (!n.chave_acesso) return false;
        const row = db.prepare('SELECT xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
        return !row || !row.xml_content;
      });

      const BATCH_SIZE = 5; // 5 XMLs por lote
      const totalNeedXml = notasNeedXml.length;
      let xmlCount = 0;

      for (let i = 0; i < totalNeedXml; i += BATCH_SIZE) {
        const batch = notasNeedXml.slice(i, i + BATCH_SIZE);

        // Baixa lote em paralelo
        const batchResults = await Promise.all(
          batch.map(async (nota) => {
            try {
              const xml = await downloadXml(nota.chave_acesso, session);
              return { nota, xml, success: !!xml };
            } catch (e) {
              console.error(`[sync] Erro download XML ${nota.chave_acesso}:`, e.message);
              return { nota, xml: null, success: false };
            }
          })
        );

        // Salva lote em uma transacao so
        const saveBatch = db.transaction((items) => {
          for (const { nota, xml } of items) {
            if (!xml) continue;
            const parsed = parseXmlDetails(xml);
            db.prepare(`
              UPDATE notas SET xml_content = ?,
              data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
              competencia = COALESCE(NULLIF(?, ''), competencia),
              numero = COALESCE(NULLIF(?, ''), numero),
              valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END,
              prestador_cnpj = ?, prestador_razao = ?,
              tomador_cnpj = ?, tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
              descricao_servico = ?, codigo_tributacao = ?,
              valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?,
              ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?,
              municipio_prestacao = ?
              WHERE chave_acesso = ?
            `).run(
              xml,
              parsed.dataEmissao, parsed.competencia, parsed.numero,
              parsed.valorServico, parsed.valorServico,
              parsed.prestadorCnpj, parsed.prestadorRazao,
              parsed.tomadorCnpj, parsed.tomadorRazao,
              parsed.descricaoServico, parsed.codigoTributacao,
              parsed.valorIss, parsed.issRetido, parsed.pisRetido, parsed.cofinsRetido,
              parsed.irRetido, parsed.csllRetido, parsed.inssRetido, parsed.valorLiquido,
              parsed.municipioPrestacao, nota.chave_acesso
            );
          }
        });
        saveBatch(batchResults.filter(r => r.success));

        xmlCount += batch.length;
        event.sender.send('sync-progress', {
          message: `Baixando XML ${Math.min(xmlCount, totalNeedXml)}/${totalNeedXml}...`,
          progress: 50 + Math.floor((Math.min(xmlCount, totalNeedXml) / Math.max(totalNeedXml, 1)) * 40)
        });

        // Pequena pausa entre lotes
        await sleep(100);
      }

      db.prepare(`
        INSERT INTO sync_log (empresa_id, tipo, data_inicio, data_fim, total_notas, status)
        VALUES (?, 'emitidas', ?, ?, ?, 'ok')
      `).run(empresaId, dataInicio, dataFim, notas.length);

      // --- Notas Tomadas (Recebidas) - mesma sessao ---
      event.sender.send('sync-progress', { message: 'Buscando notas tomadas...', progress: 62 });
      let allNotasRec = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const pctRec = 62 + Math.floor((ci / chunks.length) * 18);
        event.sender.send('sync-progress', { message: `Tomadas ${ci + 1}/${chunks.length}: ${chunk.inicio} a ${chunk.fim}`, progress: pctRec });
        try {
          const resultRec = await fetchRecebidas(empresa, chunk.inicio, chunk.fim, null, session);
          for (const n of resultRec.notas) {
            if (!allNotasRec.some(x => x.chave_acesso === n.chave_acesso)) allNotasRec.push(n);
          }
        } catch (e) {
          console.error('[sync] Erro ao buscar recebidas chunk:', e.message);
        }
      }

      if (allNotasRec.length > 0) {
        event.sender.send('sync-progress', { message: `${allNotasRec.length} notas tomadas. Salvando...`, progress: 80 });
        const upsertRec = db.transaction((items) => {
          for (const n of items) {
            const exists = db.prepare('SELECT id, xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
            if (exists) {
              if (exists.xml_content) {
                db.prepare(`UPDATE notas SET status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`).run(n.status, n.chave_acesso);
              } else {
                db.prepare(`UPDATE notas SET data_emissao = COALESCE(NULLIF(?, ''), data_emissao), competencia = COALESCE(NULLIF(?, ''), competencia), prestador_cnpj = COALESCE(NULLIF(?, ''), prestador_cnpj), prestador_razao = COALESCE(NULLIF(?, ''), prestador_razao), status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`
                ).run(n.data_emissao, n.competencia, n.prestador_cnpj, n.prestador_razao, n.status, n.chave_acesso);
              }
            } else {
              db.prepare(`INSERT INTO notas (empresa_id, chave_acesso, data_emissao, competencia, prestador_cnpj, prestador_razao, valor_servico, status, tipo, sincronizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recebida', datetime('now','localtime'))`
              ).run(n.empresa_id, n.chave_acesso, n.data_emissao, n.competencia, n.prestador_cnpj, n.prestador_razao, n.valor_servico, n.status);
            }
          }
        });
        upsertRec(allNotasRec);

        const recNeedXml = allNotasRec.filter(n => {
          if (!n.chave_acesso) return false;
          const row = db.prepare('SELECT xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
          return !row || !row.xml_content;
        });
        let recXmlCount = 0;
        for (let i = 0; i < recNeedXml.length; i += BATCH_SIZE) {
          const batch = recNeedXml.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(batch.map(async (nota) => {
            try { const xml = await downloadXml(nota.chave_acesso, session); return { nota, xml, success: !!xml }; }
            catch (e) { return { nota, xml: null, success: false }; }
          }));
          const saveRec = db.transaction((items) => {
            for (const { nota, xml } of items) {
              if (!xml) continue;
              const parsed = parseXmlDetails(xml);
              db.prepare(`UPDATE notas SET xml_content = ?, data_emissao = COALESCE(NULLIF(?, ''), data_emissao), competencia = COALESCE(NULLIF(?, ''), competencia), numero = COALESCE(NULLIF(?, ''), numero), valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END, prestador_cnpj = COALESCE(NULLIF(?, ''), prestador_cnpj), prestador_razao = COALESCE(NULLIF(?, ''), prestador_razao), tomador_cnpj = COALESCE(NULLIF(?, ''), tomador_cnpj), tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao), descricao_servico = ?, codigo_tributacao = ?, valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?, ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?, municipio_prestacao = ? WHERE chave_acesso = ?`
              ).run(xml, parsed.dataEmissao || null, parsed.competencia || null, parsed.numero || null, parsed.valorServico || 0, parsed.valorServico || 0, parsed.prestadorCnpj || null, parsed.prestadorRazao || null, parsed.tomadorCnpj || null, parsed.tomadorRazao || null, parsed.descricaoServico || null, parsed.codigoTributacao || null, parsed.valorIss || 0, parsed.issRetido || null, parsed.pisRetido || null, parsed.cofinsRetido || null, parsed.irRetido || null, parsed.csllRetido || null, parsed.inssRetido || null, parsed.valorLiquido || 0, parsed.municipioPrestacao || null, nota.chave_acesso);
            }
          });
          saveRec(batchResults.filter(r => r.success));
          recXmlCount += batch.length;
          event.sender.send('sync-progress', { message: `XML tomadas ${Math.min(recXmlCount, recNeedXml.length)}/${recNeedXml.length}...`, progress: 80 + Math.floor((Math.min(recXmlCount, recNeedXml.length) / Math.max(recNeedXml.length, 1)) * 15) });
          await sleep(100);
        }
        db.prepare(`INSERT INTO sync_log (empresa_id, tipo, data_inicio, data_fim, total_notas, status) VALUES (?, 'recebidas', ?, ?, ?, 'ok')`).run(empresaId, dataInicio, dataFim, allNotasRec.length);
      }

      // Reseta status da senha apos sync ok
      if (empresa.auth_type === 'senha') {
        db.prepare("UPDATE empresas SET senha_status = 'ok' WHERE id = ?").run(empresaId);
      }

      event.sender.send('sync-progress', { message: 'Sincronizacao concluida!', progress: 100 });
      return { success: true, total: notas.length };
    } catch (e) {
      // Marca erro na senha se autenticacao falhou
      if (empresa.auth_type === 'senha' && e.message && (
        e.message.includes('senha') ||
        e.message.includes('Senha') ||
        e.message.includes('login') ||
        e.message.includes('autentic')
      )) {
        db.prepare("UPDATE empresas SET senha_status = 'erro' WHERE id = ?").run(empresaId);
      }

      db.prepare(`
        INSERT INTO sync_log (empresa_id, tipo, data_inicio, data_fim, total_notas, status, mensagem)
        VALUES (?, 'emitidas', ?, ?, 0, 'erro', ?)
      `).run(empresaId, dataInicio, dataFim, e.message);
      return { error: e.message };
    }
  });

  // --- SYNC ALL ---
  ipcMain.handle('sync-all', async (event, dataInicio, dataFim) => {
    const allEmpresas = db.prepare('SELECT * FROM empresas WHERE (cert_path IS NOT NULL AND cert_path != "") OR (auth_type = ? AND portal_senha IS NOT NULL AND portal_senha != "")').all('senha');
    if (allEmpresas.length === 0) return { error: 'Nenhuma empresa com autenticacao configurada' };

    const chunks = generate30DayChunks(dataInicio, dataFim);
    const totalSteps = allEmpresas.length * chunks.length;
    let currentStep = 0;
    let totalNotas = 0;
    const errors = [];

    for (const empresa of allEmpresas) {
      if (empresa.auth_type === 'senha') {
        if (!empresa.portal_senha) { errors.push(`${empresa.razao_social}: senha do portal nao configurada`); currentStep += chunks.length; continue; }
      } else {
        if (!empresa.cert_path || !fs.existsSync(empresa.cert_path)) { errors.push(`${empresa.razao_social}: certificado nao encontrado`); currentStep += chunks.length; continue; }
      }

      event.sender.send('sync-progress', {
        message: `${empresa.razao_social}: autenticando...`,
        progress: Math.floor((currentStep / totalSteps) * 100),
        empresa: empresa.razao_social
      });

      let session = null;
      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        currentStep++;
        try {
          event.sender.send('sync-progress', {
            message: `${empresa.razao_social}: ${chunk.inicio} a ${chunk.fim}`,
            progress: Math.floor((currentStep / totalSteps) * 100),
            empresa: empresa.razao_social,
            chunk: `${ci + 1}/${chunks.length}`
          });

          let result;
          if (!session) {
            result = await fetchEmitidas(empresa, chunk.inicio, chunk.fim, null);
            session = result.session;
          } else {
            // Reutiliza sessao da mesma empresa
            const dtIniEnc = encodeURIComponent(chunk.inicio);
            const dtFimEnc = encodeURIComponent(chunk.fim);
            const url = `https://www.nfse.gov.br/EmissorNacional/Notas/Emitidas?pg=1&busca=&datainicio=${dtIniEnc}&datafim=${dtFimEnc}`;
            const resp = await session.get(url);
            const html = resp.data;
            if (typeof html === 'string' && html.includes('Login?ReturnUrl=') && !html.includes('accessToken')) {
              // se a sessao expirou, reautentica
              result = await fetchEmitidas(empresa, chunk.inicio, chunk.fim, null);
              session = result.session;
            } else {
              // Faz parse e paginacao
              result = await fetchEmitidas(empresa, chunk.inicio, chunk.fim, null);
              session = result.session;
            }
          }

          const notas = result.notas;
          if (notas.length > 0) {
            const upsertNotas = db.transaction((items) => {
              for (const n of items) {
                const exists = db.prepare('SELECT id, xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
                if (exists) {
                  if (exists.xml_content) {
                    db.prepare(`UPDATE notas SET status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                      .run(n.status, n.chave_acesso);
                  } else {
                    db.prepare(`UPDATE notas SET data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                      competencia = COALESCE(NULLIF(?, ''), competencia),
                      tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
                      status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`
                    ).run(n.data_emissao, n.competencia, n.tomador_razao, n.status, n.chave_acesso);
                  }
                } else {
                  db.prepare(`INSERT INTO notas (empresa_id, numero, chave_acesso, data_emissao, competencia, tomador_razao, valor_servico, status, sincronizado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
                  ).run(n.empresa_id, n.numero, n.chave_acesso, n.data_emissao, n.competencia, n.tomador_razao, n.valor_servico, n.status);
                }
              }
            });
            upsertNotas(notas);

            // Baixa XMLs em lotes paralelos (pula notas que ja tem XML)
            const notasNeedXml = notas.filter(n => {
              if (!n.chave_acesso) return false;
              const row = db.prepare('SELECT xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
              return !row || !row.xml_content;
            });

            const SYNC_BATCH_SIZE = 5;
            for (let i = 0; i < notasNeedXml.length; i += SYNC_BATCH_SIZE) {
              const batch = notasNeedXml.slice(i, i + SYNC_BATCH_SIZE);
              
              // Baixa lote em paralelo
              const batchResults = await Promise.all(
                batch.map(async (nota) => {
                  try {
                    const xml = await downloadXml(nota.chave_acesso, session);
                    return { nota, xml, success: !!xml };
                  } catch (e) {
                    console.error(`[sync-all] Erro download XML ${nota.chave_acesso}:`, e.message);
                    return { nota, xml: null, success: false };
                  }
                })
              );

              // Salva resultados do lote em uma transacao
              const saveBatch = db.transaction((items) => {
                for (const { nota, xml } of items) {
                  if (!xml) continue;
                  const parsed = parseXmlDetails(xml);
                  db.prepare(`
                    UPDATE notas SET xml_content = ?,
                    data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                    competencia = COALESCE(NULLIF(?, ''), competencia),
                    numero = COALESCE(NULLIF(?, ''), numero),
                    valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END,
                    prestador_cnpj = ?, prestador_razao = ?,
                    tomador_cnpj = ?, tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
                    descricao_servico = ?, codigo_tributacao = ?,
                    valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?,
                    ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?,
                    municipio_prestacao = ?
                    WHERE chave_acesso = ?
                  `).run(
                    xml,
                    parsed.dataEmissao, parsed.competencia, parsed.numero,
                    parsed.valorServico, parsed.valorServico,
                    parsed.prestadorCnpj, parsed.prestadorRazao,
                    parsed.tomadorCnpj, parsed.tomadorRazao,
                    parsed.descricaoServico, parsed.codigoTributacao,
                    parsed.valorIss, parsed.issRetido, parsed.pisRetido, parsed.cofinsRetido,
                    parsed.irRetido, parsed.csllRetido, parsed.inssRetido, parsed.valorLiquido,
                    parsed.municipioPrestacao, nota.chave_acesso
                  );
                }
              });
              saveBatch(batchResults.filter(r => r.success));
              
              await sleep(100);
            }
            totalNotas += notas.length;
          }

          db.prepare(`
            INSERT INTO sync_log (empresa_id, tipo, data_inicio, data_fim, total_notas, status)
            VALUES (?, 'emitidas', ?, ?, ?, 'ok')
          `).run(empresa.id, chunk.inicio, chunk.fim, notas.length);

        } catch (e) {
          console.error(`[sync-all] Erro ${empresa.razao_social} chunk ${chunk.inicio}-${chunk.fim}:`, e.message);
          errors.push(`${empresa.razao_social} (${chunk.inicio}-${chunk.fim}): ${e.message}`);
        }
        await sleep(200);
      }

      // --- Notas Tomadas (Recebidas) - mesma sessao ---
      if (session) {
        try {
          event.sender.send('sync-progress', {
            message: `${empresa.razao_social}: buscando notas tomadas...`,
            progress: Math.floor((currentStep / totalSteps) * 90),
            empresa: empresa.razao_social
          });
          let allNotasRec = [];
          for (const chunk of chunks) {
            try {
              const resultRec = await fetchRecebidas(empresa, chunk.inicio, chunk.fim, null, session);
              for (const n of resultRec.notas) {
                if (!allNotasRec.some(x => x.chave_acesso === n.chave_acesso)) allNotasRec.push(n);
              }
            } catch (e) { console.error(`[sync-all] Erro recebidas chunk ${chunk.inicio}-${chunk.fim}:`, e.message); }
          }

          const upsertRec = db.transaction((items) => {
            for (const n of items) {
              const exists = db.prepare('SELECT id, xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
              if (exists) {
                if (!exists.xml_content) {
                  db.prepare(`UPDATE notas SET data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                    prestador_cnpj = COALESCE(NULLIF(?, ''), prestador_cnpj),
                    prestador_razao = COALESCE(NULLIF(?, ''), prestador_razao),
                    status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                    .run(n.data_emissao || null, n.prestador_cnpj || null, n.prestador_razao || null, n.status, n.chave_acesso);
                } else {
                  db.prepare(`UPDATE notas SET status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                    .run(n.status, n.chave_acesso);
                }
              } else {
                db.prepare(`INSERT INTO notas (empresa_id, chave_acesso, data_emissao, competencia, prestador_cnpj, prestador_razao, valor_servico, status, tipo, sincronizado_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recebida', datetime('now','localtime'))`)
                  .run(n.empresa_id, n.chave_acesso, n.data_emissao || null, n.competencia || null, n.prestador_cnpj || null, n.prestador_razao || null, n.valor_servico, n.status);
              }
            }
          });
          upsertRec(allNotasRec);

          const recNeedXml = allNotasRec.filter(n => {
            if (!n.chave_acesso) return false;
            const row = db.prepare('SELECT xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
            return !row || !row.xml_content;
          });
          const REC_BATCH = 5;
          for (let i = 0; i < recNeedXml.length; i += REC_BATCH) {
            const batch = recNeedXml.slice(i, i + REC_BATCH);
            const results = await Promise.all(batch.map(async (nota) => {
              try {
                const xml = await downloadXml(nota.chave_acesso, session);
                return { nota, xml, success: !!xml };
              } catch (e) { return { nota, xml: null, success: false }; }
            }));
            const saveRec = db.transaction((items) => {
              for (const { nota, xml } of items) {
                if (!xml) continue;
                const parsed = parseXmlDetails(xml);
                db.prepare(`UPDATE notas SET xml_content = ?,
                  data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                  competencia = COALESCE(NULLIF(?, ''), competencia),
                  numero = COALESCE(NULLIF(?, ''), numero),
                  valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END,
                  prestador_cnpj = COALESCE(NULLIF(?, ''), prestador_cnpj),
                  prestador_razao = COALESCE(NULLIF(?, ''), prestador_razao),
                  tomador_cnpj = COALESCE(NULLIF(?, ''), tomador_cnpj),
                  tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
                  descricao_servico = ?, codigo_tributacao = ?,
                  valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?,
                  ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?,
                  municipio_prestacao = ?
                  WHERE chave_acesso = ?`).run(
                  xml, parsed.dataEmissao || null, parsed.competencia || null, parsed.numero || null,
                  parsed.valorServico || 0, parsed.valorServico || 0,
                  parsed.prestadorCnpj || null, parsed.prestadorRazao || null,
                  parsed.tomadorCnpj || null, parsed.tomadorRazao || null,
                  parsed.descricaoServico || null, parsed.codigoTributacao || null,
                  parsed.valorIss || 0, parsed.issRetido || null, parsed.pisRetido || null, parsed.cofinsRetido || null,
                  parsed.irRetido || null, parsed.csllRetido || null, parsed.inssRetido || null, parsed.valorLiquido || 0,
                  parsed.municipioPrestacao || null, nota.chave_acesso
                );
              }
            });
            saveRec(results.filter(r => r.success));
            await sleep(100);
          }
          db.prepare(`INSERT INTO sync_log (empresa_id, tipo, data_inicio, data_fim, total_notas, status) VALUES (?, 'recebidas', ?, ?, ?, 'ok')`)
            .run(empresa.id, dataInicio, dataFim, allNotasRec.length);
          totalNotas += allNotasRec.length;
        } catch (e) {
          console.error(`[sync-all] Erro recebidas ${empresa.razao_social}:`, e?.message ?? String(e));
          errors.push(`${empresa.razao_social} (recebidas): ${e?.message ?? String(e)}`);
        }
      }

      session = null; // Nova sessao para proxima empresa
    }

    event.sender.send('sync-progress', {
      message: `Concluido! ${totalNotas} notas de ${allEmpresas.length} empresas.`,
      progress: 100
    });

    return { success: true, total: totalNotas, empresas: allEmpresas.length, errors };
  });

  // --- NOTAS POR PERIODO (filtro de calendario) ---
  ipcMain.handle('get-notas-by-range', (_, empresaId, tipo, dataInicio, dataFim, status) => {
    // tipo: 'emissao' ou 'competencia'
    let sql = 'SELECT id, empresa_id, numero, chave_acesso, data_emissao, competencia, status, valor_servico, prestador_cnpj, prestador_razao, tomador_cnpj, tomador_razao, descricao_servico, codigo_tributacao, valor_iss, iss_retido, pis_retido, cofins_retido, ir_retido, csll_retido, inss_retido, valor_liquido, municipio_prestacao, (CASE WHEN xml_content IS NOT NULL THEN 1 ELSE 0 END) as has_xml FROM notas WHERE empresa_id = ? AND (tipo = \'emitida\' OR tipo IS NULL)';
    const params = [empresaId];

    if (tipo === 'competencia' && dataInicio && dataFim) {
      // competencia em MM/YYYY, converte para YYYY-MM para comparacao
      // dataInicio/dataFim vem como DD/MM/YYYY
      const [di, mi, yi] = dataInicio.split('/');
      const [df, mf, yf] = dataFim.split('/');
      const compIni = `${yi}-${mi}`;
      const compFim = `${yf}-${mf}`;
      // Converte MM/YYYY armazenado para YYYY-MM para comparacao
      sql += ` AND (substr(competencia,4,4) || '-' || substr(competencia,1,2)) >= ? AND (substr(competencia,4,4) || '-' || substr(competencia,1,2)) <= ?`;
      params.push(compIni, compFim);
    } else if (tipo === 'emissao' && dataInicio && dataFim) {
      // data_emissao em DD/MM/YYYY, converte para YYYY-MM-DD para comparacao
      sql += ` AND (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) >= ? AND (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) <= ?`;
      const [di, mi, yi] = dataInicio.split('/');
      const [df, mf, yf] = dataFim.split('/');
      params.push(`${yi}-${mi}-${di}`, `${yf}-${mf}-${df}`);
    }

    if (status && status !== 'todos') {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ` ORDER BY (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) DESC`;
    return db.prepare(sql).all(params);
  });

  // --- REPARO: re-processa XMLs para corrigir dados (async com progresso) ---
  ipcMain.handle('repair-notas-from-xml', async (event) => {
    const rows = db.prepare("SELECT id, xml_content FROM notas WHERE xml_content IS NOT NULL AND xml_content != ''").all();
    const total = rows.length;
    let fixed = 0;

    const mainWindow = getMainWindow();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const parsed = parseXmlDetails(row.xml_content);
        if (parsed.dataEmissao || parsed.numero) {
          db.prepare(`
            UPDATE notas SET
            data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
            competencia = COALESCE(NULLIF(?, ''), competencia),
            numero = COALESCE(NULLIF(?, ''), numero),
            valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END,
            prestador_cnpj = ?, prestador_razao = ?,
            tomador_cnpj = ?, tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
            descricao_servico = ?, codigo_tributacao = ?,
            valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?,
            ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?,
            municipio_prestacao = ?
            WHERE id = ?
          `).run(
            parsed.dataEmissao, parsed.competencia, parsed.numero,
            parsed.valorServico, parsed.valorServico,
            parsed.prestadorCnpj, parsed.prestadorRazao,
            parsed.tomadorCnpj, parsed.tomadorRazao,
            parsed.descricaoServico, parsed.codigoTributacao,
            parsed.valorIss, parsed.issRetido, parsed.pisRetido, parsed.cofinsRetido,
            parsed.irRetido, parsed.csllRetido, parsed.inssRetido, parsed.valorLiquido,
            parsed.municipioPrestacao, row.id
          );
          fixed++;
        }

        // Reporta progresso a cada 50 itens ou no ultimo
        if (i % 50 === 0 || i === rows.length - 1) {
          const progress = Math.round(((i + 1) / total) * 100);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('repair-progress', { current: i + 1, total, progress, fixed });
          }
        }

        // Cede ao event loop a cada 10 itens para evitar travamento
        if (i % 10 === 0) {
          await new Promise(r => setImmediate(r));
        }

      } catch (e) {
        console.error('[repair] Erro ao reparar nota', row.id, e.message);
      }
    }
    console.log(`[repair] ${fixed} notas reparadas de ${rows.length} com XML`);
    return { total: rows.length, fixed };
  });

  // --- ALERTAS: notas emitidas apos a competencia ---
  ipcMain.handle('get-alertas', () => {
    // A nota é "fora da competência" se a data de emissão (DD/MM/YYYY) pertence a um mês DIFERENTE da competência (MM/YYYY)
    // Ou emissão ocorreu em mês posterior à competência
    const rows = db.prepare(`
      SELECT n.*, e.razao_social as empresa_nome, e.cnpj as empresa_cnpj
      FROM notas n JOIN empresas e ON e.id = n.empresa_id
      WHERE (n.tipo = 'emitida' OR n.tipo IS NULL) AND n.data_emissao IS NOT NULL AND n.competencia IS NOT NULL
        AND n.data_emissao != '' AND n.competencia != ''
        AND (substr(n.data_emissao,4,2) || '/' || substr(n.data_emissao,7,4)) != n.competencia
      ORDER BY (substr(n.data_emissao,7,4) || '-' || substr(n.data_emissao,4,2) || '-' || substr(n.data_emissao,1,2)) DESC
    `).all();
    return rows;
  });

  // --- EXPORT ALERTAS ---
  ipcMain.handle('export-alertas', async (_, rows) => {
    const ExcelJS = require('exceljs');
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const defaultName = `Alertas_Divergencias_${mm}-${yyyy}.xlsx`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar Relatorio de Alertas',
      defaultPath: defaultName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (result.canceled) return { canceled: true };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NFSe Monitor';
    const ws = workbook.addWorksheet('Alertas');

    ws.columns = [
      { header: 'Empresa', key: 'empresa_nome', width: 35 },
      { header: 'CNPJ', key: 'empresa_cnpj', width: 20 },
      { header: 'Numero', key: 'numero', width: 14 },
      { header: 'Data Emissao', key: 'data_emissao', width: 14 },
      { header: 'Competencia', key: 'competencia', width: 14 },
      { header: 'Tomador', key: 'tomador_razao', width: 35 },
      { header: 'Valor Servico', key: 'valor_servico', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Divergencia', key: 'divergencia', width: 45 },
    ];

    const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFd13438' } } };
    ws.getRow(1).font = headerStyle.font;
    ws.getRow(1).fill = headerStyle.fill;

    rows.forEach(n => {
      const emComp = n.data_emissao ? n.data_emissao.substring(3, 5) + '/' + n.data_emissao.substring(6, 10) : '?';
      ws.addRow({
        ...n,
        divergencia: `Emitida na competencia ${emComp}, referente a ${n.competencia || '?'}`
      });
    });

    ws.getColumn(7).numFmt = '#,##0.00';

    ws.eachRow((row, i) => {
      if (i > 1) {
        const statusCell = row.getCell(8);
        if (statusCell.value === 'Cancelada' || statusCell.value === 'Substituida') {
          row.eachCell(cell => { cell.font = { color: { argb: 'FFd13438' } }; });
        }
      }
    });

    await workbook.xlsx.writeFile(result.filePath);
    return { success: true, path: result.filePath };
  });

  // --- EXPORT ---
  function sanitizeFilename(str) { return (str || '').replace(/[^a-zA-Z0-9_ -]/g, '').trim().replace(/\s+/g, '_'); }

  // Monta clausula WHERE a partir dos filtros
  function buildFilterWhere(empresaId, filters, tipoNota = 'emitida') {
    let where = 'WHERE empresa_id = ?';
    const params = [empresaId];
    const f = filters || {};

    if (f.competencia && f.competencia !== 'todas') {
      where += ' AND competencia = ?';
      params.push(f.competencia);
    } else if (f.tipo === 'competencia' && f.inicio && f.fim) {
      const [di, mi, yi] = f.inicio.split('/');
      const [df, mf, yf] = f.fim.split('/');
      where += ` AND (substr(competencia,4,4) || '-' || substr(competencia,1,2)) >= ? AND (substr(competencia,4,4) || '-' || substr(competencia,1,2)) <= ?`;
      params.push(`${yi}-${mi}`, `${yf}-${mf}`);
    } else if (f.tipo === 'emissao' && f.inicio && f.fim) {
      const [di, mi, yi] = f.inicio.split('/');
      const [df, mf, yf] = f.fim.split('/');
      where += ` AND (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) >= ? AND (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) <= ?`;
      params.push(`${yi}-${mi}-${di}`, `${yf}-${mf}-${df}`);
    }

    if (f.status && f.status !== 'todos') {
      where += ' AND status = ?';
      params.push(f.status);
    }

    where += ` AND (tipo = ? OR tipo IS NULL)`;
    params.push(tipoNota);

    return { where, params };
  }

  function getFilterPeriodLabel(filters) {
    const f = filters || {};
    if (f.competencia && f.competencia !== 'todas') return f.competencia.replace('/', '-');
    if (f.inicio && f.fim) return `${f.inicio.replace(/\//g, '-')}_a_${f.fim.replace(/\//g, '-')}`;
    return 'Todas';
  }

  ipcMain.handle('export-excel', async (_, empresaId, filters) => {
    const ExcelJS = require('exceljs');
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) return { error: 'Empresa nao encontrada' };

    const { where, params } = buildFilterWhere(empresaId, filters);
    const notas = db.prepare(`SELECT * FROM notas ${where} ORDER BY (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2))`).all(...params);

    const empName = sanitizeFilename(empresa.razao_social).substring(0, 30);
    const cnpjClean = empresa.cnpj.replace(/[^\d]/g, '');
    const periodLabel = getFilterPeriodLabel(filters);
    const defaultName = `Relatorio_${empName}_${cnpjClean}_${periodLabel}.xlsx`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar Relatorio Excel',
      defaultPath: defaultName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (result.canceled) return { canceled: true };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NFSe Monitor';

    // Aba: Notas
    const ws = workbook.addWorksheet('Notas');
    ws.columns = [
      { header: 'Numero', key: 'numero', width: 14 },
      { header: 'Data Emissao', key: 'data_emissao', width: 14 },
      { header: 'Competencia', key: 'competencia', width: 12 },
      { header: 'Tomador', key: 'tomador_razao', width: 35 },
      { header: 'CNPJ Tomador', key: 'tomador_cnpj', width: 20 },
      { header: 'Municipio', key: 'municipio_prestacao', width: 20 },
      { header: 'Descricao', key: 'descricao_servico', width: 40 },
      { header: 'Valor Servico', key: 'valor_servico', width: 16 },
      { header: 'ISS', key: 'valor_iss', width: 12 },
      { header: 'ISS Retido', key: 'iss_retido', width: 12 },
      { header: 'PIS', key: 'pis_retido', width: 12 },
      { header: 'COFINS', key: 'cofins_retido', width: 12 },
      { header: 'IR', key: 'ir_retido', width: 12 },
      { header: 'CSLL', key: 'csll_retido', width: 12 },
      { header: 'INSS', key: 'inss_retido', width: 12 },
      { header: 'Valor Liquido', key: 'valor_liquido', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    // Estilo do cabecalho
    const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e293b' } } };
    ws.getRow(1).font = headerStyle.font;
    ws.getRow(1).fill = headerStyle.fill;

    notas.forEach(n => ws.addRow(n));

    // Formato numerico para colunas de valores
    [8, 9, 10, 11, 12, 13, 14, 15, 16].forEach(c => {
      ws.getColumn(c).numFmt = '#,##0.00';
    });

    // Destaca linhas canceladas
    ws.eachRow((row, i) => {
      if (i > 1) {
        const statusCell = row.getCell(17);
        if (statusCell.value === 'Cancelada' || statusCell.value === 'Substituida') {
          row.eachCell(cell => { cell.font = { color: { argb: 'FFd13438' } }; });
        }
      }
    });

    // Aba: Resumo por Competencia
    const wsResumo = workbook.addWorksheet('Resumo');
    // Cabecalho com dados da empresa
    wsResumo.mergeCells('A1:E1');
    wsResumo.getCell('A1').value = empresa.razao_social;
    wsResumo.getCell('A1').font = { bold: true, size: 14 };
    wsResumo.mergeCells('A2:E2');
    wsResumo.getCell('A2').value = `CNPJ: ${empresa.cnpj}  |  Periodo: ${periodLabel}`;
    wsResumo.getCell('A2').font = { size: 11, color: { argb: 'FF616161' } };

    // Totais
    const autorizadas = notas.filter(n => n.status === 'Autorizada');
    const canceladas = notas.filter(n => n.status === 'Cancelada' || n.status === 'Substituida');
    const totalServico = autorizadas.reduce((s, n) => s + (n.valor_servico || 0), 0);
    const totalLiquido = autorizadas.reduce((s, n) => s + (n.valor_liquido || 0), 0);
    const totalRetencoes = autorizadas.reduce((s, n) => s + (n.iss_retido || 0) + (n.pis_retido || 0) + (n.cofins_retido || 0) + (n.ir_retido || 0) + (n.csll_retido || 0) + (n.inss_retido || 0), 0);

    wsResumo.addRow([]);
    wsResumo.addRow(['Total Notas', notas.length, '', 'Autorizadas', autorizadas.length]);
    wsResumo.addRow(['Canceladas/Subst.', canceladas.length, '', 'Valor Servico', totalServico]);
    wsResumo.addRow(['Total Retencoes', totalRetencoes, '', 'Valor Liquido', totalLiquido]);
    wsResumo.getRow(4).font = { bold: true };
    wsResumo.getRow(5).font = { bold: true };
    wsResumo.getRow(6).font = { bold: true };
    [2, 5].forEach(c => wsResumo.getColumn(c).numFmt = '#,##0.00');
    wsResumo.getColumn(1).width = 20;
    wsResumo.getColumn(2).width = 18;
    wsResumo.getColumn(3).width = 4;
    wsResumo.getColumn(4).width = 20;
    wsResumo.getColumn(5).width = 18;

    // Detalhamento por competencia
    wsResumo.addRow([]);
    const compHeaderRow = wsResumo.addRow(['Competencia', 'Notas', 'Valor Servico', 'Retencoes', 'Valor Liquido']);
    compHeaderRow.font = headerStyle.font;
    compHeaderRow.fill = headerStyle.fill;

    const report = db.prepare(`
      SELECT competencia,
        COUNT(*) as total,
        SUM(CASE WHEN status='Autorizada' THEN valor_servico ELSE 0 END) as servico,
        SUM(CASE WHEN status='Autorizada' THEN COALESCE(iss_retido,0)+COALESCE(pis_retido,0)+COALESCE(cofins_retido,0)+COALESCE(ir_retido,0)+COALESCE(csll_retido,0)+COALESCE(inss_retido,0) ELSE 0 END) as retencoes,
        SUM(CASE WHEN status='Autorizada' THEN valor_liquido ELSE 0 END) as liquido
      FROM notas ${where} GROUP BY competencia ORDER BY (substr(competencia,4,4) || '-' || substr(competencia,1,2)) DESC
    `).all(...params);
    report.forEach(r => wsResumo.addRow([r.competencia, r.total, r.servico, r.retencoes, r.liquido]));
    [3, 4, 5].forEach(c => wsResumo.getColumn(c).numFmt = '#,##0.00');

    await workbook.xlsx.writeFile(result.filePath);
    return { success: true, path: result.filePath };
  });

  ipcMain.handle('export-pdf', async (_, empresaId, filters) => {
    const { gerarRelatorioPDF } = require('./pdf-report');
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) return { error: 'Empresa nao encontrada' };

    const { where, params } = buildFilterWhere(empresaId, filters);
    const notas = db.prepare(`
      SELECT * FROM notas ${where} 
      ORDER BY data_emissao DESC, numero DESC
    `).all(...params);

    if (notas.length === 0) return { error: 'Nenhuma nota encontrada' };

    const periodLabel = getFilterPeriodLabel(filters);
    const defaultName = filters.resumo ? 'Resumo de competências.pdf' : `Relatorio ${periodLabel}.pdf`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar Relatório PDF',
      defaultPath: defaultName,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (result.canceled) return { canceled: true };

    // Logo em base64 (do arquivo correto) - dentro do projeto
    let logoBase64 = null;
    try {
      const logoPath = path.join(__dirname, '..', 'base64.txt');
      const logoBuffer = fs.readFileSync(logoPath, 'utf8');
      logoBase64 = logoBuffer.trim();
      console.log('Logo carregada com sucesso, tamanho:', logoBase64.length);
    } catch (e) {
      console.warn('Logo não encontrada:', e.message);
    }

    await gerarRelatorioPDF(empresa, notas, periodLabel, result.filePath, logoBase64);
    return { success: true, path: result.filePath };
  });

  ipcMain.handle('download-xml-zip', async (_, empresaId, filters) => {
    const JSZip = require('jszip');
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) return { error: 'Empresa nao encontrada' };

    const { where: baseWhere, params } = buildFilterWhere(empresaId, filters);
    const where = baseWhere + ' AND xml_content IS NOT NULL';
    const notas = db.prepare(`SELECT numero, chave_acesso, xml_content, competencia, tomador_razao FROM notas ${where}`).all(...params);

    if (notas.length === 0) return { error: 'Nenhuma nota com XML disponivel' };

    const empName = sanitizeFilename(empresa.razao_social).substring(0, 30);
    const cnpjClean = empresa.cnpj.replace(/[^\d]/g, '');
    const periodLabel = getFilterPeriodLabel(filters);
    const defaultName = `XMLs_${empName}_${cnpjClean}_${periodLabel}.zip`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar XMLs',
      defaultPath: defaultName,
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    });
    if (result.canceled) return { canceled: true };

    const zip = new JSZip();
    for (const nota of notas) {
      const filename = `${nota.chave_acesso || nota.numero}.xml`;
      zip.file(filename, nota.xml_content);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.promises.writeFile(result.filePath, buffer);
    return { success: true, path: result.filePath, total: notas.length };
  });

  // --- DOWNLOAD INDIVIDUAL DE XML/DANFE ---
  ipcMain.handle('download-nota-xml', async (_, notaId) => {
    const nota = db.prepare('SELECT n.*, e.razao_social, e.cnpj, e.cert_path, e.cert_password, e.auth_type, e.portal_senha FROM notas n JOIN empresas e ON e.id = n.empresa_id WHERE n.id = ?').get(notaId);
    if (!nota) return { error: 'Nota nao encontrada' };
    if (!nota.xml_content && !nota.chave_acesso) return { error: 'XML nao disponivel para esta nota' };

    // Nome do arquivo: {chaveAcesso}.xml
    const filename = `${nota.chave_acesso || nota.numero}.xml`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar XML da Nota',
      defaultPath: filename,
      filters: [{ name: 'XML', extensions: ['xml'] }]
    });
    if (result.canceled) return { canceled: true };

    // Se tem xml salvo, usa; senao tenta baixar do portal
    let xmlContent = nota.xml_content;
    if (!xmlContent && nota.chave_acesso) {
      try {
        const nfseApi = require('./nfse-api');
        const empresa = { cert_path: nota.cert_path, cert_password: nota.cert_password, auth_type: nota.auth_type, portal_senha: nota.portal_senha, cnpj: nota.cnpj };
        const session = await nfseApi.createSessionAuto(empresa);
        xmlContent = await nfseApi.downloadXml(nota.chave_acesso, session);
      } catch (e) {
        return { error: 'Falha ao baixar XML do portal: ' + e.message };
      }
    }

    if (!xmlContent) return { error: 'XML nao disponivel' };
    await fs.promises.writeFile(result.filePath, xmlContent, 'utf-8');
    return { success: true, path: result.filePath };
  });

  ipcMain.handle('download-nota-danfe', async (_, notaId) => {
    const nota = db.prepare('SELECT n.*, e.razao_social, e.cnpj, e.cert_path, e.cert_password, e.auth_type, e.portal_senha FROM notas n JOIN empresas e ON e.id = n.empresa_id WHERE n.id = ?').get(notaId);
    if (!nota) return { error: 'Nota nao encontrada' };
    if (!nota.chave_acesso) return { error: 'Chave de acesso nao disponivel para baixar DANFE' };

    const filename = `${nota.chave_acesso || nota.numero}.pdf`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar DANFE (PDF)',
      defaultPath: filename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (result.canceled) return { canceled: true };

    // Baixa DANFE do portal: /Notas/Download/DANFSe/{chaveAcesso}
    try {
      const nfseApi = require('./nfse-api');
      const empresa = { cert_path: nota.cert_path, cert_password: nota.cert_password, auth_type: nota.auth_type, portal_senha: nota.portal_senha, cnpj: nota.cnpj };
      const session = await nfseApi.createSessionAuto(empresa);
      const danfeUrl = `https://www.nfse.gov.br/EmissorNacional/Notas/Download/DANFSe/${nota.chave_acesso}`;
      const resp = await session.get(danfeUrl, { responseType: 'arraybuffer' });

      if (!resp.data || resp.status >= 400) {
        return { error: 'Falha ao baixar DANFE do portal' };
      }

      await fs.promises.writeFile(result.filePath, Buffer.from(resp.data));
      return { success: true, path: result.filePath };
    } catch (e) {
      return { error: 'Falha ao baixar DANFE: ' + e.message };
    }
  });

  // --- SYNC LOG ---
  ipcMain.handle('get-sync-log', (_, empresaId) => {
    return db.prepare('SELECT * FROM sync_log WHERE empresa_id = ? ORDER BY criado_em DESC LIMIT 20').all(empresaId);
  });

  // --- AUTO-SYNC ---
  let autoSyncTimer = null;
  let autoSyncMinutes = 0;

  function getAutoSyncConfig() {
    const row = db.prepare("SELECT valor FROM config WHERE chave = 'autosync_minutes'").get();
    return row ? parseInt(row.valor) || 0 : 0;
  }

  function saveAutoSyncConfig(minutes) {
    db.prepare("INSERT OR REPLACE INTO config (chave, valor) VALUES ('autosync_minutes', ?)").run(String(minutes));
  }

  // --- CONTROLE DE CONECTIVIDADE ---
  let syncPaused = false;
  let recoveryTimer = null;

  const NET_ERRORS = new Set(['ECONNREFUSED','ENOTFOUND','ENETUNREACH','ECONNRESET','ETIMEDOUT','EAI_AGAIN','ECONNABORTED','ERR_NETWORK']);

  function isConnectivityError(e) {
    if (NET_ERRORS.has(e?.code) || NET_ERRORS.has(e?.cause?.code)) return true;
    const msg = e?.message || '';
    return msg.includes('503') || e?.response?.status === 503;
  }

  function getNotifEnabled(key) {
    const row = db.prepare("SELECT valor FROM config WHERE chave = ?").get(key);
    return !row || row.valor === '1';
  }

  function showSyncNotif(key, title, body) {
    if (!getNotifEnabled(key)) return;
    const { Notification } = require('electron');
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: path.join(__dirname, '..', 'build', 'icon.ico') }).show();
    }
  }

  async function detectConnectivity() {
    const result = await checkPortalStatus();
    if (result.offline) return 'offline';
    if (result.level === 'red') return 'portal_red';
    return 'online';
  }

  function startRecoveryPolling(reason) {
    if (recoveryTimer) return;
    const interval = reason === 'offline' ? 30_000 : 3 * 60_000;
    console.log(`[autosync] Polling de recuperacao (${reason}), intervalo ${interval / 1000}s`);
    recoveryTimer = setInterval(async () => {
      try {
        const state = await detectConnectivity();
        if (state === 'online') {
          clearInterval(recoveryTimer);
          recoveryTimer = null;
          syncPaused = false;
          console.log('[autosync] Conectividade restaurada, retomando...');
          const notifKey = reason === 'offline' ? 'notif_offline' : 'notif_portal_instavel';
          const msg = reason === 'offline'
            ? 'Conexao restaurada. Retomando sincronizacao...'
            : 'Servico normalizado. Retomando sincronizacao...';
          showSyncNotif(notifKey, 'NFS-e Monitor', msg);
          autoSyncLoop();
        }
      } catch { /* silencioso */ }
    }, interval);
  }

  async function pauseSyncOnError(reason) {
    if (syncPaused) return;
    syncPaused = true;
    console.log(`[autosync] Pausado: ${reason}`);
    const notifKey = reason === 'offline' ? 'notif_offline' : 'notif_portal_instavel';
    const msg = reason === 'offline'
      ? 'Sem conexao com a internet. Sincronizacao pausada. Sera retomada automaticamente.'
      : 'Servico indisponivel. Sincronizacao pausada. Sera retomada automaticamente.';
    showSyncNotif(notifKey, 'NFS-e Monitor - Sincronizacao Pausada', msg);
    startRecoveryPolling(reason);
  }

  async function retryFetch(fn, label) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try { return await fn(); }
      catch (e) {
        if (attempt === 3 || !isConnectivityError(e)) throw e;
        console.log(`[autosync] ${label}: tentativa ${attempt} falhou (${e?.code || e?.message}), aguardando ${attempt * 3}s...`);
        await sleep(attempt * 3000);
      }
    }
  }

  async function runAutoSync() {
    const empresasList = db.prepare('SELECT * FROM empresas WHERE ((cert_path IS NOT NULL AND cert_path != "") OR (auth_type = ? AND portal_senha IS NOT NULL AND portal_senha != "")) AND autosync_paused = 0').all('senha');
    if (empresasList.length === 0) return;
    if (syncPaused) { console.log('[autosync] Sincronizacao pausada, ciclo ignorado.'); return; }

    let erroCount = 0;
    const dataInicio = '01/10/2025';
    const hoje = new Date();
    const dataFim = `${String(hoje.getDate()).padStart(2,'0')}/${String(hoje.getMonth()+1).padStart(2,'0')}/${hoje.getFullYear()}`;

    console.log(`[autosync] Iniciando busca automatica para ${empresasList.length} empresa(s)...`);

    for (const empresa of empresasList) {
      if (syncPaused) { console.log('[autosync] Sincronizacao pausada, abortando ciclo.'); break; }
      try {
        if (empresa.auth_type === 'senha') {
          if (!empresa.portal_senha) continue;
        } else {
          if (!empresa.cert_path || !fs.existsSync(empresa.cert_path)) continue;
        }

        const beforeCount = db.prepare('SELECT COUNT(*) as c FROM notas WHERE empresa_id = ?').get(empresa.id)?.c || 0;

        const chunks = generate30DayChunks(dataInicio, dataFim);
        let session = null;
        let allNotas = [];

        for (const chunk of chunks) {
          const result = await retryFetch(() => fetchEmitidas(empresa, chunk.inicio, chunk.fim, null), empresa.razao_social);
          if (!session) session = result.session;
          for (const n of result.notas) {
            if (!allNotas.some(x => x.chave_acesso === n.chave_acesso)) allNotas.push(n);
          }
        }

        // Só insere notas novas, atualiza existentes sem apagar XML
        const upsertNotas = db.transaction((items) => {
          for (const n of items) {
            const exists = db.prepare('SELECT id, xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
            if (exists) {
              if (exists.xml_content) {
                db.prepare(`UPDATE notas SET status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                  .run(n.status, n.chave_acesso);
              } else {
                db.prepare(`UPDATE notas SET data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                  competencia = COALESCE(NULLIF(?, ''), competencia),
                  tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
                  status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`
                ).run(n.data_emissao, n.competencia, n.tomador_razao, n.status, n.chave_acesso);
              }
            } else {
              db.prepare(`INSERT INTO notas (empresa_id, numero, chave_acesso, data_emissao, competencia, tomador_razao, valor_servico, status, sincronizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'))`
              ).run(n.empresa_id, n.numero, n.chave_acesso, n.data_emissao, n.competencia, n.tomador_razao, n.valor_servico, n.status);
            }
          }
        });
        upsertNotas(allNotas);

        // Baixa XMLs apenas para notas novas sem XML
        const notasNeedXml = allNotas.filter(n => {
          if (!n.chave_acesso) return false;
          const row = db.prepare('SELECT xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
          return !row || !row.xml_content;
        });

        // Baixa XMLs em lotes paralelos e salva tudo em uma transacao
        const xmlFetched = [];
        const AUTOSYNC_BATCH = 5;
        for (let i = 0; i < notasNeedXml.length; i += AUTOSYNC_BATCH) {
          const batch = notasNeedXml.slice(i, i + AUTOSYNC_BATCH);
          const results = await Promise.all(batch.map(async (nota) => {
            try {
              const xml = await downloadXml(nota.chave_acesso, session);
              return xml ? { nota, xml } : null;
            } catch (e) { return null; }
          }));
          for (const r of results) { if (r) xmlFetched.push(r); }
          await sleep(100);
        }
        if (xmlFetched.length > 0) {
          const saveXml = db.transaction((items) => {
            for (const { nota, xml } of items) {
              const parsed = parseXmlDetails(xml);
              db.prepare(`UPDATE notas SET xml_content = ?,
                data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                competencia = COALESCE(NULLIF(?, ''), competencia),
                numero = COALESCE(NULLIF(?, ''), numero),
                valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END,
                prestador_cnpj = ?, prestador_razao = ?,
                tomador_cnpj = ?, tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
                descricao_servico = ?, codigo_tributacao = ?,
                valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?,
                ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?,
                municipio_prestacao = ? WHERE chave_acesso = ?`).run(
                xml, parsed.dataEmissao || null, parsed.competencia || null, parsed.numero || null,
                parsed.valorServico || 0, parsed.valorServico || 0,
                parsed.prestadorCnpj || null, parsed.prestadorRazao || null,
                parsed.tomadorCnpj || null, parsed.tomadorRazao || null,
                parsed.descricaoServico || null, parsed.codigoTributacao || null,
                parsed.valorIss || 0, parsed.issRetido || null, parsed.pisRetido || null, parsed.cofinsRetido || null,
                parsed.irRetido || null, parsed.csllRetido || null, parsed.inssRetido || null, parsed.valorLiquido || 0,
                parsed.municipioPrestacao || null, nota.chave_acesso
              );
            }
          });
          saveXml(xmlFetched);
        }

        // --- Notas Tomadas (Recebidas) - mesma sessao ---
        if (session) {
          let allNotasRec = [];
          for (const chunk of chunks) {
            try {
              const resultRec = await retryFetch(() => fetchRecebidas(empresa, chunk.inicio, chunk.fim, null, session), empresa.razao_social);
              for (const n of resultRec.notas) {
                if (!allNotasRec.some(x => x.chave_acesso === n.chave_acesso)) allNotasRec.push(n);
              }
            } catch (e) { console.error(`[autosync] Erro recebidas chunk:`, e.message); }
          }

          const upsertRec = db.transaction((items) => {
            for (const n of items) {
              const exists = db.prepare('SELECT id, xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
              if (exists) {
                if (!exists.xml_content) {
                  db.prepare(`UPDATE notas SET data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                    prestador_cnpj = COALESCE(NULLIF(?, ''), prestador_cnpj),
                    prestador_razao = COALESCE(NULLIF(?, ''), prestador_razao),
                    status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                    .run(n.data_emissao || null, n.prestador_cnpj || null, n.prestador_razao || null, n.status, n.chave_acesso);
                } else {
                  db.prepare(`UPDATE notas SET status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                    .run(n.status, n.chave_acesso);
                }
              } else {
                db.prepare(`INSERT INTO notas (empresa_id, chave_acesso, data_emissao, competencia, prestador_cnpj, prestador_razao, valor_servico, status, tipo, sincronizado_em)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recebida', datetime('now','localtime'))`)
                  .run(n.empresa_id, n.chave_acesso, n.data_emissao || null, n.competencia || null, n.prestador_cnpj || null, n.prestador_razao || null, n.valor_servico, n.status);
              }
            }
          });
          upsertRec(allNotasRec);

          const recNeedXml = allNotasRec.filter(n => {
            if (!n.chave_acesso) return false;
            const row = db.prepare('SELECT xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
            return !row || !row.xml_content;
          });
          const recXmlFetched = [];
          for (let i = 0; i < recNeedXml.length; i += AUTOSYNC_BATCH) {
            const batch = recNeedXml.slice(i, i + AUTOSYNC_BATCH);
            const results = await Promise.all(batch.map(async (nota) => {
              try {
                const xml = await downloadXml(nota.chave_acesso, session);
                return xml ? { nota, xml } : null;
              } catch (e) { return null; }
            }));
            for (const r of results) { if (r) recXmlFetched.push(r); }
            await sleep(100);
          }
          if (recXmlFetched.length > 0) {
            const saveRecXml = db.transaction((items) => {
              for (const { nota, xml } of items) {
                const parsed = parseXmlDetails(xml);
                db.prepare(`UPDATE notas SET xml_content = ?,
                  data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                  competencia = COALESCE(NULLIF(?, ''), competencia),
                  numero = COALESCE(NULLIF(?, ''), numero),
                  valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END,
                  prestador_cnpj = COALESCE(NULLIF(?, ''), prestador_cnpj),
                  prestador_razao = COALESCE(NULLIF(?, ''), prestador_razao),
                  tomador_cnpj = COALESCE(NULLIF(?, ''), tomador_cnpj),
                  tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
                  descricao_servico = ?, codigo_tributacao = ?,
                  valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?,
                  ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?,
                  municipio_prestacao = ? WHERE chave_acesso = ?`).run(
                  xml, parsed.dataEmissao || null, parsed.competencia || null, parsed.numero || null,
                  parsed.valorServico || 0, parsed.valorServico || 0,
                  parsed.prestadorCnpj || null, parsed.prestadorRazao || null,
                  parsed.tomadorCnpj || null, parsed.tomadorRazao || null,
                  parsed.descricaoServico || null, parsed.codigoTributacao || null,
                  parsed.valorIss || 0, parsed.issRetido || null, parsed.pisRetido || null, parsed.cofinsRetido || null,
                  parsed.irRetido || null, parsed.csllRetido || null, parsed.inssRetido || null, parsed.valorLiquido || 0,
                  parsed.municipioPrestacao || null, nota.chave_acesso
                );
              }
            });
            saveRecXml(recXmlFetched);
          }
          console.log(`[autosync] ${empresa.razao_social}: ${allNotasRec.length} nota(s) tomada(s) processada(s)`);
        }

        const afterCount = db.prepare('SELECT COUNT(*) as c FROM notas WHERE empresa_id = ?').get(empresa.id)?.c || 0;
        const newCount = afterCount - beforeCount;

        if (newCount > 0) {
          console.log(`[autosync] ${empresa.razao_social}: ${newCount} nota(s) nova(s) encontrada(s)`);
          const win = getMainWindow();
          if (win) {
            win.webContents.send('autosync-alert', {
              empresa: empresa.razao_social,
              cnpj: empresa.cnpj,
              novas: newCount,
              total: allNotas.length
            });
          }
          const notifRow = db.prepare("SELECT valor FROM config WHERE chave = 'notif_sync_novas'").get();
          const notifEnabled = !notifRow || notifRow.valor === '1';
          const { Notification } = require('electron');
          if (notifEnabled && Notification.isSupported()) {
            new Notification({
              title: 'NFS-e Monitor - Novas Notas',
              body: `${empresa.razao_social}: ${newCount} nota(s) nova(s) encontrada(s)`,
              icon: path.join(__dirname, '..', 'build', 'icon.ico')
            }).show();
          }
        } else {
          console.log(`[autosync] ${empresa.razao_social}: sem novas notas`);
        }
      } catch (e) {
        erroCount++;
        console.error(`[autosync] Erro em ${empresa.razao_social}:`, e?.message ?? String(e));
        if (isConnectivityError(e)) {
          const state = await detectConnectivity();
          if (state !== 'online') { await pauseSyncOnError(state); break; }
        }
      }
    }
    if (erroCount > 0 && !syncPaused) {
      console.log(`[autosync] Ciclo concluido com ${erroCount} erro(s).`);
      showSyncNotif('notif_sync_erro', 'NFS-e Monitor - Falha na Sincronizacao',
        `${erroCount} empresa(s) com falha no ultimo ciclo. Verifique os logs.`);
    } else {
      console.log('[autosync] Ciclo concluido.');
    }
  }

  let autoSyncRunning = false;

  async function autoSyncLoop() {
    if (autoSyncRunning) return;
    autoSyncRunning = true;
    try {
      await runAutoSync();
    } catch (e) {
      console.error('[autosync] Erro no ciclo:', e?.message ?? String(e));
    }
    autoSyncRunning = false;
    // Agenda proxima execucao apos concluir
    const minutes = getAutoSyncConfig();
    if (minutes > 0) {
      console.log(`[autosync] Proximo ciclo em ${minutes} minuto(s)`);
      autoSyncTimer = setTimeout(autoSyncLoop, minutes * 60 * 1000);
    }
  }

  function startAutoSyncTimer(minutes) {
    if (autoSyncTimer) { clearTimeout(autoSyncTimer); autoSyncTimer = null; }
    if (minutes <= 0) return;
    autoSyncMinutes = minutes;
    console.log(`[autosync] Ativo: consulta a cada ${minutes} minuto(s). Iniciando agora...`);
    autoSyncLoop();
  }

  ipcMain.handle('get-autosync-config', () => {
    return { minutes: getAutoSyncConfig() };
  });

  ipcMain.handle('set-autosync-config', (_, minutes) => {
    const m = parseInt(minutes) || 0;
    if (m < 1) return { error: 'Intervalo deve ser pelo menos 1 minuto' };
    saveAutoSyncConfig(m);
    if (autoSyncTimer) { clearTimeout(autoSyncTimer); autoSyncTimer = null; }
    startAutoSyncTimer(m);
    return { success: true, minutes: m };
  });

  ipcMain.handle('stop-autosync', () => {
    saveAutoSyncConfig(0);
    if (autoSyncTimer) { clearTimeout(autoSyncTimer); autoSyncTimer = null; }
    if (recoveryTimer) { clearInterval(recoveryTimer); recoveryTimer = null; }
    syncPaused = false;
    console.log('[autosync] Desativado');
    return { success: true };
  });

  // Restaura auto-sync ao iniciar
  const savedMinutes = getAutoSyncConfig();
  if (savedMinutes > 0) startAutoSyncTimer(savedMinutes);

  // --- NOTAS RECEBIDAS (TOMADAS) ---

  ipcMain.handle('get-notas-recebidas', (_, empresaId, competencia, status) => {
    let sql = 'SELECT id, empresa_id, numero, chave_acesso, data_emissao, competencia, status, valor_servico, prestador_cnpj, prestador_razao, tomador_cnpj, tomador_razao, descricao_servico, codigo_tributacao, valor_iss, iss_retido, pis_retido, cofins_retido, ir_retido, csll_retido, inss_retido, valor_liquido, municipio_prestacao, (CASE WHEN xml_content IS NOT NULL THEN 1 ELSE 0 END) as has_xml FROM notas WHERE empresa_id = ? AND tipo = \'recebida\'';
    const params = [empresaId];
    if (competencia && competencia !== 'todas') { sql += ' AND competencia = ?'; params.push(competencia); }
    if (status && status !== 'todos') { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY data_emissao DESC';
    return db.prepare(sql).all(params);
  });

  ipcMain.handle('get-notas-recebidas-by-range', (_, empresaId, tipo, dataInicio, dataFim, status) => {
    let sql = 'SELECT id, empresa_id, numero, chave_acesso, data_emissao, competencia, status, valor_servico, prestador_cnpj, prestador_razao, tomador_cnpj, tomador_razao, descricao_servico, codigo_tributacao, valor_iss, iss_retido, pis_retido, cofins_retido, ir_retido, csll_retido, inss_retido, valor_liquido, municipio_prestacao, (CASE WHEN xml_content IS NOT NULL THEN 1 ELSE 0 END) as has_xml FROM notas WHERE empresa_id = ? AND tipo = \'recebida\'';
    const params = [empresaId];
    if (tipo === 'competencia' && dataInicio && dataFim) {
      const [di, mi, yi] = dataInicio.split('/');
      const [df, mf, yf] = dataFim.split('/');
      sql += ` AND (substr(competencia,4,4) || '-' || substr(competencia,1,2)) >= ? AND (substr(competencia,4,4) || '-' || substr(competencia,1,2)) <= ?`;
      params.push(`${yi}-${mi}`, `${yf}-${mf}`);
    } else if (tipo === 'emissao' && dataInicio && dataFim) {
      const [di, mi, yi] = dataInicio.split('/');
      const [df, mf, yf] = dataFim.split('/');
      sql += ` AND (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) >= ? AND (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) <= ?`;
      params.push(`${yi}-${mi}-${di}`, `${yf}-${mf}-${df}`);
    }
    if (status && status !== 'todos') { sql += ' AND status = ?'; params.push(status); }
    sql += ` ORDER BY (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2)) DESC`;
    return db.prepare(sql).all(params);
  });

  ipcMain.handle('sync-empresa-recebidas', async (event, empresaId, dataInicio, dataFim) => {
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) return { error: 'Empresa nao encontrada' };
    if (empresa.auth_type === 'senha') {
      if (!empresa.portal_senha) return { error: 'Senha do portal nao configurada.' };
    } else {
      if (!empresa.cert_path || !fs.existsSync(empresa.cert_path)) return { error: 'Certificado nao encontrado.' };
    }

    try {
      const chunks = generate30DayChunks(dataInicio, dataFim);
      event.sender.send('sync-progress', { message: `Buscando notas tomadas (${chunks.length} bloco(s))...`, progress: 5 });

      let allNotas = [];
      let session = null;

      for (let ci = 0; ci < chunks.length; ci++) {
        const chunk = chunks[ci];
        const pctBase = 5 + Math.floor((ci / chunks.length) * 40);
        event.sender.send('sync-progress', { message: `Bloco ${ci + 1}/${chunks.length}: ${chunk.inicio} a ${chunk.fim}`, progress: pctBase });

        const result = await fetchRecebidas(empresa, chunk.inicio, chunk.fim, (msg) => {
          event.sender.send('sync-progress', { message: msg, progress: pctBase });
        });

        if (!session) session = result.session;
        for (const n of result.notas) {
          if (!allNotas.some(x => x.chave_acesso === n.chave_acesso)) allNotas.push(n);
        }
      }

      event.sender.send('sync-progress', { message: `${allNotas.length} notas tomadas encontradas. Salvando...`, progress: 50 });

      const upsertNotas = db.transaction((items) => {
        for (const n of items) {
          const exists = db.prepare('SELECT id, xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
          if (exists) {
            if (exists.xml_content) {
              db.prepare(`UPDATE notas SET status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`)
                .run(n.status, n.chave_acesso);
            } else {
              db.prepare(`UPDATE notas SET data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
                competencia = COALESCE(NULLIF(?, ''), competencia),
                prestador_cnpj = COALESCE(NULLIF(?, ''), prestador_cnpj),
                prestador_razao = COALESCE(NULLIF(?, ''), prestador_razao),
                status = ?, sincronizado_em = datetime('now','localtime') WHERE chave_acesso = ?`
              ).run(n.data_emissao, n.competencia, n.prestador_cnpj, n.prestador_razao, n.status, n.chave_acesso);
            }
          } else {
            db.prepare(`INSERT INTO notas (empresa_id, chave_acesso, data_emissao, competencia, prestador_cnpj, prestador_razao, valor_servico, status, tipo, sincronizado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'recebida', datetime('now','localtime'))`
            ).run(n.empresa_id, n.chave_acesso, n.data_emissao, n.competencia, n.prestador_cnpj, n.prestador_razao, n.valor_servico, n.status);
          }
        }
      });
      upsertNotas(allNotas);

      const notasNeedXml = allNotas.filter(n => {
        if (!n.chave_acesso) return false;
        const row = db.prepare('SELECT xml_content FROM notas WHERE chave_acesso = ?').get(n.chave_acesso);
        return !row || !row.xml_content;
      });

      const BATCH_SIZE = 5;
      const totalNeedXml = notasNeedXml.length;
      let xmlCount = 0;

      for (let i = 0; i < totalNeedXml; i += BATCH_SIZE) {
        const batch = notasNeedXml.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (nota) => {
            try {
              const xml = await downloadXml(nota.chave_acesso, session);
              return { nota, xml, success: !!xml };
            } catch (e) {
              return { nota, xml: null, success: false };
            }
          })
        );

        const saveBatch = db.transaction((items) => {
          for (const { nota, xml } of items) {
            if (!xml) continue;
            const parsed = parseXmlDetails(xml);
            db.prepare(`
              UPDATE notas SET xml_content = ?,
              data_emissao = COALESCE(NULLIF(?, ''), data_emissao),
              competencia = COALESCE(NULLIF(?, ''), competencia),
              numero = COALESCE(NULLIF(?, ''), numero),
              valor_servico = CASE WHEN ? > 0 THEN ? ELSE valor_servico END,
              prestador_cnpj = ?, prestador_razao = ?,
              tomador_cnpj = ?, tomador_razao = COALESCE(NULLIF(?, ''), tomador_razao),
              descricao_servico = ?, codigo_tributacao = ?,
              valor_iss = ?, iss_retido = ?, pis_retido = ?, cofins_retido = ?,
              ir_retido = ?, csll_retido = ?, inss_retido = ?, valor_liquido = ?,
              municipio_prestacao = ?
              WHERE chave_acesso = ?
            `).run(
              xml,
              parsed.dataEmissao, parsed.competencia, parsed.numero,
              parsed.valorServico, parsed.valorServico,
              parsed.prestadorCnpj, parsed.prestadorRazao,
              parsed.tomadorCnpj, parsed.tomadorRazao,
              parsed.descricaoServico, parsed.codigoTributacao,
              parsed.valorIss, parsed.issRetido, parsed.pisRetido, parsed.cofinsRetido,
              parsed.irRetido, parsed.csllRetido, parsed.inssRetido, parsed.valorLiquido,
              parsed.municipioPrestacao, nota.chave_acesso
            );
          }
        });
        saveBatch(batchResults.filter(r => r.success));

        xmlCount += batch.length;
        event.sender.send('sync-progress', {
          message: `Baixando XML ${Math.min(xmlCount, totalNeedXml)}/${totalNeedXml}...`,
          progress: 50 + Math.floor((Math.min(xmlCount, totalNeedXml) / Math.max(totalNeedXml, 1)) * 40)
        });
        await sleep(100);
      }

      db.prepare(`INSERT INTO sync_log (empresa_id, tipo, data_inicio, data_fim, total_notas, status) VALUES (?, 'recebidas', ?, ?, ?, 'ok')`)
        .run(empresaId, dataInicio, dataFim, allNotas.length);

      if (empresa.auth_type === 'senha') {
        db.prepare("UPDATE empresas SET senha_status = 'ok' WHERE id = ?").run(empresaId);
      }

      event.sender.send('sync-progress', { message: 'Sincronizacao de tomadas concluida!', progress: 100 });
      return { success: true, total: allNotas.length };
    } catch (e) {
      if (empresa.auth_type === 'senha' && e.message && (e.message.includes('senha') || e.message.includes('autentic'))) {
        db.prepare("UPDATE empresas SET senha_status = 'erro' WHERE id = ?").run(empresaId);
      }
      db.prepare(`INSERT INTO sync_log (empresa_id, tipo, data_inicio, data_fim, total_notas, status, mensagem) VALUES (?, 'recebidas', ?, ?, 0, 'erro', ?)`)
        .run(empresaId, dataInicio, dataFim, e.message);
      return { error: e.message };
    }
  });

  ipcMain.handle('export-excel-recebidas', async (_, empresaId, filters) => {
    const ExcelJS = require('exceljs');
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) return { error: 'Empresa nao encontrada' };

    const { where, params } = buildFilterWhere(empresaId, filters, 'recebida');
    const notas = db.prepare(`SELECT * FROM notas ${where} ORDER BY (substr(data_emissao,7,4) || '-' || substr(data_emissao,4,2) || '-' || substr(data_emissao,1,2))`).all(...params);

    const empName = sanitizeFilename(empresa.razao_social).substring(0, 30);
    const cnpjClean = empresa.cnpj.replace(/[^\d]/g, '');
    const periodLabel = getFilterPeriodLabel(filters);
    const defaultName = `Relatorio_Tomadas_${empName}_${cnpjClean}_${periodLabel}.xlsx`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar Relatorio Excel - NFS-e Tomadas',
      defaultPath: defaultName,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });
    if (result.canceled) return { canceled: true };

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'NFSe Monitor';

    const ws = workbook.addWorksheet('Notas Tomadas');
    ws.columns = [
      { header: 'Numero', key: 'numero', width: 14 },
      { header: 'Data Emissao', key: 'data_emissao', width: 14 },
      { header: 'Competencia', key: 'competencia', width: 12 },
      { header: 'Prestador', key: 'prestador_razao', width: 35 },
      { header: 'CNPJ Prestador', key: 'prestador_cnpj', width: 20 },
      { header: 'Municipio', key: 'municipio_prestacao', width: 20 },
      { header: 'Descricao', key: 'descricao_servico', width: 40 },
      { header: 'Valor Servico', key: 'valor_servico', width: 16 },
      { header: 'ISS', key: 'valor_iss', width: 12 },
      { header: 'ISS Retido', key: 'iss_retido', width: 12 },
      { header: 'PIS', key: 'pis_retido', width: 12 },
      { header: 'COFINS', key: 'cofins_retido', width: 12 },
      { header: 'IR', key: 'ir_retido', width: 12 },
      { header: 'CSLL', key: 'csll_retido', width: 12 },
      { header: 'INSS', key: 'inss_retido', width: 12 },
      { header: 'Valor Liquido', key: 'valor_liquido', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
    ];

    const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1e293b' } } };
    ws.getRow(1).font = headerStyle.font;
    ws.getRow(1).fill = headerStyle.fill;

    notas.forEach(n => ws.addRow(n));
    [8, 9, 10, 11, 12, 13, 14, 15, 16].forEach(c => { ws.getColumn(c).numFmt = '#,##0.00'; });
    ws.eachRow((row, i) => {
      if (i > 1) {
        const statusCell = row.getCell(17);
        if (statusCell.value === 'Cancelada' || statusCell.value === 'Substituida') {
          row.eachCell(cell => { cell.font = { color: { argb: 'FFd13438' } }; });
        }
      }
    });

    const wsResumo = workbook.addWorksheet('Resumo');
    wsResumo.mergeCells('A1:E1');
    wsResumo.getCell('A1').value = empresa.razao_social;
    wsResumo.getCell('A1').font = { bold: true, size: 14 };
    wsResumo.mergeCells('A2:E2');
    wsResumo.getCell('A2').value = `CNPJ: ${empresa.cnpj}  |  Periodo: ${periodLabel}`;
    wsResumo.getCell('A2').font = { size: 11, color: { argb: 'FF616161' } };

    const autorizadas = notas.filter(n => n.status === 'Autorizada');
    const canceladas = notas.filter(n => n.status === 'Cancelada' || n.status === 'Substituida');
    const totalServico = autorizadas.reduce((s, n) => s + (n.valor_servico || 0), 0);
    const totalLiquido = autorizadas.reduce((s, n) => s + (n.valor_liquido || 0), 0);
    const totalRetencoes = autorizadas.reduce((s, n) => s + (n.iss_retido || 0) + (n.pis_retido || 0) + (n.cofins_retido || 0) + (n.ir_retido || 0) + (n.csll_retido || 0) + (n.inss_retido || 0), 0);

    wsResumo.addRow([]);
    wsResumo.addRow(['Total Notas Tomadas', notas.length, '', 'Autorizadas', autorizadas.length]);
    wsResumo.addRow(['Canceladas/Subst.', canceladas.length, '', 'Valor Servico', totalServico]);
    wsResumo.addRow(['Total Retencoes', totalRetencoes, '', 'Valor Liquido', totalLiquido]);
    wsResumo.getRow(4).font = { bold: true };
    wsResumo.getRow(5).font = { bold: true };
    wsResumo.getRow(6).font = { bold: true };
    [2, 5].forEach(c => wsResumo.getColumn(c).numFmt = '#,##0.00');
    wsResumo.getColumn(1).width = 22;
    wsResumo.getColumn(2).width = 18;
    wsResumo.getColumn(3).width = 4;
    wsResumo.getColumn(4).width = 20;
    wsResumo.getColumn(5).width = 18;

    wsResumo.addRow([]);
    const compHeaderRow = wsResumo.addRow(['Competencia', 'Notas', 'Valor Servico', 'Retencoes', 'Valor Liquido']);
    compHeaderRow.font = headerStyle.font;
    compHeaderRow.fill = headerStyle.fill;

    const report = db.prepare(`
      SELECT competencia,
        COUNT(*) as total,
        SUM(CASE WHEN status='Autorizada' THEN valor_servico ELSE 0 END) as servico,
        SUM(CASE WHEN status='Autorizada' THEN COALESCE(iss_retido,0)+COALESCE(pis_retido,0)+COALESCE(cofins_retido,0)+COALESCE(ir_retido,0)+COALESCE(csll_retido,0)+COALESCE(inss_retido,0) ELSE 0 END) as retencoes,
        SUM(CASE WHEN status='Autorizada' THEN valor_liquido ELSE 0 END) as liquido
      FROM notas ${where} GROUP BY competencia ORDER BY (substr(competencia,4,4) || '-' || substr(competencia,1,2)) DESC
    `).all(...params);
    report.forEach(r => wsResumo.addRow([r.competencia, r.total, r.servico, r.retencoes, r.liquido]));
    [3, 4, 5].forEach(c => wsResumo.getColumn(c).numFmt = '#,##0.00');

    await workbook.xlsx.writeFile(result.filePath);
    return { success: true, path: result.filePath };
  });

  ipcMain.handle('download-xml-zip-recebidas', async (_, empresaId, filters) => {
    const JSZip = require('jszip');
    const empresa = db.prepare('SELECT * FROM empresas WHERE id = ?').get(empresaId);
    if (!empresa) return { error: 'Empresa nao encontrada' };

    const { where: baseWhere, params } = buildFilterWhere(empresaId, filters, 'recebida');
    const where = baseWhere + ' AND xml_content IS NOT NULL';
    const notas = db.prepare(`SELECT numero, chave_acesso, xml_content, competencia, prestador_razao FROM notas ${where}`).all(...params);

    if (notas.length === 0) return { error: 'Nenhuma nota tomada com XML disponivel' };

    const empName = sanitizeFilename(empresa.razao_social).substring(0, 30);
    const cnpjClean = empresa.cnpj.replace(/[^\d]/g, '');
    const periodLabel = getFilterPeriodLabel(filters);
    const defaultName = `XMLs_Tomadas_${empName}_${cnpjClean}_${periodLabel}.zip`;

    const result = await dialog.showSaveDialog(getMainWindow(), {
      title: 'Salvar XMLs das Notas Tomadas',
      defaultPath: defaultName,
      filters: [{ name: 'ZIP', extensions: ['zip'] }]
    });
    if (result.canceled) return { canceled: true };

    const zip = new JSZip();
    for (const nota of notas) {
      const filename = `${nota.chave_acesso || nota.numero}.xml`;
      zip.file(filename, nota.xml_content);
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    await fs.promises.writeFile(result.filePath, buffer);
    return { success: true, path: result.filePath, total: notas.length };
  });

  // --- Estatisticas do banco ---
  const { getDbStats, formatBytes } = require('./database');
  ipcMain.handle('get-db-stats', () => {
    const stats = getDbStats();
    return { size: stats.size, sizeFormatted: formatBytes(stats.size) };
  });

  // --- Versao do app ---
  const packageJson = require('../package.json');
  ipcMain.handle('get-app-version', () => {
    return packageJson.version;
  });
}

module.exports = { setupIpcHandlers };
