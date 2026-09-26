"""Build attributed offline reference snapshots. Requires markdown and beautifulsoup4.
Usage: python tools/bundle-offline-reference.py PATH_TO_WIKI_CHECKOUT
"""
import sys,json,hashlib,urllib.request,urllib.parse,posixpath,html
from pathlib import Path
from datetime import datetime,timezone
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
import markdown
root=Path(__file__).resolve().parents[1]/'data/offline-docs/reference'
root.mkdir(parents=True,exist_ok=True)
wiki=Path(sys.argv[1]); pages={}; blobs={}; failures=[]
def fetch(u):
 try:
  with urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'IKEMaker-Offline-Docs/1.0'}),timeout=25) as r:return u,r.read(),r.headers.get_content_type(),None
 except Exception as e:return u,None,None,str(e)
def clean(u):return urllib.parse.urldefrag(u)[0]
def allowed(u):
 p=urllib.parse.urlparse(u)
 return (p.netloc=='www.elecbyte.com' and p.path.startswith('/mugendocs-11b1/')) or (p.netloc=='potsmugen.github.io' and p.path.startswith('/ikemen-merged-docs/'))
def local(u):
 p=urllib.parse.urlparse(u); base='mugen' if p.netloc=='www.elecbyte.com' else 'merged'; prefix='/mugendocs-11b1/' if base=='mugen' else '/ikemen-merged-docs/'
 rel=urllib.parse.unquote(p.path[len(prefix):]) or 'index.html'
 if not Path(rel).suffix:rel+='.html'
 if '..' in Path(rel).parts:raise ValueError(rel)
 return base+'/'+rel
queue={'https://www.elecbyte.com/mugendocs-11b1/mugen.html','https://potsmugen.github.io/ikemen-merged-docs/'};seen=set()
while queue:
 batch=sorted(queue-seen);queue=set()
 if not batch:break
 seen.update(batch)
 with ThreadPoolExecutor(max_workers=6) as pool:
  for u,data,kind,error in pool.map(fetch,batch):
   if error:failures.append({'url':u,'error':error});continue
   dest=local(u);blobs[u]=(dest,data,kind)
   if kind=='text/html':
    soup=BeautifulSoup(data,'html.parser');pages[u]=(dest,soup)
    for tag in soup.find_all(['a','img','link','script']):
     attr='href' if tag.name in ['a','link'] else 'src'; value=tag.get(attr,'');target=clean(urllib.parse.urljoin(u,value))
     if value and allowed(target) and not urllib.parse.urlparse(target).query and Path(urllib.parse.urlparse(target).path).suffix.lower() not in ['.zip','.exe','.7z','.rar'] and target not in seen:queue.add(target)
for f in sorted(wiki.glob('*.md')):
 u='https://github.com/ikemen-engine/Ikemen-GO/wiki/'+urllib.parse.quote(f.stem)
 body=markdown.markdown(f.read_text(encoding='utf-8'),extensions=['tables','fenced_code','toc','sane_lists'])
 dest='wiki/'+f.stem+'.html';soup=BeautifulSoup('<html><head><meta charset="utf-8"><title>'+html.escape(f.stem)+'</title></head><body>'+body+'</body></html>','html.parser');pages[u]=(dest,soup)
# Original markdown sources are retained for attribution and future regeneration.
for f in wiki.glob('*.md'):
 q=root/'wiki-source'/f.name;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(f.read_bytes())
lookup={urllib.parse.unquote(u).rstrip('/'):d for u,(d,_) in pages.items()}
lookup.update({urllib.parse.unquote(u).rstrip('/'):d for u,(d,_,_) in blobs.items()})
lookup['https://github.com/ikemen-engine/Ikemen-GO/wiki']='wiki/Home.html'
# Fetch inline wiki images once, retaining attribution URLs in the manifest.
image_urls=set()
for u,(d,soup) in pages.items():
 if d.startswith('wiki/'):
  for tag in soup.find_all('img'):
   target=urllib.parse.urljoin(u+'/',tag.get('src',''))
   if target.startswith('https://'):image_urls.add(target)
