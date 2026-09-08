/**
 * Proactive GitHub Analyst Service
 * Discovers and inspects local GitHub repositories, checking for uncommitted
 * changes, unpushed commits, and activity, then formats a personalized report.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultGitHubDirectory() {
  if (process.env.GITHUB_PROJECTS_DIR && fs.existsSync(process.env.GITHUB_PROJECTS_DIR)) {
    return path.resolve(process.env.GITHUB_PROJECTS_DIR);
  }
  const userHome = os.homedir();
  const candidates = [
    path.join(userHome, 'Documents', 'GitHub'),
    path.join(userHome, 'GitHub'),
    path.join(userHome, 'Projects'),
    path.resolve(__dirname, '../../../..')
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return path.resolve(dir);
  }
  return path.resolve(__dirname, '../../..');
}

function discoverRepositories(githubRoot = null, maxDepth = 2) {
  const root = githubRoot || defaultGitHubDirectory();
  const repos = [];
  if (!fs.existsSync(root)) return repos;

  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') && entry.name !== '.genos-agent-worlds') continue;

      const repoPath = path.join(root, entry.name);
      if (fs.existsSync(path.join(repoPath, '.git'))) {
        repos.push({ name: entry.name, path: repoPath });
      } else if (maxDepth > 1) {
        try {
          const subEntries = fs.readdirSync(repoPath, { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isDirectory() && fs.existsSync(path.join(repoPath, sub.name, '.git'))) {
              repos.push({ name: `${entry.name}/${sub.name}`, path: path.join(repoPath, sub.name) });
            }
          }
        } catch (_) {}
      }
    }
  } catch (err) {
    console.warn(`[GitHub Analyst] Erreur lors du scan de ${root}: ${err.message}`);
  }
  return repos;
}

function detectTechStack(repoPath) {
  const stack = [];
  if (fs.existsSync(path.join(repoPath, 'Cargo.toml'))) stack.push('Rust');
  if (fs.existsSync(path.join(repoPath, 'package.json'))) stack.push('Node.js / JS');
  if (fs.existsSync(path.join(repoPath, 'pyproject.toml')) || fs.existsSync(path.join(repoPath, 'requirements.txt'))) stack.push('Python');
  if (fs.existsSync(path.join(repoPath, 'go.mod'))) stack.push('Go');
  if (fs.existsSync(path.join(repoPath, 'pom.xml'))) stack.push('Java');
  if (fs.existsSync(path.join(repoPath, 'Dockerfile')) || fs.existsSync(path.join(repoPath, 'docker-compose.yml'))) stack.push('Docker');
  return stack.length > 0 ? stack.join(', ') : 'Polyglot';
}

function analyzeRepository(repoPath) {
  const name = path.basename(repoPath);
  const techStack = detectTechStack(repoPath);

  // 1. Branche actuelle
  const branchRes = spawnSync('git', ['branch', '--show-current'], { cwd: repoPath, encoding: 'utf8', timeout: 3000 });
  const branch = (branchRes.stdout || '').trim() || 'HEAD détachée';

  // 2. Statut des modifications locales
  const statusRes = spawnSync('git', ['status', '-s'], { cwd: repoPath, encoding: 'utf8', timeout: 3000 });
  const statusLines = (statusRes.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const dirty = statusLines.length > 0;
  const modifiedCount = statusLines.filter((l) => l.startsWith('M') || l.includes(' M ')).length;
  const untrackedCount = statusLines.filter((l) => l.startsWith('??')).length;

  // 3. Commits en avance / en retard
  const aheadBehindRes = spawnSync('git', ['status', '-uno', '-b'], { cwd: repoPath, encoding: 'utf8', timeout: 3000 });
  const branchInfo = (aheadBehindRes.stdout || '').split('\n')[0] || '';
  const aheadMatch = branchInfo.match(/ahead (\d+)/);
  const behindMatch = branchInfo.match(/behind (\d+)/);
  const ahead = aheadMatch ? parseInt(aheadMatch[1], 10) : 0;
  const behind = behindMatch ? parseInt(behindMatch[1], 10) : 0;

  // 4. Derniers commits
  const logRes = spawnSync('git', ['log', '-n', '3', '--oneline'], { cwd: repoPath, encoding: 'utf8', timeout: 3000 });
  const recentCommits = (logRes.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);

  return {
    name,
    path: repoPath,
    branch,
    dirty,
    totalChanges: statusLines.length,
    modifiedCount,
    untrackedCount,
    ahead,
    behind,
    recentCommits,
    techStack,
    statusSample: statusLines.slice(0, 5)
  };
}

function generateProactiveReport(analyses, agentConfig = {}) {
  const agentName = agentConfig.name || 'Sekou';
  const personality = agentConfig.personality || "Gardien vigilant et analyste d'architecture de l'écosystème.";
  const role = agentConfig.role || 'Autonomous GitHub Auditor & Sentinel';

  const total = analyses.length;
  const dirtyRepos = analyses.filter((a) => a.dirty);
  const unpushedRepos = analyses.filter((a) => a.ahead > 0);
  const behindRepos = analyses.filter((a) => a.behind > 0);
  const cleanRepos = analyses.filter((a) => !a.dirty && a.ahead === 0 && a.behind === 0);

  const timestamp = new Date().toLocaleString('fr-FR', { timeZoneName: 'short' });

  let md = `# 🛡️ Rapport d'Analyse Proactive GitHub - ${agentName}\n\n`;
  md += `> **Agent** : **${agentName}** (${role})\n`;
  md += `> **Personnalité** : *"${personality}"*\n`;
  md += `> **Horodatage** : ${timestamp}\n\n`;

  md += `## 📊 Vue d'Ensemble de l'Écosystème\n\n`;
  md += `- **Total de dépôts analysés** : \`${total}\`\n`;
  md += `- **Dépôts parfaitement propres & synchronisés** : \`${cleanRepos.length}\`\n`;
  md += `- **Dépôts avec modifications locales non commitées** : \`${dirtyRepos.length}\`\n`;
  md += `- **Dépôts avec commits locaux non poussés** : \`${unpushedRepos.length}\`\n`;
  if (behindRepos.length > 0) {
    md += `- **Dépôts en retard par rapport au serveur distant** : \`${behindRepos.length}\`\n`;
  }
  md += `\n---\n\n`;

  // Focus sur les dépôts nécessitant attention
  const urgent = [...new Set([...dirtyRepos, ...unpushedRepos, ...behindRepos])];
  if (urgent.length > 0) {
    md += `## ⚠️ Projets Nécessitant Votre Attention (${urgent.length})\n\n`;
    for (const repo of urgent) {
      md += `### 📁 [${repo.name}](${repo.path}) (\`${repo.techStack}\` | branche \`${repo.branch}\`)\n`;
      if (repo.dirty) {
        md += `- **Modifications locales** : ${repo.totalChanges} fichier(s) (${repo.modifiedCount} modifiés, ${repo.untrackedCount} non suivis).\n`;
        if (repo.statusSample.length > 0) {
          md += `  \`\`\`text\n  ${repo.statusSample.join('\n  ')}\n  \`\`\`\n`;
        }
      }
      if (repo.ahead > 0) {
        md += `- **Commits en attente de push** : 🚀 **${repo.ahead}** commit(s) devant \`origin/${repo.branch}\`.\n`;
      }
      if (repo.behind > 0) {
        md += `- **Commits distants en attente de pull** : 📥 **${repo.behind}** commit(s) derrière le serveur distant.\n`;
      }
      if (repo.recentCommits.length > 0) {
        md += `- **Dernière activité** : \`${repo.recentCommits[0]}\`\n`;
      }
      md += `\n`;
    }
  } else {
    md += `## ✨ Sérénité Totale\n\nTous vos dépôts sont propres et synchronisés avec leurs serveurs distants ! Excellent travail.\n\n`;
  }

  // Synthèse des dépôts propres
  if (cleanRepos.length > 0) {
    md += `## 🟢 Dépôts Synchronisés & Sains (${cleanRepos.length})\n\n`;
    const cleanList = cleanRepos.map((r) => `\`${r.name}\` (${r.techStack})`).join(', ');
    md += `${cleanList}\n\n`;
  }

  md += `---\n\n`;
  md += `### 💡 Conseil Proactif de ${agentName}\n\n`;
  if (dirtyRepos.length > 0) {
    md += `> Pensez à commiter vos travaux en cours sur **${dirtyRepos.slice(0, 3).map((r) => r.name).join(', ')}** pour éviter toute perte de contexte.\n`;
  } else if (unpushedRepos.length > 0) {
    md += `> Vos travaux locaux sont sauvegardés mais pas encore poussés sur vos dépôts distants (**${unpushedRepos.slice(0, 3).map((r) => r.name).join(', ')}**). Un \`git push\` sécurisera vos avancées sur GitHub.\n`;
  } else {
    md += `> L'architecture est stable et le terrain est dégagé pour vos prochaines créations.\n`;
  }

  return md;
}

function saveReport(reportContent, reportsDir = null) {
  const dir = reportsDir || path.resolve(__dirname, '../../../.genos/reports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const latestFile = path.join(dir, 'proactive-audit-latest.md');
  const timestampFile = path.join(dir, `proactive-audit-${Date.now()}.md`);

  fs.writeFileSync(latestFile, reportContent, 'utf8');
  fs.writeFileSync(timestampFile, reportContent, 'utf8');
  return { latestFile, timestampFile };
}

function runFullAudit(agentConfig = {}, githubRoot = null) {
  const root = githubRoot || defaultGitHubDirectory();
  const repos = discoverRepositories(root);
  const analyses = repos.map((repo) => analyzeRepository(repo.path));
  const report = generateProactiveReport(analyses, agentConfig);
  const saved = saveReport(report);

  return {
    root,
    totalRepos: repos.length,
    analyses,
    report,
    savedFiles: saved
  };
}

module.exports = {
  defaultGitHubDirectory,
  discoverRepositories,
  detectTechStack,
  analyzeRepository,
  generateProactiveReport,
  saveReport,
  runFullAudit
};
