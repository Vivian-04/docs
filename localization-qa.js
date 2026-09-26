/**
 * Localization QA for Wraith Protocol documentation
 * 
 * Checks translated documentation pages for:
 * - Stale links
 * - Missing sections
 * - Code drift
 * - Language metadata
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname);
const MARKDOWN_EXT = ['.md', '.mdx'];

const SKIP_DIRS = new Set(['.git', '.agents', 'node_modules']);
const SKIP_FILES = new Set(['docs.json', 'CLAUDE.md', 'PR_DESCRIPTION.md']);

function parseFrontMatter(content) {
  let attrs = {};
  let body = content;

  const fmMatch = content.match(/^---[\s\S]*?^---/m);
  if (fmMatch) {
    const fmContent = content.substring(3, fmMatch[0].lastIndexOf('---')).trim();
    const attrsObj = {};
    for (const line of fmContent.split('\n')) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        let value = match[2].trim();
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value)) value = Number(value);
        attrsObj[match[1]] = value;
      }
    }
    attrs = attrsObj;

    const fmEndIndex = content.indexOf('---', 3);
    if (fmEndIndex !== -1) {
      body = content.substring(fmEndIndex + 3).trim();
    }
  }

  return { attrs, body };
}

function extractHeadings(body) {
  const headings = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
      });
    }
  }
  return headings;
}

function countCodeFences(body) {
  const lines = body.split('\n');
  let count = 0;
  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inFence = !inFence;
      count++;
    }
  }
  return count;
}

function extractLinks(body) {
  const links = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
      line: match.index,
    });
  }
  return links;
}

function classifyLink(url) {
  if (!url) return 'external';
  if (url.startsWith('/') || url.startsWith('#')) return 'internal';
  if (url.startsWith('http://') || url.startsWith('https://')) return 'external';
  return 'internal';
}

function normalizePagePath(page) {
  if (!page) return '';
  let p = page.replace(/^\/|\/$/g, '');
  return p.toLowerCase();
}

function getNavPages(navigation) {
  const pages = [];

  if (!navigation || !navigation.tabs || !Array.isArray(navigation.tabs)) return pages;

  for (const tab of navigation.tabs) {
    const groups = tab.groups;
    if (!groups || !Array.isArray(groups)) continue;

    for (const group of groups) {
      const groupPages = group.pages;
      if (groupPages && Array.isArray(groupPages)) {
        for (const page of groupPages) {
          pages.push(normalizePagePath(page));
        }
      }
      if (group.items && Array.isArray(group.items)) {
        for (const subItem of group.items) {
          const subPages = subItem.pages;
          if (subPages && Array.isArray(subPages)) {
            for (const page of subPages) {
              pages.push(normalizePagePath(page));
            }
          }
          const subGroups = subItem.groups;
          if (subGroups && Array.isArray(subGroups)) {
            for (const subGroup of subGroups) {
              const sgPages = subGroup.pages;
              if (sgPages && Array.isArray(sgPages)) {
                for (const page of sgPages) {
                  pages.push(normalizePagePath(page));
                }
              }
            }
          }
        }
      }
    }
  }

  return pages;
}

function getAllMDXFiles() {
  const files = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (MARKDOWN_EXT.some(ext => entry.name.endsWith(ext))) {
        // Skip non-doc files
        const basename = entry.name.replace(path.extname(entry.name), '');
        if (SKIP_FILES.has(basename)) continue;
        files.push(fullPath);
      }
    }
  }

  walk(DOCS_DIR);
  return files;
}

function getPageKey(filePath) {
  const rel = path.relative(DOCS_DIR, filePath);
  const withoutExt = path.extname(rel) ? rel.replace(path.extname(rel), '') : rel;
  return withoutExt.replace(/\\/g, '/');
}

function hasLocaleMetadata(attrs) {
  return attrs.locale !== undefined && attrs.locale !== null;
}

function runQA() {
  console.log('=== Wraith Protocol Localization QA ===\n');

  // 1. Read docs.json
  const docsJSONPath = path.join(DOCS_DIR, 'docs.json');
  let navigation;
  if (fs.existsSync(docsJSONPath)) {
    const jsonContent = fs.readFileSync(docsJSONPath, 'utf-8');
    const docsConfig = JSON.parse(jsonContent);
    navigation = docsConfig.navigation;
    console.log('Loaded navigation from docs.json\n');
  } else {
    console.warn('docs.json not found\n');
    navigation = null;
  }

  // Get canonical page paths from navigation
  const canonicalPages = navigation ? getNavPages(navigation) : [];
  console.log(`Canonical pages from navigation: ${canonicalPages.length}\n`);
  console.log('  ', canonicalPages.join(', '), '\n');

  // 2. Get all markdown files
  const allFiles = getAllMDXFiles();
  console.log(`Total markdown files found: ${allFiles.length}\n`);

  // 3. Parse all files
  const fileData = [];

  for (const filePath of allFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = parseFrontMatter(content);
      const pageKey = getPageKey(filePath);
      const hasLocale = hasLocaleMetadata(parsed.attrs);
      const locale = hasLocale ? parsed.attrs.locale : null;

      const headings = extractHeadings(parsed.body);
      const codeFenceCount = countCodeFences(parsed.body);
      const links = extractLinks(parsed.body);
      const classifiedLinks = links.map(l => ({
        ...l,
        type: classifyLink(l.url),
      }));

      fileData.push({
        filePath,
        pageKey,
        title: parsed.attrs.title || 'Untitled',
        description: parsed.attrs.description || '',
        locale,
        hasLocaleMetadata: hasLocale,
        headings,
        codeFenceCount,
        links: classifiedLinks,
        rawBody: parsed.body,
      });
    } catch (err) {
      console.error(`Error parsing ${filePath}:`, err.message);
    }
  }

  // Build map of page keys
  const pageMap = new Map();
  for (const fd of fileData) {
    pageMap.set(fd.pageKey, fd);
  }

  // 4. Identify source vs translated pages
  const translatedPages = new Set();
  const sourceLanguagePages = new Set();

  for (const [key, fd] of pageMap) {
    if (fd.hasLocaleMetadata) {
      translatedPages.add(key);
    } else {
      sourceLanguagePages.add(key);
    }
  }

  console.log(`Source language (English) pages: ${sourceLanguagePages.size}`);
  console.log(`Translated pages: ${translatedPages.size}\n`);

  // 5. Define supported translated pages (from navigation)
  const supportedTranslated = new Set();
  if (navigation) {
    for (const pageKey of canonicalPages) {
      if (!pageMap.has(pageKey)) {
        console.log(`  Warning: Page in navigation but not found in docs: ${pageKey}`);
      } else {
        supportedTranslated.add(pageKey);
      }
    }
  }

  console.log(`Supported pages for translation: ${supportedTranslated.size}\n`);

  // 6. Compare structure between source and translated pages
  const issues = [];

  for (const pageKey of translatedPages) {
    const fd = pageMap.get(pageKey);
    
    let sourcePageKey = pageKey;
    if (fd.locale && pageKey.endsWith(`.${fd.locale}`)) {
      sourcePageKey = pageKey.slice(0, -(fd.locale.length + 1));
    }

    const sourceFd = pageMap.get(sourcePageKey);
    
    if (!sourceFd) {
      issues.push({
        type: 'missing_source',
        page: pageKey,
        message: `Could not find source English page for translated page: ${sourcePageKey}`,
      });
      continue;
    }

    if (sourceFd) {
      // Compare headings
      const sourceHeadingTexts = sourceFd.headings.map(h => h.text);
      const translatedHeadingTexts = fd.headings.map(h => h.text);

      const missingInTranslation = sourceHeadingTexts.filter(h => !translatedHeadingTexts.includes(h));
      const extraInTranslation = translatedHeadingTexts.filter(h => !sourceHeadingTexts.includes(h));

      if (missingInTranslation.length > 0) {
        issues.push({
          type: 'heading_drift',
          page: pageKey,
          message: `Missing headings in translation: ${missingInTranslation.join(', ')}`,
          details: {
            sourceHeadings: sourceHeadingTexts,
            translatedHeadings: translatedHeadingTexts,
          },
        });
      }

      if (extraInTranslation.length > 0) {
        issues.push({
          type: 'heading_drift',
          page: pageKey,
          message: `Extra headings in translation not in source: ${extraInTranslation.join(', ')}`,
          details: {
            sourceHeadings: sourceHeadingTexts,
            translatedHeadings: translatedHeadingTexts,
          },
        });
      }

      // Compare code fence counts
      if (sourceFd.codeFenceCount !== fd.codeFenceCount) {
        issues.push({
          type: 'code_drift',
          page: pageKey,
          message: `Code fence count mismatch: source=${sourceFd.codeFenceCount}, translation=${fd.codeFenceCount}`,
          details: {
            sourceFenceCount: sourceFd.codeFenceCount,
            translatedFenceCount: fd.codeFenceCount,
          },
        });
      }

      // Compare link structure
      const sourceLinks = sourceFd.links.map(l => ({ ...l, type: classifyLink(l.url) }));
      const translatedLinks = fd.links.map(l => ({ ...l, type: classifyLink(l.url) }));

      // Links in translation not in source
      for (const translatedLink of translatedLinks) {
        const matchingSourceLink = sourceLinks.find(
          sl => sl.url === translatedLink.url && sl.text === translatedLink.text
        );

        if (!matchingSourceLink) {
          if (translatedLink.type === 'external') {
            issues.push({
              type: 'link_structural',
              page: pageKey,
              message: `Link in translation not in source: ${translatedLink.text} (${translatedLink.url})`,
              details: { type: translatedLink.type },
            });
          } else {
            issues.push({
              type: 'link_structural',
              page: pageKey,
              message: `Internal link in translation not in source: ${translatedLink.text} (${translatedLink.url})`,
              details: { type: translatedLink.type },
            });
          }
        }
      }

      // Links in source missing from translation
      for (const sourceLink of sourceLinks) {
        const hasMatching = translatedLinks.some(
          tl => tl.url === sourceLink.url && tl.text === sourceLink.text
        );
        if (!hasMatching && sourceLink.type === 'internal') {
          issues.push({
            type: 'link_missing',
            page: pageKey,
            message: `Internal link missing from translation: ${sourceLink.text} (${sourceLink.url})`,
          });
        }
      }
    }
  }

  // 7. Check locale metadata
  console.log('\n=== Locale Metadata Check ===');
  for (const [key, fd] of pageMap) {
    if (fd.hasLocaleMetadata) {
      console.log(`  ✓ ${key}: locale="${fd.locale}"`);
    } else {
      console.log(`  ✗ ${key}: missing locale metadata`);
    }
  }

// 8. Check canonical links
console.log('\n=== Canonical Links Check ===');
  for (const fd of fileData) {
    // Check for canonical link by looking for <link> tag with rel=canonical
    const hasCanonicalLink = /<link\s/i.test(fd.rawBody) &&
      (/rel=["'][^"']*canonical[^"']*["']/i.test(fd.rawBody));
    const canonicalUrlMatch = fd.rawBody.match(/href=["']([^"']+)["']/i);
    if (hasCanonicalLink) {
      if (canonicalUrlMatch) {
        console.log(`  ✓ ${fd.pageKey}: canonical URL="${canonicalUrlMatch[1]}"`);
      } else {
        console.log(`  ✓ ${fd.pageKey}: canonical link present`);
      }
    } else {
      console.log(`  ✗ ${fd.pageKey}: missing canonical link`);
    }
  }

  // 9. Report summary
  console.log('\n=== QA Summary ===');

  const byType = {};
  for (const issue of issues) {
    byType[issue.type] = (byType[issue.type] || 0) + 1;
  }

  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type}: ${count}`);
  }

  console.log(`\nTotal structural issues: ${issues.length}`);

  if (issues.length === 0) {
    console.log('✓ All checks passed! Documentation is structurally sound.');
  } else {
    console.log('\n=== Detailed Issues ===');
    for (const issue of issues) {
      console.log(`\n[${issue.type}] ${issue.page}: ${issue.message}`);
      if (issue.details) {
        console.log(`    Details: ${JSON.stringify(issue.details)}`);
      }
    }
  }

  return { issues, fileData, pageMap, translatedPages, sourceLanguagePages, supportedTranslated };
}

module.exports = { runQA, parseFrontMatter, extractHeadings, countCodeFences, extractLinks, classifyLink, hasLocaleMetadata };

// Run if executed directly
if (require.main === module) {
  const result = runQA();
  if (result.issues.length > 0) {
    process.exit(1);
  }
}