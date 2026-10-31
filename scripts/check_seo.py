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
BASE = 'https://www.getpraxora.com'
LEGACY_HOST = 'dental-followup-landing-page.vercel.app'

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
    pages = {
        p: Page(p)
        for p in ROOT.rglob('*.html')
        if not p.name.startswith('google')
        and '.git' not in p.parts
        and not any(part.startswith('_') for part in p.relative_to(ROOT).parts)
    }
    titles = []
    descriptions = []
    canonicals = []
    links = 0
    articles = 0
    for path, page in pages.items():
        label = str(path.relative_to(ROOT))
        assert LEGACY_HOST not in page.raw, (label, 'legacy production domain')
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
        for name in ['og:image', 'twitter:image']:
            image = page.meta(name)[0]
            assert image.startswith(BASE + '/') and local_file(image).is_file(), (label, name)
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
            if tag == 'img':
                assert 'alt' in attrs, (label, 'image missing alt')
                if 'workflow.svg' in attrs.get('src', ''):
                    assert attrs['alt'].strip() and attrs.get('width') and attrs.get('height'), (label, 'workflow image metadata')
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
    urls = [el.text for el in sitemap.findall('./{*}url/{*}loc')]
    for entry in sitemap.findall('./{*}url'):
        page_url = entry.find('{*}loc').text
        for image in entry.findall('{http://www.google.com/schemas/sitemap-image/1.1}image'):
            image_url = image.find('{http://www.google.com/schemas/sitemap-image/1.1}loc').text
            assert image_url.startswith(BASE + '/') and local_file(image_url).is_file(), ('image sitemap target', image_url)
            page = pages[local_file(page_url)]
            sources = [urljoin(page_url, a.get('src', '')) for t, a in page.tags if t == 'img']
            assert image_url in sources, ('sitemap image must appear on its page', page_url, image_url)
    indexable = {p.canonical for p in pages.values() if not any('noindex' in v for v in p.meta('robots'))}
    kit_url = BASE + '/follow-up-recovery-kit/'
    assert kit_url not in indexable
    assert len(urls) == len(set(urls)) and set(urls) == indexable | {kit_url}, 'sitemap/indexable page mismatch'
    kit = pages[ROOT / 'follow-up-recovery-kit/index.html']
    assert kit.meta('robots') == ['noindex, follow'], 'preserve recovery kit funnel policy'
    assert BASE + '/sitemap.xml' in (ROOT / 'robots.txt').read_text(encoding='utf-8-sig')
    assert (ROOT / 'googlea050d084b5f189f3.html').read_text(encoding='utf-8-sig').strip() == 'google-site-verification: googlea050d084b5f189f3.html'
    config = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8-sig'))
    # _config.yml would otherwise make Vercel build the GitHub Pages redirect site.
    assert config.get('framework') is None, 'Vercel must stay a static deploy'
    redirects = config['redirects']
    alias_pairs = [
        ('/missed-calls', '/missed-calls.html'),
        ('/missed-calls/', '/missed-calls.html'),
        ('/workflow-unscheduled-treatment', '/workflow-unscheduled-treatment.html'),
        ('/workflow-unscheduled-treatment/', '/workflow-unscheduled-treatment.html'),
        ('/workflow-recall-leakage', '/workflow-recall-leakage.html'),
        ('/workflow-recall-leakage/', '/workflow-recall-leakage.html'),
        ('/workflow-missed-implant-consult', '/workflow-missed-implant-consult.html'),
        ('/workflow-missed-implant-consult/', '/workflow-missed-implant-consult.html'),
        ('/free-missed-revenue-audit', '/free-missed-revenue-audit.html'),
        ('/free-missed-revenue-audit/', '/free-missed-revenue-audit.html'),
        ('/index.html', '/'),
    ]
    production_hosts = [LEGACY_HOST, 'getpraxora.com', 'www.getpraxora.com']

    def host_rule(host, source, destination):
        return {
            'source': source,
            'has': [{'type': 'host', 'value': host}],
            'destination': destination,
            'permanent': True,
        }

    expected = []
    for host in production_hosts:
        for source, path in alias_pairs:
            expected.append(host_rule(host, source, BASE + path))
    expected.append(host_rule(LEGACY_HOST, '/:path*', BASE + '/:path*'))
    expected.append(host_rule('getpraxora.com', '/:path*', BASE + '/:path*'))
    expected.append({'source': '/index.html', 'destination': '/', 'permanent': True})
    expected.append({'source': '/:path*/index.html', 'destination': '/:path*/', 'permanent': True})
    assert redirects == expected, 'redirect list drifted'
    for rule in redirects:
        assert rule['permanent'] is True
        assert LEGACY_HOST not in rule['destination']
    # Host catch-alls stay behind the explicit aliases and do not match preview hosts
    # or send www back to itself.
    for host in [LEGACY_HOST, 'getpraxora.com']:
        catch_alls = [
            i for i, rule in enumerate(redirects)
            if rule.get('source') == '/:path*' and rule.get('has') == [{'type': 'host', 'value': host}]
        ]
        assert catch_alls == [len(alias_pairs) * len(production_hosts) + (0 if host == LEGACY_HOST else 1)]
    assert not any(
        rule.get('source') == '/:path*' and rule.get('has') == [{'type': 'host', 'value': 'www.getpraxora.com'}]
        for rule in redirects
    )
    pages_config = (ROOT / '_config.yml').read_text(encoding='utf-8-sig')
    assert 'theme: null' in pages_config and 'enabled: false' in pages_config
    assert not (ROOT / '.nojekyll').exists(), 'GitHub Pages must build the Jekyll redirects'
    published = {}
    for path in (ROOT / '_canonical_redirects').glob('*.md'):
        meta = {}
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            if line.startswith('permalink:'):
                meta['permalink'] = line.split(':', 1)[1].strip().strip('"').strip("'")
            elif line.startswith('target:'):
                meta['target'] = line.split(':', 1)[1].strip()
        published[meta['permalink']] = meta['target']
    for path, page in pages.items():
        rel = path.relative_to(ROOT).as_posix()
        if rel == 'index.html':
            permalink = '/'
        elif rel.endswith('/index.html'):
            permalink = '/' + rel[:-len('index.html')]
        else:
            permalink = '/' + rel
        assert published.get(permalink) == page.canonical, (permalink, published.get(permalink), page.canonical)
    for stem in [
        'missed-calls',
        'workflow-unscheduled-treatment',
        'workflow-recall-leakage',
        'workflow-missed-implant-consult',
        'free-missed-revenue-audit',
    ]:
        assert published.get('/' + stem + '/') == BASE + '/' + stem + '.html'
    for folder in ['api', 'assets']:
        for path in (ROOT / folder).rglob('*'):
            if path.is_file() and path.suffix in ('.js', '.svg'):
                assert LEGACY_HOST not in path.read_text(encoding='utf-8-sig'), str(path)
    css = (ROOT / 'styles.css').read_text(encoding='utf-8-sig')
    assert re.search(r'\.reveal\s*\{\s*opacity:\s*1;', css), 'content must be visible without JS'
    print(f'PASS: {len(pages)} pages, {articles} article/breadcrumb graphs, {len(urls)} sitemap URLs, {links} internal links; metadata, anchors and assets valid.')

if __name__ == '__main__':
    main()
