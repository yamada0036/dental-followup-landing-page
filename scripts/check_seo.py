"""Validate static SEO metadata, crawl paths, assets and JSON-LD without dependencies.
Run from any directory: python3 scripts/check_seo.py
"""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, unquote
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://dental-followup-landing-page.vercel.app'

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path = path
        self.raw = path.read_text(encoding='utf-8-sig')
        self.tags = []
        self.feed(self.raw)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def values(self, tag, attribute, value, target):
        return [a.get(target, '') for t, a in self.tags if t == tag and a.get(attribute) == value]

    def meta(self, name):
        return self.values('meta', 'name', name, 'content') or self.values('meta', 'property', name, 'content')

    @property
    def canonical(self):
        return self.values('link', 'rel', 'canonical', 'href')[0]


def local_file(url):
    path = ROOT / unquote(urlsplit(url).path).lstrip('/')
    return path / 'index.html' if path.is_dir() else path


def main():
    pages = {p: Page(p) for p in ROOT.rglob('*.html') if not p.name.startswith('google') and '.git' not in p.parts}
    titles = []
    descriptions = []
    canonicals = []
    links = 0
    articles = 0
    for path, page in pages.items():
        label = str(path.relative_to(ROOT))
        assert len(page.values('link', 'rel', 'canonical', 'href')) == 1, label
        canonical = page.canonical
        assert canonical.startswith(BASE + '/') and local_file(canonical) == path, label
        canonicals.append(canonical)
        assert sum(t == 'h1' for t, _ in page.tags) == 1, label
        assert any(t == 'html' and a.get('lang') == 'en' for t, a in page.tags), label
        title = re.findall(r'<title>(.*?)</title>', page.raw, re.S)
        assert len(title) == 1 and title[0].strip(), label
        titles.append(title[0])
        for name in ['description', 'og:title', 'og:description', 'og:url', 'og:image', 'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']:
            assert len(page.meta(name)) == 1 and page.meta(name)[0], (label, name)
        descriptions.append(page.meta('description')[0])
        assert page.meta('og:url') == [canonical], label
        ids = [a['id'] for _, a in page.tags if 'id' in a]
        assert len(ids) == len(set(ids)), (label, 'duplicate IDs')
        schemas = re.findall(r'<script type="application/ld\+json">(.*?)</script>', page.raw, re.S)
        assert len(schemas) == 1, label
        schema = json.loads(schemas[0])
        assert schema['@context'] == 'https://schema.org', label
        graph = schema['@graph']
        webpage = next(n for n in graph if n['@type'] in ('WebPage', 'CollectionPage'))
        assert webpage['url'] == canonical, label
        if page.meta('og:type') == ['article']:
            articles += 1
            article = next(n for n in graph if n['@type'] == 'Article')
            assert article['mainEntityOfPage']['@id'] == canonical + '#webpage', label
            crumbs = next(n for n in graph if n['@type'] == 'BreadcrumbList')['itemListElement']
            assert [n['position'] for n in crumbs] == [1, 2, 3], label
            assert crumbs[-1]['item'] == canonical, label
            assert page.values('nav', 'aria-label', 'Breadcrumb', 'class') == ['breadcrumbs'], label
        for tag, attrs in page.tags:
            key = 'href' if tag in ('a', 'link') else 'src' if tag in ('img', 'script') else None
            if not key or key not in attrs:
                continue
            url = urlsplit(urljoin(canonical, attrs[key]))
            if url.netloc != urlsplit(BASE).netloc:
                continue
            dest = local_file(url.geturl())
            assert dest.is_file(), (label, attrs[key], 'missing local target')
            if tag == 'a':
                links += 1
                assert '/index.html' not in url.path, (label, 'noncanonical home link')
                if url.fragment and dest in pages:
                    target_ids = [a.get('id') for _, a in pages[dest].tags]
                    assert unquote(url.fragment) in target_ids, (label, attrs[key], 'missing anchor')
    for label, values in [('titles', titles), ('descriptions', descriptions), ('canonicals', canonicals)]:
        assert not [v for v, n in Counter(values).items() if n > 1], ('duplicates', label)
    sitemap = ET.parse(ROOT / 'sitemap.xml')
    urls = [el.text for el in sitemap.findall('.//{*}loc')]
    indexable = {p.canonical for p in pages.values() if not any('noindex' in v for v in p.meta('robots'))}
    assert len(urls) == len(set(urls)) and set(urls) == indexable, 'sitemap/indexable page mismatch'
    kit = pages[ROOT / 'follow-up-recovery-kit/index.html']
    assert kit.meta('robots') == ['noindex, follow'], 'preserve recovery kit funnel policy'
    assert BASE + '/sitemap.xml' in (ROOT / 'robots.txt').read_text(encoding='utf-8-sig')
    assert (ROOT / 'googlea050d084b5f189f3.html').read_text().strip() == 'google-site-verification: googlea050d084b5f189f3.html'
    config = json.loads((ROOT / 'vercel.json').read_text())
    assert config['redirects'] == [{'source': '/index.html', 'destination': '/', 'permanent': True}]
    css = (ROOT / 'styles.css').read_text()
    assert re.search(r'\.reveal\s*\{\s*opacity:\s*1;', css), 'content must be visible without JS'
    print(f'PASS: {len(pages)} pages, {articles} article/breadcrumb graphs, {len(urls)} sitemap URLs, {links} internal links; metadata, anchors and assets valid.')

if __name__ == '__main__':
    main()
