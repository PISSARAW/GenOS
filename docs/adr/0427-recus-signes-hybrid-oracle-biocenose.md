# ADR 0427 — Reçu signé lié au claim pour Hybrid Oracle

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : Biocénose, Hybrid Oracle Community, promotion factuelle

## Contexte

L'ADR 0417 liait un reçu `VERIFIED` aux identifiants du claim, du
vérificateur et de la communauté. Un callback `isTrustedReceipt` pouvait
néanmoins accepter un simple champ textuel. Le contenu du claim et le tour
ne figuraient pas dans une preuve vérifiée par le runtime. La finalisation
appelée directement pouvait recevoir un reçu fabriqué avec un callback qui
retourne toujours `true`.

## Décision

Pour `hybrid_oracle_community`, le reçu doit inclure `round` et
`epistemicReceipt`. Ce dernier est vérifié par le service de reçu épistémique
GenOS avec la clé HMAC configurée côté serveur et un digest de vérificateur
présent dans le registre de confiance. Son `evidenceDigest` doit correspondre
au SHA-256 canonique de la communauté, du tour, de l'identifiant et du
contenu exact du claim, du vérificateur, de l'identifiant du reçu et de sa
référence de preuve. Le `resultId` signé doit être l'identifiant du reçu et
le statut signé doit être `verified`.

Le routage exige cette vérification en plus du callback de confiance et ne
route que vers les membres actifs. L'agrégation et la promotion filtrent à
nouveau les reçus contre les claims persistés et les membres actifs de la
session. Un reçu absent, altéré, d'un autre tour ou d'un claim modifié ne
peut pas débloquer le jugement factuel. L'absence de clé HMAC entraîne un
refus de vérification. Les autres variants gardent leur contrat existant.
Le runtime déduit la politique de la constitution persistée et refuse toute
surcharge d'un handler de délibération pour Hybrid Oracle, afin qu'un appelant
ne saute pas ces contrôles en remplaçant l'étape de vérification ou le jugement.

Le runtime Biocénose ne signe aucun reçu à partir de `isTrustedReceipt` ou
du résultat brut de `verificationExecutor`. L'émission relève d'une autorité
de vérification distincte ; les tests produisent seulement des fixtures
signées pour démontrer la frontière.

## Limites

La signature prouve la possession de la clé locale et l'intégrité du lien,
pas la justesse de l'expérience externe ni l'indépendance du vérificateur.
La confidentialité et la rotation de la clé relèvent de la configuration du
service de reçus épistémiques. Un code privilégié ayant accès à la clé et à
`issueReceipt` reste dans le domaine de confiance du serveur.
