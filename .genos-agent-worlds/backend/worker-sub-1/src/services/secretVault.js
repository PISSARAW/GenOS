const crypto=require('crypto');
function key(){const raw=process.env.GENOS_SECRET_KEY;if(!raw)throw new Error('GENOS_SECRET_KEY must be configured.');return crypto.createHash('sha256').update(raw).digest();}
function encrypt(value){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const ciphertext=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
function decrypt(record){const decipher=crypto.createDecipheriv('aes-256-gcm',key(),Buffer.from(record.iv,'base64'));decipher.setAuthTag(Buffer.from(record.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(record.ciphertext,'base64')),decipher.final()]).toString('utf8');}
module.exports={encrypt,decrypt};
