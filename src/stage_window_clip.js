'use strict';
// Same effective zoom/scales and native float32 rounding as static BG projection.
const {clip}=require('./stage_parallax_projection');
function stageWindowClip(item,model,camera,runtime){return clip(item,model,camera,runtime);}
module.exports={stageWindowClip};
