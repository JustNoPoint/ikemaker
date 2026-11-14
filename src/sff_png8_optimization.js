'use strict';
const {evaluatePng8Recompression}=require('./sff_png8_recompression');
const NONE='none',ZLIB9='zlib9-smaller-only',NATIVE_V21=new Set(['ikemaker-builtin-sff-v21-png8','ikemaker-builtin-sff-v21-png8-prerelease']);
function normalizePng8Optimization(value){if(value===undefined)return NONE;if(value!==NONE&&value!==ZLIB9)throw Error('PNG8 optimization must be none or zlib9-smaller-only.');return value;}
function legacyPng8Optimization(specification){return normalizePng8Optimization(specification.options?.shared?.png8Optimization);}
function assertLegacyOptimization(specification){const mode=legacyPng8Optimization(specification);if(mode===ZLIB9&&(String(specification.target?.sffVersion)!=='2.1'||!specification.sprites?.some(sprite=>String(sprite.format).toLowerCase()==='png8')))throw Error('PNG8 optimization requires native SFF2.1 output containing indexed PNG8 sprites.');return mode;}
function validateBackendOptimization(encoding,backendId){const selected=encoding.backendOptions?.[backendId]||{};if(selected.png8Optimization===undefined)return NONE;const mode=normalizePng8Optimization(selected.png8Optimization);if(!NATIVE_V21.has(backendId))throw Error('PNG8 optimization is supported only by the native SFF2.1 indexed writer; SprMake2 and other versions stay unchanged.');return mode;}
function optimizedPng8(bytes,specification,options={}){return legacyPng8Optimization(specification)===ZLIB9?evaluatePng8Recompression(bytes,options).buffer:bytes;}
module.exports={NONE,ZLIB9,NATIVE_V21,normalizePng8Optimization,legacyPng8Optimization,assertLegacyOptimization,validateBackendOptimization,optimizedPng8};
