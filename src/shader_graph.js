'use strict';

const { normalizeGraph, NODE_TYPES } = require('./shader_workshop_model');
const { classifySafeguards } = require('./shader_safeguard_policy');

// Inputs without a wire use the values shown in the editor.
const ports = {
  'source-color': ['rgba', {}],
  'source-uv': ['uv', {}],
  time: ['number', {}],
  number: ['number', {}],
  color: ['rgba', {}],
  add: ['rgba', {a:'rgba', b:'rgba'}],
  multiply: ['rgba', {a:'rgba', b:'rgba'}],
  mix: ['rgba', {a:'rgba', b:'rgba', amount:'number'}],
  grayscale: ['rgba', {color:'rgba'}],
  'uv-offset': ['uv', {uv:'uv', x:'number', y:'number'}],
  'alpha-threshold': ['rgba', {color:'rgba', threshold:'number'}],
  'neighbor-sample': ['rgba', {uv:'uv'}],
  'output-color': [null, {color:'rgba'}]
};
const labels = new Map(NODE_TYPES.map(t => [t.id,t.label]));
const defaults = {
  a:'Source color', b:'White', amount:'0.5', color:'Source color',
  threshold:'0.5', uv:'Source UV', x:'0 pixels', y:'0 pixels'
};
function initialGraph() {
  return normalizeGraph({nodes:[{id:'source',type:'source-color'},{id:'output',type:'output-color'}],
    edges:[{from:'source',output:'rgba',to:'output',input:'color'}]});
}
function numberLiteral(n) {
  return Number(n).toFixed(6);
}
function graphPlan(project) {
  const { nodes,edges } = project.graph;
  const outputs = nodes.filter(node => node.type === 'output-color');
  if (outputs.length !== 1) throw new Error('Add exactly one Output Color to the graph.');
  const byId = new Map(nodes.map(node => [node.id,node]));
  const order = [], done = new Set(), pending = new Set(), links = new Map();
  for (const edge of edges) {
    if (!links.has(edge.to)) links.set(edge.to,new Map());
    const input = links.get(edge.to);
    if (input.has(edge.input)) throw new Error('Each graph input accepts one connection.');
    input.set(edge.input,edge);
  }
  function visit(node) {
    if (done.has(node)) return;
    if (pending.has(node)) throw new Error('Disconnect the circular graph connection.');
    pending.add(node);
    for (const [input,edge] of links.get(node.id) || []) {
      const from = byId.get(edge.from), kind = ports[node.type][1][input];
      if (!from || !kind || ports[from.type][0] !== kind || edge.output !== kind)
        throw new Error('Choose a compatible source for '+labels.get(node.type)+' '+input+'.');
      visit(from);
    }
    pending.delete(node);
    done.add(node);
    order.push(node);
  }
  visit(outputs[0]);
  const types = new Set(order.map(n => n.type));
  const sampled = types.has('neighbor-sample');
  const changesRgb = sampled || ['color','mix','add','multiply','grayscale'].some(type => types.has(type));
  const capabilities = {
    changesRgb, breaksIndexedBehavior:changesRgb, neighborSampling:sampled,
    changesSilhouette: sampled || types.has('alpha-threshold'), changesAlpha:sampled || types.has('alpha-threshold'),
    addsVisiblePixels:sampled
  };
  const effect = {id:'graph',label:'Node graph',capabilities};
  return {order,links,policy:classifySafeguards(project,effect),effect};
}
function graphBody(project) {
  const plan = graphPlan(project);
  const blocked = plan.policy.filter(s => s.status === 'blocked');
  if (blocked.length) throw new Error('Node graph is blocked by '+blocked.map(s=>s.label).join(', ')+'.');
  const variables = new Map(), lines=[];
  for (const [i,node] of plan.order.entries()) {
    const inputs=plan.links.get(node.id);
    const wire=(name,fallback)=>variables.get(inputs?.get(name)?.from) || fallback;
    const a=wire('a','sourceColor'), b=wire('b','vec4(1.0)'), c=wire('color','sourceColor');
    let value;
    switch(node.type) {
      case 'source-color': value='sourceColor'; break;
      case 'source-uv': value='graphUv'; break;
      case 'time': value='graphTime'; break;
      case 'number': value=numberLiteral(node.value ?? 0.5); break;
      case 'color': value='vec4('+((node.value || [1,1,1]).map(numberLiteral)).join(', ')+', sourceColor.a)'; break;
      case 'add': value='vec4('+a+'.rgb + '+b+'.rgb, '+a+'.a)'; break;
      case 'multiply': value='vec4('+a+'.rgb * '+b+'.rgb, '+a+'.a)'; break;
      case 'mix': value='vec4(mix('+a+'.rgb, '+b+'.rgb, clamp('+wire('amount','0.5')+', 0.0, 1.0)), '+a+'.a)'; break;
      case 'grayscale': value='vec4(vec3(dot('+c+'.rgb, vec3(0.2126,0.7152,0.0722))), '+c+'.a)'; break;
      case 'uv-offset': value=wire('uv','graphUv')+' + vec2('+wire('x','0.0')+', '+wire('y','0.0')+') / graphSize'; break;
      case 'neighbor-sample': value='graphSample('+wire('uv','graphUv')+')'; break;
      case 'alpha-threshold': value='vec4('+c+'.rgb, '+c+'.a * step('+wire('threshold','0.5')+', '+c+'.a))'; break;
      case 'output-color':
        lines.push('vec4 result = clamp('+c+', 0.0, 1.0);');
        if(project.target.kind!=='fullscreen' && project.safeguards.preserveTransparentPixels)
          lines.push('if (sourceColor.a <= 0.0) result = vec4(0.0);');
        continue;
      default: throw new Error('Unknown graph node.');
    }
    const name='n'+i, type={rgba:'vec4',uv:'vec2',number:'float'}[ports[node.type][0]];
    variables.set(node.id,name);
    lines.push(type+' '+name+' = '+value+';');
  }
  return {body:lines.join('\n  '),policy:plan.policy,animated:plan.order.some(n=>n.type==='time')};
}
const sampleFn = 'vec4 graphSample(vec2 uv) { if(any(lessThan(uv,vec2(0.0))) || any(greaterThanEqual(uv,vec2(1.0)))) return vec4(0.0); return SAMPLE; }';
function compileGraphPreview(project) {
  const {body,policy,animated} = graphBody(project);
  const baseline=require('./shader_effect_catalog').compileTrustedEffect({...project,mode:'preset',presetId:'passthrough'});
  const generate = (modern) => {
    const frag=modern?baseline.fragment:baseline.fallback.fragment;
    const sample=(modern?'texture':'texture2D')+'(uTexture,uv)';
    return frag.slice(0,frag.indexOf('void main()'))+'uniform float graphTime;\n'+sampleFn.replace('SAMPLE',sample)+
      '\nvoid main(){vec2 graphUv=vUv; vec2 graphSize=max(uTextureSize,vec2(1.0)); vec4 sourceColor=graphSample(graphUv);\n  '+
      body+'\n  '+(modern?'outColor':'gl_FragColor')+'=result;\n}';
  };
  return {...baseline,effectId:'graph',label:'Node graph',policy,fragment:generate(true),
    fallback:{...baseline.fallback,fragment:generate(false)},animated};
}
function graphStages(project,nightly) {
  const {body}=graphBody(project);
  if (project.target.kind==='fullscreen') {
    const {fullscreenFiles}=require('./shader_effect_catalog');
    const base=fullscreenFiles({...project,mode:'preset',presetId:'passthrough'});
    const start=base.fragment.slice(0,base.fragment.indexOf('void main()'))
      .replace('uniform Size {vec2 TextureSize;','uniform Size {vec2 TextureSize; float CurrentTime;')
      .replace('uniform vec2 TextureSize;','uniform vec2 TextureSize; uniform float CurrentTime;');
    return {...base,fragment:start+'\n'+sampleFn.replace('SAMPLE','texture(Texture,uv)')+
      '\nvoid main() {vec2 graphUv=vUv;vec2 graphSize=max(TextureSize,vec2(1.0));float graphTime=CurrentTime;vec4 sourceColor=graphSample(graphUv);\n'+body+'\nFragColor=result;\n}'};
  }
  if (!['sprite','animation','projectile','explod'].includes(project.target.kind)) throw new Error('Choose a character or fullscreen target for export.');
  let header, uv, size;
  if(nightly) {
    header=require('./shader_sprite_library');
    uv='ikemenSpriteUV()'; size='vec2(textureSize(tex,0))*(spriteUV.zw-spriteUV.xy)';
  } else {
    const template=require('./shader_sprite_template');
    const start=template.indexOf('void main(void)'),trapez=template.indexOf('/* sample position */',start);
    const adjust=template.slice(template.indexOf('vec2 uv = texcoord;',start),trapez);
    header=template.slice(0,start)+'\nvec2 ikemenSpriteUV(){'+adjust+' return uv;}\n'+
      template.slice(start).replace('void main(void)','vec4 ikemenSpriteColor(vec2 uv)').replace(adjust,'').replace('FragColor = c;','return c;');
    uv='ikemenSpriteUV()';size='vec2(textureSize(tex,0))';
  }
  return {fragment:header+'\n'+sampleFn.replace('SAMPLE','ikemenSpriteColor(uv)')+
    '\nvoid main() {vec2 graphUv='+uv+'; vec2 graphSize=max(vec2(1.0),'+size+'); float graphTime=iTime; vec4 sourceColor=graphSample(graphUv);\n'+body+'\nFragColor=result;\n}'};
}
module.exports={ports,labels,defaults,initialGraph,graphPlan,compileGraphPreview,graphStages};
