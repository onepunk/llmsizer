#!/usr/bin/env tsx
/**
 * scrape-models.ts
 *
 * Fetches text-generation models from HuggingFace for a curated list of authors,
 * filters to those with >1000 downloads, and emits a JSON array compatible with
 * the llmsizer model database.
 *
 * Usage:
 *   npx tsx scripts/scrape-models.ts > public/models.json
 */

const TARGET_AUTHORS = [
  "meta-llama",
  "Qwen",
  "deepseek-ai",
  "mistralai",
  "google",
  "microsoft",
  "NousResearch",
  "cognitivecomputations",
  "teknium",
  "bigcode",
  "stabilityai",
  "tiiuae",
  "allenai",
  "THUDM",
  "internlm",
  "upstage",
  "databricks",
  "mosaicml",
];

interface HFModel {
  id: string;
  author?: string;
  downloads?: number;
  likes?: number;
  createdAt?: string;
  tags?: string[];
  pipeline_tag?: string;
  safetensors?: {
    total?: number;
    parameters?: Record<string, number>;
  };
  cardData?: {
    license?: string;
  };
  config?: {
    num_attention_heads?: number;
    num_key_value_heads?: number;
    num_hidden_layers?: number;
    head_dim?: number;
    max_position_embeddings?: number;
    sliding_window?: number;
    num_experts?: number;
    num_experts_per_tok?: number;
  };
}

interface LLMSizerModel {
  name: string;
  provider: string;
  parameter_count: string;
  parameters_raw: number;
  min_ram_gb: number;
  recommended_ram_gb: number;
  min_vram_gb: number;
  quantization: string;
  format: string;
  context_length: number;
  use_case: string;
  is_moe: boolean;
  num_experts: number | null;
  active_experts: number | null;
  active_parameters: number | null;
  release_date: string | null;
  capabilities: string[];
  num_attention_heads: number | null;
  num_key_value_heads: number | null;
  num_hidden_layers: number | null;
  head_dim: number | null;
  license: string | null;
}

// ---------------------------------------------------------------------------
// Parameter count parsing
// ---------------------------------------------------------------------------

/**
 * Parse parameter count from safetensors total (preferred) or model name.
 * Returns { raw, label } where raw is the number of parameters and label
 * is a human-readable string like "7B".
 */
function parseParamCount(model: HFModel): { raw: number; label: string } {
  // Prefer safetensors metadata
  const st = model.safetensors;
  if (st?.total && st.total > 0) {
    return { raw: st.total, label: formatParamLabel(st.total) };
  }

  // Fall back to name-based heuristic
  const nameParts = model.id.split("/");
  const modelName = nameParts[nameParts.length - 1].toLowerCase();

  // Match patterns like 7B, 13B, 70B, 1.5B, 0.5B, 72B, 405B, 3b, 8b, etc.
  const match = modelName.match(/([\d]+(?:[\.\d]+)?)\s*([bBmMkK])/);
  if (match) {
    const num = parseFloat(match[1]);
    const suffix = match[2].toLowerCase();
    let raw: number;
    if (suffix === "b") raw = num * 1e9;
    else if (suffix === "m") raw = num * 1e6;
    else if (suffix === "k") raw = num * 1e3;
    else raw = num;
    return { raw, label: formatParamLabel(raw) };
  }

  return { raw: 0, label: "Unknown" };
}

function formatParamLabel(raw: number): string {
  if (raw >= 1e12) return `${(raw / 1e12).toFixed(1)}T`;
  if (raw >= 1e9) return `${(raw / 1e9).toFixed(1)}B`;
  if (raw >= 1e6) return `${(raw / 1e6).toFixed(1)}M`;
  if (raw >= 1e3) return `${(raw / 1e3).toFixed(1)}K`;
  return String(raw);
}

// ---------------------------------------------------------------------------
// RAM / VRAM estimation
// ---------------------------------------------------------------------------

