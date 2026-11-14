'use strict';

const crypto = require('crypto');
const token = /^[A-Za-z0-9_.:-]{1,128}$/;
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const stableId = (...parts) => hash(JSON.stringify(parts)).slice(0,24);
const prefix = {zss:'#',lua:'--',air:';',cns:';',cmd:';',st:';',def:';',inp:';',jnp:';',txt:';'};
const newline = /\r?\n$/;
function wrapBlock(text, {tool,id,role,syntax,label,mode='reference'}) {
  if (![tool,id,role].every(x=>typeof x==='string' && token.test(x)) || !Object.hasOwn(prefix,syntax) || !['reference','managed'].includes(mode))
    throw Error('Invalid authoring link identity or language.');
  const eol=text.includes('\r\n')?'\r\n':'\n', trailing=newline.test(text);
  const body=text.replace(newline,''), cleanLabel=String(label||role).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,180);
  const current=scanLinks(body);
  if(current.length || /^\s*(?:#|;|--) IKEMaker (?:end )?link\b/im.test(body)){
    if(current.length===1 && current[0].start===0 && current[0].end===body.length && current[0].id===id && current[0].tool===tool && current[0].role===role && current[0].mode===mode && ['clean','reference'].includes(current[0].status))return text;
    throw Error('The selected code already contains an authoring link. Review the existing link first.');
  }
  const meta={tool,id,role,label:cleanLabel,mode};
  if(mode==='managed')meta.hash=hash(body.replace(/\r\n/g,'\n'));
  const comment=prefix[syntax];
  return comment+' IKEMaker link v1 '+JSON.stringify(meta)+eol+body+eol+comment+' IKEMaker end link '+id+' '+role+(trailing?eol:'');
}

function scanLinks(text) {
  const found=[];
  let open;
  const pattern=/^[ \t]*(#|;|--) IKEMaker (link\b|end link\b)([^\r\n]*)/gm;
  for(const m of text.matchAll(pattern)){
    if(m[2]==='link'){
      const nested=!!open;
      if(open)found.push(open);
      open=null;
      let d;
      if(!m[3].startsWith(' v1 '))continue;
      try{d=JSON.parse(m[3].slice(4));}catch{continue;}
      if(!d||![d.tool,d.id,d.role].every(x=>typeof x==='string'&&token.test(x)) || !['managed','reference'].includes(d.mode))continue;
      const end=m.index+m[0].length;
      open={tool:d.tool,id:d.id,role:d.role,label:String(d.label||d.role),mode:d.mode,hash:d.hash,start:m.index,end,bodyStart:end+(text.slice(end,end+2)==='\r\n'?2:1),bodyEnd:end,status:'incomplete',comment:m[1],nested};
    }else if(open){
      if(m[3].trim()===open.id+' '+open.role && open.comment===m[1]){
        open.bodyEnd=Math.max(open.bodyStart,m.index-(text.slice(m.index-2,m.index)==='\r\n'?2:1));
        open.end=m.index+m[0].length;
        if(!open.nested)open.status=open.mode==='reference'?'reference':hash(text.slice(open.bodyStart,open.bodyEnd).replace(/\r\n/g,'\n'))===open.hash?'clean':'edited';
      }
      found.push(open);open=null;
    }
  }
  if(open)found.push(open);
  return found;
}

function escapeToken(value){return value.replace(/[.]/g,'\\.');}
function planUpdate(text,linkedBlock){
  const block=linkedBlock.replace(newline,''), incoming=scanLinks(block);
  if(incoming.length!==1 || incoming[0].start!==0 || incoming[0].end!==block.length || !['clean','reference'].includes(incoming[0].status))return {status:'conflict',reason:'Invalid generated block.'};
  const item=incoming[0], matches=scanLinks(text).filter(x=>x.tool===item.tool && x.id===item.id && x.role===item.role);
  const endings=new RegExp('^[ \\t]*(?:#|;|--) IKEMaker end link '+escapeToken(item.id)+' '+escapeToken(item.role)+'[ \\t]*\\r?$','gm');
  if([...text.matchAll(endings)].length>matches.length)return {status:'conflict',reason:'An incomplete or duplicate copy of this link remains. Review its source.'};
  if(!matches.length){
    const orphan=new RegExp('^[ \\t]*(?:#|;|--) IKEMaker end link '+escapeToken(item.id)+' '+escapeToken(item.role)+'[ \\t]*\\r?$','m');
    if(orphan.test(text))return {status:'conflict',reason:'An incomplete copy of this link remains. Review its source.'};
    return {status:'new',text:linkedBlock};
  }
  if(matches.length!==1)return {status:'conflict',reason:'Multiple copies exist. Choose the authoritative installation first.'};
  const prior=matches[0], before=text.slice(prior.start,prior.end);
  if(before.replace(/\r\n/g,'\n')===block.replace(/\r\n/g,'\n'))return {status:'unchanged',start:prior.start,end:prior.end,text:before};
  if(prior.status!=='clean'||item.mode!=='managed')return {status:'conflict',reason:'Review the handwritten, changed, or incomplete block before replacing it.'};
  return {status:'update',start:prior.start,end:prior.end,text:block.replace(/\r?\n/g,text.includes('\r\n')?'\r\n':'\n')};
}
module.exports={wrapBlock,scanLinks,stableId,planUpdate};
