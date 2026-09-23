import re,sys
s=open('/home/user/terryWMS/index.html',encoding='utf-8').read()
vid=sys.argv[1]
i=s.index('id="view-%s"'%vid); j=s.find('id="view-',i+10); v=s[i:j if j>0 else i+60000]
for m in re.finditer(r'<(input|select|textarea|button)[^>]*>', v):
    t=m.group(0); idm=re.search(r'id="([^"]+)"',t); oc=re.search(r'on(click|change|keydown|input|keypress)="([^"]+)"',t); txt=''
    if m.group(1)=='button':
        e=v.find('</button>',m.end()); txt=re.sub(r'<[^>]+>','',v[m.end():e]).strip()[:24]
    ph=re.search(r'placeholder="([^"]+)"',t)
    if idm or oc: print(m.group(1), idm.group(1) if idm else '-', (oc.group(2)[:60] if oc else ''), txt, (ph.group(1)[:20] if ph else ''))
