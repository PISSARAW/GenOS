const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Configure l'auto-démarrage de Griot sous Windows en créant un script 
 * dans le dossier "Startup" de l'utilisateur.
 */
function enableGriotAutostart() {
    if (process.platform !== 'win32') return;

    try {
        const startupDir = path.join(
            os.homedir(), 
            'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
        );
        
        const autostartFile = path.join(startupDir, 'Griot_Daemon.bat');

        // Récupère la racine du projet GenOS (en remontant depuis backend/src/services)
        const projectDir = path.resolve(__dirname, '../../..'); 

        // Remplacer "npm start" par la commande exacte utilisée pour lancer Griot (ex: npm run start:griot)
        const command = `@echo off\ncd /d "${projectDir}"\nstart /min "Griot Daemon" cmd /c "npm start"\n`;

        if (!fs.existsSync(autostartFile)) {
            fs.writeFileSync(autostartFile, command);
            console.log("✅ [Griot] Configuration de l'auto-démarrage Windows réussie.");
        } else {
            console.log("ℹ️ [Griot] L'auto-démarrage Windows est déjà configuré.");
        }
    } catch (error) {
        console.error("❌ [Griot] Impossible de configurer l'auto-démarrage :", error.message);
    }
}

module.exports = { enableGriotAutostart };
