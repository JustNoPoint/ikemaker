'use strict';

const KINDS=Object.freeze(['string','integer','float','expression','unknown']);

function classifyRuntimeValue(value){
  const expression=String(value??'').trim();
  if(!expression)return Object.freeze({kind:'unknown',literal:false,expression:''});
  if(/^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/.test(expression))return Object.freeze({kind:'string',literal:true,expression});
  if(/^[+-]?\d+$/.test(expression))return Object.freeze({kind:'integer',literal:true,expression});
  if(/^[+-]?(?:\d+\.\d*|\d*\.\d+)(?:e[+-]?\d+)?$/i.test(expression))return Object.freeze({kind:'float',literal:true,expression});
  return Object.freeze({kind:'expression',literal:false,expression});
}

function classifyArguments(values){return Object.freeze((values||[]).map(value=>classifyRuntimeValue(value).kind));}

function summarizeRuntimeValue(value){
  const classified=classifyRuntimeValue(value);
  if(classified.kind==='string')return `string literal · ${Math.max(0,classified.expression.length-2)} source character(s)`;
  if(classified.literal)return `${classified.kind} literal · ${classified.expression.slice(0,64)}`;
  return classified.kind==='unknown'?'unknown value':'dynamic expression';
}

function summarizeArguments(values){return Object.freeze((values||[]).map(summarizeRuntimeValue));}

module.exports={KINDS,classifyRuntimeValue,classifyArguments,summarizeRuntimeValue,summarizeArguments};
