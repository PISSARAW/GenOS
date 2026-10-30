# Registre MCP sans dépendance navigateur

La campagne Qwen a révélé qu'une reprise appelant `genos_replay` échouait pendant
le chargement du registre : le constructeur du service navigateur chargeait
`puppeteer`, même quand aucun outil navigateur n'était demandé.

L'adaptateur charge désormais cette dépendance à l'ouverture effective du
navigateur. Le registre et les outils sans navigateur restent chargeables en son
absence. Une demande de navigation échoue toujours si sa dépendance manque ;
aucune navigation fictive ni désactivation du sandbox n'est introduite.

`test_mcp_registry_without_browser_dependency.js` simule l'absence du module,
charge le vrai registre et vérifie que seul `open()` tente de le charger.
