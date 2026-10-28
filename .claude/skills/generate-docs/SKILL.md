---
name: generate-docs
description: Analyzes recent git changes or specific files to automatically write clear, human-readable feature documentation and saves it to the docs/features/ directory.
---

## Objective
Automatically document completed features by inspecting actual code modifications. The output must look like it was written by an experienced human developer for their team—clear, punchy, and completely free of robotic AI fluff.

## Human-Readable Style Guide
- **Skip the Filler:** Avoid introductory paragraphs like "In this document, we will look at..." or generic summary conclusions. Start directly with the core technical headers.
- **Active Voice Only:** Write conversationally and directly (e.g., "The API validates the payload" instead of "The payload is validated by the API").
- **Keep it Scannable:** Use bold text for key variables/files and stick to short, 2-3 sentence paragraphs so team members can digest it at a glance.

## Execution Steps
1. Run `git status` and `git diff` (or check the last commit) to analyze changes across frontend, backend, or AI modules.
2. Draft the documentation and save it directly as a Markdown file inside `docs/features/<feature-name>.md`. Create missing folders if necessary.

## Documentation Template
- # [Feature Name] (Descriptive and brief)
- ## Why This Matters (1-2 sentences on the core business problem this feature solves)
- ## How It Works (A clear, step-by-step linear walkthrough tracking how data moves through the feature)
- ## Code Breakdown
  - **Frontend:** Components changed, state management hooks, or props introduced.
  - **Backend:** Endpoints exposed/modified, payload structures, and validation middleware.
  - **AI Pipeline:** (If applicable) Prompts tweaked, agentic tools utilized, or RAG connections made.
- ## DB & State Changes (Schema updates, migrations, or cache modifications)
- ## Local Verification (Quick bullet points detailing exactly how a dev can test this feature locally)

Once the file is written, respond with a simple two-line confirmation showing where the file was saved.
