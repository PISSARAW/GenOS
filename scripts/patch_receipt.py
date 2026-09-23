import re

with open('backend/src/services/epistemicVerifierReceiptService.js', 'r') as f:
    content = f.read()

old_pt = """function payloadText(receipt) {
  return [
    receipt.resultId,
    receipt.evidenceDigest,
    receipt.verifierDigest,
    receipt.checkedAt,
    receipt.nonce,
    receipt.status,
    receipt.independent === true ? 'independent' : 'dependent',
    receipt.independenceDescriptor ? JSON.stringify(receipt.independenceDescriptor) : '',
    receipt.independenceDistance !== undefined ? String(receipt.independenceDistance) : '',
  ].join('\\u0000');
}"""

new_pt = """function payloadText(receipt) {
  const fields = [
    receipt.resultId,
    receipt.evidenceDigest,
    receipt.verifierDigest,
    receipt.checkedAt,
    receipt.nonce,
    receipt.status,
    receipt.independent === true ? 'independent' : 'dependent',
    receipt.independenceDescriptor ? JSON.stringify(receipt.independenceDescriptor) : '',
    receipt.independenceDistance !== undefined ? String(receipt.independenceDistance) : '',
  ];
  if (Array.isArray(receipt.coveredObligations)) {
    fields.push([...receipt.coveredObligations].sort().join(','));
  }
  return fields.join('\\u0000');
}"""

content = content.replace(old_pt, new_pt)

old_ir = """  const receipt = {
    resultId: input.resultId,
    evidenceDigest: input.evidenceDigest,
    verifierDigest: input.verifierDigest,
    checkedAt: input.checkedAt || new Date().toISOString(),
    nonce: input.nonce || crypto.randomUUID(),
    status: input.status || 'verified',
    independent: input.independent === true,
    independenceDescriptor: input.independenceDescriptor || null,
    independenceDistance: input.independenceDistance !== undefined ? input.independenceDistance : null,
  };
  return { ...receipt, signature: signatureFor(receipt) };"""

new_ir = """  const receipt = {
    resultId: input.resultId,
    evidenceDigest: input.evidenceDigest,
    verifierDigest: input.verifierDigest,
    checkedAt: input.checkedAt || new Date().toISOString(),
    nonce: input.nonce || crypto.randomUUID(),
    status: input.status || 'verified',
    independent: input.independent === true,
    independenceDescriptor: input.independenceDescriptor || null,
    independenceDistance: input.independenceDistance !== undefined ? input.independenceDistance : null,
  };
  if (Array.isArray(input.coveredObligations)) {
    receipt.coveredObligations = [...input.coveredObligations];
  }
  return { ...receipt, signature: signatureFor(receipt) };"""

content = content.replace(old_ir, new_ir)

with open('backend/src/services/epistemicVerifierReceiptService.js', 'w') as f:
    f.write(content)

print('OK')
