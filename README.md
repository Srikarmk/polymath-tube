# Polymath Tube

**Live:** https://polymath-tube.vercel.app

The talks, lectures and documentaries that Hacker News commenters kept recommending from 2007 to 2026,
in one feed that ranges across 150 topics. It is built on the open data that
[HackerTube](https://hackertube.org) published: every YouTube video that at least three different people
recommended on HN, in at least three different months.

## How the feed is ranked

`profile.json` holds a set of interests, each a short description ("how transformers work inside",
"cities, transit and civic data", "game design and game feel"). Each is embedded with
`BAAI/bge-small-en-v1.5`, the model HackerTube used for its video vectors, and every video is scored
against every interest.

Raw cosine favours generic videos: an intro lecture matches half the interests a little. So each
interest's similarity is z-scored, and half the video's average z across all interests is subtracted,
which keeps an interest's top picks about that interest. A video's score is its strongest weighted
interest plus `0.6 × log(1 + HackerTube score)`, where HackerTube's score counts the months HN kept
recommending it.

A small nudge that changes every day (and on every Shuffle) keeps the mix from going stale, and videos
HackerTube marks as dated drop a little. The feed is then picked greedily across HackerTube's 16 areas
and 150 topics: a second video from the same topic, area or channel costs points, and the first video
from a new area earns some. A content-type filter (talks, lectures, documentaries, explainers,
interviews) narrows it.

Each video carries a strip of 20 cells, 2007 to 2026, lit in the years HN commenters recommended it
(brighter for more recommending comments among the up to 20 the export keeps per video).

In the browser, a like raises the video's nearest neighbours by embedding and the videos its HN
recommenders also recommended. "Not for me" pushes its neighbours down, and videos already opened drop
back. Interest weights can be changed on the Tune page. All of this stays in `localStorage`.

## Run it

```bash
mkdir -p data/raw && cd data/raw && curl -LO https://hackertube.org/download/hackertube-data.zip && unzip hackertube-data.zip && cd ../..
uv run --with fastembed --with numpy python build/build.py   # writes web/public/data/
cd web && npm install && npm run dev                         # http://localhost:5191
```

Edit `profile.json` and re-run `build.py` to change the interests the feed starts from.

## Credit

Video picks, summaries and HN comments are from HackerTube's export (ODC-By 1.0), built from the
[open-index/hacker-news](https://huggingface.co/datasets/open-index/hacker-news) archive. Comments remain
the work of their authors. Not affiliated with HackerTube, YouTube or Y Combinator.
