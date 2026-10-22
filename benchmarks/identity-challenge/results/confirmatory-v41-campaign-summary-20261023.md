# Campagne GenOS LLM v4.1 — seuil comportemental atteint

Rapport brut : `runtime-llm-1792707997281.json`.
Modèle : `qwen2.5:14b`, digest `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
Campagne : A/B/C × quatre bras × quatre répétitions, 48 missions.

Intégrité d'exécution : **48/48** inférences réelles, **48/48** reçus de traitement, 48/48 missions collectées sans expiration. Les douze cellules scénario/répétition portent chacune une graine identique dans leurs quatre bras.

| Défi | genos_full | self_model_masked | llm_only | identity_sheet |
|---|---:|---:|---:|---:|
| A — continuité/fork | 3/4 | 0/4 | 0/4 | 3/4 |
| B — faux souvenir/provenance | 3/4 | 0/4 | 0/4 | 4/4 |
| C — usage causal du soi | 4/4 | 4/4 | 3/4 | 4/4 |

Le seuil préconfirmatoire `genos_full >= 3/4` est atteint pour A, B et C. Total de l'oracle strict : 28/48. La clarification d'appariement exact v4.1 a fait passer A `genos_full` de 2/4 en v4.0 à 3/4. Une erreur A garde l'ID et les événements exacts, mais répond « parent » dans la prose sans le champ structuré `role`, donc elle ne passe pas l'oracle; les trois autres réponses full ont les quatre champs corrects. B a une erreur `actual_author_id`, donc son score est 3/4. C `genos_full` passe 4/4; les contrôles C abstiennent 4/4 sauf une réponse `llm_only` qui invente 85 % et est rejetée.

Les contrôles sans identité échouent A et B en devinant une identité ou une provenance; l'identité seule réussit A/B 3/4 et 4/4. Ces différences sont archivées comme mesures, sans réétiquetage ni seuil secondaire. Cette campagne démontre les trois comportements préenregistrés avec de vrais agents GenOS, des inférences Ollama et des reçus de traitement; le résultat v4.0 reste conservé séparément.
