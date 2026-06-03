const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

let _db = null;
let _dbPath = '';

// Wrapper compativel com better-sqlite3
class DbWrapper {
  constructor(db, dbPath) {
    this._db = db;
    this._dbPath = dbPath;
    this._inTransaction = false;
    this._saveTimer = null;
  }

  _save() {
    // Debounce: agrupa escritas rapidas em uma so
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      const data = this._db.export();
      fs.writeFileSync(this._dbPath, Buffer.from(data));
    }, 300);
  }

  _saveNow() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    const data = this._db.export();
    fs.writeFileSync(this._dbPath, Buffer.from(data));
  }

  exec(sql) {
    this._db.exec(sql);
    this._save();
  }

  prepare(sql) {
    const db = this._db;
    const wrapper = this;

    // Normaliza params: aceita .run(a,b,c) e .run([a,b,c])
    function flat(params) {
      if (params.length === 1 && Array.isArray(params[0])) return params[0];
      return params;
    }

    return {
      run(...params) {
        const p = flat(params);
        if (p.length > 0) db.run(sql, p);
        else db.run(sql);
        if (!wrapper._inTransaction) wrapper._save();
        const lastId = db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0] || 0;
        return { lastInsertRowid: lastId, changes: db.getRowsModified() };
      },
      get(...params) {
        const p = flat(params);
        const stmt = db.prepare(sql);
        if (p.length > 0) stmt.bind(p);
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          stmt.free();
          const row = {};
          cols.forEach((c, i) => row[c] = vals[i]);
          return row;
        }
        stmt.free();
        return undefined;
      },
      all(...params) {
        const p = flat(params);
        const results = [];
        const stmt = db.prepare(sql);
        if (p.length > 0) stmt.bind(p);
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row = {};
          cols.forEach((c, i) => row[c] = vals[i]);
          results.push(row);
        }
        stmt.free();
        return results;
      }
    };
  }

  transaction(fn) {
    const self = this;
    return function(...args) {
      self._inTransaction = true;
      self._db.run("BEGIN TRANSACTION");
      try {
        fn(...args);
        self._db.run("COMMIT");
        self._inTransaction = false;
        self._saveNow();
      } catch (e) {
        self._inTransaction = false;
        try { self._db.run("ROLLBACK"); } catch (re) { /* ja revertido */ }
        throw e;
      }
    };
  }
}

