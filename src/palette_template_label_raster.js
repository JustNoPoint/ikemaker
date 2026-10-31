'use strict';

const FONT={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111','0':'111101101101111','1':'010110010010111','2':'110001111100111','3':'110001110001110','4':'101101111001001','5':'111100110001110','6':'011100110101010','7':'111001010010010','8':'010101010101010','9':'010101011001110','-':'000000111000000','_':'000000000000111',' ':'000000000000000','?':'110001010000010'};
function measure(text){return Math.max(1,String(text||'').slice(0,40).length*4-1)}
function draw(buffer,width,text,color,x=0,y=0){
  const label=String(text||'').toUpperCase().slice(0,40),rgba=String(color||'0,0,0,255').split(',').map(Number);
  for(let index=0;index<label.length;index++){
    const glyph=FONT[label[index]]||FONT['?'];
    for(let row=0;row<5;row++)for(let column=0;column<3;column++)if(glyph[row*3+column]==='1'){
      const px=x+index*4+column,py=y+row;if(px<0||py<0||px>=width)continue;
      const at=(py*width+px)*4;buffer[at]=rgba[0]||0;buffer[at+1]=rgba[1]||0;buffer[at+2]=rgba[2]||0;buffer[at+3]=Number.isFinite(rgba[3])?rgba[3]:255;
    }
  }
  return buffer;
}
module.exports={FONT,measure,draw};
