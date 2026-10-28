#!/usr/bin/env python3
"""Build the Astronautics Atlas dataset from OpenAlex (+ Semantic Scholar).

Writes:
  data/dataset.json  - everything the site renders
  data/history.json  - weekly snapshots used for growth charts

Standard library only, so the GitHub Action needs no pip install.
Set OPENALEX_API_KEY (optional) for a dedicated OpenAlex budget.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OPENALEX = "https://api.openalex.org"
S2_BATCH = "https://api.semanticscholar.org/graph/v1/paper/batch"
USER_AGENT = "astronautics-atlas (+https://github.com/pars519-Tur/astronautics-atlas)"

# OpenAlex topics that make up "astronautics". Key = short slug used by the site.
TOPICS = {
    "astrodynamics": {"id": "T11082", "label": "Astrodynamics & GNC", "color": "#5b8cff"},
    "spacecraft": {"id": "T12449", "label": "Spacecraft & SmallSats", "color": "#33d1c6"},
    "propulsion": {"id": "T12513", "label": "Rocket Propulsion", "color": "#ff7a45"},
    "debris": {"id": "T11701", "label": "Space Debris & Robotics", "color": "#c77dff"},
    "satcom": {"id": "T12042", "label": "Satellite Communications", "color": "#ffd166"},
    "cryogenics": {"id": "T13200", "label": "Cryogenics & Propellants", "color": "#7fdbff"},
    "humanspace": {"id": "T14214", "label": "Human Spaceflight", "color": "#ff5d8f"},
    "lifesci": {"id": "T12005", "label": "Space Life Sciences", "color": "#8ce99a"},
}
TOPIC_BY_ID = {v["id"]: k for k, v in TOPICS.items()}

BASE_FILTER = "type:article|review|book|book-chapter,is_retracted:false"
WORK_FIELDS = ",".join([
    "id", "doi", "title", "publication_year", "cited_by_count", "counts_by_year",
    "primary_location", "authorships", "primary_topic", "open_access", "type", "fwci",
])

# Records OpenAlex mis-attributes (journal-name stubs, misclassified classics).
BLOCKLIST_FILE = Path(__file__).with_name("blocklist.txt")


def topic_filter(keys=None) -> str:
    ids = [TOPICS[k]["id"] for k in (keys or TOPICS)]
    return f"primary_topic.id:{'|'.join(ids)},{BASE_FILTER}"


def http_json(url: str, data: bytes | None = None, retries: int = 5) -> dict:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < retries - 1:
                wait = 2 ** attempt * 3
                print(f"  HTTP {e.code}, retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
                continue
            raise
        except urllib.error.URLError:
            if attempt < retries - 1:
                time.sleep(2 ** attempt * 3)
                continue
            raise
    raise RuntimeError("unreachable")


def openalex(path: str, **params) -> dict:
    key = os.environ.get("OPENALEX_API_KEY")
    if key:
        params["api_key"] = key
    url = f"{OPENALEX}/{path}?{urllib.parse.urlencode(params, safe=':|,')}"
    out = http_json(url)
    time.sleep(0.15)
    return out


def top_works(filt: str, n: int) -> list[dict]:
    works: list[dict] = []
    page = 1
    while len(works) < n:
        res = openalex("works", filter=filt, sort="cited_by_count:desc",
                       per_page=min(100, n), page=page, select=WORK_FIELDS)
        works += res["results"]
        if len(res["results"]) < min(100, n):
            break
        page += 1
    return works[:n]


def group(filt: str, field: str) -> list[dict]:
    res = openalex("works", filter=filt, group_by=field)
    return [{"key": g["key"].rsplit("/", 1)[-1], "name": g["key_display_name"], "count": g["count"]}
            for g in res["group_by"]]


def count(filt: str) -> int:
    return openalex("works", filter=filt, per_page=1, select="id")["meta"]["count"]


def load_blocklist() -> set[str]:
    if not BLOCKLIST_FILE.exists():
        return set()
    return {line.split("#")[0].strip() for line in BLOCKLIST_FILE.read_text().splitlines()
            if line.split("#")[0].strip()}


def slim(w: dict, year_now: int) -> dict:
    loc = w.get("primary_location") or {}
    src = loc.get("source") or {}
    authors = [a["author"]["display_name"] for a in w.get("authorships", []) if a.get("author")]
    countries = sorted({c for a in w.get("authorships", []) for c in (a.get("countries") or [])})
    institutions = []
    for a in w.get("authorships", []):
        for inst in a.get("institutions") or []:
            name = inst.get("display_name")
            if name and name not in institutions:
                institutions.append(name)
    cby = {c["year"]: c["cited_by_count"] for c in w.get("counts_by_year", [])}
    recent = cby.get(year_now, 0) + cby.get(year_now - 1, 0)
    age = max(1, year_now - (w.get("publication_year") or year_now) + 1)
    topic_id = ((w.get("primary_topic") or {}).get("id") or "").rsplit("/", 1)[-1]
    oa = w.get("open_access") or {}
    return {
        "id": w["id"].rsplit("/", 1)[-1],
        "doi": (w.get("doi") or "").replace("https://doi.org/", "") or None,
        "title": w.get("title") or "Untitled",
        "year": w.get("publication_year"),
        "type": w.get("type"),
        "citations": w.get("cited_by_count", 0),
        "recent": recent,
        "velocity": round(w.get("cited_by_count", 0) / age, 1),
        "fwci": round(w["fwci"], 2) if w.get("fwci") is not None else None,
        "byYear": {str(y): c for y, c in sorted(cby.items())},
        "authors": authors[:6],
        "authorCount": len(authors),
        "institutions": institutions[:4],
        "countries": countries,
        "venue": src.get("display_name"),
        "topic": TOPIC_BY_ID.get(topic_id),
        "oa": oa.get("oa_status"),
        "oaUrl": oa.get("oa_url"),
    }


def clean(works: list[dict], blocklist: set[str], year_now: int) -> list[dict]:
    out, seen_titles = [], set()
    for w in works:
        wid = w["id"].rsplit("/", 1)[-1]
        title = (w.get("title") or "").strip()
        if wid in blocklist or not w.get("authorships") or len(title.split()) < 3:
            continue
        norm = "".join(ch for ch in title.lower() if ch.isalnum())
        if norm in seen_titles:  # duplicate editions of the same book/paper
            continue
        seen_titles.add(norm)
        out.append(slim(w, year_now))
    return out


def diversify(papers: list[dict], per_topic: int) -> list[dict]:
    """Keep rank order but cap each field's share of the head of the list."""
    head, tail, seen = [], [], {}
    for p in papers:
        seen[p["topic"]] = seen.get(p["topic"], 0) + 1
        (head if seen[p["topic"]] <= per_topic else tail).append(p)
    return head + tail


