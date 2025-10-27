import { pipeline } from "@xenova/transformers";

const g = global as any;

export async function getMiniLM() {
  if (!g.__minilm_embedder__) {
    const modelId = "Xenova/all-MiniLM-L6-v2";
    const extractor = await pipeline("feature-extraction", modelId);

    g.__minilm_embedder__ = {
      modelId,
      dim: 384,
      async embed(text: string) {
        const result = await extractor(text, { pooling: "mean", normalize: true });
        return Array.from(result.data as Float32Array);
      },
    };
  }
  return g.__minilm_embedder__;
}
