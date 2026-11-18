import type { Data, Video } from "./data";
import type { State } from "./store";

export type Ranked = { v: Video; score: number };

const QUALITY = 0.6; // weight on log(1 + HackerTube score): how much HN's lasting love counts
const PERSONAL = 0.7; // weight on the strongest interest
const SAME_TOPIC = 0.6; // penalty per earlier pick in the same topic
const SAME_AREA = 0.3; // penalty per earlier pick in the same area
const SAME_CHANNEL = 0.8; // penalty per earlier pick from the same channel (3Blue1Brown twice in a row)
const NEW_AREA = 0.7; // bonus for the first pick from an area, so the feed spans all of HN
const DATED = 0.3; // HackerTube marks some videos as aged; they drop a little
const JITTER = 0.7; // a per-day (and per-shuffle) nudge, so the feed is not the same list every visit
const LIKED_TOPIC = 0.25; // a like also lifts the rest of its topic a little

/** Content-type groups for the filter. "All" is the absence of a group. */
export const TYPE_GROUPS: { id: string; label: string; short: string; types: string[] }[] = [
  { id: "talks", label: "Talks", short: "Talks", types: ["talk", "demo"] },
  { id: "lectures", label: "Lectures and courses", short: "Lectures", types: ["lecture", "course", "tutorial"] },
  { id: "docs", label: "Documentaries", short: "Documentaries", types: ["documentary"] },
  { id: "explainers", label: "Explainers", short: "Explainers", types: ["explainer", "commentary"] },
  { id: "interviews", label: "Interviews and podcasts", short: "Interviews", types: ["interview", "podcast"] },
];

export function typeMatch(group: string | null) {
  const g = TYPE_GROUPS.find((x) => x.id === group);
  return g ? (v: Video) => g.types.includes(v.type) : () => true;
}

export const quality = (v: Video) => QUALITY * Math.log1p(v.score);

export function weightsFor(data: Data, s: State) {
  return data.meta.facets.map((f) => s.weights[f.id] ?? f.weight);
}

/** Which interest pulls this video in hardest, and how hard. */
export function affinity(v: Video, w: number[]) {
  let best = -Infinity;
  let arg = 0;
  for (let j = 0; j < w.length; j++) {
    const x = (w[j] * v.f[j]) / 10;
    if (x > best) {
      best = x;
      arg = j;
    }
  }
  return { best, arg };
}

/** A stable number in [0, 1) for a video and a seed. */
function hash01(id: string, seed: number) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export const today = () => Math.floor(Date.now() / 86400000);

/** Videos near the ones you liked (by embedding and by shared HN recommenders), and away from hidden ones. */
function likeSignals(data: Data, s: State) {
  const boost = new Map<string, number>();
  const topics = new Set<string>();
  const add = (id: string, b: number) => boost.set(id, Math.min((boost.get(id) ?? 0) + b, 2.5));
  for (const id of s.liked) {
    const v = data.byId.get(id);
    if (!v) continue;
    topics.add(v.cats[0]);
    for (const [nid, cos] of v.sim) if (cos > 62) add(nid, ((cos - 62) / 25) * 1.4);
    for (const nid of v.rel) add(nid, 0.5);
  }
  for (const id of s.hidden) {
    const v = data.byId.get(id);
    if (!v) continue;
    for (const [nid, cos] of v.sim) if (cos > 70) add(nid, -0.6);
  }
  return { boost, topics };
}

const visible = (v: Video, hidden: Set<string>) => !hidden.has(v.id) && v.life !== "news" && v.recs > 0;

