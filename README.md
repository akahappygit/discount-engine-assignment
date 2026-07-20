# Opptra Discount Engine — Base Implementation

**Live deployment:** https://discount-engine-assignment-lyart.vercel.app/

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:5173, upload `sample-data/rules.csv` and `sample-data/cart.csv`, click **Calculate Discounts**.

To test natural-language rule input locally, add a `.env` file with:

VITE_GROQ_API_KEY=your_key_here

(Get a free key at https://console.groq.com/)

## What's Implemented

**Foundation** — Item-level discount engine: picks the non-stackable rule with the largest rupee saving, stacks any `stackable: true` rules on top.

**Task 1 — Cart-level offer** — RULE-04 applies a 10% discount to the cart total once it meets the Rs.4,000 threshold. Shown as a separate line in results; hidden entirely if the threshold isn't met.

**Task 2 — Natural language rule input** — Text field parsed by a Groq LLM (llama-3.1-8b-instant) into a structured rule, shown in a confirmation card the user must approve before it's added. If the Groq call fails (rate limit, network, missing key), it falls back automatically to a local regex parser — the user never sees a crash.

**Task 3 — PDF cart upload** — Extracts a Product/Brand/Platform/Base Price table from an uploaded PDF using `pdfjs-dist`, replaces the current cart, and re-runs the engine automatically with existing rules.

## Expected Results (sample data)

| Item | Base Price | Final Price | Reasoning |
|---|---|---|---|
| ITEM-01 | Rs.1,299 | Rs.1,104 | Platform offer: 15% off (beats Rs.150) |
| ITEM-02 | Rs.849 | Rs.629 | Brand Rs.150 off + Platform 10% stacked |
| ITEM-03 | Rs.599 | Rs.509 | Platform offer: 15% off |
| ITEM-04 | Rs.2,499 | Rs.2,499 | No offers available |
| ITEM-05 | Rs.449 | Rs.382 | Platform offer: 15% off |
| ITEM-06 | Rs.899 | Rs.809 | Platform offer: 10% off |

Cart subtotal Rs.5,932 → Rs.4,000 threshold met → 10% cart offer → **Final total Rs.5,339**

## Design Decisions & Tradeoffs

- **Hybrid LLM parsing** — Groq is the primary parser (real API call, `temperature: 0` for deterministic output, JSON-schema enforced). A local regex parser is the fallback if the API is unavailable, so the app never breaks even without a key or network access.
- **LLM output isn't trusted blindly** — beyond basic shape validation, the parsed rule is cross-checked against the raw input text: the claimed brand/platform must actually appear in what the user typed, and a `stackable: true` claim is rejected unless the input actually mentions stacking. This was added after testing surfaced the model occasionally defaulting to `stackable: true` on garbled input (e.g. stray `+`, `=`, `*` symbols) with no textual basis.
- **Price floor at zero** — both item-level and cart-level discounts are clamped with `Math.max(0, ...)` so a large flat discount on a cheap item can never produce a negative price.
- **Typo tolerance is intentionally limited** — the LLM path handles natural phrasing variation well (e.g. "10 percent" instead of "10%"), but the fallback parser is strict/symbol-based by design, since it has no real language understanding. A misspelled platform name (e.g. "amaazon") is treated as unresolvable rather than guessed at — a wrong guess on pricing data is worse than a clear rejection.
- **PDF layout is a known limitation** — the parser assumes a specific column order (Product, Brand, Platform, Base Price) and Y-coordinate-based row grouping. A differently formatted PDF could produce incorrect results; malformed rows are skipped and flagged rather than silently included.
- **Client-side API key** — the Groq key is a `VITE_` env var, meaning it's bundled into the client build and visible in network requests. This is an accepted tradeoff for this assignment's scope (no backend required per the brief); a production version would route this through a server-side proxy to keep the key private.

## Project Structure

src/
engine/
discountEngine.js ← pure discount logic (untouched by new input paths)
csvParser.js ← CSV → typed objects
LLMParser.js ← Groq API call + validation
nlParser.js ← local regex fallback parser
pdfParser.js ← PDF table extraction
components/
App.jsx ← state orchestration
sample-data/
rules.csv
cart.csv

## Loom Walkthrough

[Add your Loom link here after recording — must be recorded on the live deployment URL above, not localhost]


