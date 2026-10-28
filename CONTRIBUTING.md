# Contributing to Astronautics Atlas

Thanks for helping map the literature of spaceflight! 🛰️

You don't need to write code to contribute. Most improvements start as an issue.

## Ways to help

| You want to… | Do this |
|---|---|
| Suggest a new field | Open a [**New field**](../../issues/new?template=new-field.yml) issue |
| Report a wrong or misclassified paper | Open a [**Bad record**](../../issues/new?template=bad-record.yml) issue, or add its ID to `scripts/blocklist.txt` in a PR |
| Propose a chart or feature | Open a [**Idea**](../../issues/new?template=idea.yml) issue |
| Fix a bug or build a feature | Send a pull request (see below) |

## Finding OpenAlex IDs

- **Paper ID** (`W…`): open the paper in the atlas, click **OpenAlex ↗**, and copy the ID from the URL.
- **Topic ID** (`T…`): search topics at `https://api.openalex.org/topics?search=your+keywords` and copy the `id`.

## Pull requests

1. Fork the repo and create a branch.
2. Make your change:
   - **Fields** are defined in `TOPICS` in [`scripts/fetch_data.py`](scripts/fetch_data.py).
   - **Excluded records** live in [`scripts/blocklist.txt`](scripts/blocklist.txt), one ID per line with a short reason.
   - **Site** code is `index.html`, `assets/css/style.css` and `assets/js/app.js`. There's no build step.
3. Test locally:
   ```bash
   python3 scripts/fetch_data.py   # regenerates data/
   python3 -m http.server 8000     # open http://localhost:8000
   ```
4. Open the PR with a short description and, for visual changes, a screenshot.

Please don't commit regenerated `data/` files in feature PRs. The weekly bot handles those.

## Ground rules

- The fetcher stays dependency-free (Python standard library only).
- Use open data sources only, with no scraping of paywalled sites.
- Be kind. Everyone here is a space nerd. 🚀
