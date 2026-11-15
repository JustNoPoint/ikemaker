'use strict';
const {randomBytes}=require('node:crypto');
const MIME='application/x-ikemaker-voice-cut-ticket',TTL=120000;
const tickets=new Map();
function revoke(owner){for(const [key,value]of tickets)if(value.owner===owner)tickets.delete(key);}
function issue({owner,isCurrent,materialize,describe,onConsumed},now=Date.now()){
 if(!owner||typeof isCurrent!=='function'||typeof materialize!=='function')throw Error('A live voice review is required.');
 for(const [key,value]of tickets)if(value.expires<=now)tickets.delete(key);
 const token=randomBytes(32).toString('hex');tickets.set(token,{owner,isCurrent,materialize,describe:String(describe||'Reviewed voice clips'),onConsumed,expires:now+TTL});return token;
}
function consume(token,now=Date.now()){
 const item=typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?tickets.get(token):null;
 if(!item)throw Error('This voice drag is unavailable. Drag the current reviewed clips again.');
 tickets.delete(token);
 if(typeof item.onConsumed==='function')item.onConsumed();
 if(item.expires<=now||!item.isCurrent())throw Error('The voice review changed or closed. Drag the current clips again.');
 return {describe:item.describe,materialize:async options=>{if(!item.isCurrent())throw Error('The voice review changed or closed.');const result=await item.materialize(options);if(!item.isCurrent())throw Error('The voice review changed during the drop.');return result;},assertCurrent:()=>{if(!item.isCurrent())throw Error('The voice review changed during import.');}};
}
module.exports={MIME,TTL,issue,consume,revoke};
