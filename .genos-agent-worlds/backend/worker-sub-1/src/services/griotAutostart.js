const daemon = require('./daemonAgentAutostart');

/**
 * Configure l'auto-démarrage de l'agent sentinelle GenOS sous Windows.
 * Maintient la compatibilité ascendante avec l'ancien point d'entrée Griot.
 */
function enableGriotAutostart() {
  return daemon.enableAutostartIfConfigured();
}

module.exports = {
  enableGriotAutostart,
  ...daemon
};
