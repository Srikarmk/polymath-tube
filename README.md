# Polymath Tube

**Live:** https://polymath-tube.vercel.app

HackerTube, re-ranked for one person. [HackerTube](https://hackertube.org) kept the YouTube videos that
Hacker News commenters recommended again and again from 2007 to 2026, and published them as open data.
This site takes that list and ranks it against my own projects.

## How the ranking works

`profile.json` holds 14 threads, one for each strand of my work: eval statistics (evalpair,
experiment-forensics), how LLMs fail (prompt-brittleness, llm-judge-bias, format-tax), real-time graphics
(Duskline), transit and civic data (Yeas & Nays, bostonmove), and so on. Each thread's text is embedded
with `BAAI/bge-small-en-v1.5`, the model HackerTube used for its video vectors, and every video is scored
against every thread.

Raw cosine favours generic videos: an intro ML lecture scores well against half the profile. So each
thread's similarity is z-scored, and half the video's average z across all threads is subtracted. A
video's personal score is its strongest weighted thread, plus `0.6 × log(1 + HackerTube score)`, the
number of months HN kept recommending it. The feed is picked greedily with a penalty for repeating a
thread, so one interest can't fill the page.

In the browser, likes boost a video's embedding neighbours and the videos its HN recommenders also
liked. "Not for me" pushes neighbours down, and videos you've already opened drop back. Thread weights
can be changed on the Tune page. All of this is stored in `localStorage` only.

## Rebuild

```bash
mkdir -p data/raw && cd data/raw && curl -LO https://hackertube.org/download/hackertube-data.zip && unzip hackertube-data.zip && cd ../..
uv run --with fastembed --with numpy python build/build.py   # writes web/public/data/
cd web && npm install && npm run dev                         # http://localhost:5191
```

Edit `profile.json` and re-run `build.py` to change what the site thinks I care about.

## Credit

Video picks, summaries and HN comments are from HackerTube's export (ODC-By 1.0), built from the
[open-index/hacker-news](https://huggingface.co/datasets/open-index/hacker-news) archive. Comments remain
the work of their authors. Not affiliated with HackerTube, YouTube or Y Combinator.
