from pathlib import Path
from bs4 import BeautifulSoup
import json,urllib.parse,posixpath
r=Path(__file__).resolve().parents[1]/'data/offline-docs/reference'
m=json.loads((r/'manifest.json').read_text()); aliases={}
for item in m['pages']:
 if item['file'].startswith('wiki/'):
  stem=Path(item['file']).stem.lower();aliases['https://potsmugen.github.io/ikemen-merged-docs/'+stem]=item['file']
aliases.update({'https://potsmugen.github.io/ikemen-merged-docs/state-controllers':'merged/sctrl.html','https://potsmugen.github.io/ikemen-merged-docs/triggers':'merged/triggers.html','https://www.elecbyte.com/mugendocs-11b1/docs/loopguide.html':'mugen/loopguide.html','https://www.elecbyte.com/mugendocs-11b1/exp.html':'mugen/cns.html#expressions','https://www.elecbyte.com/mugendocs-11b1/overview.html':'mugen/mugen.html'})
fixed=0
for p in r.rglob('*.html'):
 soup=BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser')
 for a in soup.find_all('a',href=True):
  u,frag=urllib.parse.urldefrag(a['href']);key=urllib.parse.unquote(u).rstrip('/').lower()
  if key in aliases:
   target=aliases[key];dest,defaultfrag=urllib.parse.urldefrag(target)
   a['href']=urllib.parse.quote(posixpath.relpath(dest,p.relative_to(r).parent.as_posix()),safe='/.-_')+('#'+(frag or defaultfrag) if frag or defaultfrag else '');fixed+=1
 if p.name=='index.html':
  seen=set()
  for li in list(soup.find_all('li')):
   a=li.find('a');h=a.get('href') if a else None
   if h in seen:li.decompose()
   else:seen.add(h)
 p.write_text(str(soup),encoding='utf-8')
unique={}
for item in m['pages']:unique.setdefault(item['file'],item)
m['pages']=list(unique.values());m['upstreamLinkRepairs']=[{**x,'localReplacement':aliases[urllib.parse.unquote(x['url']).rstrip('/').lower()]} for x in m['failures'] if urllib.parse.unquote(x['url']).rstrip('/').lower() in aliases]
m['failures']=[x for x in m['failures'] if urllib.parse.unquote(x['url']).rstrip('/').lower() not in aliases]
(r/'manifest.json').write_text(json.dumps(m,indent=2)+'\n',encoding='utf-8')
missing=[];links=0
for p in r.rglob('*.html'):
 soup=BeautifulSoup(p.read_text(encoding='utf-8'),'html.parser')
 for a in soup.find_all(['a','img','link']):
  v=a.get('href') or a.get('src') or '';u=urllib.parse.urlparse(v)
  if not v or u.scheme or not u.path:continue
  links+=1;target=(p.parent/urllib.parse.unquote(u.path)).resolve()
  if not target.exists():missing.append({'page':p.relative_to(r).as_posix(),'target':v})
report={'referencePages':len(m['pages']),'wikiPages':17,'localLinksChecked':links,'missingLocalTargets':missing,'unavailableSources':m['failures'],'repairedLinks':fixed}
(r/'link-check.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,indent=2));assert not missing
