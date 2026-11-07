'use strict';
// stage.go in pinned 64-bit nightly 6a093924 accepts a bare name or a suffix
// parsed by strconv.Atoi. It does not interpret the suffix as a runtime slot.
function isAttachedDeclaration(key){const match=/^attachedchar([+-]?\d+)?$/i.exec(key);if(!match)return false;if(match[1]===undefined)return true;const value=BigInt(match[1]);return value>=-9223372036854775808n&&value<=9223372036854775807n;}
module.exports={isAttachedDeclaration};
