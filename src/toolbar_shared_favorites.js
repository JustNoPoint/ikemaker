'use strict';
const KEY='__sharedFavorites';
const portable=id=>typeof id==='string'&&/^(?:shared[.]|command[.])/.test(id);
function merge(previous,next,current){const removed=new Set(previous.filter(portable).filter(id=>!next.includes(id))),ordered=next.filter(portable);return[...new Set([...ordered,...current.filter(id=>!removed.has(id))])].slice(0,40);}
function migrate(preferences){const next={...preferences},shared=[...(preferences[KEY]?.favorites||[])];for(const [surface,value]of Object.entries(preferences)){if(surface===KEY)continue;const favorites=Array.isArray(value?.favorites)?value.favorites:[];shared.push(...favorites.filter(portable));next[surface]={...value,favorites:favorites.filter(id=>!portable(id))};}next[KEY]={favorites:[...new Set(shared)].slice(0,40)};return next;}
module.exports={KEY,portable,merge,migrate};
