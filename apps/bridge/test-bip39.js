import * as bip39 from 'bip39';

console.log('Testing BIP-39...');
console.log('12 words:', bip39.generateMnemonic(128));
console.log('24 words:', bip39.generateMnemonic(256));
console.log('Success!');
