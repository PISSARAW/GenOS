# 18. IMMUNOLOGIE

Les mécanismes par lesquels l'essaim se protège des instructions malveillantes (Prompt Injection) et des dépendances corrompues.

---

## 18.1 ARN Interférence et CRISPR-Cas9

### Ce que ça apporte à l'agent
GenOS utilise un concept inspiré de **l'ARNi (Interférence)** : le *hot code swapping*. Si une heuristique ou un sous-prompt s'avère toxique (ex: il provoque des hallucinations systématiques), le système peut l'inhiber "silencieusement" à la volée, sans redémarrer l'agent.
De plus, via l'outil inject_crispr_spacer, GenOS enregistre la "signature" (l'empreinte) du prompt malveillant. Si l'attaque se présente à nouveau, elle est "coupée" et ignorée avant même d'atteindre le LLM.

Cela apporte une **résilience dynamique sans downtime**. Les agents malades guérissent pendant qu'ils travaillent, et les nouveaux prompts malveillants sont neutralisés génétiquement dès la deuxième tentative.
