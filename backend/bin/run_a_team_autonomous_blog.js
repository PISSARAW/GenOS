const fs = require('fs');
const path = require('path');
const { generate } = require('../src/services/modelRouter.js');
const { analyzeMission } = require('../src/services/aTeamService.js');
const { parseMarkdownAST } = require('../src/services/markdownParser.js');
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
const { withImmunity, withTextImmunity, askLocalLLM } = require('../src/services/immuneSystem.js');
const { EpistemicData, evaluatePerception } = require('../src/services/epistemics.js');

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
async function generateTopicsForAuthor(author, variantIndex) {
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

    const plan = await withImmunity(prompt, 'high', validator, 3, 'ateam_orchestrator', null, variantIndex);
    if (plan) {
        author.articles = plan.articles;
    } else {
        console.error(`[Apoptose] Sujets par défaut pour ${author.name}`);
        author.articles = [
            new EpistemicData({ value: "Sujet de secours 1", provenance: { origin: "fallback", failure: true }, confidence: 0, epistemic_state: "INVALID", forbidden_ops: ["generate"] }),
            new EpistemicData({ value: "Sujet de secours 2", provenance: { origin: "fallback", failure: true }, confidence: 0, epistemic_state: "INVALID", forbidden_ops: ["generate"] }),
            new EpistemicData({ value: "Sujet de secours 3", provenance: { origin: "fallback", failure: true }, confidence: 0, epistemic_state: "INVALID", forbidden_ops: ["generate"] })
        ];
    }
}

// 2. Le duo "Author" et "Critic" rédige l'article (Stigmergie Conceptuelle & Canalisation Épigénétique)
async function phase2DraftAndReview(author, title, variantIndex) {
    console.log(`\n-> Rédaction en cours : "${title}" par ${author.name}...`);
    
    // 1. Gène Architecte (Injection du Template)
    const draftPrompt = `Tu es ${author.name} (${author.style}). Écris un article approfondi sur : "${title}". 
    L'article doit être sourcé avec des faits réels, sans clichés d'IA.
    
    RÈGLE ABSOLUE - Tu dois IMPÉRATIVEMENT respecter ce gabarit exact (Canalisation) :
    
    # ${title}
    (Introduction accrocheuse)
    
    ## 1. Contexte et Enjeux
    (Texte détaillé)
    
    ## 2. Innovations et Solutions
    (Texte avec au moins une liste à puces)
    
    ## 3. Impact et Perspectives
    (Conclusion)
    
    ## Sources
    - (Liste de 2 ou 3 sources ou liens)
    
    Renvoie uniquement le Markdown.`;
    
    let draft = await askLocalLLM(draftPrompt, 'medium', 'ateam_orchestrator', variantIndex);
    if (!draft) return null;

    console.log(`-> Peer-Review (Literary Critic) en cours (Divergence Cognitive: Modèle alternatif)...`);
    const reviewPrompt = `Voici un brouillon d'article. Enlève absolument tous les tics de langage des IA (ex: "En conclusion").
    Garde le style de ${author.name}, rends-le percutant. Vérifie que l'article soit très long et fourni. 
    Tu DOIS conserver intacts tous les titres exacts (## 1. Contexte et Enjeux, ## 2. Innovations et Solutions, ## 3. Impact et Perspectives, ## Sources).
    Brouillon : ${draft}`;

    // 2. Chaperon Markdown (Immunité Structurelle)
    const textValidator = (text) => {
        const ast = parseMarkdownAST(text);
        const hasNode = (str, lvl) => ast.some(n => n.type === 'heading' && n.level === lvl && n.text.includes(str));

        if (!hasNode("1. Contexte", 2)) throw new Error("Échappement immunitaire structurel détecté");
        if (!hasNode("2. Innovations", 2)) throw new Error("Échappement immunitaire structurel détecté");
        if (!hasNode("3. Impact", 2)) throw new Error("Échappement immunitaire structurel détecté");
        if (!hasNode("Sources", 2)) throw new Error("Échappement immunitaire structurel détecté");
        if (text.length < 1500) throw new Error("L'article est trop court (moins de 1500 caractères). Développe davantage les arguments.");
    };

    // Divergence Cognitive : variantIndex + 1
    // Fallback Stem Cell : si le critic échoue totalement après 3 essais à respecter la structure, on renvoie le draft brut
    let finalArticle = await withTextImmunity(reviewPrompt, 'high', {
        validatorFn: textValidator,
        maxRetries: 3,
        agentId: 'ateam_orchestrator',
        stemCellFallback: draft,
        variantIndex: variantIndex + 1
    });
    
    // 3. Consolidation Mécanique (Nettoyage final)
    if (finalArticle) {
        finalArticle = finalArticle.replace(/^```markdown/gi, '').replace(/```$/g, '').trim();
    }
    
    return finalArticle;
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
    console.log("=== DÉMARRAGE DU DAEMON A-TEAM (AVEC SYSTÈME IMMUNITAIRE ET MUE COGNITIVE) ===");
    
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

    let authorIndex = 0;
    for (const author of plan.authors) {
        authorIndex++;
        console.log(`\n=== ACTIVATION DU SOUS-AGENT : ${author.name} (Mue Cognitive: Modèle N°${authorIndex}) ===`);
        await generateTopicsForAuthor(author, authorIndex);
        
        for (const title of author.articles) {
            try {
                evaluatePerception(title, "generate");
            } catch (error) {
                console.error(`[Anomalie] Abstention : ${error.message}`);
                continue;
            }
            const actualTitle = title instanceof EpistemicData ? title.value : title;
            const finalContent = await phase2DraftAndReview(author, actualTitle, authorIndex);
            if (finalContent) phase3SaveArticle(author, actualTitle, finalContent);
        }
    }
    console.log("\n=== MISSION TERMINÉE. ===");
}

runAutonomousDaemon();
