'use strict';

const DESTINATIONS=Object.freeze({
  sff:{label:'SFF / Sprites',color:'#52c878'},air:{label:'AIR / Animations',color:'#4da3ff'},palette:{label:'Palettes',color:'#b27cff'},snd:{label:'SND / Sounds',color:'#e3ad45'},move_lab:{label:'Move Lab',color:'#39cad1'},code:{label:'Code',color:'#758dce'},stage:{label:'Stage',color:'#c6924e'},screenpack:{label:'Screenpack / UI',color:'#8a78d6'},maps:{label:'Project Data / Maps',color:'#48c5cf'},help:{label:'Help',color:'#b9c0c8'}
});
function destinationForCommand(command){const value=String(command||'');if(/^air\./.test(value))return'air';if(/^sff\./.test(value))return'sff';if(/^snd\./.test(value))return'snd';if(/palette|palfx/i.test(value))return'palette';if(/maps/i.test(value))return'maps';if(/stage/i.test(value))return'stage';if(/screenpack|\.ui\./i.test(value))return'screenpack';if(/moveLab|moveConstants|hitDef|helperLab|explodComposer|throwCreator|positionCamera/i.test(value))return'move_lab';if(/codeStructure|Controllers|commandMovelist|cnsConverter/i.test(value))return'code';if(/help|experience/i.test(value))return'help';return''}
function attributes(destination){return DESTINATIONS[destination]?` data-ikemen-destination="${destination}"`:''}
function styleHtml(){const rules=Object.entries(DESTINATIONS).map(([id,item])=>`[data-ikemen-destination="${id}"]{--ikemen-destination:${item.color};border-color:var(--ikemen-destination)!important;box-shadow:inset 0 -2px var(--ikemen-destination)}`).join('');return `<style data-ikemen-destination-style>${rules}[data-ikemen-destination]:hover{background:color-mix(in srgb,var(--ikemen-destination) 18%,var(--vscode-button-secondaryBackground,transparent))}@media(forced-colors:active){[data-ikemen-destination]{border-color:ButtonText!important;box-shadow:none}}</style>`}

module.exports={DESTINATIONS,destinationForCommand,attributes,styleHtml};
