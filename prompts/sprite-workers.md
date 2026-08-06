---
description: Split independent work across persistent Sprite workers and synthesize results
---

Decompose the request into independent, bounded worker tasks. Run them through the Sprite worker pool with conservative concurrency, then synthesize agreements, conflicts, failures, and concrete next actions. Preserve worker environments unless cleanup is configured.
