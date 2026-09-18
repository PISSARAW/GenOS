'use strict';

const M = ({ id, label, school, status, definition, metadata = {} }) => ({
  id, label, domain: 'mathematics', school, status,
  family: 'philosophy-of-mathematics', definition,
  evidenceLevel: 'philosophical', ...metadata
});

const MATHEMATICS_DEFINITIONS = [
  M({ id: 'mathematics.number', label: 'Nombre et objet mathématique', school: 'general', status: 'registered', definition: 'Statut ontologique et rôle structurel des nombres et des entités mathématiques.' }),
  M({ id: 'mathematics.infinite', label: 'Infini mathématique', school: 'general', status: 'registered', definition: 'Concept de totalité ou de processus sans borne dans la pratique mathématique.' }),
  M({ id: 'mathematics.continuum', label: 'Continuum mathématique', school: 'general', status: 'interpretive', definition: 'Problème du continu, de ses points et de sa structure.' }),
  M({ id: 'mathematics.potential-actual-infinity', label: 'Infini potentiel et infini actuel', school: 'aristotle-cantor', status: 'interpretive', definition: 'Opposition entre un processus indéfiniment prolongeable et une totalité infinie donnée.' }),
  M({ id: 'mathematics.transfinite', label: 'Nombre transfini, cardinal et ordinal', school: 'cantor', status: 'registered', definition: 'Hiérarchie des cardinaux et des ordinaux transfinis, incluant les alephs et la récurrence transfinie.' }),
  M({ id: 'mathematics.infinitesimal', label: 'Infiniment petit', school: 'leibniz-newton', status: 'interpretive', definition: 'Grandeur non nulle plus petite que toute grandeur positive ordinaire dans les conceptions du calcul infinitésimal.' }),
  M({ id: 'mathematics.nonstandard-analysis', label: 'Analyse non standard', school: 'robinson', status: 'registered', definition: 'Reconstruction rigoureuse du calcul avec nombres hyperréels et principe de transfert.' }),
  M({ id: 'mathematics.platonism', label: 'Platonisme mathématique / réalisme mathématique', school: 'frege-godel', status: 'disputed', definition: 'Les entités mathématiques abstraites existent indépendamment des agents et de leurs pratiques.', metadata: { authors: ['Frege', 'Gödel'], aliases: ['réalisme mathématique', 'néo-platonisme mathématique'], claims: ['Problème épistémologique d’accès aux objets abstraits.'] } }),
  M({ id: 'mathematics.nominalism', label: 'Nominalisme mathématique', school: 'field', status: 'disputed', definition: 'Les objets mathématiques ne constituent pas un domaine abstrait autonome ; les théories doivent être nominalisables.', metadata: { authors: ['Hartry Field'], works: ['Science Without Numbers'] } }),
  M({ id: 'mathematics.fictionalism', label: 'Fictionalisme mathématique', school: 'field', status: 'interpretive', definition: 'Les entités mathématiques sont des fictions utiles au raisonnement sans engagement ontologique littéral.', metadata: { authors: ['Hartry Field'] } }),
  M({ id: 'mathematics.conceptualism', label: 'Conceptualisme mathématique', school: 'conceptualism', status: 'interpretive', definition: 'Les entités mathématiques dépendent de constructions ou de capacités conceptuelles.' }),
  M({ id: 'mathematics.psychologism', label: 'Psychologisme mathématique', school: 'psychologism', status: 'disputed', definition: 'Les lois ou objets mathématiques sont expliqués par des faits psychologiques ; position critiquée par Frege.' }),
  M({ id: 'mathematics.logicism', label: 'Logicisme', school: 'frege-russell', status: 'interpretive', definition: 'Réduction des mathématiques à la logique et à ses principes.', metadata: { authors: ['Frege', 'Russell'], works: ['Grundlagen der Arithmetik', 'Grundgesetze der Arithmetik', 'Principia Mathematica'] } }),
  M({ id: 'mathematics.formalism', label: 'Formalisme mathématique', school: 'hilbert', status: 'interpretive', definition: 'Les mathématiques sont étudiées comme manipulation formelle de symboles sous des règles explicites.', metadata: { authors: ['Hilbert'], claims: ['Le programme de Hilbert vise une preuve finitaire de cohérence.'] } }),
  M({ id: 'mathematics.intuitionism', label: 'Intuitionnisme mathématique', school: 'brouwer-heyting', status: 'interpretive', definition: 'Les objets mathématiques sont construits mentalement ; le tiers exclu n’est pas universel.', metadata: { authors: ['Brouwer', 'Heyting'] } }),
  M({ id: 'mathematics.indispensability-argument', label: 'Argument d’indispensabilité Quine-Putnam', school: 'quine-putnam', status: 'disputed', definition: 'L’indispensabilité des mathématiques dans les meilleures théories scientifiques motive un engagement réaliste envers leurs entités.', metadata: { authors: ['Quine', 'Putnam'], aliases: ['argument de Quine-Putnam'] } }),
  M({ id: 'mathematics.foundations-crisis', label: 'Crise des fondements', school: 'foundations', status: 'registered', definition: 'Crise provoquée par les paradoxes et les conflits entre positions fondationnelles.' }),
  M({ id: 'mathematics.set-theory', label: 'Théorie des ensembles', school: 'set-theory', status: 'registered', definition: 'Fondation par ensembles, appartenance, axiomes et constructions de collections mathématiques.' }),
  M({ id: 'mathematics.zfc', label: 'ZFC', school: 'zermelo-fraenkel', status: 'registered', definition: 'Théorie de Zermelo-Fraenkel avec axiome du choix, cadre fondationnel standard mais non unique.' }),
  M({ id: 'mathematics.type-theory', label: 'Théorie des types', school: 'russell-church', status: 'registered', definition: 'Fondation organisée par types afin de contrôler les paradoxes et les niveaux de construction.' }),
  M({ id: 'mathematics.category-theory', label: 'Théorie des catégories', school: 'lawvere-grothendieck', status: 'interpretive', definition: 'Étude des objets par morphismes, foncteurs, transformations naturelles et propriétés universelles.', metadata: { authors: ['Lawvere', 'Grothendieck'] } }),
  M({ id: 'mathematics.structuralism', label: 'Structuralisme mathématique', school: 'shapiro-resnik', status: 'interpretive', definition: 'Les mathématiques portent principalement sur des structures et les positions qu’elles contiennent.', metadata: { authors: ['Shapiro', 'Resnik'] } }),
  M({ id: 'mathematics.ante-rem-structuralism', label: 'Structuralisme ante rem', school: 'shapiro', status: 'disputed', definition: 'Les structures existent indépendamment de leurs instances concrètes.' }),
  M({ id: 'mathematics.in-re-structuralism', label: 'Structuralisme in re', school: 'structuralism', status: 'interpretive', definition: 'Les structures existent dans leurs réalisations ou instances.' }),
  M({ id: 'mathematics.post-rem-structuralism', label: 'Structuralisme post rem', school: 'structuralism', status: 'interpretive', definition: 'Les structures sont abstraites à partir de systèmes ou pratiques déjà donnés.' }),
  M({ id: 'mathematics.continuum-hypothesis', label: 'Hypothèse du continuum', school: 'cantor-godel-cohen', status: 'disputed', definition: 'Énoncé sur une cardinalité intermédiaire entre les entiers et les réels, indépendant de ZFC.', metadata: { authors: ['Cantor', 'Gödel', 'Cohen'], aliases: ['CH'] } }),
  M({ id: 'mathematics.hilbert-problems', label: 'Problèmes de Hilbert', school: 'hilbert', status: 'registered', definition: 'Programme de problèmes structurant la recherche moderne, de l’Entscheidungsproblem au dixième problème.', metadata: { authors: ['Hilbert'], aliases: ['23 problèmes de Hilbert'] } }),
  M({ id: 'mathematics.proof', label: 'Nature de la preuve mathématique', school: 'proof-theory', status: 'registered', definition: 'Justification soumise à des exigences de validité, de rigueur et de vérifiabilité.' }),
  M({ id: 'mathematics.proof-theory', label: 'Théorie de la démonstration', school: 'gentzen-hilbert', status: 'registered', definition: 'Étude des preuves, de leur normalisation, de l’élimination des coupures et de leur cohérence.', metadata: { authors: ['Gentzen', 'Hilbert'] } }),
  M({ id: 'mathematics.homotopy-type-theory', label: 'Théorie homotopique des types', school: 'voevodsky-univalent-foundations', status: 'interpretive', definition: 'Fondation reliant types, égalités, espaces et principes d’univalence.', metadata: { authors: ['Voevodsky'] } }),
  M({ id: 'mathematics.mathematical-intuition', label: 'Intuition et schème mathématiques', school: 'kant', status: 'interpretive', definition: 'Rôle de l’intuition pure, de l’espace, du temps et du schématisme dans les concepts mathématiques.', metadata: { authors: ['Kant'] } }),
  M({ id: 'mathematics.mathematical-beauty', label: 'Beauté mathématique', school: 'hardy-ramanujan', status: 'interpretive', definition: 'Valeur esthétique attribuée à la surprise, l’économie, l’élégance et l’inévitabilité.', metadata: { authors: ['G. H. Hardy', 'Ramanujan'] } })
];

module.exports = { MATHEMATICS_DEFINITIONS };