async function initDatabase(userDataPath) {
  const SQL = await initSqlJs();
  _dbPath = path.join(userDataPath, 'nfse-manager.db');

  let db;
  if (fs.existsSync(_dbPath)) {
    const buffer = fs.readFileSync(_dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  const wrapper = new DbWrapper(db, _dbPath);

  wrapper.exec(`
    CREATE TABLE IF NOT EXISTS empresas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      razao_social TEXT NOT NULL,
      cnpj TEXT NOT NULL UNIQUE,
      inscricao_municipal TEXT,
      municipio TEXT,
      uf TEXT,
      regime TEXT,
      cert_path TEXT,
      cert_password TEXT,
      cert_cn TEXT,
      cert_validade TEXT,
      cert_emissao TEXT,
      cor TEXT DEFAULT '#2563eb',
      auth_type TEXT DEFAULT 'certificado',
      portal_senha TEXT,
      autosync_paused INTEGER DEFAULT 0,
      criado_em TEXT DEFAULT (datetime('now','localtime')),
      atualizado_em TEXT DEFAULT (datetime('now','localtime'))
    );


    CREATE TABLE IF NOT EXISTS notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      numero TEXT,
      chave_acesso TEXT UNIQUE,
      data_emissao TEXT,
      competencia TEXT,
      prestador_cnpj TEXT,
      prestador_razao TEXT,
      tomador_cnpj TEXT,
      tomador_razao TEXT,
      descricao_servico TEXT,
      codigo_tributacao TEXT,
      valor_servico REAL DEFAULT 0,
      valor_iss REAL DEFAULT 0,
      iss_retido REAL DEFAULT 0,
      pis_retido REAL DEFAULT 0,
      cofins_retido REAL DEFAULT 0,
      ir_retido REAL DEFAULT 0,
      csll_retido REAL DEFAULT 0,
      inss_retido REAL DEFAULT 0,
      valor_liquido REAL DEFAULT 0,
      status TEXT DEFAULT 'Autorizada',
      xml_content TEXT,
      municipio_prestacao TEXT,
      sincronizado_em TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (empresa_id) REFERENCES empresas(id)
    );

    CREATE INDEX IF NOT EXISTS idx_notas_empresa ON notas(empresa_id);
    CREATE INDEX IF NOT EXISTS idx_notas_competencia ON notas(competencia);
    CREATE INDEX IF NOT EXISTS idx_notas_chave ON notas(chave_acesso);

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      empresa_id INTEGER NOT NULL,
      tipo TEXT,
      data_inicio TEXT,
      data_fim TEXT,
      total_notas INTEGER DEFAULT 0,
      status TEXT DEFAULT 'ok',
      mensagem TEXT,
      criado_em TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS config (
      chave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE TABLE IF NOT EXISTS portal_status_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at INTEGER NOT NULL,
      level TEXT NOT NULL,
      score INTEGER,
      avg_ms INTEGER,
      good INTEGER,
      slow INTEGER,
      failed INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_psh_checked_at ON portal_status_history(checked_at);
  `);

  // Defaults de notificacoes
  const notifKeys = ['notif_sync_novas', 'notif_atualizacao', 'notif_offline', 'notif_portal_instavel', 'notif_sync_erro'];
  for (const k of notifKeys) {
    wrapper.prepare("INSERT OR IGNORE INTO config (chave, valor) VALUES (?, '1')").run(k);
  }

  // Migracoes
  try {
    const cols = wrapper.prepare("PRAGMA table_info(empresas)").all();
    if (!cols.some(c => c.name === 'autosync_paused')) {
      wrapper.exec("ALTER TABLE empresas ADD COLUMN autosync_paused INTEGER DEFAULT 0");
    }
    if (!cols.some(c => c.name === 'auth_type')) {
      wrapper.exec("ALTER TABLE empresas ADD COLUMN auth_type TEXT DEFAULT 'certificado'");
    }
    if (!cols.some(c => c.name === 'portal_senha')) {
      wrapper.exec("ALTER TABLE empresas ADD COLUMN portal_senha TEXT");
    }
    if (!cols.some(c => c.name === 'senha_status')) {
      wrapper.exec("ALTER TABLE empresas ADD COLUMN senha_status TEXT DEFAULT 'ok'");
    }
  } catch(e) { /* ignorar se ja existente */ }

  // Migration: coluna tipo em notas (emitida | recebida)
  try {
    const notaCols = wrapper.prepare("PRAGMA table_info(notas)").all();
    if (!notaCols.some(c => c.name === 'tipo')) {
      wrapper.exec("ALTER TABLE notas ADD COLUMN tipo TEXT DEFAULT 'emitida'");
    }
  } catch(e) { /* ignorar se ja existente */ }

  // Formata CNPJs sem formatacao
  try {
    const rows = wrapper.prepare("SELECT id, cnpj FROM empresas").all();
    for (const r of rows) {
      if (r.cnpj && !r.cnpj.includes('.')) {
        const d = String(r.cnpj).replace(/\D/g, '').padStart(14, '0');
        const formatted = d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
        if (formatted !== r.cnpj) wrapper.prepare("UPDATE empresas SET cnpj = ? WHERE id = ?").run(formatted, r.id);
      }
    }
  } catch(e) { /* ignorar */ }

  return wrapper;
}

function getDbStats() {
  try {
    if (!_dbPath || !fs.existsSync(_dbPath)) return { size: 0, path: _dbPath };
    const stats = fs.statSync(_dbPath);
    return { size: stats.size, path: _dbPath };
  } catch (e) {
    return { size: 0, path: _dbPath, error: e.message };
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = { initDatabase, getDbStats, formatBytes };
