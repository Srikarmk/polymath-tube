import type { Data, Video } from "./data";
import type { State } from "./store";

export type Ranked = { v: Video; score: number };

const QUALITY = 0.6; // weight on log(1 + HackerTube score): how much HN's lasting love counts
const PERSONAL = 0.7; // weight on the strongest interest
const SAME_TOPIC = 0.6; // penalty per earlier pick in the same topic
const SAME_AREA = 0.3; // penalty per earlier pick in the same area
const NEW_AREA = 0.7; // bonus for the first pick from an area, so the feed spans all of HN

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

/** Videos near the ones you liked (by embedding and by shared HN recommenders), and away from hidden ones. */
function likeSignals(data: Data, s: State) {
  const boost = new Map<string, number>();
  const add = (id: string, b: number) => boost.set(id, Math.min((boost.get(id) ?? 0) + b, 2.5));
  for (const id of s.liked) {
    const v = data.byId.get(id);
    if (!v) continue;
    for (const [nid, cos] of v.sim) if (cos > 62) add(nid, ((cos - 62) / 25) * 1.4);
    for (const nid of v.rel) add(nid, 0.5);
  }
  for (const id of s.hidden) {
    const v = data.byId.get(id);
    if (!v) continue;
    for (const [nid, cos] of v.sim) if (cos > 70) add(nid, -0.6);
  }
  return boost;
}

const visible = (v: Video, hidden: Set<string>) => !hidden.has(v.id) && v.life !== "news" && v.recs > 0;

export function forYou(data: Data, s: State, count: number): Ranked[] {
  const w = weightsFor(data, s);
  const boost = likeSignals(data, s);
  const hidden = new Set(s.hidden);
  const liked = new Set(s.liked);
  const seen = new Set(s.history.map((h) => h.id));

  const pool: { v: Video; score: number; cat: string; area: string }[] = [];
  for (const v of data.videos) {
    if (!visible(v, hidden) || liked.has(v.id)) continue;
    const score =
      PERSONAL * Math.max(0, affinity(v, w).best) + quality(v) + (boost.get(v.id) ?? 0) - (seen.has(v.id) ? 1.5 : 0);
    const cat = v.cats[0];
    pool.push({ v, score, cat, area: data.meta.cats[cat]?.area ?? "" });
  }
  pool.sort((a, b) => b.score - a.score);
  const candidates = pool.slice(0, Math.max(1500, count * 10));

  // Greedy pick: repeating a topic or area costs, opening a new area pays.
  const catUsed = new Map<string, number>();
  const areaUsed = new Map<string, number>();
  const taken = new Uint8Array(candidates.length);
  const out: Ranked[] = [];
  while (out.length < count && out.length < candidates.length) {
    let bi = -1;
    let bs = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      if (taken[i]) continue;
      const c = candidates[i];
      const a = areaUsed.get(c.area) ?? 0;
      const adj = c.score - SAME_TOPIC * (catUsed.get(c.cat) ?? 0) - SAME_AREA * a + (a === 0 ? NEW_AREA : 0);
      if (adj > bs) {
        bs = adj;
        bi = i;
      }
    }
    taken[bi] = 1;
    const c = candidates[bi];
    catUsed.set(c.cat, (catUsed.get(c.cat) ?? 0) + 1);
    areaUsed.set(c.area, (areaUsed.get(c.area) ?? 0) + 1);
    out.push({ v: c.v, score: c.score });
  }
  return out;
}

/** A topic or a whole area: HN's most lasting picks first, nudged a little toward your interests. */
export function byTopic(data: Data, s: State, match: (v: Video) => boolean, count: number): Ranked[] {
  const w = weightsFor(data, s);
  const hidden = new Set(s.hidden);
  return data.videos
    .filter((v) => visible(v, hidden) && match(v))
    .map((v) => ({ v, score: quality(v) + 0.25 * Math.max(0, affinity(v, w).best) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

const tokenize = (s: string) => s.toLowerCase().match(/[a-z0-9+#]+/g) ?? [];

export function search(data: Data, query: string, count: number): Ranked[] {
  const terms = tokenize(query).filter((t) => t.length > 1);
  if (!terms.length) return [];
  const phrase = query.toLowerCase().trim();
  const out: Ranked[] = [];
  for (const v of data.videos) {
    const title = v.t.toLowerCase();
    const meta = `${v.ch} ${v.topic} ${v.tags.join(" ")}`.toLowerCase();
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
