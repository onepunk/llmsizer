# llmsizer

Find which LLMs actually fit on your hardware. Try it at [llmsizer.com](https://llmsizer.com).

## What it does

- **Detects your GPU** via WebGL — no install required
- **Estimates memory** for each model across quantization levels (Q2_K through F16)
- **Predicts speed** (tokens/sec) based on your GPU's memory bandwidth
- **Scores and ranks** 5,000+ models by quality, speed, fit, and context length
- **Shows what fits** — perfect, good, marginal, or won't run

## Tech

Static React SPA — everything runs in your browser. No backend, no data collection.

Built with TypeScript, Vite, and a model database auto-updated weekly from HuggingFace.

## Run locally

```bash
npm install
npm run dev
```

## Test

```bash
npm test
```

## License

MIT
