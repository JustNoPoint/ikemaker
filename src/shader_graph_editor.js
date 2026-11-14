'use strict';
const { ports,labels,defaults } = require('./shader_graph');
const { replaceGraph } = require('./shader_workshop_model');
const escape = value => String(value).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
function editGraph(project,message) {
  const {op,id,input,from,type,value}=message, graph=project.graph;
  let nodes=[...graph.nodes], edges=[...graph.edges];
  const node=nodes.find(n=>n.id===id);
  if(op==='add') {
    if(!labels.has(type) || nodes.length>=256) throw new Error('Choose a node type or remove a node first.');
    if(type==='output-color' && nodes.some(n=>n.type===type)) throw new Error('The graph already has an Output Color.');
    let n=1;while(nodes.some(item=>item.id===type+'-'+n)) n++;
    nodes.push({id:type+'-'+n,type});
  } else {
    if(!node) throw new Error('The selected node has changed.');
    if(op==='remove') {
      nodes=nodes.filter(item=>item!==node);
      edges=edges.filter(e=>e.from!==id&&e.to!==id);
    } else if(op==='connect') {
      if(!Object.hasOwn(ports[node.type][1],input)) throw new Error('Unknown graph input.');
      edges=edges.filter(e=>!(e.to===id&&e.input===input));
      if(from) {
        const source=nodes.find(item=>item.id===from);
        if(!source||ports[source.type][0]!==ports[node.type][1][input]) throw new Error('Choose a matching graph output.');
        const reaches=new Set([id]);
        for (const candidate of reaches) {
          if(candidate===from) throw new Error('This wire would create a circular graph connection.');
          for(const e of edges) if(e.from===candidate) reaches.add(e.to);
        }
        if(edges.length>=512) throw new Error('Remove a graph connection before adding another.');
        edges.push({from,output:ports[source.type][0],to:id,input});
      }
    } else if(op==='value') {
      const valid=node.type==='number' && Number.isFinite(value) && Math.abs(value)<=10000 ||
        node.type==='color' && Array.isArray(value) && value.length===3 && value.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
      if(!valid) throw new Error('Enter a number between −10000 and 10000 or choose an RGB color.');
      nodes=nodes.map(item=>item===node?{...node,value}:item);
    } else throw new Error('Unknown graph edit.');
  }
  return replaceGraph(project,{nodes,edges});
}
function renderGraph(project) {
  const graph=project.graph;
  const option=(key,label,selected=false)=>'<option value="'+escape(key)+'"'+(selected?' selected':'')+'>'+escape(label)+'</option>';
  const names = new Map();
  const occurrences = new Map();
  for (const node of graph.nodes) {
    const count=(occurrences.get(node.type)||0)+1;
    occurrences.set(node.type,count);
    names.set(node.id,node.label||labels.get(node.type)+(count>1?' '+count:''));
  }
  const name=n=>names.get(n.id);
  const cards=graph.nodes.map(node=>{
    const id=escape(node.id);
    const fields=Object.entries(ports[node.type][1]).map(([input,kind])=>{
      const edge=graph.edges.find(e=>e.to===node.id && e.input===input);
      return '<label>'+escape(input)+' <select data-graph-input="'+input+'">'+option('',defaults[input],!edge)+
        graph.nodes.filter(n=>n!==node && ports[n.type][0]===kind).map(n=>option(n.id,name(n),n.id===edge?.from)).join('')+'</select></label>';
    });
    if(node.type==='number') fields.push('<label>Value <input type="number" min="-10000" max="10000" step="any" data-graph-value value="'+(node.value??0.5)+'"></label>');
    if(node.type==='color') fields.push('<label>RGB <input type="color" data-graph-value value="#'+(node.value||[1,1,1]).map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('')+'"></label>');
    if(node.type==='time'&&project.target.kind==='fullscreen') fields.push('<small>IKEMEN supplies its raw performance counter for fullscreen shaders. Offline preview uses elapsed seconds.</small>');
    return '<fieldset data-graph-node="'+id+'"><legend>'+escape(name(node))+'</legend><div class="row">'+fields.join(' ')+' <button data-graph-remove>Remove</button></div></fieldset>';
  });
  return '<section id="nodeGraph"><h2>Node graph</h2><p>Connect nodes with the input menus. Output Color determines the preview and export.</p><div class="row"><label>New node <select id="newGraphType">'+
    [...labels].filter(([id])=>id!=='output-color'||!graph.nodes.some(n=>n.type===id)).map(([id,name])=>option(id,name)).join('')+
    '</select></label><button id="addGraphNode">Add node</button></div>'+cards.join('')+'</section>';
}
function installGraphControls(send) {
  const root=document.getElementById('nodeGraph');
  if(!root)return;
  document.getElementById('addGraphNode').onclick=()=>send({type:'edit-graph',op:'add',typeId:document.getElementById('newGraphType').value});
  root.addEventListener('click',event=>{
    if(event.target.closest('[data-graph-remove]'))send({type:'edit-graph',op:'remove',id:event.target.closest('[data-graph-node]').dataset.graphNode});
  });
  root.addEventListener('change',event=>{
    const target=event.target, id=target.closest('[data-graph-node]')?.dataset.graphNode;
    if(target.hasAttribute('data-graph-input'))send({type:'edit-graph',op:'connect',id,input:target.dataset.graphInput,from:target.value});
    if(target.hasAttribute('data-graph-value'))send({type:'edit-graph',op:'value',id,value:target.type==='color'?target.value.slice(1).match(/../g).map(v=>parseInt(v,16)/255):target.valueAsNumber});
  });
}
module.exports={editGraph,renderGraph,installGraphControls};
