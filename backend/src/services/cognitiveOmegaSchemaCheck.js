'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

function load(schema) {
  if (typeof schema !== 'string') return schema;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.schema\.json$/.test(schema)) throw new Error('schema_name_invalid');
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../spec', schema), 'utf8'));
}

function validate(candidate, descriptor) {
  try {
    const schema = load(descriptor.schema);
    if (schema === undefined || schema === null) throw new Error('schema_missing');
    const Engine = /2020-12/.test(schema.$schema || '') ? Ajv2020 : Ajv;
    const engine = new Engine({ allErrors: true, strict: false });
    addFormats(engine);
    const validator = engine.compile(schema);
    const valid = validator(candidate);
    return { valid, errors: validator.errors || [], schema: descriptor.schema };
  } catch (error) {
    return { valid: false, unavailable: true, errors: [error.message] };
  }
}

module.exports = { validate };
