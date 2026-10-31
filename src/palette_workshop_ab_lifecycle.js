'use strict';
function runtime(){
  let generation=0,restore=null;
  return{
    begin(){generation+=1;restore=null;return generation},
    current(token){return token===generation},
    register(token,callback){if(token===generation&&typeof callback==='function')restore=callback},
    restore(){restore?.()}
  };
}
module.exports={runtime};
