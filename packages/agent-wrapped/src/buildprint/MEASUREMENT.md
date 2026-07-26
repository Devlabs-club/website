# Buildprint measurement matrix (`buildprint-0.3.0`)

| Fact | Source | Uploaded? | Allowed proof wording |
|---|---|---|---|
| Substantial sessions | Session-like files with length ≥4k, duration ≥15m, or ≥8m + multi-signal | Count only | “N substantial sessions” |
| Project buckets | Hashed parent dirs (`projects/`, `sessions/`) | Count only | “N project buckets” |
| Product-building sessions | FE/product keyword activity in substantial sessions | Count | “Product-building activity appeared in X of Y sessions” |
| Connected FE+BE sessions | Same sample hits frontend + backend terms | Count | “Worked across frontend and backend in N sessions” |
| Systems sessions | DB/infra (or backend-without-FE) activity | Count | “Backend, data, or infrastructure activity appeared in N sessions” |
| Verification sessions | test/build/lint/verify terms in session | Count | “Verification activity appeared in X of Y sessions” |
| Recovery loops | error + fix co-occurrence windows | Count | “N recovery loops detected” |
| Context artifacts | AGENTS.md / rules / settings sources | Boolean/count | “Reusable context artifacts were present” |
| Agents used | Distinct agent families with samples | Count | “N agents used” |

**Never claim in MVP:** completed product surfaces, % of meaningful changes verified, verified fix success rate, time-to-working-output, successful multi-agent synthesis.

**Evidence Strength** describes evidence amount/diversity/reliability — not a universal quality grade.
