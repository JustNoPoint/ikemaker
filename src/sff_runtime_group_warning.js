'use strict';
function runtimeGroupWarning(group){return Number(group)===65535?'IKEMEN nightly 6e564af reserves sprite group 65535: stored sprites in this group cannot render. Choose another group for new artwork; existing sprites are retained.':''}
module.exports={runtimeGroupWarning};
