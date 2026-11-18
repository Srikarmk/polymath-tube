export type Video = {
  id: string;
  t: string;
  ch: string;
  sum: string;
  why: string;
  type: string;
  life: "evergreen" | "dated" | "news";
  topic: string;
  tags: string[];
  cats: string[];
  q: string | null;
  qy: string | null;
  score: number;
  recs: number;
  years: [number, number];
  rm: number;
  ry: string;
  f: number[];
  sim: [string, number][];
  rel: string[];
};

export type Facet = { id: string; short: string; weight: number };

export type Meta = {
  facets: Facet[];
  cats: Record<string, { name: string; area: string; n: number }>;
  areas: { id: string; name: string; cats: string[] }[];
  generated: string;
  years: [number, number];
  emb: { dim: number; rows: number; model: string };
};

export type Mention = { u: string; m: string; s: string; x: string; id: number; st: string };

export type Data = { videos: Video[]; byId: Map<string, Video>; meta: Meta };

let dataPromise: Promise<Data> | null = null;
export function loadData(): Promise<Data> {
  if (!dataPromise) {
    dataPromise = Promise.all([
      fetch("/data/videos.json").then((r) => r.json() as Promise<Video[]>),
      fetch("/data/meta.json").then((r) => r.json() as Promise<Meta>),
    ]).then(([videos, meta]) => ({ videos, meta, byId: new Map(videos.map((v) => [v.id, v])) }));
  }
  return dataPromise;
}

let mentionsPromise: Promise<Record<string, Mention[]>> | null = null;
export function loadMentions() {
  if (!mentionsPromise) mentionsPromise = fetch("/data/mentions.json").then((r) => r.json());
  return mentionsPromise;
}

export const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hq2.jpg`;
export const hnUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;
