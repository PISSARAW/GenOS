# Commandes compactes avec XGrammar

`command_grammar.py` compile une grammaire EBNF XGrammar pour `READ chemin`
et `SCORE entier`. L'expérience conserve un parseur et un contrôle d'autorité
après le décodage contraint : une sortie syntaxiquement valide ne donne aucun
droit supplémentaire. Le résumé compare erreurs de format, réparations et
tokens sur les mêmes tâches en modes libre et contraint.

Installer `xgrammar==0.2.8` dans un environnement dédié, puis
`python integrations/xgrammar/test_command_grammar.py`. Le test emploie un
vocabulaire jouet ; aucun moteur de production ni gain en tokens n'est établi.
Un moteur réel doit appliquer le masque XGrammar à ses logits.

Source : [XGrammar](https://github.com/mlc-ai/xgrammar).
