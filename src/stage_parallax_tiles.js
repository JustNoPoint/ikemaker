'use strict';
// Static parallax ignores tilespacing and vertical tile in pinned stage.go.
// Horizontal copies advance by the row width; finite repeats begin at copy 0.
function parallaxTileRange(flag,edges,viewport,maxCopies=4096){
 if(!Number.isInteger(flag)||!edges.length||edges.some(e=>!Number.isFinite(e.left)||!Number.isFinite(e.width)||e.width<=0)||!Number.isFinite(viewport.left)||!Number.isFinite(viewport.right)||viewport.left>=viewport.right)return {supported:false,reason:'Invalid parallax tile geometry.'};
 if(flag===0)return {supported:true,first:0,last:0,count:1};
 let first=Math.min(...edges.map(e=>Math.floor((viewport.left-e.left)/e.width))),last=Math.max(...edges.map(e=>Math.ceil((viewport.right-e.left)/e.width)-1));
 if(flag!==1){first=Math.max(0,first);last=Math.min((flag<0?2147483647:flag)-1,last);}
 const count=Math.max(0,last-first+1);
 if(count>maxCopies)return {supported:false,reason:'Parallax tile preview exceeds '+maxCopies+' visible copies.'};
 return {supported:true,first,last,count};
}
module.exports={parallaxTileRange};
