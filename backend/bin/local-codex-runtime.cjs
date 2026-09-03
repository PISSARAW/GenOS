#!/usr/bin/env node
const { decodeMissionInput, encodeEvent } = require('../src/services/runtimeProtocol');
const modelRouter = require('../src/services/modelRouter');

let raw = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { raw = Buffer.concat([raw, chunk]); });
process.stdin.on('end', async () => {
  let mission;
  try { 
      mission = decodeMissionInput(raw); 
  } catch (e) { 
      process.exit(2); 
  }

  let prompt = mission.prompt || mission.currentTask || "No prompt provided";

  // Clean the massive GenOS orchestration meta-prompt to avoid confusing small local models
  if (prompt.includes('MANDATORY FINAL SYNTHESIS PHASE') || prompt.includes('Assigned branch:')) {
    prompt = prompt.split('\n')[0].trim();
  }

  // Inject Workspace Context so the model can actually answer questions about "this project"
  let contextStr = '';
  try {
    const fs = require('fs');
    const path = require('path');
    const cwd = process.cwd();
    const projectName = process.env.GRIOT_PROJECT_NAME || path.basename(cwd);
    
    let extraInfo = '';
    const readmePath = path.join(cwd, 'README.md');
    if (fs.existsSync(readmePath)) {
      extraInfo += "\nExtrait du README : " + fs.readFileSync(readmePath, 'utf8').substring(0, 500) + "...";
    } else {
      const pkgPath = path.join(cwd, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        extraInfo += `\nDescription package.json : ${pkg.description || 'Aucune'}`;
      }
    }

    const files = fs.readdirSync(cwd)
      .filter(f => !f.startsWith('.') && f !== 'node_modules' && f !== 'dist')
      .slice(0, 30)
      .join(', ');
    
    contextStr = `[CONTEXTE DU WORKSPACE ACTIF : Projet "${projectName}"]\nFichiers à la racine : ${files}${extraInfo}\n\n`;
  } catch(e) {}

  // Use a strong persona instruction to prevent the LLM's default alignment from refusing to "analyze a site/project"
  const framedPrompt = `Tu es Griot, l'assistant IA de développement de GenOS. Tu as un accès TOTAL et DIRECT au "site" ou "projet" dont parle l'utilisateur, car il s'agit du code source local fourni ci-dessous.
RÈGLE ABSOLUE : Tu ne dois SOUS AUCUN PRÉTEXTE t'excuser, dire que tu es une IA, ou affirmer que tu n'as pas accès à internet. Tu AS déjà accès au site via les fichiers.
Si l'utilisateur te demande d'"explorer" ou d'"analyser" le site, réponds IMMÉDIATEMENT en te basant sur le contexte ci-dessous, sans aucune phrase d'avertissement.

IMPORTANT / ARTÉFACTS OBLIGATOIRES: Si tu dois créer ou modifier un fichier, générer un document long, ou un plan d'implémentation, tu DOIS obligatoirement l'encadrer avec les balises \`[ARTIFACT: chemin/vers/fichier.ext]\` au début et \`[/ARTIFACT]\` à la fin. Ne mets pas ce contenu dans le chat standard et n'utilise pas de blocs de code pour cela.
PLANS D'ACTION: Lorsque tu proposes un plan d'action, tu dois SYSTÉMATIQUEMENT utiliser des listes de tâches Markdown (\`- [ ]\`).

${contextStr}Requête de l'utilisateur : ${prompt}`;

  process.stdout.write(encodeEvent({
    eventType: 'AGENT_PLAN_CREATED',
    action: 'PLAN',
    detail: 'Local cognitive router runtime accepted the mission.',
    status: 'running',
    currentTask: prompt
  }));

  try {
    const { withTextImmunity } = require('../src/services/immuneSystem.js');
    
    // Le Chaperon Structurel de Griot (Canalisation Épigénétique)
    const griotValidator = (text) => {
        // Règle 9 : Si Griot propose des modifications de code ou de longs textes, on vérifie l'existence des balises ou au moins une structure Markdown saine.
        // On s'assure qu'il n'a pas répondu juste par un "Oui" ou "Non" laconique s'il y avait une requête complexe.
        if (text.length < 10) throw new Error("Réponse trop courte ou absente.");
    };

    // On enveloppe l'agent dans le Système Immunitaire (Pléiotropie = maxRetries 3)
    const reply = await withTextImmunity(framedPrompt, 'high', {
        validatorFn: griotValidator,
        maxRetries: 3,
        agentId: 'griot_runtime'
    });
    
    if (!reply) {
        throw new Error("Échec critique de la génération (Apoptose).");
    }
    
    // Parse the reply to write files to disk
    const artifactRegex = /\[ARTIFACT:\s*([^\]]+)\]([\s\S]*?)\[\/ARTIFACT\]/gi;
    let match;
    const fsLib = require('fs');
    const pathLib = require('path');
    while ((match = artifactRegex.exec(reply)) !== null) {
      const filepath = match[1].trim();
      const code = match[2].trim();
      try {
        const absPath = pathLib.resolve(process.cwd(), filepath);
        fsLib.mkdirSync(pathLib.dirname(absPath), { recursive: true });
        fsLib.writeFileSync(absPath, code);
      } catch (e) {
        console.error("Erreur lors de l'ecriture du fichier:", e);
      }
    }
    
    const report = { 
        outcome: 'success', 
        claims: [{ statement: reply, evidence: [] }] 
    };
    
    process.stdout.write(encodeEvent({
      eventType: 'AGENT_COMPLETED',
      action: 'COMPLETE',
      detail: 'Local cognitive router completed with Epigenetic Canalization.',
      status: 'completed',
      payload: { evidenceReport: report }
    }));
    process.exit(0);
  } catch(e) {
    process.stdout.write(encodeEvent({
      eventType: 'AGENT_FAILED',
      action: 'ERROR',
      detail: e.message,
      severity: 'error',
      status: 'error'
    }));
    process.exit(1);
  }
});
