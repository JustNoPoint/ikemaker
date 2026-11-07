'use strict';
const {motionTargetCurrent}=require('./stage_motion_owners');
// All navigation uses host-owned rows. Webview source filenames are never trusted.
async function routeStageMotion(api,binding,inventory,message,services){
 if(!binding.isCurrent()||!services.inventoryCurrent(inventory))return false;
 if(message.operation==='moveLab'){const attached=inventory.attachedOwners.find(row=>row.ownerDef===message.ownerDef);return attached?require('./stage_attached_move_lab').openAttachedMoveLab(api,binding,attached,{sourceCurrent:target=>motionTargetCurrent(target,services.readText)}):false;}
 const row=inventory.rows.find(row=>row.id===message.rowId);if(!row)return false;
 if(message.operation==='solo')return !row.unresolved&&row.affectedBackgrounds.length&&motionTargetCurrent(row.target,services.readText)?services.isolate([...row.affectedBackgrounds]):false;
 if(message.operation==='source')return motionTargetCurrent(row.target,services.readText)?services.openSource(row.target):false;
 return false;
}
module.exports={routeStageMotion};
