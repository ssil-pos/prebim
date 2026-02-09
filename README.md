# prebim

**A web-based bim concept modeler — built with AI as the development engine.**

> Build/Deploy note: This repository is deployed by an AI-assisted pipeline (Moltbot).
> Each deploy is tagged (`deploy-*`) and logged in `DEPLOY_LOG.md` for auditability.

This is **not a Revit or Tekla replacement**.  
`prebim` is a lightweight, open structural modeler for **fast thinking, quick checks, and early-stage exploration** — before committing to heavy BIM workflows.

---

## Why this exists

In real projects, many structural decisions happen **before** detailed BIM modeling:

- quick span / height sanity checks  
- rough quantity and weight estimation  
- comparing multiple layout options  
- explaining structural intent to non-modelers  

These steps are often done with sketches, spreadsheets, or intuition — not because BIM tools are bad, but because they are **too heavy for this phase**.

`prebim` lives exactly in that gap.

---

## What it is

- Web-based structural concept modeler  
- Focused on **steel frames / pipe racks / simple structural systems**
- Designed for **speed, iteration, and disposability**
- Runs in the browser — no installation, no setup

Typical use cases:
- “Does this layout make sense?”
- “What happens if I add one more bay?”
- “How much heavier does this option get?”
- “Can I explain this structure in 30 seconds?”

---

## What it is NOT

- ❌ Not a detailed BIM authoring tool  
- ❌ Not a construction or shop-drawing solution  
- ❌ Not a full MEP modeler  
- ❌ Not meant to replace Revit or Tekla  

Think of `prebim` as a **thinking tool**, not a final deliverable.

---

## AI-first development approach

This project was built with **AI as the primary coding and deployment agent**.

- All coding, refactoring, and deployment were performed through AI
- My role was to:
  - define system boundaries
  - decide what *should* and *should not* be built
  - constrain scope intentionally (e.g. excluding MEP)
  - evaluate correctness, usability, and domain fit

> AI wrote the code.  
> I designed the problem, the constraints, and the decisions.

This repository is as much an **experiment in AI-assisted development** as it is a structural tool.

---

## Philosophy

- Fast over perfect  
- Disposable over precious  
- Concept over detail  
- Human judgment over automation  

If a model is too valuable to delete, it’s probably too early to be in Revit.

---

## Current status

This is an **experimental, evolving project**.
Expect:
- rough edges
- incomplete features
- changing data structures

That is intentional.

---

## License

MIT License

Feel free to use, modify, fork, or build on this project.  
This is shared as an **experiment**, not as a product.

---

## Disclaimer

All outputs are for **conceptual exploration only**.  
Do not use this tool directly for construction, fabrication, or final engineering decisions.
