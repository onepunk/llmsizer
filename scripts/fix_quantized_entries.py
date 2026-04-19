#!/usr/bin/env python3
# Derived from llmfit (https://github.com/AlexsJones/llmfit),
# MIT Licensed, Copyright (c) 2026 Alex Jones. See NOTICE for full text.
# Modifications Copyright (c) 2026 onepunk, MIT Licensed.
"""
fix_quantized_entries.py

One-shot patcher for public/models.json.

Pre-quantized HuggingFace repos (AWQ, GPTQ, MLX-Nbit, compressed-tensors,
bitsandbytes, *-Nbit) store packed tensors: safetensors.total reports the
packed element count, not the true parameter count. A model with 80B real
parameters quantized to AWQ-4bit will report ~14.4B elements via the HF API.

The upstream llmfit scraper trusts safetensors.total, so every pre-quantized
entry in public/models.json has VRAM/RAM estimates that are ~8x too small.

This script fixes that in place by:
  - correcting known context-window metadata that HF configs expose
    inconsistently across RoPE/YaRN families
  - backfilling MoE active-parameter metadata for known families
  - detecting pre-quantized entries (format in awq/gptq/mlx, plus name regex)
  - fetching .safetensors / .gguf / .bin sizes from the HF tree API
  - rewriting weight_gb (new field), min_vram_gb, min_ram_gb,
    recommended_ram_gb, parameters_raw, parameter_count, and normalizing
    the quantization label

Run once; safe to re-run. The scrape_hf_models.py scraper has the same
fix applied for future re-scrapes.

Usage:
  python3 scripts/fix_quantized_entries.py
  python3 scripts/fix_quantized_entries.py --dry-run
  python3 scripts/fix_quantized_entries.py --only cyankiwi/Qwen3-Coder-Next-AWQ-4bit
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

HF_API = "https://huggingface.co/api/models"
MODELS_JSON = os.path.join(
    os.path.dirname(__file__), "..", "public", "models.json"
)

# Name patterns that indicate a pre-quantized repo even when the `format`
# field doesn't.
QUANT_NAME_RE = re.compile(
    r"(?:-AWQ|-GPTQ|-MLX|-EXL2|-BNB|-bnb|-4bit|-8bit|-3bit|-2bit)\b", re.I
)

# Native quantization → bytes per parameter. These are empirical, tuned so
# `weight_gb * 1e9 / BYTES_PER_PARAM` matches the published parameter count
# (e.g. Qwen3-Next-80B AWQ-4bit = 48.3 GB / 0.60 ≈ 80B).
BYTES_PER_PARAM = {
    "AWQ-4bit": 0.60,
    "AWQ-8bit": 1.10,
    "GPTQ-Int4": 0.60,
    "GPTQ-Int8": 1.10,
    "GPTQ-Int2": 0.35,
    "MLX-4bit": 0.55,
    "MLX-8bit": 1.05,
    "MLX-3bit": 0.45,
    "MLX-6bit": 0.80,
    "BNB-4bit": 0.60,
    "BNB-8bit": 1.05,
    "Q4_K_M": 0.58,
    "Q5_K_M": 0.68,
    "Q6_K": 0.80,
    "Q8_0": 1.05,
}

# Runtime overhead beyond raw weight size (KV cache + activations + OS).
# These floors mirror the upstream llmfit conventions.
VRAM_HEADROOM = 1.10  # +10% for activations/KV headroom
RAM_MIN_MULT = 1.20   # min RAM = weight * 1.2 (KV + overhead)
RAM_REC_MULT = 2.00   # recommended RAM = weight * 2.0 (generous headroom)

CONTEXT_RULES = [
    (re.compile(r"^meta-llama/Llama-3\.1-"), 131_072, 131_072, None),
    (re.compile(r"^meta-llama/Llama-3\.2-[13]B(?:-|$)"), 131_072, 131_072, None),
    (re.compile(r"/?Llama-3\.2-1B"), 131_072, 131_072, None),
    (re.compile(r"/?Llama-4-Scout-"), 10_000_000, 10_000_000, None),
    (re.compile(r"^(?:meta-llama|codellama)/CodeLlama-"), 16_384, 16_384, None),
    (re.compile(r"^google/gemma-2-"), 8_192, 8_192, None),
    (re.compile(r"^Qwen/Qwen2\.5-(?!VL-)"), 131_072, 32_768, "YaRN"),
    (re.compile(r"^Qwen/Qwen3-(?:0\.6B|1\.7B|4B|8B|14B|32B)(?:-|$)"), 131_072, 32_768, "YaRN"),
    (re.compile(r"(?:^deepseek-ai/|/)deepseek-(?:coder-)?v2(?:\.5)?", re.I), 131_072, 131_072, None),
    (re.compile(r"(?:^deepseek-ai/|/)DeepSeek-R1-0528-Qwen3-8B"), 131_072, 131_072, None),
    (re.compile(r"/DeepSeek-(?:R1-0528|V3(?:\.2|-0324)?)-NVFP4"), 131_072, 131_072, None),
    (re.compile(r"^deepseek-ai/DeepSeek-(?:V3|R1)(?:-|$|\.)"), 131_072, 131_072, None),
    (re.compile(r"^moonshotai/Kimi-K2-Instruct$"), 131_072, 131_072, None),
    (re.compile(r"^moonshotai/Kimi-K2(?:-Instruct-0905|-Thinking|\.5)"), 262_144, 262_144, None),
]

MOE_RULES = [
    (re.compile(r"^moonshotai/Kimi-K2"), 384, 8, 32_000_000_000),
    (re.compile(r"^zai-org/GLM-4\.5(?:-|$)"), 256, 8, 32_000_000_000),
    (re.compile(r"^zai-org/GLM-5(?:\.1)?(?:-|$)"), 256, 8, 40_000_000_000),
]

A_ACTIVE_RE = re.compile(r"(\d+(?:\.\d+)?)B-A(\d+(?:\.\d+)?)B", re.I)


def is_prequantized(entry: dict) -> bool:
    """A repo is pre-quantized when its native format isn't GGUF (= Q4_K_M
    is just a fallback label) and the weights on HF are already packed."""
    fmt = (entry.get("format") or "").lower()
    if fmt in ("awq", "gptq", "mlx", "exl2", "bnb"):
        return True
    quant = entry.get("quantization") or ""
    if quant.startswith(("AWQ", "GPTQ", "MLX", "EXL2", "BNB")):
        return True
    if QUANT_NAME_RE.search(entry.get("name", "")):
        return True
    return False


def apply_metadata_fixups(entry: dict) -> bool:
    """Apply deterministic metadata fixes that do not require network calls."""
    changed = False
    name = entry.get("name", "")

    for pattern, context, native_context, method in CONTEXT_RULES:
        if pattern.search(name):
            if entry.get("context_length") != context:
                entry["context_length"] = context
                changed = True
            if native_context is not None and native_context != context:
                if entry.get("native_context_length") != native_context:
                    entry["native_context_length"] = native_context
                    changed = True
            else:
                if "native_context_length" in entry:
                    entry.pop("native_context_length", None)
                    changed = True
            if method:
                if entry.get("context_extension") != method:
                    entry["context_extension"] = method
                    changed = True
            else:
                if "context_extension" in entry:
                    entry.pop("context_extension", None)
                    changed = True
            break

    for pattern, num_experts, active_experts, active_params in MOE_RULES:
        if pattern.search(name):
            for key, val in (
                ("is_moe", True),
                ("num_experts", num_experts),
                ("active_experts", active_experts),
                ("active_parameters", active_params),
            ):
                if entry.get(key) != val:
                    entry[key] = val
                    changed = True
            break

    # Generic MoE naming convention: Qwen3-Coder-480B-A35B, GLM-4.5-355B-A32B.
    m = A_ACTIVE_RE.search(name)
    if m:
        active_params = int(float(m.group(2)) * 1_000_000_000)
        if entry.get("is_moe") is not True:
            entry["is_moe"] = True
            changed = True
        if entry.get("active_parameters") != active_params:
            entry["active_parameters"] = active_params
            changed = True

    return changed


def infer_native_quant(entry: dict) -> str:
    """Pick a normalized quant label. Prefers the existing label, falls
    back to name-parsing for entries the original scraper missed."""
    quant = entry.get("quantization") or ""
    if quant and quant.startswith(("AWQ", "GPTQ", "MLX", "EXL2", "BNB")):
        return quant

    name_up = entry.get("name", "").upper()
    if "-AWQ-8BIT" in name_up:
        return "AWQ-8bit"
    if "-AWQ" in name_up:
        return "AWQ-4bit"
    if "-GPTQ-INT8" in name_up or "-GPTQ-8BIT" in name_up:
        return "GPTQ-Int8"
    if "-GPTQ" in name_up:
        return "GPTQ-Int4"
    if "-MLX-8BIT" in name_up:
        return "MLX-8bit"
    if "-MLX-6BIT" in name_up:
        return "MLX-6bit"
    if "-MLX-3BIT" in name_up:
        return "MLX-3bit"
    if "-MLX" in name_up:
        return "MLX-4bit"
    if "-BNB" in name_up or "BITSANDBYTES" in name_up:
        return "BNB-4bit" if "4BIT" in name_up or "-4" in name_up else "BNB-8bit"
    if name_up.endswith("-8BIT") or "-8BIT-" in name_up:
        return "AWQ-8bit"  # best guess
    if name_up.endswith("-4BIT") or "-4BIT-" in name_up:
        return "AWQ-4bit"
    return quant or "AWQ-4bit"


def fetch_tree(repo_id: str) -> list | None:
    """Fetch the HF repo's file tree for main branch."""
    url = f"{HF_API}/{repo_id}/tree/main"
    req = urllib.request.Request(
        url, headers={"Accept": "application/json", "User-Agent": "llmsizer-fixup/1.0"}
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < 2:
                time.sleep(2 ** attempt)
                continue
            print(f"  ! HTTP {e.code} for {repo_id}", file=sys.stderr)
            return None
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
                continue
            print(f"  ! Error fetching {repo_id}: {e}", file=sys.stderr)
            return None
    return None


def weight_size_gb_from_tree(tree: list) -> float | None:
    """Sum LFS sizes for weight files in the repo."""
    total = 0
    for f in tree:
        path = f.get("path", "")
        lfs = f.get("lfs") or {}
        size = lfs.get("size") or f.get("size") or 0
        # Only count real weight files, not tokenizers/configs.
        if path.endswith((".safetensors", ".gguf", ".bin", ".pt", ".pth")):
            # Skip sharded index files which are tiny JSONs.
            if path.endswith(".safetensors.index.json"):
                continue
            total += size
    if total == 0:
        return None
    return round(total / 1e9, 2)


def format_param_count(raw: int) -> str:
    if raw >= 1e12:
        v = raw / 1e12
        return f"{v:.1f}T" if v != int(v) else f"{int(v)}T"
    if raw >= 1e9:
        v = raw / 1e9
        return f"{v:.1f}B" if v != int(v) else f"{int(v)}B"
    if raw >= 1e6:
        return f"{raw / 1e6:.0f}M"
    return f"{raw / 1e3:.0f}K"


def patch_entry(entry: dict) -> tuple[bool, str]:
    """Fetch weight size and rewrite memory fields. Returns (changed, note)."""
    repo = entry["name"]
    tree = fetch_tree(repo)
    if tree is None:
        return False, "fetch failed"
    weight_gb = weight_size_gb_from_tree(tree)
    if weight_gb is None:
        return False, "no weight files"

    native_quant = infer_native_quant(entry)
    bpp = BYTES_PER_PARAM.get(native_quant, 0.60)
    params_raw = int(weight_gb * 1e9 / bpp)

    # Normalize format to match native_quant.
    if native_quant.startswith("AWQ"):
        fmt = "awq"
    elif native_quant.startswith("GPTQ"):
        fmt = "gptq"
    elif native_quant.startswith("MLX"):
        fmt = "mlx"
    elif native_quant.startswith("BNB"):
        fmt = "bnb"
    elif native_quant.startswith("EXL2"):
        fmt = "exl2"
    else:
        fmt = entry.get("format", "safetensors")

    min_vram = round(weight_gb * VRAM_HEADROOM + 0.5, 1)
    min_ram = round(weight_gb * RAM_MIN_MULT + 0.5, 1)
    rec_ram = round(weight_gb * RAM_REC_MULT + 0.5, 1)

    entry["weight_gb"] = weight_gb
    entry["quantization"] = native_quant
    entry["format"] = fmt
    entry["parameters_raw"] = params_raw
    entry["parameter_count"] = format_param_count(params_raw)
    entry["min_vram_gb"] = min_vram
    entry["min_ram_gb"] = min_ram
    entry["recommended_ram_gb"] = rec_ram

    return True, (
        f"{weight_gb:.1f} GB, {native_quant}, "
        f"{entry['parameter_count']} params, min_vram={min_vram}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--only", metavar="REPO", help="Patch only the given repo_id"
    )
    parser.add_argument(
        "--json", default=MODELS_JSON, help="Path to models.json"
    )
    args = parser.parse_args()

    with open(args.json) as f:
        data = json.load(f)

    metadata_changed = sum(1 for e in data if apply_metadata_fixups(e))
    print(f"Applied deterministic metadata fixups to {metadata_changed} entries", file=sys.stderr)

    targets = [
        e for e in data
        if is_prequantized(e) and (not args.only or e.get("name") == args.only)
    ]
    print(f"Found {len(targets)} pre-quantized entries to patch", file=sys.stderr)

    changed = 0
    failed = 0
    for i, entry in enumerate(targets, 1):
        repo = entry["name"]
        print(f"[{i}/{len(targets)}] {repo}", file=sys.stderr)
        ok, note = patch_entry(entry)
        if ok:
            changed += 1
            print(f"  ✓ {note}", file=sys.stderr)
        else:
            failed += 1
            print(f"  ✗ skipped ({note})", file=sys.stderr)
        # Be polite to the HF API.
        time.sleep(0.15)

    print(
        f"\nMetadata fixed {metadata_changed}; quantized patched {changed}, failed {failed}, total {len(targets)}",
        file=sys.stderr,
    )

    if args.dry_run:
        print("(dry-run, not writing)", file=sys.stderr)
        return 0

    with open(args.json, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print(f"Wrote {args.json}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
