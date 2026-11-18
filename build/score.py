"""Embed the taste-profile facets with the same model HackerTube used and score every video.

Writes data/facet_sims.npy ([videos, facets], float32) and prints the top videos per facet so the
profile can be checked by eye.

    uv run --with fastembed --with numpy python build/score.py
"""

import json
from pathlib import Path

import numpy as np
from fastembed import TextEmbedding

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "hackertube-data"


def load_videos():
    return [json.loads(line) for line in open(RAW / "videos.jsonl")]


def main():
    videos = load_videos()
    by_vid = {v["vid"]: v for v in videos}
    ids = json.load(open(RAW / "embedding_ids.json"))
    emb = np.load(RAW / "embeddings.npy").astype(np.float32)
    assert emb.shape[0] == len(ids)

    facets = json.load(open(ROOT / "profile.json"))["facets"]
    model = TextEmbedding("BAAI/bge-small-en-v1.5")
    fvec = np.array(list(model.embed([f["text"] for f in facets])), dtype=np.float32)
    fvec /= np.linalg.norm(fvec, axis=1, keepdims=True)

    # Sanity check: the model must reproduce HackerTube's vectors closely enough for search.
    probe = list(model.embed(["distributed systems"]))[0]
    probe /= np.linalg.norm(probe)
    top = np.argsort(-(emb @ probe))[:5]
    print("probe 'distributed systems':", [by_vid[ids[i]]["title"][:60] for i in top])

    sims = emb @ fvec.T  # [N, F]
    np.save(ROOT / "data" / "facet_sims.npy", sims)
    json.dump(ids, open(ROOT / "data" / "facet_sims_ids.json", "w"))

    print(f"\nsims: mean {sims.mean():.3f}  p50 {np.median(sims):.3f}  p99 {np.percentile(sims, 99):.3f}  max {sims.max():.3f}\n")
    for j, f in enumerate(facets):
        order = np.argsort(-sims[:, j])[:8]
        print(f"== {f['id']}  (p99 {np.percentile(sims[:, j], 99):.3f})")
        for i in order:
            v = by_vid[ids[i]]
            print(f"   {sims[i, j]:.3f}  s={v['score']:>4}  {v['title'][:70]}  [{v['channel'][:20]}]")


if __name__ == "__main__":
    main()


def specific(sims):
    """Per-facet z-score, minus half the video's mean z across facets.

    Raw cosine favours generic videos (an intro ML lecture is 0.75 to half the profile). Subtracting
    the video's average pull keeps a facet's top picks about that facet."""
    z = (sims - sims.mean(0)) / sims.std(0)
    return z - 0.5 * z.mean(1, keepdims=True)
