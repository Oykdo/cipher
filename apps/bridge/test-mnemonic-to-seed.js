// Convert mnemonic to BIP-39 seed for login
import * as bip39 from 'bip39';

const mnemonic = "mind swamp orient call nerve pair few material dynamic rough company cruel";
const seed = await bip39.mnemonicToSeed(mnemonic);
const masterKey = seed.toString('hex');

console.log('Mnemonic:', mnemonic);
console.log('Master Key (hex):', masterKey);
console.log('\nUse this masterKey for login!');
