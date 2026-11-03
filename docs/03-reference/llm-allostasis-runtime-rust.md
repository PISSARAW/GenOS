# Usage réel des appels LLM Rust

Le registre `llm_allostasis` possède trois dimensions entières distinctes :
tokens rapportés par le fournisseur, tentatives HTTP d'inférence et temps mural
observé du transport en millisecondes. Il ne transforme ni l'ATP, ni la longueur
du texte, ni le temps CPU en tokens ou en coût monétaire.

Les limites sont celles de l'ADMIT natif intègre. Une réserve de 5 %, arrondie
au supérieur, reste protégée dans chaque dimension. Ainsi, un budget de deux
appels laisse un appel ordinaire et une place protégée. Un budget d'un appel
est refusé ; le registre n'augmente pas silencieusement le grant. La réserve
n'accorde pas une capacité de récupération ou un droit d'appel supplémentaire.

Avant HTTP, l'exposition retient le maximum d'entrée plus le maximum de sortie,
une tentative et le maximum de temps mural autorisé. Elle est atomique avec
l'intention OMEGA et l'effet CONTINUITY. Une exposition déjà enregistrée ne peut
pas être utilisée pour autoriser une seconde tentative. Les compteurs sont
globaux à la mission : changer d'incarnation ne recrédite pas les dépenses.

L'usage connu provient du reçu opaque du client natif : compteurs explicites
du fournisseur, identité du modèle et de la requête, réponse et durée mesurée.
Ces compteurs sont une observation du rapport du fournisseur, pas une mesure
indépendante de son tokenizer ni une facture certifiée. Les estimations
historiques `len/4` du serveur de chat et du CLI ne sont pas admises comme usage
réel de ce parcours.

Les maxima d'entrée servent à l'admission et à l'exposition ; ce profil ne
dispose pas d'un tokenizer local attestant chaque modèle. Un fournisseur peut
rapporter une consommation supérieure aux bornes. Ce dépassement reste débité,
marque l'allocation en dépassement, et bloque la publication et les nouveaux
grants au lieu d'annuler le constat. Une saturation entière est signalée par
`accounting_overflow` ; les valeurs détaillées restent présentes dans le reçu
natif et l'état demeure bloqué.

Si les deux compteurs d'usage ne sont pas disponibles, l'exposition maximale
de tokens reste retenue avec un état inconnu. Le minimum connu est débité :
le maximum entre la somme des composantes explicitement connues et un total
explicitement rapporté. Les compteurs partiels restent consultables dans le
reçu natif, sans être transformés en consommation totale nulle. La retenue
complète et ce débit minimal rendent le disponible conservateur ; un rejeu du
même reçu ne débite pas à nouveau ce minimum. La tentative HTTP et son temps mural peuvent déjà être observés et
irréversibles alors que la quantité de tokens demeure inconnue.

Seul un échec opaque `BeforeDispatch`, effectivement émis par le dispatch
correspondant, peut libérer une exposition sans consommation. Une annulation,
un timeout, une réponse perdue ou une erreur après entrée dans le transport
n'impliquent jamais zéro usage. Un nouveau reçu d'annulation externe ne peut
pas solder une ancienne opération inconnue partageant le même prompt.

La libération exige l'absence de toute exposition ou consommation inconnue et
de tout dépassement. Elle ne soustrait jamais les tokens, les tentatives ni le
temps déjà observés. L'enregistrement d'un reçu réel reste possible après
expiration pour comptabiliser un effet ancien ; il ne renouvelle pas le bail
et ne permet pas une publication sans autorité courante.

Les tests `llm_allostasis` couvrent un échange HTTP réel de qualification,
l'idempotence du débit, l'usage absent après réouverture, les réserves protégées
et les dépassements conservés. Ils ne revendiquent aucune facturation externe.