def enrich_s2(papers: list[dict]) -> None:
    """Add Semantic Scholar influential-citation counts (best effort)."""
    with_doi = [p for p in papers if p["doi"]]
    for i in range(0, len(with_doi), 400):
        chunk = with_doi[i:i + 400]
        body = json.dumps({"ids": [f"DOI:{p['doi']}" for p in chunk]}).encode()
        url = f"{S2_BATCH}?fields=influentialCitationCount,url"
        try:
            res = http_json(url, data=body, retries=4)
        except Exception as e:  # noqa: BLE001 - enrichment is optional
            print(f"  Semantic Scholar skipped: {e}", file=sys.stderr)
            return
        for p, r in zip(chunk, res):
            if r:
                p["influential"] = r.get("influentialCitationCount")
                p["s2Url"] = r.get("url")
        time.sleep(1.5)


def update_history(dataset: dict) -> dict:
    path = DATA / "history.json"
    history = json.loads(path.read_text()) if path.exists() else {"snapshots": []}
    today = dataset["generatedAt"][:10]
    snap = {
        "date": today,
        "totalWorks": dataset["totals"]["works"],
        "topics": {k: v["works"] for k, v in dataset["topics"].items()},
        "papers": {p["id"]: p["citations"] for p in dataset["hallOfFame"][:50] + dataset["rising"][:50]},
    }
    history["snapshots"] = [s for s in history["snapshots"] if s["date"] != today] + [snap]
    history["snapshots"] = history["snapshots"][-156:]  # ~3 years of weekly runs
    path.write_text(json.dumps(history, separators=(",", ":")))
    return history


def update_readme(dataset: dict) -> None:
    """Refresh the live Top 10 table between the README markers."""
    path = ROOT / "README.md"
    if not path.exists():
        return
    start, end = "<!-- TOP10:START -->", "<!-- TOP10:END -->"
    text = path.read_text()
    if start not in text or end not in text:
        return
    rows = ["| # | Paper | Year | Citations |", "|---:|---|:---:|---:|"]
    for i, p in enumerate(dataset["hallOfFame"][:10], 1):
        title = p["title"].replace("|", "\\|")
        link = f"https://doi.org/{p['doi']}" if p["doi"] else f"https://openalex.org/{p['id']}"
        who = p["authors"][0] + (" et al." if p["authorCount"] > 1 else "") if p["authors"] else ""
        rows.append(f"| {i} | [{title}]({link}) <br><sub>{who}</sub> | {p['year']} | {p['citations']:,} |")
    rows.append(f"\n<sub>Auto-updated {dataset['generatedAt'][:10]} · "
                f"{dataset['totals']['works']:,} astronautics works indexed</sub>")
    body = "\n".join(rows)
    pre, rest = text.split(start, 1)
    path.write_text(f"{pre}{start}\n{body}\n{end}{rest.split(end, 1)[1]}")


