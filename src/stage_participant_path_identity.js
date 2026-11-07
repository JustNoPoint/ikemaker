'use strict';
const path=require('path');
// Ready-token identity must survive native Windows inventory spelling changes.
// Keep case significant on platforms whose paths can be case-sensitive.
module.exports=filename=>process.platform==='win32'?path.resolve(filename).toLowerCase():path.resolve(filename);
