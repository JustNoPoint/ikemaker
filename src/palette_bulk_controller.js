'use strict';
const crypto=require('crypto'),authority=require('./palette_bulk_source_authority'),gallery=require('./palette_bulk_gallery_model'),scanner=require('./palette_bulk_gallery_scan'),{PaletteBulkExportStore}=require('./palette_bulk_export_store'),writer=require('./palette_bulk_copy_writer');
class PaletteBulkController{
 constructor(projectRoot){this.store=new PaletteBulkExportStore(projectRoot);this.busy=false}
 locked(work){if(this.busy)throw new Error('Bulk Palette Gallery is already completing another operation.');this.busy=true;try{return work()}finally{this.busy=false}}
 startSff(filename,selections,registry,options){return this.locked(()=>{const source=authority.fromSff(filename,selections,registry),template=options.templateFilename?authority.templateFromIndexedPng(options.templateFilename):null,inventory=scanner.scan(options.galleryRoot).inventory,plan=gallery.plan({...options,sourceAuthority:source,templateAuthority:template,galleryInventory:inventory.entries}),operationId=`bulk-${crypto.randomBytes(12).toString('hex')}`;return this.store.create(source,template,plan,operationId)})}
 snapshot(operationId){const saved=this.store.load(operationId);authority.revalidate(saved.source);if(saved.template)authority.revalidateTemplate(saved.template);return saved}
 write(operationId,expectedHeadHash,outputRoot){return this.locked(()=>{const saved=this.snapshot(operationId);if(saved.headByteHash!==expectedHeadHash)throw new Error('Bulk reviewed plan changed after review.');return writer.write({sourceAuthority:saved.source,templateAuthority:saved.template,plan:saved.plan,operationId,revision:saved.head.revision,outputRoot})})}
}
module.exports={PaletteBulkController};
