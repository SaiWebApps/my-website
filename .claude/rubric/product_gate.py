#!/usr/bin/env python3
"""Structural product-route and discoverability gate for the built artifact. No regular expressions."""
import json
import os
import sys
from html.parser import HTMLParser
from urllib.parse import urlsplit
from xml.etree import ElementTree

RUBRIC = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(RUBRIC))


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.meta = {}
        self.canonicals = []
        self.json_ld = []
        self.in_json_ld = False
        self.json_parts = []
        self.in_title = False
        self.title_parts = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == 'a' and attributes.get('href'):
            self.links.append(attributes['href'])
        if tag == 'meta':
            key = attributes.get('property') or attributes.get('name')
            if key and attributes.get('content') is not None:
                self.meta.setdefault(key, []).append(attributes['content'])
        if tag == 'link' and 'canonical' in (attributes.get('rel') or '').split() and attributes.get('href'):
            self.canonicals.append(attributes['href'])
        if tag == 'script' and attributes.get('type') == 'application/ld+json':
            self.in_json_ld = True
            self.json_parts = []
        if tag == 'title':
            self.in_title = True

    def handle_endtag(self, tag):
        if tag == 'script' and self.in_json_ld:
            self.json_ld.append(''.join(self.json_parts))
            self.in_json_ld = False
            self.json_parts = []
        if tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_json_ld:
            self.json_parts.append(data)
        if self.in_title:
            self.title_parts.append(data)


def failure(check, page, where, message):
    return {'check': check, 'page': page, 'where': where, 'msg': message, 'src': 'product'}


def href_path(href, origin):
    split = urlsplit(href)
    if split.scheme and split.netloc and href.startswith(origin):
        return split.path or '/'
    if split.scheme or split.netloc:
        return ''
    path = split.path
    if not path:
        return ''
    if path.startswith('/'):
        return path
    return '/' + path


def has_destination(links, destination, origin):
    wanted = destination['path']
    file_path = '/' + destination['file']
    paths = {href_path(href, origin) for href in links}
    return wanted in paths or file_path in paths


def schema_types(value):
    if isinstance(value, str):
        return {value}
    if isinstance(value, list):
        return {item for item in value if isinstance(item, str)}
    return set()


