#!/usr/bin/env python3
"""Generate RSS from the publication register; fail on articles omitted during publication."""
import argparse,datetime,email.utils,html,json,re,sys,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://www.oecuhobog.org'

def build():
    records=json.loads((ROOT/'blog/publications.json').read_text())
    pages={p.parent.name for p in (ROOT/'blog').glob('*/index.html')}
    slugs={r['slug'] for r in records}
    if len(slugs)!=len(records) or pages!=slugs:
        raise ValueError('Publication register differs from article pages: '+repr(sorted(pages^slugs)))
    for row in records:
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]*',row['slug']):raise ValueError('Invalid slug')
        if not row.get('legacy') and (not row.get('published_at') or not row.get('title') or not row.get('excerpt')):raise ValueError('New articles require publication time/title/excerpt')
    items=sorted([r for r in records if r.get('published_at')],key=lambda r:datetime.datetime.fromisoformat(r['published_at']),reverse=True)[:20]
    ET.register_namespace('atom','http://www.w3.org/2005/Atom')
    root=ET.Element('rss',version='2.0');ch=ET.SubElement(root,'channel')
    for tag,value in [('title','大阪電気通信大学高等学校同窓会'),('description','大阪電気通信大学高等学校の同窓会ページです。電通高校の様子や同窓会の活動の様子をまとめています。'),('link',ORIGIN+'/'),('language','ja'),('lastBuildDate',email.utils.format_datetime(datetime.datetime.fromisoformat(items[0]['published_at'])))]:ET.SubElement(ch,tag).text=value
    ET.SubElement(ch,'{http://www.w3.org/2005/Atom}link',href=ORIGIN+'/blog/feed.xml',rel='self',type='application/rss+xml')
    for r in items:
        item=ET.SubElement(ch,'item');url=ORIGIN+'/blog/'+r['slug']+'/'
        for tag,value in [('title',r['title']),('pubDate',email.utils.format_datetime(datetime.datetime.fromisoformat(r['published_at']))),('link',url),('guid',url),('description',r['excerpt'])]:ET.SubElement(item,tag).text=value
    ET.indent(root,space='  ')
    return ET.tostring(root,encoding='utf-8',xml_declaration=True)+b'\n'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    try:expected=build()
    except (ValueError,KeyError) as e:print(str(e),file=sys.stderr);return 1
    p=ROOT/'blog/feed.xml'
    if args.check:
        if p.read_bytes()!=expected:print('RSS is stale; run python3 scripts/build_feed.py',file=sys.stderr);return 1
        print('Publication register and RSS are consistent.');return 0
    p.write_bytes(expected);print('RSS updated.');return 0
if __name__=='__main__':sys.exit(main())
