'use strict';

function willRepresentation({ subject, representation } = {}) {
  if (!subject) throw new Error('schopenhauerService.willRepresentation requires subject');
  return { subject, representation: representation || null, worldAs: ['representation', 'will'], will: 'blind striving', description: 'Le monde est representation pour le sujet et volonte comme chose en soi.' };
}

function principiumRationis({ phenomenon } = {}) {
  if (!phenomenon) throw new Error('schopenhauerService.principiumRationis requires phenomenon');
  return { phenomenon, principle: 'sufficient_reason', knowableAs: 'representation', description: 'Tout phenomene est saisi dans un rapport de raison suffisante.' };
}

function denialOfWill({ subject } = {}) {
  if (!subject) throw new Error('schopenhauerService.denialOfWill requires subject');
  return { subject, mode: 'ascetic', willToLive: 'suspended', compassion: true, description: 'La compassion et l ascese suspendent le vouloir-vivre et sa souffrance.' };
}

module.exports = { willRepresentation, principiumRationis, denialOfWill };
