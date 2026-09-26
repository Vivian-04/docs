# Pull Request: Add localization QA for translated documentation (#162)

## Summary

This PR adds a localization QA script to check translated documentation pages for:
- Stale links
- Missing sections
- Code drift (heading and code fence comparison)
- Language metadata and canonical links

## Changes

- **`localization-qa.js`** (new file): Standalone Node.js script that performs comprehensive localization QA on the Wraith Protocol documentation. The script:
  - Reads `docs.json` to define supported translated pages from the navigation structure
  - Parses all `.md`/`.mdx` files and extracts front matter metadata
  - Checks locale metadata presence on each page
  - Compares heading structure between source and translated versions
  - Compares code fence counts to detect code drift
  - Validates internal link structure (detects missing/extra links)
  - Checks for canonical links in page headers
  - Reports untranslated pages and structural issues

## QA Results

Running the script against the current documentation reveals:

- **24 supported pages** defined in `docs.json` navigation (excluding `CLAUDE.md` and `PR_DESCRIPTION.md`)
- **0 translated pages** - all pages missing `locale` front matter metadata
- **24 untranslated pages** detected, all requiring locale metadata
- **All 26 pages** missing canonical links

The QA script identifies structural issues that need to be addressed when adding translations for the documentation.

## Checklist

- [x] Define supported translated pages from `docs.json` navigation
- [x] Compare headings between source and translated pages
- [x] Compare code fence counts for code drift detection
- [x] Compare internal/external link structure
- [x] Check locale metadata presence
- [x] Check canonical links
- [x] Report untranslated/stale sections

## Type

`feat` - Adds new localization QA functionality for documentation

## Testing

The script executes successfully with Node.js built-in modules only (no npm dependencies required). It reports all QA checks and produces detailed output for each issue type found.