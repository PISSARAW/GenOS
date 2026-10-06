'use strict';

const fs = require('node:fs');
const { error } = require('./gvxContracts');

function publicKey() {
  const file = process.env.GENOS_GVX_VERIFIER_PUBLIC_KEY_FILE;
  return file ? fs.readFileSync(file, 'utf8') : String(process.env.GENOS_GVX_VERIFIER_PUBLIC_KEY || '');
}

function remoteConfiguration() {
  const config = { url: process.env.GENOS_GVX_VERIFIER_URL,
    token: process.env.GENOS_GVX_VERIFIER_TOKEN, publicKey: publicKey() };
  if (!config.url || !config.token || !config.publicKey) throw error('GVX_REMOTE_VERIFIER_CONFIGURATION_REQUIRED');
  require('./gvxRemoteVerifierClient').requestOptions(config.url, config.token);
  return config;
}

module.exports = { publicKey, remoteConfiguration };