/**
 * Q4_K_M formula: bytes ≈ params * 4.5 bits / 8 = params * 0.5625
 * Add ~0.5 GB overhead.
 */
function estimateRam(
  parametersRaw: number,
  activeParameters: number | null
): { min_ram_gb: number; recommended_ram_gb: number; min_vram_gb: number } {
  const effectiveParams = activeParameters ?? parametersRaw;
  const rawGb = (effectiveParams * 0.58) / 1e9 + 0.5;
  const minRam = Math.max(1.0, parseFloat(rawGb.toFixed(1)));
  const recommended = Math.max(2.0, parseFloat((rawGb * 1.25).toFixed(1)));
  const minVram = parseFloat((rawGb * 0.75).toFixed(1));
  return { min_ram_gb: minRam, recommended_ram_gb: recommended, min_vram_gb: minVram };
}

// ---------------------------------------------------------------------------
// Use-case inference
// ---------------------------------------------------------------------------

function inferUseCase(modelId: string): string {
  const name = modelId.toLowerCase();
  if (name.includes("embed")) return "Embedding";
  if (
    name.includes("vision") ||
    name.includes("-vl") ||
    name.includes("_vl") ||
    name.includes("vl-") ||
    name.includes("-vision") ||
    name.includes("multimodal")
  )
    return "Multimodal";
  if (
    name.includes("code") ||
    name.includes("coder") ||
    name.includes("starcoder") ||
    name.includes("deepseek-coder") ||
    name.includes("codellama") ||
    name.includes("codestral")
  )
    return "Coding";
  return "General";
}

// ---------------------------------------------------------------------------
// Capabilities inference
// ---------------------------------------------------------------------------

function inferCapabilities(model: HFModel): string[] {
  const caps: string[] = [];
  const name = model.id.toLowerCase();
  const tags = model.tags ?? [];

  if (
    name.includes("instruct") ||
    name.includes("chat") ||
    name.includes("-it") ||
    name.includes("_it")
  ) {
    caps.push("instruction_following");
  }
  if (name.includes("code") || name.includes("coder")) {
    caps.push("code_generation");
  }
  if (
    name.includes("vision") ||
    name.includes("-vl") ||
    name.includes("_vl") ||
    name.includes("vl-") ||
    name.includes("multimodal")
  ) {
    caps.push("vision");
  }
  if (tags.includes("function-calling") || name.includes("tool")) {
    caps.push("tool_use");
  }

  return [...new Set(caps)];
}

// ---------------------------------------------------------------------------
// MoE detection
// ---------------------------------------------------------------------------

function detectMoe(model: HFModel): {
  is_moe: boolean;
  num_experts: number | null;
  active_experts: number | null;
  active_parameters: number | null;
} {
  const name = model.id.toLowerCase();
  const config = model.config;

  const isMoe =
    name.includes("moe") ||
    name.includes("mixtral") ||
    name.includes("deepseek-moe") ||
    (config?.num_experts != null && config.num_experts > 1);

  if (!isMoe) {
    return { is_moe: false, num_experts: null, active_experts: null, active_parameters: null };
  }

  const numExperts = config?.num_experts ?? null;
  const activeExperts = config?.num_experts_per_tok ?? null;

  // Estimate active parameters: if we know total params and expert counts, scale down
  let activeParameters: number | null = null;
  const st = model.safetensors;
  if (st?.total && numExperts && activeExperts) {
    // Rough estimate: active_params ≈ non_expert_params + (active_experts/num_experts) * expert_params
    // We approximate expert_params as 80% of total for MoE models
    const expertFraction = activeExperts / numExperts;
    activeParameters = Math.round(
      st.total * (0.2 + 0.8 * expertFraction)
    );
  }

  return { is_moe: true, num_experts: numExperts, active_experts: activeExperts, active_parameters: activeParameters };
}

// ---------------------------------------------------------------------------
// Context length
// ---------------------------------------------------------------------------

