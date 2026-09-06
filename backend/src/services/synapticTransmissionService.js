/**
 * GenOS Synaptic Transmission Service
 * Bridges Synaptic Vesicles (neurotransmitter release & reuptake) and Exosomes (epigenetic matrix transmission).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const protobuf = require('protobufjs');
const { studioBridgeRoot, phagocytizeExosomes } = require('./genosCli');
const { getDatabase } = require('../db');

let protoRoot = null;

async function getProtoTypes() {
  if (!protoRoot) {
    const protoPath = path.join(__dirname, '../proto/synapse.proto');
    protoRoot = await protobuf.load(protoPath);
  }
  return {
    Vesicle: protoRoot.lookupType('synapse.Vesicle'),
    Exosome: protoRoot.lookupType('synapse.Exosome')
  };
}

async function releaseVesicles(engrams = [], options = {}) {
  const cleftDir = path.join(studioBridgeRoot(), 'synaptic_cleft');
  if (!fs.existsSync(cleftDir)) fs.mkdirSync(cleftDir, { recursive: true });

  const { Vesicle } = await getProtoTypes();
  const payload = { engrams };
  const errMsg = Vesicle.verify(payload);
  if (errMsg) throw new Error(errMsg);

  const message = Vesicle.create(payload);
  const buffer = Vesicle.encode(message).finish();
  const compressed = zlib.gzipSync(buffer);

  const id = crypto.randomUUID();
  const targetAgent = options.targetAgentId || options.agentId ? `${String(options.targetAgentId || options.agentId).replace(/[^a-zA-Z0-9_-]/g, '')}_` : '';
  const filePath = path.join(cleftDir, `vesicle_${targetAgent}${id}.vesicle`);
  fs.writeFileSync(filePath, compressed);
  return filePath;
}

async function uptakeVesicles(targetAgentId = null) {
  const cleftDir = path.join(studioBridgeRoot(), 'synaptic_cleft');
  if (!fs.existsSync(cleftDir)) return [];

  const { Vesicle } = await getProtoTypes();
  const files = fs.readdirSync(cleftDir);
  const collectedEngrams = [];

  for (const file of files) {
    if (file.startsWith('vesicle_') && file.endsWith('.vesicle')) {
      if (targetAgentId) {
        const cleanTarget = String(targetAgentId).replace(/[^a-zA-Z0-9_-]/g, '');
        const targetPrefix = `vesicle_${cleanTarget}_`;
        const isBroadcast = /^vesicle_[0-9a-f]{8}-[0-9a-f]{4}/i.test(file);
        if (!file.startsWith(targetPrefix) && !isBroadcast) continue;
      }
      const fullPath = path.join(cleftDir, file);
      try {
        const compressed = fs.readFileSync(fullPath);
        const buffer = zlib.gunzipSync(compressed);
        const message = Vesicle.decode(buffer);
        const obj = Vesicle.toObject(message, { arrays: true });
        if (Array.isArray(obj.engrams)) {
          collectedEngrams.push(...obj.engrams);
        }
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.error(`[SynapticTransmission] Failed to uptake vesicle ${file}:`, err.message);
      }
    }
  }

  return collectedEngrams;
}

async function depositExosome(params = {}) {
  const exosomeDir = path.join(studioBridgeRoot(), 'extracellular_matrix');
  if (!fs.existsSync(exosomeDir)) fs.mkdirSync(exosomeDir, { recursive: true });

  const { Exosome } = await getProtoTypes();
  const engramsList = params.new_engrams || params.newEngrams || [];
  const pName = params.plasmid_name || params.plasmidName || '';
  const pCode = params.plasmid_code || params.plasmidCode || '';
  const payload = {
    new_engrams: engramsList,
    newEngrams: engramsList,
    plasmid_name: pName,
    plasmidName: pName,
    plasmid_code: pCode,
    plasmidCode: pCode
  };

  const message = Exosome.create(payload);
  const buffer = Exosome.encode(message).finish();
  const compressed = zlib.gzipSync(buffer);

  const id = crypto.randomUUID();
  const filePath = path.join(exosomeDir, `exosome_${Date.now()}_${id}.exosome`);
  fs.writeFileSync(filePath, compressed);
  return filePath;
}

async function absorbExosomes(db = null) {
  const database = db || (await getDatabase());
  const exosomes = await phagocytizeExosomes();
  if (!exosomes.length || !database) {
    return { absorbedCount: exosomes.length, engramsStored: 0, plasmidsAssimilated: 0 };
  }

  let engramsStored = 0;
  let plasmidsAssimilated = 0;
  const errors = [];

  for (const exo of exosomes) {
    const errorsBefore = errors.length;
    const engrams = exo.new_engrams || exo.newEngrams || [];
    if (Array.isArray(engrams)) {
      for (const engram of engrams) {
        if (!engram || typeof engram.content !== 'string' || !engram.content.trim()) {
          errors.push('Engram content is required.');
          continue;
        }
        if (!Array.isArray(engram.vector) || engram.vector.length !== 768 || engram.vector.some(value => !Number.isFinite(Number(value)))) {
          errors.push(`Engram '${engram.content.slice(0, 80)}' has no valid 768-dimensional vector.`);
          continue;
        }
        const id = `eng_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const vec = engram.vector;
        const float32 = new Float32Array(vec);
        const buffer = Buffer.from(float32.buffer);

        try {
          await database.run(
            `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight, organization_id, project_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id, 'Exosome Absorbed Engram', engram.content, buffer, 'exosome_phagocytosis', 'Exosome', 1.5,
            exo.organization_id || exo.organizationId || null,
            exo.project_id || exo.projectId || null
          );
          engramsStored += 1;
        } catch (error) {
          errors.push(`Engram insertion failed: ${error.message}`);
        }
      }
    }

    const pName = exo.plasmid_name || exo.plasmidName;
    const pCode = exo.plasmid_code || exo.plasmidCode;
    if (pName || pCode) {
      const plasmidId = `plasmid_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      try {
        await database.run(
          `INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight, organization_id, project_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          plasmidId, `Plasmid: ${pName || 'Anonymous'}`, pCode || '', 'exosome_matrix', 'Plasmid', 2.0,
          exo.organization_id || exo.organizationId || null,
          exo.project_id || exo.projectId || null
        );
        plasmidsAssimilated += 1;
      } catch (error) {
        errors.push(`Plasmid insertion failed: ${error.message}`);
      }
    }
    if (errors.length === errorsBefore && exo.__sourcePath) {
      try { fs.unlinkSync(exo.__sourcePath); } catch (error) { errors.push(`Exosome cleanup failed: ${error.message}`); }
    }
  }

  return { success: errors.length === 0, absorbedCount: exosomes.length, engramsStored, plasmidsAssimilated, errors };
}

module.exports = {
  releaseVesicles,
  uptakeVesicles,
  depositExosome,
  absorbExosomes
};
