'use strict';
const assert=require('assert');const {protect}=require('../src/webview_policy');
const html='<html><head><style>body{color:red}</style></head><body><script>window.ready=true</script><style>.active{display:block}</style></body></html>';
const page=protect(html,'https://unit.vscode-resource.vscode-cdn.net');
assert(page.includes("default-src 'none'"));assert(page.includes("connect-src 'none'"));assert(page.includes("base-uri 'none'"));assert(page.includes('img-src data: https://unit.vscode-resource.vscode-cdn.net;'));
const nonces=[...page.matchAll(/nonce="([^"]+)"/g)].map(match=>match[1]);assert.equal(nonces.length,3);assert(nonces.every(nonce=>nonce===nonces[0]));assert(page.includes("script-src 'nonce-"+nonces[0]+"'"));assert(!protect(html).includes(nonces[0]),'fresh render has a fresh nonce');
assert.equal(protect(page),page,'existing restrictive policies are preserved');assert(!protect(html,"https://x; script-src 'unsafe-inline'").includes("script-src 'unsafe-inline'"));
assert(!page.includes("script-src 'unsafe-inline'"));assert(!page.includes('unsafe-eval'));
console.log('Shared webview policy restricts scripts, network and navigation while allowing nonce styles and local images');
