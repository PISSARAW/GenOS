#!/usr/bin/env node
'use strict';

/**
 * Campagne de calibration nosologique — Agent A.
 *
 * Prépare l'infrastructure (structure, critères, vérification) d'une campagne
 * train / disjoint holdout pour les seuils de condition et benefit/harm pour
 * les quantités de thérapie.
 *
 * Cette campagne ne contient AUCUNE observation. Elle définit le contrat que
 * doivent respecter les données réelles avant que `shared/nosology.json`
 * puisse voir son `calibration.status` passer de
 * `uncalibrated_engineering_defaults` à une valeur étayée.
 *
 * Voir : docs/adr/0644-calibration-et-projection-nosologique-traçable.md
 *        docs/adr/0327-completion-nosologie-calibration-promotion.md
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const NOSOLOGY_PATH = path.join(ROOT, 'shared', 'nosology.json');
const OUT_DIR = path.join(ROOT, 'docs', '06-qualite-preuves', 'campagnes');
const SCHEMA = 'genos.nosology-calibration-campaign/v1';

const SEUIL_DEFAUT = 0.5;
const QUANTITE_DEFAUT = 0.25;

function die(message) {
  console.error(`[calibration-campagne] ERREUR: ${message}`);
  process.exit(1);
}

function loadNosology() {
  let raw;
  try {
    raw = fs.readFileSync(NOSOLOGY_PATH, 'utf8');
  } catch (error) {
    die(`impossible de lire ${NOSOLOGY_PATH}: ${error.message}`);
  }
  let catalog;
  try {
    catalog = JSON.parse(raw);
  } catch (error) {
    die(`catalogue nosologique invalide: ${error.message}`);
  }
  if (catalog.schema !== 'genos.nosology/v1') {
    die(`schéma inattendu: ${catalog.schema}`);
  }
  return catalog;
}

function defaultCampaign() {
  return {
    schema: SCHEMA,
    status: 'pending_real_observations',
    createdAt: new Date().toISOString(),
    parameters: {
      conditionThresholds: {
        implementedDefault: SEUIL_DEFAUT,
        evidence: 'contract_tests_only',
        promotionGate:
          'verified_train_and_disjoint_holdout_campaign',
        note: '0.5 est un défaut d’ingénierie; remplacé uniquement par une campagne vérifiée.'
      },
      therapyAmounts: {
        implementedDefault: QUANTITE_DEFAUT,
        evidence: 'contract_safety_and_idempotence_tests_only',
        promotionGate: 'verified_benefit_harm_campaign',
        note: '0.25 est un défaut d’ingénierie; remplacé uniquement par une campagne vérifiée.'
      },
      familyPressure: {
        productionAggregation: 'maximum_v1',
        candidateAggregation: 'noisy_or_v2',
        evidence: 'uncalibrated_shadow_comparison',
        promotionGate:
          'verified_common_holdout_against_raw_family_max_and_no_change',
        note: 'noisy_or_v2 reste en shadow tant que la campagne holdout commune ne la promeut pas.'
      },
      aeisThresholdsInScope: false
    },
    requirements: {
      observations: {
        signed: true,
        independent: true,
        paired: true,
        diversified: true,
        minimumCount: 20,
        minimumTaskFamilies: 3,
        minimumModels: 2,
        minimumDomains: 3,
        note: 'aucune observation n’est encore fournie; les valeurs par défaut d’ingénierie demeurent.'
      },
      controls: ['family_max_v1', 'raw_signals', 'no_change'],
      candidate: 'noisy_or_v2'
    },
    promotionRules: {
      candidateSuperiorToAllControls:
        'lowerBound > 0 sur chaque contrôle, correction de Bonferroni (√m conservateur)',
      commonHoldout:
        'cas communs vérifiés, holdout = true, réception签名 cohérente avec le digest',
      noSyntheticData:
        'les observations purement synthétiques ou de contrat ne suffisent pas à promouvoir'
    }
  };
}

function main() {
  const catalog = loadNosology();
  const conditions = catalog.conditions.length;
  const therapies = catalog.therapies.length;
  const families = new Set(catalog.conditions.map((c) => c.category)).size;

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const campaign = defaultCampaign();
  campaign.summary = {
    conditions,
    therapies,
    families,
    calibratedConditions: 0,
    calibratedTherapies: 0,
    note:
      'aucune condition ni thérapie n’est encore calibrée; les seuils (0.5) et quantités (0.25) restent des défauts d’ingénierie.'
  };

  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(campaign.parameters))
    .digest('hex');
  campaign.parametersDigest = `sha256:${digest}`;

  const outPath = path.join(OUT_DIR, 'campagne-calibration-nosologie.json');
  fs.writeFileSync(outPath, JSON.stringify(campaign, null, 2) + '\n');

  console.log('[calibration-campagne] OK');
  console.log(`  catalogue: ${conditions} conditions, ${therapies} thérapies, ${families} familles`);
  console.log(`  seuil condition: ${SEUIL_DEFAUT} (défaut d’ingénierie, non calibré)`);
  console.log(`  quantité thérapie: ${QUANTITE_DEFAUT} (défaut d’ingénierie, non calibré)`);
  console.log(`  campagne: ${outPath}`);
  console.log(`  statut: pending_real_observations`);
  console.log();
  console.log('Pour franchir la porte de promotion, fournir des observations réelles,');
  console.log('signées, indépendantes, appariées et diversifiées (train/disjoint holdout),');
  console.log('puis mettre à jour shared/nosology.json avec le nouveau calibration.status.');
}

main();
