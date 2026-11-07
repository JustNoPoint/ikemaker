'use strict';
// Official executable-specific evidence; screenPos changed units between these builds.
const BUILDS=Object.freeze({'c869a7fb0112257a6a581fa2d66ca76a9860b5b6ec500be38f8e480f6bf79cf7':Object.freeze({label:'Official stable 1.0.0',screenPosSpace:'global'}),'77db97013e9ec1d6b87498de5facdd7a38643ea7522422c0381a13ea8adfa1ca':Object.freeze({label:'Official Nightly 2026.11.05 fb269c9',screenPosSpace:'local'})});
module.exports={BUILDS,profile:digest=>BUILDS[String(digest).toLowerCase()]||{label:'Unverified engine geometry',screenPosSpace:'unverified'}};
