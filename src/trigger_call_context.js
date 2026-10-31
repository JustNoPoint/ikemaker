'use strict';

const LIMITS=Object.freeze({sourceBytes:4*1024*1024,calls:512,arguments:32});

function maskedSource(value,languageId='zss'){
  const text=String(value||'');if(Buffer.byteLength(text,'utf8')>LIMITS.sourceBytes)return null;
  const chars=[...text],cns=languageId==='ikemen-cns';let quote='',escaped=false,lineComment=false;
  for(let index=0;index<chars.length;index+=1){const char=chars[index],next=chars[index+1]||'';
    if(lineComment){if(char==='\n'||char==='\r')lineComment=false;else chars[index]=' ';continue;}
    if(quote){chars[index]=' ';if(escaped){escaped=false;continue;}if(char==='\\'){escaped=true;continue;}if(char===quote)quote='';continue;}
    if(char==='"'||char==="'"){quote=char;chars[index]=' ';continue;}
    if(char==='#'||char==='/'&&next==='/'||cns&&char===';'){lineComment=true;chars[index]=' ';if(char==='/'&&next==='/'){chars[index+1]=' ';index+=1;}continue;}
  }
  return chars.join('');
}

function closeForCall(masked,open){
  const stack=['('];
  for(let index=open+1;index<masked.length;index+=1){const char=masked[index];
    if(char==='('||char==='['||char==='{'){stack.push(char);continue;}
    if(char===')'){
      if(stack.at(-1)==='['){stack.pop();continue;}// IKEMEN half-open range: [min,max)
      if(stack.at(-1)!=='(')return-1;stack.pop();if(!stack.length)return index;continue;
    }
    if(char===']'){
      if(stack.at(-1)==='['){stack.pop();continue;}
      if(stack.at(-1)==='('&&stack.length>1){stack.pop();continue;}// IKEMEN half-open range: (min,max]
      return-1;
    }
    if(char==='}'){if(stack.at(-1)!=='{')return-1;stack.pop();}
  }
  return-1;
}

function trimSpan(text,start,end){while(start<end&&/\s/.test(text[start]))start+=1;while(end>start&&/\s/.test(text[end-1]))end-=1;return{start,end,text:text.slice(start,end)};}
function argumentSpans(text,masked,open,close){
  if(!text.slice(open+1,close).trim())return[];
  const result=[];let start=open+1;const stack=[];
  for(let index=open+1;index<close;index+=1){const char=masked[index];
    if(char==='('||char==='['||char==='{'){stack.push(char);continue;}
    if(char===')'){if(stack.at(-1)==='['||stack.at(-1)==='(')stack.pop();continue;}
    if(char===']'){if(stack.at(-1)==='['||stack.at(-1)==='(')stack.pop();continue;}
    if(char==='}'){if(stack.at(-1)==='{')stack.pop();continue;}
    if(char===','&&!stack.length){result.push(trimSpan(text,start,index));start=index+1;if(result.length>=LIMITS.arguments)return[];}
  }
  result.push(trimSpan(text,start,close));return result.map((span,position)=>({...span,position}));
}

function callOccurrences(value,names,languageId='zss'){
  const text=String(value||''),masked=maskedSource(text,languageId);if(masked===null)return[];
  const known=new Map([...names].map(name=>[String(name).toLowerCase(),String(name)])),calls=[];const identifier=/[A-Za-z_]/;
  for(let index=0;index<masked.length&&calls.length<LIMITS.calls;index+=1){
    if(!identifier.test(masked[index])||index>0&&/[A-Za-z0-9_.]/.test(masked[index-1]))continue;
    let end=index+1;while(end<masked.length&&/[A-Za-z0-9_.]/.test(masked[end]))end+=1;
    const raw=text.slice(index,end),catalogName=known.get(raw.toLowerCase());let open=end;while(/\s/.test(masked[open]||''))open+=1;
    if(catalogName&&masked[open]==='('){const close=closeForCall(masked,open);if(close>=0)calls.push({name:catalogName,sourceName:raw,start:index,nameEnd:end,open,close,end:close+1,source:text.slice(index,close+1),arguments:argumentSpans(text,masked,open,close)});}
    index=end-1;
  }
  return calls;
}

function lineBounds(text,offset){const start=Math.max(0,text.lastIndexOf('\n',Math.max(0,offset-1))+1),next=text.indexOf('\n',offset);return{start,end:next<0?text.length:next};}
function callAtOffset(value,names,offset,languageId='zss'){
  const text=String(value||''),bounded=Math.max(0,Math.min(text.length,Number(offset)||0)),calls=callOccurrences(text,names,languageId);
  const containing=calls.filter(call=>bounded>=call.start&&bounded<=call.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start));
  if(containing.length)return containing[0];
  const line=lineBounds(text,bounded),sameLine=calls.filter(call=>call.start>=line.start&&call.end<=line.end);
  return sameLine.length===1?sameLine[0]:null;
}

function argumentPositionAt(call,offset){
  const exact=(call?.arguments||[]).find(argument=>offset>=argument.start&&offset<=argument.end);if(exact)return exact.position;
  if(offset>call?.open&&offset<call?.close){let position=0;for(const argument of call.arguments||[])if(offset>argument.end)position=argument.position+1;return position;}
  return null;
}

function replacementPlan(text,call,slot,value){
  const replacement=String(value||'').trim();if(!replacement||/[\u0000\r\n]/.test(replacement)||Buffer.byteLength(replacement,'utf8')>4096)return null;
  const position=Number(slot?.position),current=call?.arguments?.[position];let start,end,insert='';
  if(current){start=current.start;end=current.end;insert=replacement;}
  else if(position===(call?.arguments?.length||0)){start=end=call.close;insert=`${position?', ':''}${replacement}`;}
  else return null;
  const source=String(text||'').slice(call.start,call.end),relativeStart=start-call.start,relativeEnd=end-call.start;
  return Object.freeze({start,end,value:insert,original:source,preview:source.slice(0,relativeStart)+insert+source.slice(relativeEnd),position});
}

module.exports={LIMITS,maskedSource,closeForCall,argumentSpans,callOccurrences,callAtOffset,argumentPositionAt,replacementPlan};
