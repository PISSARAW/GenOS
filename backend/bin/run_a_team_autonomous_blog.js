const fs = require('fs');
const path = require('path');
const { generate } = require('../src/services/modelRouter.js');
const { analyzeMission } = require('../src/services/aTeamService.js');

const TARGET_DIR = 'C:\\Users\\Shadow\\Documents\\GitHub\\cit-uda-blog\\articles';

const DIVISIONS = [
    "Ingénierie Logicielle", "Ingénierie Electrique et Electronique", "Ingénierie Mécanique", 
    "Ingénierie Civile", "Ingénierie Chimique", "Ingénierie Biomédicale", "Systèmes Énergétiques", 
    "TIC", "Intelligence Artificielle", "Nouvelles Technologies", "Science de données", "Génie Environnemental"
];

const MISSION_PITCH = `La Commission d'Ingénierie et Technologie (CIT) de l'UDA veut 30 articles de niveau New York Times. 
L'équipe doit être constituée de 5 auteurs, chacun ayant son style, et se répartissant impérativement et uniquement ces 12 divisions techniques exactes : 
${DIVISIONS.join(', ')}.`;

// -----------------------------------------------------------------------------
// SYSTÈME IMMUNITAIRE GLOBAL
// -----------------------------------------------------------------------------
const { withImmunity, askLocalLLM } = require('../src/services/immuneSystem.js');

// -----------------------------------------------------------------------------
// PHASES BIOMIMÉTIQUES
// -----------------------------------------------------------------------------

// 1. Définition de l'équipe (HOX Genes)
async function phase1DesignTeam() {
    console.log("=== PHASE 1 : DÉFINITION AUTONOME DE L'ÉQUIPE (Gènes HOX) ===");
    const prompt = `En tant qu'Orchestrateur, ta mission est : ${MISSION_PITCH}.
    Génère un JSON représentant exactement 5 auteurs africains spécialisés (utilise des noms africains).
    Répartis impérativement ces 12 divisions entre eux.
    Format attendu :
    { "authors": [ { "name": "Amadou", "style": "Tech", "divisions": ["TIC"] } ] }
    IMPORTANT : Renvoie UNIQUEMENT le JSON pur.`;

    const validator = (data) => {
        if (!data.authors || !Array.isArray(data.authors)) throw new Error("Il manque le tableau 'authors'.");
        if (data.authors.length !== 5) throw new Error(`Il faut exactement 5 auteurs, reçu ${data.authors.length}.`);
        data.authors.forEach(a => {
            if (!a.name || !a.style || !a.divisions) throw new Error("Un auteur manque de propriétés vitales.");
        });
    };

    return await withImmunity(prompt, 'high', validator, 3, 'ateam_orchestrator');
}

// 1.5. Génération des sujets ciblés (Cascade enzymatique locale)
async function generateTopicsForAuthor(author) {
    console.log(`[Orchestrateur] Génération des 6 sujets pour ${author.name}...`);
    const prompt = `Tu es le rédacteur en chef de l'UDA. L'auteur ${author.name} (Style: ${author.style}) couvre : ${author.divisions.join(', ')}.
    Invente 6 titres d'articles pertinents sur des innovations en Afrique.
    Format JSON attendu (Les titres DOIVENT être des textes/strings, pas des objets) :
    { "articles": ["Titre 1", "Titre 2", "Titre 3", "Titre 4", "Titre 5", "Titre 6"] }
    IMPORTANT : Ne mets aucun blabla, juste le JSON.`;
    
    const validator = (data) => {
        if (!data.articles || !Array.isArray(data.articles)) throw new Error("Il manque le tableau 'articles'.");
        if (data.articles.length !== 6) throw new Error(`Il faut exactement 6 articles, reçu ${data.articles.length}.`);
        data.articles.forEach(t => {
            if (typeof t !== 'string') throw new Error(`Le titre "${JSON.stringify(t)}" est un Objet au lieu d'une String.`);
        });
    };

    const plan = await withImmunity(prompt, 'high', validator, 3, 'ateam_orchestrator');
    if (plan) {
        author.articles = plan.articles;
    } else {
        console.error(`[Apoptose] Sujets par défaut pour ${author.name}`);
        author.articles = ["Sujet de secours 1", "Sujet de secours 2", "Sujet de secours 3"];
    }
}

// 2. Le duo "Author" et "Critic" rédige l'article (Stigmergie Conceptuelle)
async function phase2DraftAndReview(author, title) {
    console.log(`\n-> Rédaction en cours : "${title}" par ${author.name}...`);
    const draftPrompt = `Tu es ${author.name} (${author.style}). Écris un article de 800 mots sur : "${title}". 
    L'article doit être sourcé avec des faits réels, sans clichés d'IA. Renvoie uniquement le Markdown.`;
    
    let draft = await askLocalLLM(draftPrompt, 'medium');
    if (!draft) return;

    console.log(`-> Peer-Review (Literary Critic) en cours...`);
    const reviewPrompt = `Voici un brouillon d'article. Enlève absolument tous les tics de langage des IA (ex: "En conclusion").
    Garde le style de ${author.name}, rends-le percutant. Brouillon : ${draft}`;

    let finalArticle = await askLocalLLM(reviewPrompt, 'high');
    return finalArticle || draft;
}

// 3. Sauvegarde physique
function phase3SaveArticle(author, title, content) {
    if (!fs.existsSync(TARGET_DIR)) fs.mkdirSync(TARGET_DIR, { recursive: true });
    
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = path.join(TARGET_DIR, `${author.name.replace(/\s+/g, '_')}_${safeTitle}.md`);
    
    const frontmatter = `---\ntitle: "${title}"\nauthor: "${author.name}"\nstyle: "${author.style}"\ndate: "${new Date().toISOString().split('T')[0]}"\n---\n\n`;
    fs.writeFileSync(filename, frontmatter, 'utf8');
    fs.appendFileSync(filename, content, 'utf8');
    console.log(`[Succès] Article sauvegardé : ${filename}`);
}

async function runAutonomousDaemon() {
    console.log("=== DÉMARRAGE DU DAEMON A-TEAM (AVEC SYSTÈME IMMUNITAIRE) ===");
    
    let plan = await phase1DesignTeam();
    
    if (!plan || !plan.authors) {
        console.warn("[Système Immunitaire] Échec de la neurogenèse (Planification). Activation de l'équipe de réserve (Stem Cells).");
        plan = {
            authors: [
                { name: "Amadou Diop", style: "NYT Tech", divisions: ["Intelligence Artificielle", "Science de données"] },
                { name: "Dr. Fatima Zahra", style: "NYT Health", divisions: ["Ingénierie Biomédicale", "Ingénierie Chimique"] },
                { name: "Kwame Osei", style: "NYT Climate", divisions: ["Systèmes Énergétiques", "Génie Environnemental"] },
                { name: "Nadia Benali", style: "NYT Architecture", divisions: ["Ingénierie Civile", "Ingénierie Mécanique"] },
                { name: "Samuel Kalu", style: "NYT Business", divisions: ["Ingénierie Logicielle", "TIC", "Nouvelles Technologies"] }
            ]
        };
    }

    for (const author of plan.authors) {
        console.log(`\n=== ACTIVATION DU SOUS-AGENT : ${author.name} ===`);
        await generateTopicsForAuthor(author);
        
        for (const title of author.articles) {
            const finalContent = await phase2DraftAndReview(author, title);
            if (finalContent) phase3SaveArticle(author, title, finalContent);
        }
    }
    console.log("\n=== MISSION TERMINÉE. ===");
}

runAutonomousDaemon();
