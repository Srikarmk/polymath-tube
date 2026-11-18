import type { Data, Facet, Video } from "./data";
import type { State } from "./store";

export type Reason =
  | { kind: "facet"; facet: Facet }
  | { kind: "like"; from: Video }
  | { kind: "match" };

export type Ranked = { v: Video; score: number; reason: Reason };

const QUALITY = 0.6; // weight on log(1 + HackerTube score): how much HN's lasting love counts
const DIVERSITY = 0.35; // penalty per earlier pick from the same thread

export const quality = (v: Video) => QUALITY * Math.log1p(v.score);

export function weightsFor(data: Data, s: State) {
  return data.meta.facets.map((f) => s.weights[f.id] ?? f.weight);
}

/** Which thread of your work pulls this video in hardest, and how hard. */
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
  const boost = new Map<string, { b: number; from: Video }>();
  const add = (id: string, b: number, from: Video) => {
    const cur = boost.get(id);
    if (!cur) boost.set(id, { b, from });
    else {
      const total = Math.min(cur.b + b, 2.5);
      boost.set(id, { b: total, from: b > cur.b ? from : cur.from });
    }
  };
  for (const id of s.liked) {
    const v = data.byId.get(id);
    if (!v) continue;
    for (const [nid, cos] of v.sim) if (cos > 62) add(nid, ((cos - 62) / 25) * 1.4, v);
    for (const nid of v.rel) add(nid, 0.5, v);
  }
  const push = new Map<string, number>();
  for (const id of s.hidden) {
    const v = data.byId.get(id);
    if (!v) continue;
    for (const [nid, cos] of v.sim) if (cos > 70) push.set(nid, (push.get(nid) ?? 0) + 0.6);
  }
  return { boost, push };
}

export function forYou(data: Data, s: State, count: number): Ranked[] {
  const w = weightsFor(data, s);
  const { boost, push } = likeSignals(data, s);
  const hidden = new Set(s.hidden);
  const liked = new Set(s.liked);
  const seen = new Set(s.history.map((h) => h.id));

  const pool: (Ranked & { thread: number })[] = [];
  for (const v of data.videos) {
    if (hidden.has(v.id) || liked.has(v.id) || v.life === "news" || v.recs === 0) continue;
    const { best, arg } = affinity(v, w);
    const lb = boost.get(v.id);
    let score = best + quality(v) - (push.get(v.id) ?? 0) - (seen.has(v.id) ? 1.5 : 0);
    let reason: Reason = { kind: "facet", facet: data.meta.facets[arg] };
    if (lb) {
      score += lb.b;
      if (lb.b > 0.8) reason = { kind: "like", from: lb.from };
    }
    pool.push({ v, score, reason, thread: lb && lb.b > 0.8 ? -1 : arg });
  }
  pool.sort((a, b) => b.score - a.score);
  const candidates = pool.slice(0, Math.max(400, count * 4));

  // Greedy pick with a penalty for repeating a thread, so one strong interest can't fill the page.
  const used = new Map<number, number>();
  const out: Ranked[] = [];
  const taken = new Set<number>();
  while (out.length < count && taken.size < candidates.length) {
    let bi = -1;
    let bs = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      if (taken.has(i)) continue;
      const c = candidates[i];
      const adj = c.score - DIVERSITY * (used.get(c.thread) ?? 0);
      if (adj > bs) {
        bs = adj;
        bi = i;
      }
    }
    taken.add(bi);
    const c = candidates[bi];
    used.set(c.thread, (used.get(c.thread) ?? 0) + 1);
    out.push({ v: c.v, score: c.score, reason: c.reason });
  }
  return out;
}

export function byThread(data: Data, s: State, j: number, count: number): Ranked[] {
  const hidden = new Set(s.hidden);
  const facet = data.meta.facets[j];
  return data.videos
    .filter((v) => !hidden.has(v.id) && v.life !== "news" && v.recs > 0)
    .map((v) => ({ v, score: v.f[j] / 10 + quality(v), reason: { kind: "facet", facet } as Reason }))
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
    out.push({ v, score: s + quality(v), reason: { kind: "match" } });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, count);
}
