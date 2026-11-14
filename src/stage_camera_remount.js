'use strict';
// Serializable numeric view restoration; source/layer identity is checked elsewhere.
function stageCameraRemountState(data,saved,limits){
 const value=data.cameraState||(saved?.filename===data.filename?saved.cameraState:null);
 if(!value)return null;const next={...value};
 for(const key of ['x','y','zoom']){const bounds=limits[key];if(!Number.isFinite(value[key])||!Array.isArray(bounds)||bounds.length!==2||!bounds.every(Number.isFinite)||bounds[0]>bounds[1])return null;const minimum=key==='zoom'?Math.max(.001,bounds[0]):bounds[0];if(minimum>bounds[1]||key==='zoom'&&value.zoom<=0)return null;next[key]=Math.max(minimum,Math.min(bounds[1],value[key]));}
 return next;
}
module.exports={stageCameraRemountState};