def failures(candidate):
    out = []
    try:
        authority = json.load(open(os.path.join(RUBRIC, 'authority.json')))
    except (OSError, json.JSONDecodeError) as error:
        return [failure('P5', '-', 'authority.json', f'route authority cannot be read: {error}')]
    public = authority.get('publicSite') or {}
    origin = public.get('origin', '').rstrip('/')
    routes = public.get('routes') or []
    destinations = [route for route in routes if route.get('id') in (public.get('oneClickDestinations') or [])]
    page_routes = [route for route in routes if route.get('file', '').endswith('.html')]
    image = origin + public.get('image', '')

    for route in page_routes:
        page_id = route.get('id')
        path = os.path.join(candidate, route.get('file', ''))
        if not os.path.isfile(path):
            out.append(failure('F26', page_id, 'route', f'expected route file is missing: {route.get("file")}'))
            continue
        parser = PageParser()
        parser.feed(open(path).read())
        canonical = origin + route.get('path', '')
        if parser.canonicals != [canonical]:
            out.append(failure('F26', page_id, 'canonical', f'canonical must be exactly {canonical}'))
        title = ' '.join(''.join(parser.title_parts).split())
        descriptions = parser.meta.get('description') or []
        description = descriptions[0] if len(descriptions) == 1 else ''
        expected_meta = {
            'og:type': 'website',
            'og:title': title,
            'og:description': description,
            'og:url': canonical,
            'og:image': image,
            'twitter:card': 'summary',
            'twitter:title': title,
            'twitter:description': description,
            'twitter:image': image,
        }
        for key, expected in expected_meta.items():
            if parser.meta.get(key) != [expected]:
                out.append(failure('F26', page_id, key, f'{key} must be exactly {expected}'))
        if not title:
            out.append(failure('F26', page_id, 'title', 'document title must be present exactly once'))
        if not description:
            out.append(failure('F26', page_id, 'description', 'description must be present exactly once'))
        for destination in destinations:
            if not has_destination(parser.links, destination, origin):
                out.append(failure('E22', page_id, 'one-click destinations', f'{destination.get("id")} is not a direct link on this route'))

        graphs = []
        for source in parser.json_ld:
            try:
                value = json.loads(source)
            except json.JSONDecodeError as error:
                out.append(failure('F26', page_id, 'JSON-LD', f'JSON-LD is invalid: {error}'))
                continue
            if isinstance(value, dict):
                graph = value.get('@graph')
                graphs.extend(graph if isinstance(graph, list) else [value])
        found_types = set()
        for item in graphs:
            if isinstance(item, dict):
                found_types.update(schema_types(item.get('@type')))
        for required_type in ('Person', 'WebSite', 'WebPage'):
            if required_type not in found_types:
                out.append(failure('F26', page_id, 'JSON-LD', f'{required_type} schema is missing'))
        web_pages = [item for item in graphs if isinstance(item, dict) and 'WebPage' in schema_types(item.get('@type'))]
        people = [item for item in graphs if isinstance(item, dict) and 'Person' in schema_types(item.get('@type'))]
        websites = [item for item in graphs if isinstance(item, dict) and 'WebSite' in schema_types(item.get('@type'))]
        if len(people) != 1 or people[0].get('name') != 'Sairam Krishnan' or people[0].get('url') != origin + '/':
            out.append(failure('F26', page_id, 'JSON-LD', 'Person schema is not bound to Sairam Krishnan and the site origin'))
        if len(websites) != 1 or websites[0].get('url') != origin + '/':
            out.append(failure('F26', page_id, 'JSON-LD', 'WebSite schema is not bound to the site origin'))
        if (len(web_pages) != 1 or web_pages[0].get('url') != canonical or web_pages[0].get('name') != title
                or web_pages[0].get('description') != description):
            out.append(failure('F26', page_id, 'JSON-LD', 'WebPage schema is not bound to the canonical title, description, and URL'))

    machine_files = public.get('machineFiles') or []
    for name in machine_files:
        path = os.path.join(candidate, name)
        if not os.path.isfile(path) or os.path.getsize(path) == 0:
            out.append(failure('F26', '-', name, 'required machine-readable discovery file is missing or empty'))

    expected_urls = {origin + route.get('path', '') for route in routes}
    pages_path = os.path.join(candidate, 'sitemap-pages.xml')
    index_path = os.path.join(candidate, 'sitemap-index.xml')
    try:
        pages_tree = ElementTree.parse(pages_path)
        locations = {node.text for node in pages_tree.iter() if node.tag.endswith('loc') and node.text}
        if locations != expected_urls:
            out.append(failure('F26', '-', 'sitemap-pages.xml', 'page sitemap does not exactly match the governed public routes'))
    except (OSError, ElementTree.ParseError) as error:
        out.append(failure('F26', '-', 'sitemap-pages.xml', f'page sitemap cannot be parsed: {error}'))
    try:
        index_tree = ElementTree.parse(index_path)
        locations = {node.text for node in index_tree.iter() if node.tag.endswith('loc') and node.text}
        if locations != {origin + '/sitemap-pages.xml'}:
            out.append(failure('F26', '-', 'sitemap-index.xml', 'sitemap index does not point only to the governed page sitemap'))
    except (OSError, ElementTree.ParseError) as error:
        out.append(failure('F26', '-', 'sitemap-index.xml', f'sitemap index cannot be parsed: {error}'))

    llms_path = os.path.join(candidate, 'llms.txt')
    try:
        llms = open(llms_path).read()
        for destination in destinations:
            if origin + destination.get('path', '') not in llms:
                out.append(failure('E22', '-', 'llms.txt', f'llms.txt omits the {destination.get("id")} destination'))
    except OSError:
        pass

    try:
        vercel = json.load(open(os.path.join(ROOT, 'vercel.json')))
        if vercel.get('buildCommand') != 'python3 .claude/rubric/score.py --deploy-build':
            out.append(failure('P6', '-', 'vercel.json', 'Vercel must rebuild only through score.py --deploy-build'))
        if vercel.get('outputDirectory') != 'dist':
            out.append(failure('P5', '-', 'vercel.json', 'Vercel output must be the hash-locked dist artifact'))
        package = json.load(open(os.path.join(ROOT, 'package.json')))
        if (package.get('scripts') or {}).get('deploy:build') != 'python3 .claude/rubric/score.py --deploy-build':
            out.append(failure('P6', '-', 'package.json', 'deploy:build must use the sole score.py orchestrator'))
        available = {route.get('path') for route in routes}
        available.update('/' + name for name in machine_files)
        route_by_path = {route.get('path'): route for route in page_routes}
        for redirect in vercel.get('redirects') or []:
            destination = urlsplit(redirect.get('destination', ''))
            path = destination.path or '/'
            if path not in available:
                out.append(failure('E22', '-', 'vercel.json', f'redirect target does not exist: {redirect.get("destination")}'))
                continue
            if destination.fragment:
                route = route_by_path.get(path)
                target = os.path.join(candidate, route.get('file')) if route else ''
                source = open(target).read()
                if f'id="{destination.fragment}"' not in source:
                    out.append(failure('E22', route.get('id') if route else '-', 'vercel.json', f'redirect fragment does not exist: {redirect.get("destination")}'))
    except (OSError, json.JSONDecodeError) as error:
        out.append(failure('E22', '-', 'vercel.json', f'deployment routes cannot be validated: {error}'))

    return out


def main(argv):
    candidate = argv[0] if argv else os.path.join(RUBRIC, 'out', 'candidate')
    out = failures(candidate)
    for item in out:
        print(f"FAIL {item['check']} {item['page']} {item['where']}: {item['msg']}")
    if not out:
        print('product: routes, one-click destinations, SEO metadata, JSON-LD, llms.txt, and sitemaps verified')
    return 1 if out else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
