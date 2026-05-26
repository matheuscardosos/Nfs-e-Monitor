const fs = require('fs');
const forge = require('node-forge');

function parsePfxCertificate(filePath, password) {
  try {
    const pfxData = fs.readFileSync(filePath);
    const pfxAsn1 = forge.asn1.fromDer(pfxData.toString('binary'));
    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, password);

    const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];

    if (!certBag || certBag.length === 0) {
      return { error: 'Nenhum certificado encontrado no arquivo PFX' };
    }

    const cert = certBag[0].cert;
    const cn = cert.subject.getField('CN')?.value || '';
    const validade = cert.validity.notAfter;
    const emissao = cert.validity.notBefore;

    let cnpj = '';
    // Extrai CNPJ do SubjectAltName
    const sanExt = cert.getExtension('subjectAltName');
    if (sanExt && sanExt.altNames) {
      for (const alt of sanExt.altNames) {
        if (alt.type === 0 && alt.value) {
          try {
            const asn1 = forge.asn1.fromDer(alt.value);
            const oid = forge.asn1.derToOid(asn1.value[0].value);
            if (oid === '2.16.76.1.3.3') {
              const rawCnpj = asn1.value[1].value[0].value;
              cnpj = rawCnpj.replace(/[^\d]/g, '');
            }
          } catch (e) { /* ignorar */ }
        }
      }
    }

    // Fallback: tira CNPJ do CN
    if (!cnpj) {
      const cnpjMatch = cn.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/);
      if (cnpjMatch) {
        cnpj = cnpjMatch[1].replace(/[^\d]/g, '');
      }
    }

    let razaoSocial = cn.split(':')[0]?.trim() || cn;

    return {
      cn,
      cnpj: formatCnpj(cnpj),
      cnpjRaw: cnpj,
      razaoSocial,
      validade: validade.toISOString(),
      emissao: emissao.toISOString(),
      validadeFormatted: formatDate(validade),
      emissaoFormatted: formatDate(emissao),
      vencido: new Date() > validade,
      error: null
    };
  } catch (e) {
    if (e.message?.includes('Invalid password') || e.message?.includes('PKCS#12 MAC')) {
      return { error: 'Senha do certificado incorreta' };
    }
    return { error: 'Erro ao ler certificado: ' + e.message };
  }
}

function formatCnpj(cnpj) {
  if (!cnpj || cnpj.length !== 14) return cnpj;
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('pt-BR');
}

module.exports = { parsePfxCertificate, formatCnpj, formatDate };