def main() -> None:
    DATA.mkdir(exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc)
    year = now.year
    blocklist = load_blocklist()
    allf = topic_filter()

    print("Totals & topic sizes")
    topics = {}
    for key, meta in TOPICS.items():
        f = topic_filter([key])
        years = group(f, "publication_year")
        top = clean(top_works(f, 40), blocklist, year)[:15]
        topics[key] = {
            **meta,
            "works": sum(y["count"] for y in years),
            "byYear": {y["key"]: y["count"] for y in years
                       if y["key"].isdigit() and 1950 <= int(y["key"]) <= year},
            "top": top,
        }
        print(f"  {meta['label']}: {topics[key]['works']:,}")

    print("Hall of fame")
    hall = clean(top_works(allf, 200), blocklist, year)[:100]

    print("Rising stars")
    recent_pool = []
    for key in TOPICS:  # per field, so smaller fields still surface their risers
        recent_pool += top_works(f"{topic_filter([key])},from_publication_date:{year - 6}-01-01", 40)
    rising = diversify(sorted(clean(recent_pool, blocklist, year), key=lambda p: p["recent"], reverse=True), 3)[:60]

    print("Fresh hits")
    fresh = diversify(clean(top_works(f"{allf},from_publication_date:{year - 2}-01-01", 150), blocklist, year), 3)[:40]

    print("Groupings")
    countries = group(allf, "authorships.countries")
    sources = group(f"{allf},primary_location.source.type:journal", "primary_location.source.id")[:25]
    institutions = group(allf, "authorships.institutions.lineage")[:25]
    oa = group(allf, "open_access.oa_status")
    recent_countries = group(f"{allf},from_publication_date:{year - 4}-01-01", "authorships.countries")
    no_country = count(f"{allf},authorships.countries:null")

    print("Country trajectories")
    trend_years = list(range(year - 10, year))  # last 10 complete years
    per_year = {y: {g["key"]: g["count"] for g in group(f"{allf},publication_year:{y}", "authorships.countries")}
                for y in trend_years}
    names = {c["key"]: c["name"] for c in countries}
    country_years = {
        "years": trend_years,
        "series": {k: {"name": names[k], "counts": [per_year[y].get(k, 0) for y in trend_years]}
                   for k in [c["key"] for c in countries[:70]]},
    }

    all_papers = {p["id"]: p for p in hall + rising + fresh}
    print(f"Semantic Scholar enrichment ({len(all_papers)} papers)")
    enrich_s2(list(all_papers.values()))
    for lst in (hall, rising, fresh, *[t["top"] for t in topics.values()]):
        for p in lst:
            p.update({k: all_papers[p["id"]][k] for k in ("influential", "s2Url")
                      if p["id"] in all_papers and k in all_papers[p["id"]]})

    dataset = {
        "generatedAt": now.isoformat(timespec="seconds"),
        "source": "OpenAlex, Semantic Scholar",
        "totals": {
            "works": sum(t["works"] for t in topics.values()),
            "countries": len(countries),
            "thisYear": count(f"{allf},publication_year:{year}"),
            "openAccess": sum(g["count"] for g in oa if g["key"] not in ("closed", "unknown")),
        },
        "countryCoverage": None,
        "topics": topics,
        "hallOfFame": hall,
        "rising": rising,
        "fresh": fresh,
        "countries": countries,
        "recentCountries": recent_countries,
        "countryYears": country_years,
        "sources": sources,
        "institutions": institutions,
        "openAccess": oa,
    }
    total_filtered = count(allf)
    dataset["countryCoverage"] = round(1 - no_country / total_filtered, 3) if total_filtered else None
    history = update_history(dataset)
    update_readme(dataset)
    dataset["historyLength"] = len(history["snapshots"])
    (DATA / "dataset.json").write_text(json.dumps(dataset, ensure_ascii=False, separators=(",", ":")))
    print(f"Done: {dataset['totals']['works']:,} works, {len(hall)} hall-of-fame papers")


if __name__ == "__main__":
    main()
