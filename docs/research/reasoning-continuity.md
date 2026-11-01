# Carrying the agent's reasoning between steps

Measured on 1 November 2026 with `muse-spark-1.3-contributor`, reasoning effort `low`. This is recommendation 1 of the [agent architecture review](agent-architecture-review.md).

## Question

Between tool steps, the agent forgot its own reasoning. Meta's Chat Completions API cannot carry reasoning across steps for external keys: "each turn reasons from scratch" ([reasoning](https://dev.meta.ai/docs/reasoning)). The Responses API can, in two ways ([Responses](https://dev.meta.ai/docs/protocols/responses)):

- **Stateless encrypted replay** (`store: false`, `include: ["reasoning.encrypted_content"]`). The reasoning comes back encrypted and is sent again with the conversation, and nothing is stored at Meta. Meta recommends this for multi-turn and agentic use.
- **Server-side history** (`previous_response_id`). Meta stores the conversation, and each step sends only what is new.

We built the first. Does it make the agent better, faster or cheaper?

## What changed

- `meta-responses.ts` asks for the encrypted reasoning and keeps it with the reply (`ModelReply.reasoning`). It replays the reasoning before the message or tool call it led to, and sends `store: false`.
- Each turn sends its ID as `prompt_cache_key`, so its steps share Meta's prompt cache.
- Responses is now the default API. `META_AI_API=chat` switches back.

## Results

**Typed requests and voice takes** (`yarn eval:api --confirm --repeats 2`). These are the 13 prompt-rule requests, graded, and the 3 takes with a `truth.json`, each run twice per API:

| | Chat Completions | Responses, reasoning carried |
| --- | --- | --- |
| Typed requests passed | 26/26 | 26/26 |
| Average steps per run | 3.6 | 2.8 |
| Average seconds per run | 19.5 | 11.5 |
| Cost of the 32 runs | $1.20 | $1.08 |

The biggest gains came on turns that took many steps:

- "Repeat two bars" went from 8.5 steps and 27 s to 3.5 steps and 9 s.
- Two voice takes went from 48 s to 20 s, and from 104 s (12 steps) to 29 s (7 steps).
- A few short requests were 1–6 s slower.

The voice takes were run on a blank score with no instruction. Their truth assumes the key, chords and start beat, so both APIs wrote 0–2 of 32 notes "right" on the strict per-beat grade. That measures the setup, not the API. Use the takes here for time and steps only.

**Page reads** (`yarn eval:sheet-agent --only leadsheet,long`, one run each):

| Page | Chat: accuracy, steps, seconds | Responses: accuracy, steps, seconds |
| --- | --- | --- |
| leadsheet | 100% pitch, 100% rhythm, 100% chords; 5 steps, 76 s | same; 6 steps, 54 s |
| long | 92% pitch, 100% rhythm; 8 steps, 225 s | same; 5 steps, 44 s |

## Reading

- **No worse anywhere measured, and faster on most turns.** The gain comes mostly from fewer steps: an agent that remembers its plan wastes fewer calls. Steps that got slower are within the noise of two runs.
- **Cost is about the same or lower.** The replayed reasoning adds input tokens, but they are mostly cached, and fewer steps outweigh them.
- **Limits:** two runs per request, one per page, and one model at low effort. Rerun `yarn eval:api` and the page eval after a model or effort change.
- **Not tried:** server-side history (`previous_response_id`). It would also stop re-sending page images every step, but Meta would keep the conversation. Revisit it only if page reads need it.
