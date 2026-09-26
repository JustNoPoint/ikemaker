'use strict';
const {randomBytes}=require('crypto');
// Use only on trusted, escaped application templates. This is a content policy,
// not a sanitizer for external HTML. Existing asset-viewer policies remain intact.
function protect(html,resourceSource='') {
  if(/http-equiv=["']Content-Security-Policy["']/i.test(html))return html;
  const nonce=randomBytes(24).toString('base64');
  const local=/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s;"'<>]+$/.test(resourceSource)?' '+resourceSource:'';
  const policy="default-src 'none'; base-uri 'none'; form-action 'none'; img-src data:"+local+"; media-src data:"+local+"; font-src"+(local||" 'none'")+"; style-src 'nonce-"+nonce+"'; style-src-attr 'unsafe-inline'; script-src 'nonce-"+nonce+"'; connect-src 'none';";
  return html.replace(/<(script|style)(?=[\s>])/gi,(_,tag)=>'<'+tag+' nonce="'+nonce+'"').replace(/<head(?:\s[^>]*)?>/i,head=>head+'<meta http-equiv="Content-Security-Policy" content="'+policy+'">');
}
module.exports={protect};
