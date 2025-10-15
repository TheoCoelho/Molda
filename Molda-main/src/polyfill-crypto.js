// Polyfill para crypto.getRandomValues no Node.js
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {};
}

if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  try {
    const { webcrypto } = require('crypto');
    globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
  } catch (e) {
    globalThis.crypto.getRandomValues = (arr) => {
      throw new Error('crypto.getRandomValues não está disponível neste ambiente.');
    };
  }
}
