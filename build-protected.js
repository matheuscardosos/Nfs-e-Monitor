const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('Iniciando build protegido...');

// Configuração de ofuscação forte
const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  debugProtection: true,
  debugProtectionInterval: true,
  disableConsoleOutput: false, // Manter console para desenvolvimento
  identifierNamesGenerator: 'hexadecimal',
  log: false,
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  transformObjectKeys: true,
  unicodeEscapeSequence: false
};

// Arquivos para ofuscar (proteger)
const filesToObfuscate = [
  'main.js',
  'services/database.js',
  'services/ipc-handlers.js',
  'services/pdf-report.js'
];

// Backup dos arquivos originais
console.log('Criando backup dos arquivos originais...');
const backupDir = './backup-original';
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

filesToObfuscate.forEach(file => {
  const originalPath = path.join(__dirname, file);
  const backupPath = path.join(backupDir, file);
  if (fs.existsSync(originalPath)) {
    // Garante que o diretorio de backup existe
    const backupDirPath = path.dirname(backupPath);
    if (!fs.existsSync(backupDirPath)) {
      fs.mkdirSync(backupDirPath, { recursive: true });
    }
    fs.copyFileSync(originalPath, backupPath);
    console.log(`Backup: ${file}`);
  } else {
    console.warn(`Arquivo não encontrado: ${file}`);
  }
});

// Ofuscar arquivos
console.log('Ofuscando arquivos críticos...');
filesToObfuscate.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (fs.existsSync(filePath)) {
    const originalCode = fs.readFileSync(filePath, 'utf8');
    
    // Pular arquivos muito grandes ou específicos
    if (file.includes('node_modules')) return;
    
    try {
      const obfuscatedCode = JavaScriptObfuscator.obfuscate(originalCode, obfuscatorOptions);
      fs.writeFileSync(filePath, obfuscatedCode.getObfuscatedCode());
      console.log(`Ofuscado: ${file}`);
    } catch (error) {
      console.warn(`Erro ao ofuscar ${file}:`, error.message);
      // Restaura original se falhar
      fs.writeFileSync(filePath, originalCode);
    }
  }
});

// Executar build do Electron
console.log('Executando build do Electron...');
try {
  execSync('npm run build', { stdio: 'inherit' });
  console.log('Build concluído com sucesso!');
} catch (error) {
  console.error('Erro no build:', error.message);
}

// Restaurar arquivos originais
console.log('Restaurando arquivos originais...');
filesToObfuscate.forEach(file => {
  const originalPath = path.join(__dirname, file);
  const backupPath = path.join(backupDir, file);
  
  if (fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, originalPath);
    console.log(`Restaurado: ${file}`);
  }
});

// Limpar backup
fs.rmSync(backupDir, { recursive: true, force: true });

console.log('Build protegido finalizado!');
console.log('O executável está em dist/ com proteção contra engenharia reversa.');