with ThreadPoolExecutor(max_workers=6) as pool:
 for u,data,kind,error in pool.map(fetch,sorted(image_urls)):
  if error:failures.append({'url':u,'error':error});continue
  ext=Path(urllib.parse.urlparse(u).path).suffix or '.png';dest='assets/'+hashlib.sha256(u.encode()).hexdigest()[:16]+ext
  blobs[u]=(dest,data,kind);lookup[urllib.parse.unquote(u).rstrip('/')]=dest
for u,(dest,data,kind) in blobs.items():
 if u in pages:continue
 p=root/dest;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
for u,(dest,soup) in pages.items():
 for tag in soup.find_all(['a','img','link','script']):
  attr='href' if tag.name in ['a','link'] else 'src';v=tag.get(attr)
  if not v or v.startswith('#'):continue
  target=urllib.parse.urljoin(u,v)
  # Wiki markdown often uses bare page names instead of full URLs.
  if dest.startswith('wiki/') and not urllib.parse.urlparse(v).scheme and not v.startswith('/'):
   target=urllib.parse.urljoin('https://github.com/ikemen-engine/Ikemen-GO/wiki/',v)
  bare,frag=urllib.parse.urldefrag(target);key=urllib.parse.unquote(bare).rstrip('/')
  if key in lookup:
   tag[attr]=urllib.parse.quote(posixpath.relpath(lookup[key],posixpath.dirname(dest)),safe='/.-_')+('#'+frag if frag else '')
  else:tag[attr]=target
 # Offline pages require no remote scripts or styles; retain inline reference styles.
 for tag in list(soup.find_all('script')):tag.decompose()
 for tag in list(soup.find_all('link')):
  if str(tag.get('href','')).startswith(('http:','https:')):tag.decompose()
 style=soup.new_tag('style');style.string='body{max-width:1100px;margin:24px auto;padding:0 20px;font:16px/1.55 system-ui,sans-serif}pre{overflow:auto;background:#eee;padding:12px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:6px}img{max-width:100%}.offline-nav{padding:12px;background:#e6eef6;margin-bottom:24px}';(soup.head or soup).append(style)
 nav=soup.new_tag('div',attrs={'class':'offline-nav'});nav.append(BeautifulSoup('<a href="'+posixpath.relpath('index.html',posixpath.dirname(dest))+'">Offline library</a> · <a href="'+html.escape(u)+'">Original source (online)</a> · Snapshot '+datetime.now(timezone.utc).date().isoformat(),'html.parser'));(soup.body or soup).insert(0,nav)
 p=root/dest;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(str(soup),encoding='utf-8')
manifest={'capturedAt':datetime.now(timezone.utc).isoformat(),'pages':[{'source':u,'file':d} for u,(d,_) in sorted(pages.items())],'assets':[{'source':u,'file':d} for u,(d,_,_) in blobs.items() if u not in pages],'failures':failures}
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
sections=[]
for prefix,label in [('wiki/','IKEMEN GO wiki — all pages'),('merged/','Merged MUGEN / IKEMEN reference'),('mugen/','MUGEN 1.1 reference and tutorials')]:
 links=[]
 for u,(d,soup) in sorted(pages.items(),key=lambda pair:pair[1][0]):
  if d.startswith(prefix):
   title=soup.title.get_text() if soup.title else Path(d).stem.replace('-',' ')
   links.append('<li><a href="'+urllib.parse.quote(d,safe='/.-_')+'">'+html.escape(title)+'</a></li>')
 sections.append('<h2>'+label+'</h2><ul>'+''.join(links)+'</ul>')
(root/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>IKEMaker Offline Reference Library</title><style>body{max-width:1000px;margin:30px auto;padding:20px;font:17px/1.6 system-ui}li{margin:5px 0}</style><h1>Offline Reference Library</h1><p>Complete captured documentation collections, bundled for offline reading. Snapshot '+datetime.now(timezone.utc).date().isoformat()+'. Links between included pages are local. External downloads, videos and unrelated sites still require internet. Upstream documentation may describe features newer than your engine.</p><p>Original authors and copyright notices are retained. Each page links to its original source. MUGEN documentation © Elecbyte; IKEMEN wiki © its contributors; merged reference by PotS and contributors.</p>'+''.join(sections),encoding='utf-8')
print(json.dumps({'pages':len(pages),'wikiPages':sum(d.startswith('wiki/') for d,_ in pages.values()),'assets':len(manifest['assets']),'failures':failures},indent=2))