function inferContextLength(model: HFModel): number {
  const config = model.config;
  if (config?.max_position_embeddings && config.max_position_embeddings > 0) {
    return config.max_position_embeddings;
  }
  // Fallback default
  return 8192;
}

// ---------------------------------------------------------------------------
// HuggingFace API fetch
// ---------------------------------------------------------------------------

const HF_API_BASE = "https://huggingface.co/api";
const MIN_DOWNLOADS = 1000;
const PER_AUTHOR_LIMIT = 30;

async function fetchModelsForAuthor(author: string): Promise<HFModel[]> {
  const url =
    `${HF_API_BASE}/models?author=${encodeURIComponent(author)}` +
    `&sort=downloads&direction=-1&limit=${PER_AUTHOR_LIMIT}&filter=text-generation`;

  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "llmsizer-scraper/1.0",
      },
    });
    if (res.ok) break;
    if (res.status === 429 || res.status >= 500) {
      const delay = Math.pow(2, attempt) * 1000;
      process.stderr.write(`[WARN] HTTP ${res.status} for ${author}, retrying in ${delay}ms...\n`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    break;
  }

  if (!res || !res.ok) {
    process.stderr.write(
      `[WARN] Failed to fetch ${author}: HTTP ${res?.status ?? 'unknown'}\n`
    );
    return [];
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    process.stderr.write(`[WARN] Unexpected response for ${author}: not an array\n`);
    return [];
  }
  return data as HFModel[];
}

// ---------------------------------------------------------------------------
// Model transformation
// ---------------------------------------------------------------------------

function transformModel(model: HFModel): LLMSizerModel {
  const { raw: parametersRaw, label: parameterCount } = parseParamCount(model);
  const { is_moe, num_experts, active_experts, active_parameters } = detectMoe(model);
  const { min_ram_gb, recommended_ram_gb, min_vram_gb } = estimateRam(
    parametersRaw,
    active_parameters
  );
  const contextLength = inferContextLength(model);
  const useCase = inferUseCase(model.id);
  const capabilities = inferCapabilities(model);

  const config = model.config;
  const provider = model.author ?? model.id.split("/")[0];

  return {
    name: model.id,
    provider,
    parameter_count: parameterCount,
    parameters_raw: parametersRaw,
    min_ram_gb,
    recommended_ram_gb,
    min_vram_gb,
    quantization: "Q4_K_M",
    format: "gguf",
    context_length: contextLength,
    use_case: useCase,
    is_moe,
    num_experts: num_experts ?? null,
    active_experts: active_experts ?? null,
    active_parameters: active_parameters ?? null,
    release_date: model.createdAt ? model.createdAt.split("T")[0] : null,
    capabilities,
    num_attention_heads: config?.num_attention_heads ?? null,
    num_key_value_heads: config?.num_key_value_heads ?? null,
    num_hidden_layers: config?.num_hidden_layers ?? null,
    head_dim: config?.head_dim ?? null,
    license: model.cardData?.license ?? null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const results: LLMSizerModel[] = [];
  const seen = new Set<string>();

  for (const author of TARGET_AUTHORS) {
    process.stderr.write(`[INFO] Fetching models for author: ${author}\n`);

    let models: HFModel[];
    try {
      models = await fetchModelsForAuthor(author);
    } catch (err) {
      process.stderr.write(`[WARN] Error fetching ${author}: ${err}\n`);
      continue;
    }

    for (const model of models) {
      const downloads = model.downloads ?? 0;
      if (downloads < MIN_DOWNLOADS) continue;
      if (seen.has(model.id)) continue;
      seen.add(model.id);

      results.push(transformModel(model));
    }

    process.stderr.write(
      `[INFO]   ${models.filter((m) => (m.downloads ?? 0) >= MIN_DOWNLOADS).length} models kept\n`
    );

    // Be polite to the API
    await new Promise((r) => setTimeout(r, 200));
  }

  process.stderr.write(`[INFO] Total models: ${results.length}\n`);
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`[ERROR] ${err}\n`);
  process.exit(1);
});
