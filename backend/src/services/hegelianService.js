'use strict';

function dialectique({ thesis, antithesis } = {}) {
  if (!thesis || !antithesis) throw new Error('hegelianService.dialectique requires thesis and antithesis');
  return { method: 'dialectical', thesis, antithesis, synthesis: `synthese(${thesis}, ${antithesis})`, development: 'Aufhebung', description: 'La contradiction est depassee et conservee dans une determination plus riche.' };
}

function absoluteGeist({ system = {} } = {}) {
  return { concept: 'absolute_geist', system, selfKnowing: true, historicalDevelopment: true, description: 'L Esprit absolu est le mouvement par lequel la totalite devient consciente d elle-meme.' };
}

function recognition({ self, other } = {}) {
  if (!self || !other) throw new Error('hegelianService.recognition requires self and other');
  return { self, other, reciprocal: true, relation: 'mutual_recognition', description: 'La conscience de soi se constitue dans la reconnaissance reciproque.' };
}

module.exports = { dialectique, absoluteGeist, recognition };
