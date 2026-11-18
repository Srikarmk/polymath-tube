// Semantic search in the browser. The query is embedded with bge-small (the model HackerTube used for its
// video vectors), and compared with every video's vector from emb.bin: int8, one row per video in
// videos.json order. Both load on the first search only.

type Embed = (text: string) => Promise<Float32Array>;

let embP: Promise<Int8Array> | null = null;
let modelP: Promise<Embed> | null = null;

export function loadEmb() {
  if (!embP) embP = fetch("/data/emb.bin").then((r) => {
    if (!r.ok) throw new Error(`emb.bin ${r.status}`);
    return r.arrayBuffer();
  }).then((b) => new Int8Array(b));
  return embP;
}

export function loadModel(model: string) {
  if (!modelP) {
    modelP = import("@huggingface/transformers").then(async ({ pipeline, env }) => {
      env.allowLocalModels = false;
      const pipe = await pipeline("feature-extraction", model, { dtype: "q8" });
      return async (text: string) => {
        const out = await pipe(text, { pooling: "cls", normalize: true });
        return out.data as Float32Array;
      };
    });
    modelP.catch(() => (modelP = null));
  }
  return modelP;
}

/** Cosine of the query against every video (the stored rows are scaled, so divide by each row's norm). */
export async function semanticScores(query: string, model: string, dim: number): Promise<Float32Array> {
  const [emb, embed] = await Promise.all([loadEmb(), loadModel(model)]);
  const q = await embed(query);
  const rows = emb.length / dim;
  const out = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let dot = 0;
    let nn = 0;
    const o = r * dim;
    for (let k = 0; k < dim; k++) {
      const x = emb[o + k];
      dot += x * q[k];
      nn += x * x;
    }
    out[r] = nn ? dot / Math.sqrt(nn) : 0;
  }
  return out;
}

/** For checking the browser model against HackerTube's vectors. */
export async function embedQuery(query: string, model: string) {
  return (await loadModel(model))(query);
}
