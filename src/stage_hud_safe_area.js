'use strict';
function validHudInsets(value){return value===undefined||Boolean(value&&Object.keys(value).sort().join('|')==='bottom|left|right|top'&&Object.values(value).every(n=>Number.isFinite(n)&&n>=0&&n<=45)&&value.left+value.right<95&&value.top+value.bottom<95);}
function hudSafeRectangle(width,height,insets){return{x:width*insets.left/100,y:height*insets.top/100,w:width*(1-(insets.left+insets.right)/100),h:height*(1-(insets.top+insets.bottom)/100)};}
module.exports={validHudInsets,hudSafeRectangle};
