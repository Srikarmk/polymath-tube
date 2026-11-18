import json, sys
import numpy as np
sys.path.insert(0, "build")
from score import specific, RAW, ROOT
videos = {json.loads(l)["vid"]: json.loads(l) for l in open(RAW / "videos.jsonl")}
ids = json.load(open(ROOT / "data/facet_sims_ids.json"))
sims = np.load(ROOT / "data/facet_sims.npy")
facets = json.load(open(ROOT / "profile.json"))["facets"]
w = np.array([f["weight"] for f in facets])
s = specific(sims)
for j, f in enumerate(facets):
    order = np.argsort(-s[:, j])[:6]
    print("==", f["id"]); [print(f"   {s[i,j]:.2f}  {videos[ids[i]]['title'][:72]}") for i in order]
q = np.array([videos[v]["score"] for v in ids])
rec = np.array([videos[v]["hn"]["recommenders"] for v in ids])
news = np.array([videos[v]["shelf_life"] == "news" for v in ids])
best = (s * w).max(1); arg = (s * w).argmax(1)
final = best + 0.6 * np.log1p(q) - 5 * news - 3 * (rec == 0)
print("\n== FOR YOU top 40")
for i in np.argsort(-final)[:40]:
    print(f"  {final[i]:.2f} rel {best[i]:.2f} q {q[i]:>4}  {facets[arg[i]]['id']:<13} {videos[ids[i]]['title'][:64]}")
from collections import Counter
print(Counter(facets[arg[i]]["id"] for i in np.argsort(-final)[:300]))
