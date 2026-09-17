'use strict';

const M = (id, label, school, status, definition, metadata = {}) => ({
  id, label, domain: 'mathematics', school, status,
  family: 'philosophy-of-mathematics', definition,
  evidenceLevel: 'philosophical', ...metadata
});

const MATHEMATICS_DEFINITIONS = [
  M('mathematics.number', 'Nombre et objet mathématique', 'general', 'registered', 'Statut ontologique et rôle structurel des nombres et des entités mathématiques.'),
  M('mathematics.infinite', 'Infini mathématique', 'general', 'registered', 'Concept de totalité ou de processus sans borne dans la pratique mathématique.'),
  M('mathematics.continuum', 'Continuum mathématique', 'general', 'interpretive', 'Problème du continu, de ses points et de sa structure.'),
  M('mathematics.potential-actual-infinity', 'Infini potentiel et infini actuel', 'aristotle-cantor', 'interpretive', 'Opposition entre un processus indéfiniment prolongeable et une totalité infinie donnée.'),
  M('mathematics.transfinite', 'Nombre transfini, cardinal et ordinal', 'cantor', 'registered', 'Hiérarchie des cardinaux et des ordinaux transfinis, incluant les alephs et la récurrence transfinie.'),
  M('mathematics.infinitesimal', 'Infiniment petit', 'leibniz-newton', 'interpretive', 'Grandeur non nulle plus petite que toute grandeur positive ordinaire dans les conceptions du calcul infinitésimal.'),
  M('mathematics.nonstandard-analysis', 'Analyse non standard', 'robinson', 'registered', 'Reconstruction rigoureuse du calcul avec nombres hyperréels et principe de transfert.'),
  M('mathematics.platonism', 'Platonisme mathématique / réalisme mathématique', 'frege-godel', 'disputed', 'Les entités mathématiques abstraites existent indépendamment des agents et de leurs pratiques.', { authors: ['Frege', 'Gödel'], aliases: ['réalisme mathématique', 'néo-platonisme mathématique'], claims: ['Problème épistémologique d’accès aux objets abstraits.'] }),
  M('mathematics.nominalism', 'Nominalisme mathématique', 'field', 'disputed', 'Les objets mathématiques ne constituent pas un domaine abstrait autonome ; les théories doivent être nominalisables.', { authors: ['Hartry Field'], works: ['Science Without Numbers'] }),
  M('mathematics.fictionalism', 'Fictionalisme mathématique', 'field', 'interpretive', 'Les entités mathématiques sont des fictions utiles au raisonnement sans engagement ontologique littéral.', { authors: ['Hartry Field'] }),
  M('mathematics.conceptualism', 'Conceptualisme mathématique', 'conceptualism', 'interpretive', 'Les entités mathématiques dépendent de constructions ou de capacités conceptuelles.'),
  M('mathematics.psychologism', 'Psychologisme mathématique', 'psychologism', 'disputed', 'Les lois ou objets mathématiques sont expliqués par des faits psychologiques ; position critiquée par Frege.'),
  M('mathematics.logicism', 'Logicisme', 'frege-russell', 'interpretive', 'Réduction des mathématiques à la logique et à ses principes.', { authors: ['Frege', 'Russell'], works: ['Grundlagen der Arithmetik', 'Grundgesetze der Arithmetik', 'Principia Mathematica'] }),
  M('mathematics.formalism', 'Formalisme mathématique', 'hilbert', 'interpretive', 'Les mathématiques sont étudiées comme manipulation formelle de symboles sous des règles explicites.', { authors: ['Hilbert'], claims: ['Le programme de Hilbert vise une preuve finitaire de cohérence.'] }),
  M('mathematics.intuitionism', 'Intuitionnisme mathématique', 'brouwer-heyting', 'interpretive', 'Les objets mathématiques sont construits mentalement ; le tiers exclu n’est pas universel.', { authors: ['Brouwer', 'Heyting'] }),
  M('mathematics.indispensability-argument', 'Argument d’indispensabilité Quine-Putnam', 'quine-putnam', 'disputed', 'L’indispensabilité des mathématiques dans les meilleures théories scientifiques motive un engagement réaliste envers leurs entités.', { authors: ['Quine', 'Putnam'], aliases: ['argument de Quine-Putnam'] }),
  M('mathematics.foundations-crisis', 'Crise des fondements', 'foundations', 'registered', 'Crise provoquée par les paradoxes et les conflits entre positions fondationnelles.'),
  M('mathematics.set-theory', 'Théorie des ensembles', 'set-theory', 'registered', 'Fondation par ensembles, appartenance, axiomes et constructions de collections mathématiques.'),
  M('mathematics.zfc', 'ZFC', 'zermelo-fraenkel', 'registered', 'Théorie de Zermelo-Fraenkel avec axiome du choix, cadre fondationnel standard mais non unique.'),
  M('mathematics.type-theory', 'Théorie des types', 'russell-church', 'registered', 'Fondation organisée par types afin de contrôler les paradoxes et les niveaux de construction.'),
  M('mathematics.category-theory', 'Théorie des catégories', 'lawvere-grothendieck', 'interpretive', 'Étude des objets par morphismes, foncteurs, transformations naturelles et propriétés universelles.', { authors: ['Lawvere', 'Grothendieck'] }),
  M('mathematics.structuralism', 'Structuralisme mathématique', 'shapiro-resnik', 'interpretive', 'Les mathématiques portent principalement sur des structures et les positions qu’elles contiennent.', { authors: ['Shapiro', 'Resnik'] }),
  M('mathematics.ante-rem-structuralism', 'Structuralisme ante rem', 'shapiro', 'disputed', 'Les structures existent indépendamment de leurs instances concrètes.'),
  M('mathematics.in-re-structuralism', 'Structuralisme in re', 'structuralism', 'interpretive', 'Les structures existent dans leurs réalisations ou instances.'),
  M('mathematics.post-rem-structuralism', 'Structuralisme post rem', 'structuralism', 'interpretive', 'Les structures sont abstraites à partir de systèmes ou pratiques déjà donnés.'),
  M('mathematics.continuum-hypothesis', 'Hypothèse du continuum', 'cantor-godel-cohen', 'disputed', 'Énoncé sur une cardinalité intermédiaire entre les entiers et les réels, indépendant de ZFC.', { authors: ['Cantor', 'Gödel', 'Cohen'], aliases: ['CH'] }),
  M('mathematics.hilbert-problems', 'Problèmes de Hilbert', 'hilbert', 'registered', 'Programme de problèmes structurant la recherche moderne, de l’Entscheidungsproblem au dixième problème.', { authors: ['Hilbert'], aliases: ['23 problèmes de Hilbert'] }),
  M('mathematics.proof', 'Nature de la preuve mathématique', 'proof-theory', 'registered', 'Justification soumise à des exigences de validité, de rigueur et de vérifiabilité.'),
  M('mathematics.proof-theory', 'Théorie de la démonstration', 'gentzen-hilbert', 'registered', 'Étude des preuves, de leur normalisation, de l’élimination des coupures et de leur cohérence.', { authors: ['Gentzen', 'Hilbert'] }),
  M('mathematics.homotopy-type-theory', 'Théorie homotopique des types', 'voevodsky-univalent-foundations', 'interpretive', 'Fondation reliant types, égalités, espaces et principes d’univalence.', { authors: ['Voevodsky'] }),
  M('mathematics.mathematical-intuition', 'Intuition et schème mathématiques', 'kant', 'interpretive', 'Rôle de l’intuition pure, de l’espace, du temps et du schématisme dans les concepts mathématiques.', { authors: ['Kant'] }),
  M('mathematics.mathematical-beauty', 'Beauté mathématique', 'hardy-ramanujan', 'interpretive', 'Valeur esthétique attribuée à la surprise, l’économie, l’élégance et l’inévitabilité.', { authors: ['G. H. Hardy', 'Ramanujan'] })
];

module.exports = { MATHEMATICS_DEFINITIONS };
