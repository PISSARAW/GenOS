'use strict';
const fs = require('node:fs');
const path = require('node:path');
const evidence = require('./evidence.cjs');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const percent = value => new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 2 }).format(value);

function table(headers, rows) {
  return '<table><thead><tr>' + headers.map(h => '<th>' + escape(h) + '</th>').join('') + '</tr></thead><tbody>'
    + rows.map(row => '<tr>' + row.map(value => '<td>' + escape(value) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}

function armRows(events) {
  return ['learned','frozen','permuted'].map(arm => {
    const rows = events.filter(row => row.type === 'eval-result' && row.arm === arm);
    const known = rows.filter(row => row.score.solvable);
    const unknown = rows.filter(row => !row.score.solvable);
    return [arm, `${known.filter(row => row.score.exact).length}/${known.length}`,
      percent(known.filter(row => row.score.exact).length / known.length),
      `${unknown.filter(row => row.score.unknownRecognized).length}/${unknown.length}`];
  });
}

function ruleRows(events) {
  let committed;
  const rules = {};
  for (const row of events) {
    if (row.type === 'response-committed') committed = row;
    if (row.type === 'eval-result' && row.arm === 'learned') {
      Object.assign(rules, committed.prompt.lessons);
    }
  }
  return Object.entries(rules).map(([op, rule]) => [op, JSON.stringify(rule)]);
}

function main(campaign) {
  const manifest = read(path.join(campaign, 'manifest.json'));
  const summary = read(path.join(campaign, 'summary.json'));
  const verification = read(path.join(campaign, 'verification.json'));
  const cold = read(path.join(campaign, 'cold-identity/summary.json'));
  const report = summary.results[0];
  const events = evidence.journal(path.join(campaign, 'lineage-0'));
  const training = events.filter(row => row.type === 'train-result');
  const supported = summary.status === 'bounded_support' && verification.exitCode === 0 && cold.passed;
  const title = supported ? 'Critères atteints dans le périmètre testé' : 'Preuve complète non établie';
  const identity = Object.entries(report.identity.rates).map(([key, value]) => [key, `${value.successes}/${value.total}`, percent(value.rate), percent(value.lower)]);
  const comparisons = report.learning.comparisons.map(row => [row.family, row.control, percent(row.gain), percent(row.lower), row.passed]);
  const created = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(summary.completedAt));
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>GenOS — campagne locale corrigée</title><style>
body{font-family:Segoe UI,Arial,sans-serif;background:#f5f7fa;color:#182331;line-height:1.55;margin:0}main{max-width:1080px;margin:auto;padding:32px 26px}
h1{font-size:30px}h2{font-size:21px;margin-top:30px}.status{font-weight:700;color:${supported ? '#14633b' : '#90351c'}}.card{background:white;padding:22px;border:1px solid #dbe1e9;border-radius:10px}
table{border-collapse:collapse;width:100%;background:white;margin:14px 0;font-size:14px}th,td{text-align:left;border:1px solid #dbe1e9;padding:9px 12px;overflow-wrap:anywhere}th{background:#eaf0f7}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eaf0f7;padding:14px}a{color:#185aa2}</style><main>
<h1>GenOS : campagne complète avec LLM local</h1><p class="status">${escape(title)}</p><p>Fin : ${escape(created)}, Europe/Paris.</p>
<div class="card">${escape(manifest.protocol.modelName)}, llama.cpp CUDA natif hors ligne sur D:. ${report.trainedCycles} transformations, ${report.calls} inférences principales, ${report.freshProcesses} processus GenOS, ${report.modelServerRestarts} rechargements du modèle avant tests. Durée : ${(summary.totalElapsedMs / 60000).toFixed(1)} minutes.</div>
<h2>Verdict et intégrité</h2>${table(['Contrôle','Résultat'], [
  ['Verdict primaire', summary.status], ['Vérificateur hors ligne : code de sortie', verification.exitCode],
  ['Sondes à froid entièrement correctes', `${cold.results.filter(row => row.passed).length}/${cold.results.length}`],
  ['Erreurs de transport ou sorties invalides', report.invalidOrTransportFailures],
  ['Tokens entrée / sortie, raisonnement inclus', `${report.inputTokens} / ${report.outputTokens}`]
])}
<h2>Filiation et continuité</h2>${table(['Propriété','Réponses exactes','Taux','Borne de référence'], identity)}
<p>Le registre fournit un contexte causal vérifié, avec ancêtres et épisodes relus dans les services de production. Le LLM restitue ces faits et maintient le mandat initial via sa mémoire externe. Les noms, rôles et postures changent ; les réponses brutes restent celles notées.</p>
<p>Critères inchangés : self et origin ≥ 99 % observés avec borne de Wilson de référence ≥ 95 % ; path, relation, author et ownership ≥ 95 % ; identité conjointe des 50 derniers cycles ≥ 95 % ; dix sondes de descendants entièrement correctes.</p>
${table(['Mesure conjointe', 'Taux'], [['Derniers 50 cycles', percent(report.identity.lateJointRate)], ['Descendants', percent(report.identity.cloneJointRate)]])}
<h2>Apprentissages et transfert</h2>${table(['Mémoire','Résolubles exacts','Taux','Inconnus reconnus'], armRows(events))}
<p>Les paramètres sont proposés par le LLM. La porte vérifie uniquement les exemples d'entraînement et l'identifiabilité de la règle ; elle conserve les rejets et révoque les règles contredites. Le LLM applique les règles sur les tests, sans feedback, sans réparation de ses réponses et sans mise à jour des poids.</p>
${table(['Admissions pendant l’apprentissage','Nombre'], [['Acceptées', training.filter(row => row.learningAdmission.accepted).length], ['Rejetées', training.filter(row => !row.learningAdmission.accepted).length]])}
${table(['Famille','Contrôle','Gain observé','Borne','Seuil atteint'], comparisons)}
<p>Chaque borne de gain doit dépasser 10 points. Les autres seuils sont : inconnus ≥ 90 %, Brier ≤ 0,20 et exactitude ≥ 80 % dans chacune des trois fenêtres.</p>
${table(['Fenêtre après rechargement', 'Exactitude'], report.learning.windows.map(row => [row.window + 1, percent(row.successRate)]))}
${table(['Mesure','Valeur'], [['Inconnus', percent(report.learning.unknownRate)], ['Brier résolubles', report.learning.brier]])}
${table(['Opérateur','Dernière règle validée proposée par le LLM'], ruleRows(events))}
<h2>Portée</h2><p>Un modèle et un monde, avec poids fixes, mémoire externe, filiation assistée par le registre et règles typées validées. Ce cas ne qualifie pas un LLM sans ces services, ni une conscience, une identité psychologique, des mutations arbitraires ou l'orchestrateur autonome complet.</p>
<p>Les cycles d'identité sont dépendants : Wilson est une référence de seuil, pas une garantie sur une population. Les fenêtres ne sont pas des lignées indépendantes. Les contrastes de transfert sont conditionnels à l'échantillonnage du corpus. Le vérificateur et l'oracle séparé ont été écrits dans le même projet ; il n'y a pas de réplication indépendante ni d'attestation matérielle.</p>
<p>Les pilotes de développement et la référence négative restent séparés. Aucun critère n'a été abaissé et aucune promotion de production n'est autorisée. Le plan récupère les règles utiles et émet une expression symbolique non évaluée, avec l'entrée littérale dans son ordre d'origine. Le LLM réalise les opérations ; le compilateur n'exécute aucun calcul ou transformation de résultat. Aucune réponse calculée n'est injectée dans le prompt ou le schéma.</p>
<h2>Pièces vérifiables</h2><ul>
<li><a href="manifest.json">Manifeste et empreintes des sources</a></li><li><a href="summary.json">Métriques primaires</a></li>
<li><a href="lineage-0/events.jsonl">Requêtes et réponses LLM, journal chaîné</a></li><li><a href="verification.json">Rejeu et code de sortie</a></li>
<li><a href="cold-identity/summary.json">Sondes après rechargement à froid</a></li></ul>
<p>Manifeste conservé avant observations :</p><pre>${escape(summary.manifestHash)}</pre>
<p>Rejeu hors ligne :</p><pre>node ${escape(path.join(__dirname, 'verify.cjs'))} ${escape(campaign)} ${escape(summary.manifestHash)}</pre>
<p>Protocole : ${escape(manifest.protocol.id)}. Modèle SHA-256 : ${escape(manifest.protocol.modelSha256)}.</p></main></html>`;
  fs.writeFileSync(path.join(campaign, 'report.html'), html);
  console.log(path.join(campaign, 'report.html'));
}

if (require.main === module) main(path.resolve(process.argv[2]));
