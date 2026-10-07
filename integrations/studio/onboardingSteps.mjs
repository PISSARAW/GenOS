export function onboardingSteps(context) {
  return [
    ['Authentification', context.authenticated ? 'Session authentifiée' : 'À faire',
      'Une clé active est requise. Elle reste en mémoire, jamais dans une URL ou le stockage navigateur.'],
    ['Organisation et projet', context.scoped ? 'Renseignés' : 'À faire',
      'Sélectionnez un projet autorisé. Renseigner un identifiant ne confère aucun droit.'],
    ['Agent', context.agentSelected ? 'Renseigné' : 'À faire',
      'Choisissez un agent du projet, ou utilisez un lien de run autorisé.'],
    ['Première lecture', context.runRead ? 'Dossier chargé' : 'À faire',
      'Ouvrir un run existant ne crée pas de mission. Un dossier chargé ne vaut pas promotion ni preuve de vérité.']
  ];
}