export function forYou(data: Data, s: State, count: number, type: string | null): Ranked[] {
  const w = weightsFor(data, s);
  const { boost, topics } = likeSignals(data, s);
  const hidden = new Set(s.hidden);
  const liked = new Set(s.liked);
  const seen = new Set(s.history.map((h) => h.id));
  const match = typeMatch(type);
  const seed = today() * 31 + s.shuffle;

  const pool: { v: Video; score: number; cat: string; area: string }[] = [];
  for (const v of data.videos) {
    if (!visible(v, hidden) || liked.has(v.id) || !match(v)) continue;
    const cat = v.cats[0];
    const score =
      PERSONAL * Math.max(0, affinity(v, w).best) +
      quality(v) +
      (boost.get(v.id) ?? 0) +
      (topics.has(cat) ? LIKED_TOPIC : 0) +
      JITTER * hash01(v.id, seed) -
      (v.life === "dated" ? DATED : 0) -
      (seen.has(v.id) ? 1.5 : 0);
    pool.push({ v, score, cat, area: data.meta.cats[cat]?.area ?? "" });
  }
  pool.sort((a, b) => b.score - a.score);
  const candidates = pool.slice(0, Math.max(1500, count * 10));

  // Greedy pick: repeating a topic, an area or a channel costs; opening a new area pays.
  const catUsed = new Map<string, number>();
  const areaUsed = new Map<string, number>();
  const chUsed = new Map<string, number>();
  const taken = new Uint8Array(candidates.length);
  const out: Ranked[] = [];
  while (out.length < count && out.length < candidates.length) {
    let bi = -1;
    let bs = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      if (taken[i]) continue;
      const c = candidates[i];
      const a = areaUsed.get(c.area) ?? 0;
      const adj =
        c.score -
        SAME_TOPIC * (catUsed.get(c.cat) ?? 0) -
        SAME_AREA * a -
        SAME_CHANNEL * (chUsed.get(c.v.ch) ?? 0) +
        (a === 0 ? NEW_AREA : 0);
      if (adj > bs) {
        bs = adj;
        bi = i;
      }
    }
    taken[bi] = 1;
    const c = candidates[bi];
    catUsed.set(c.cat, (catUsed.get(c.cat) ?? 0) + 1);
    areaUsed.set(c.area, (areaUsed.get(c.area) ?? 0) + 1);
    chUsed.set(c.v.ch, (chUsed.get(c.v.ch) ?? 0) + 1);
    out.push({ v: c.v, score: c.score });
  }
  return out;
}

export type TopicSort = "lasting" | "foryou";

/** A topic or a whole area. "lasting" is HN's most lasting picks first; "foryou" leans on your interests. */
export function byTopic(
  data: Data,
  s: State,
  match: (v: Video) => boolean,
  count: number,
  sort: TopicSort = "lasting",
): Ranked[] {
  const w = weightsFor(data, s);
  const hidden = new Set(s.hidden);
  const lean = sort === "foryou" ? 0.9 : 0.15;
  return data.videos
    .filter((v) => visible(v, hidden) && match(v))
    .map((v) => ({ v, score: quality(v) + lean * Math.max(0, affinity(v, w).best) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

export function countWhere(data: Data, s: State, match: (v: Video) => boolean) {
  const hidden = new Set(s.hidden);
  let n = 0;
  for (const v of data.videos) if (visible(v, hidden) && match(v)) n++;
  return n;
}

const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9+#]+/g) ?? [];

export function search(data: Data, query: string, count: number): Ranked[] {
  const terms = tokenize(query).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const phrase = query.toLowerCase().trim();
  const out: Ranked[] = [];
  for (const v of data.videos) {
    const title = v.t.toLowerCase();
    const meta = `${v.ch} ${v.topic} ${v.tags.join(" ")} ${v.cats.map((c) => data.meta.cats[c]?.name ?? "").join(" ")}`.toLowerCase();
    const body = `${v.sum} ${v.why}`.toLowerCase();
    let s = 0;
    let hits = 0;
    for (const t of terms) {
      const re = new RegExp(`\\b${t.replace(/[+#]/g, "\\$&")}`);
      const h = (re.test(title) ? 3 : 0) + (re.test(meta) ? 2 : 0) + (re.test(body) ? 1 : 0);
      if (h) hits++;
      s += h;
    }
    if (hits < Math.ceil(terms.length * 0.6)) continue;
    if (terms.length > 1 && (title.includes(phrase) || meta.includes(phrase))) s += 4;
    out.push({ v, score: s + quality(v) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, count);
}
