"""Turn the HackerTube export plus profile.json into the static data the site loads.

    uv run --with fastembed --with numpy python build/build.py

Writes web/public/data/{videos,facets,mentions}.json. Re-run after editing profile.json.
"""

import json
import re
from pathlib import Path

import numpy as np

from score import RAW, ROOT, specific

OUT = ROOT / "web" / "public" / "data"
MENTIONS_PER_VIDEO = 5
SIMILAR_PER_VIDEO = 12
FIRST_YEAR, LAST_YEAR = 2007, 2026


def norm_title(t):
    return re.sub(r"[^a-z0-9]+", " ", t.lower()).strip()


def main():
    import score

    score.main()  # refresh facet_sims.npy from profile.json

    videos = [json.loads(l) for l in open(RAW / "videos.jsonl")]
    by_vid = {v["vid"]: v for v in videos}
    ids = json.load(open(RAW / "embedding_ids.json"))
    row = {v: i for i, v in enumerate(ids)}
    emb = np.load(RAW / "embeddings.npy").astype(np.float32)
    sims = np.load(ROOT / "data" / "facet_sims.npy")
    spec = specific(sims)
    facets = json.load(open(ROOT / "profile.json"))["facets"]

    # Some talks were uploaded twice; keep the better-scored copy (videos.jsonl is best-first).
    seen, keep = set(), []
    for v in videos:
        key = norm_title(v["title"])
        if key in seen:
            continue
        seen.add(key)
        keep.append(v)
    keep_set = {v["vid"] for v in keep}
    print(f"\nkept {len(keep)} of {len(videos)} after title dedupe")

    related = {}
    for line in open(RAW / "related.jsonl"):
        r = json.loads(line)
        related[r["vid"]] = [x["vid"] for x in r["related"] if x["vid"] in keep_set][:8]

    keep_rows = np.array([row[v["vid"]] for v in keep])
    E = emb[keep_rows]
    S = E @ E.T
    np.fill_diagonal(S, -1)

    mentions = {}
    for line in open(RAW / "mentions.jsonl"):
        m = json.loads(line)
        if m["vid"] not in keep_set or m["stance"] not in ("rec", "strong_rec"):
            continue
        mentions.setdefault(m["vid"], []).append(m)

    def year_strip(vid):
        """One digit per year 2007-2026: recommending comments kept that year (export keeps 20 per video), capped at 9."""
        c = [0] * (LAST_YEAR - FIRST_YEAR + 1)
        for m in mentions.get(vid, []):
            y = int(m["month"][:4])
            if FIRST_YEAR <= y <= LAST_YEAR:
                c[y - FIRST_YEAR] += 1
        return "".join(str(min(x, 9)) for x in c)

    out = []
    for k, v in enumerate(keep):
        i = row[v["vid"]]
        nn = np.argsort(-S[k])[:SIMILAR_PER_VIDEO]
        out.append({
            "id": v["vid"],
            "t": v["title"],
            "ch": v["channel"],
            "sum": v["summary"],
            "why": v["why_hn"],
            "type": v["content_type"],
            "life": v["shelf_life"],
            "topic": v["primary_topic"],
            "tags": v["tags"][:6],
            "cats": [c["id"] for c in v["categories"]],
            "q": v["quote"]["text"] if v.get("quote") else None,
            "qy": v["quote"]["year"] if v.get("quote") else None,
            "score": v["score"],
            "recs": v["hn"]["recommenders"],
            "years": [v["hn"]["first_year"], v["hn"]["last_year"]],
            "rm": v["hn"]["rec_months"],
            "ry": year_strip(v["vid"]),
            # facet affinity, z-score units ×10, so the client can re-weight without embeddings
            "f": [int(round(float(x) * 10)) for x in spec[i]],
            # nearest neighbours by embedding, with cosine ×100
            "sim": [[keep[j]["vid"], int(round(float(S[k, j]) * 100))] for j in nn],
            "rel": related.get(v["vid"], []),
        })

    trimmed = {}
    for vid, ms in mentions.items():
        ms.sort(key=lambda m: (m["stance"] != "strong_rec", -len(m["quote"] or "")))
        trimmed[vid] = [{
            "u": m["author"],
            "m": m["month"],
            "s": m["story_title"],
            "x": m["text"][:600],
            "id": m["hn_comment_id"],
            "st": m["stance"],
        } for m in ms[:MENTIONS_PER_VIDEO]]

    tax = json.load(open(RAW / "taxonomy.json"))
    cats = {c["id"]: {"name": c["name"], "area": a["id"]} for a in tax["areas"] for c in a["categories"]}
    counts = {}
    for v in out:
        for c in v["cats"]:
            counts[c] = counts.get(c, 0) + 1
    areas = [{
        "id": a["id"],
        "name": a["name"],
        "cats": [c["id"] for c in sorted(a["categories"], key=lambda c: -counts.get(c["id"], 0)) if counts.get(c["id"])],
    } for a in tax["areas"]]
    for cid in cats:
        cats[cid]["n"] = counts.get(cid, 0)

    OUT.mkdir(parents=True, exist_ok=True)
    # Video vectors for semantic search in the browser: int8, one row per video in videos.json order.
    scale = 127.0 / float(np.abs(E).max())
    (np.clip(np.round(E * scale), -127, 127).astype(np.int8)).tofile(OUT / "emb.bin")
    json.dump(out, open(OUT / "videos.json", "w"), separators=(",", ":"), ensure_ascii=False)
    json.dump(trimmed, open(OUT / "mentions.json", "w"), separators=(",", ":"), ensure_ascii=False)
    json.dump({
        "facets": [{k: f[k] for k in ("id", "short", "weight")} for f in facets],
        "cats": cats,
        "areas": areas,
        "generated": "2026-10-31",
        "years": [FIRST_YEAR, LAST_YEAR],
        "emb": {"dim": int(E.shape[1]), "rows": int(E.shape[0]), "model": "Xenova/bge-small-en-v1.5"},
    }, open(OUT / "meta.json", "w"), separators=(",", ":"), ensure_ascii=False)
    for p in OUT.iterdir():
        print(f"{p.name:16} {p.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
