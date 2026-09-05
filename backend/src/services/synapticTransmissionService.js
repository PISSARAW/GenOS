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

async function releaseVesicles(engrams = []) {
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
  const filePath = path.join(cleftDir, `vesicle_${id}.vesicle`);
  fs.writeFileSync(filePath, compressed);
  return filePath;
}

async function uptakeVesicles() {
  const cleftDir = path.join(studioBridgeRoot(), 'synaptic_cleft');
  if (!fs.existsSync(cleftDir)) return [];

  const { Vesicle } = await getProtoTypes();
  const files = fs.readdirSync(cleftDir);
  const collectedEngrams = [];

  for (const file of files) {
    if (file.startsWith('vesicle_') && file.endsWith('.vesicle')) {
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

  for (const exo of exosomes) {
    const engrams = exo.new_engrams || exo.newEngrams || [];
    if (Array.isArray(engrams)) {
      for (const engram of engrams) {
        const id = `eng_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const vec = Array.isArray(engram.vector) && engram.vector.length === 768
          ? engram.vector
          : new Array(768).fill(0.0);
        const float32 = new Float32Array(vec);
        const buffer = Buffer.from(float32.buffer);

        await database.run(
          `INSERT INTO genome_decisions (id, title, content, embedding_blob, created_by, category, synaptic_weight)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id, 'Exosome Absorbed Engram', engram.content || '', buffer, 'exosome_phagocytosis', 'Exosome', 1.5
        ).catch((e) => { console.error('[absorbExosomes insert error]:', e); });
        engramsStored += 1;
      }
    }

    const pName = exo.plasmid_name || exo.plasmidName;
    const pCode = exo.plasmid_code || exo.plasmidCode;
    if (pName || pCode) {
      const plasmidId = `plasmid_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      await database.run(
        `INSERT INTO genome_decisions (id, title, content, created_by, category, synaptic_weight)
         VALUES (?, ?, ?, ?, ?, ?)`,
        plasmidId, `Plasmid: ${pName || 'Anonymous'}`, pCode || '', 'exosome_matrix', 'Plasmid', 2.0
      ).catch(() => {});
      plasmidsAssimilated += 1;
    }
  }

  return { absorbedCount: exosomes.length, engramsStored, plasmidsAssimilated };
}

module.exports = {
  releaseVesicles,
  uptakeVesicles,
  depositExosome,
  absorbExosomes
};
