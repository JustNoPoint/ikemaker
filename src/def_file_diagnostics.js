'use strict';

const fs=require('fs');
const path=require('path');

function withoutComment(line){let quoted=false;for(let index=0;index<line.length;index+=1){if(line[index]==='"'&&line[index-1]!=='\\')quoted=!quoted;else if(line[index]===';'&&!quoted)return line.slice(0,index);}return line;}

function missingFileIssues(text,filename,exists=fs.existsSync){
  if(!/\.def$/i.test(String(filename||'')))return[];
  const lines=String(text||'').split(/\r?\n/),issues=[];let section='';
  for(let line=0;line<lines.length;line+=1){
    const raw=lines[line],code=withoutComment(raw),header=/^\s*\[\s*([^\];]+)\s*\]/.exec(code);
    if(header){section=header[1].trim().toLowerCase();continue;}
    if(section!=='files')continue;
    const field=/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*?)\s*$/.exec(code);if(!field)continue;
    const authored=field[2],value=authored.trim(),relative=/^"([^"\r\n]+)"$/.test(value)?value.slice(1,-1):value;
    if(!relative||/[\r\n\0,*?]/.test(relative))continue;
    const target=path.resolve(path.dirname(filename),relative.replace(/[\\/]/g,path.sep));if(exists(target))continue;
    const leading=authored.length-authored.trimStart().length,start=field[0].indexOf(field[2])+leading+(value.startsWith('"')?1:0);
    issues.push({line,start,length:relative.length,severity:'error',code:'missing-def-file',message:`[Files] ${field[1]} references a file that does not exist: ${relative}`,help:'Correct the path, restore the missing file, or deliberately remove the assignment. IKEMaker will not create, rename, or substitute a file automatically.'});
  }
  return issues;
}

module.exports={missingFileIssues,withoutComment};
