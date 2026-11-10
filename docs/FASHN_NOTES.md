# FASHN API notes

Sources read on 9 Nov 2026:

- https://docs.fashn.ai/api-reference/tryon-v1-6
- https://docs.fashn.ai/api-reference/tryon-max
- https://docs.fashn.ai/api-overview/error-handling
- https://docs.fashn.ai/api-overview/webhooks
- https://docs.fashn.ai/sdk/typescript

`https://docs.fashn.ai/llms-full.txt` and `https://docs.fashn.ai/api-overview/rate-limits` were not available (the rate-limits URL returned 404). Numeric limits below are the ones this product must enforce. They come from the build brief, not from a FASHN page I could open.

## Run request

`POST https://api.fashn.ai/v1/run`

Headers:

- `Authorization: Bearer <FASHN_API_KEY>`
- `Content-Type: application/json`

Body (parameters live inside `inputs`, not at the top level):

```json
{
  "model_name": "tryon-v1.6",
  "inputs": {}
}
```

Immediate response:

```json
{ "id": "prediction-id", "error": null }
```

Optional webhook: append `?webhook_url=<absolute url>` on `/v1/run`. FASHN then POSTs the same status payload. Non-2xx responses are retried up to 5 times over about 5 minutes. There is no signature header in the docs, so this backend adds its own `secret` query parameter and checks it.

## Status

`GET https://api.fashn.ai/v1/status/:id`

Documented terminal values: `completed`, `failed`, `canceled`, `time_out`.

Documented in-progress values used by this worker: `starting`, `in_queue`, `processing`.

Completed body:

```json
{
  "id": "...",
  "status": "completed",
  "output": ["https://cdn.fashn.ai/<id>/output_0.png"],
  "error": null
}
```

`output` is an array of CDN URLs, or base64 data URIs when `return_base64` is true. CDN files are deleted after 72 hours (60 minutes if base64). This backend always downloads the first output and stores it locally.

SDK `subscribe` also exposes `creditsUsed` when status is `completed`. The REST status example does not include it. The worker records `creditsUsed` when present, otherwise the published price for the selected model.

## tryon-v1.6 inputs

| Field | Required | Notes |
| --- | --- | --- |
| `model_image` | yes | Person photo. URL or `data:image/...;base64,...` |
| `garment_image` | yes | Garment. URL or data URI |
| `category` | no | `auto` (default), `tops`, `bottoms`, `one-pieces` |
| `segmentation_free` | no | default `true` |
| `moderation_level` | no | `conservative`, `permissive` (default), `none` |
| `garment_photo_type` | no | `auto` (default), `flat-lay`, `model` |
| `mode` | no | `performance`, `balanced` (default), `quality` |
| `seed` | no | default 42, range 0 .. 2^32-1 |
| `num_samples` | no | default 1, range 1..4. Cost is 1 credit per image |
| `output_format` | no | `png` (default) or `jpeg` |
| `return_base64` | no | default false |

Inputs are processed at 864×1296. Typical time: performance ~5s, balanced ~8s, quality ~12–17s.

Saree calls use `category: "one-pieces"`, `garment_photo_type: "flat-lay"`, `mode: "balanced"`, `num_samples: 1`, `output_format: "jpeg"`.

## tryon-max inputs

The garment field name is different.

| Field | Required | Notes |
| --- | --- | --- |
| `product_image` | yes | Product image. URL or data URI |
| `model_image` | yes | Person photo |
| `prompt` | no | styling hint |
| `resolution` | no | `1k` (default), `2k`, `4k` |
| `generation_mode` | no | `fast`, `balanced`, `quality`. Omitted is billed as balanced |
| `seed` | no | default 42 |
| `num_images` | no | default 1, range 1..4. This is not `num_samples` |
| `output_format` | no | `png` or `jpeg` |
| `return_base64` | no | default false |

There is no `category` or `garment_image` on tryon-max.

Input limits: 30 MiB, minimum 15×15, aspect ratio 1:16 to 16:1. Violations return runtime `InputValidationError`.

Credits (per image): fast 1/2/3, balanced 2/3/4, quality 3/4/5 for 1k/2k/4k. This backend uses `resolution: "1k"` and `generation_mode: "balanced"` (2 credits) unless the status payload reports `creditsUsed`.

## Image inputs

Accepted: public `http(s)` URL, or a data URI `data:image/<type>;base64,...`.

Localhost URLs are not reachable by FASHN. This backend sends a public URL only when the storage URL is `http(s)` and not loopback. Portraits are always sent as base64 data URIs. Product images use a public URL when one exists, otherwise base64.

## Errors

API-level (HTTP error, no prediction id):

| HTTP | `error` | Our code | Retry |
| --- | --- | --- | --- |
| 400 | BadRequest | TRYON_UNAVAILABLE | no |
| 401 | UnauthorizedAccess | TRYON_UNAVAILABLE | no |
| 404 | NotFound | TRYON_UNAVAILABLE | no |
| 429 | RateLimitExceeded or ConcurrencyLimitExceeded | TRYON_BUSY | yes |
| 429 | OutOfCredits | TRYON_UNAVAILABLE | no |
| 500 | InternalServerError | TRYON_UNAVAILABLE | yes |

The docs list OutOfCredits as HTTP 429, not 402. The worker also treats HTTP 402 as out of credits (`TRYON_UNAVAILABLE`, no retry).

Runtime (`status: "failed"`, HTTP 200 on the status call). Docs say failed predictions do not consume credits. Do not automatically re-run these:

- `ImageLoadError`, `ContentModerationError`, `InputValidationError`, `PoseError` → `TRYON_BAD_PHOTO`
- `UnavailableError`, `PipelineError`, `ThirdPartyError` → `TRYON_UNAVAILABLE` (single retry of the poll, not a new `/run`, except Pipeline/ThirdParty/Unavailable which may be transient during status polling)

`canceled` and `time_out` are terminal. Our job status uses `timed_out` for FASHN `time_out` and for our own 120s deadline.

## Credits endpoint

`GET https://api.fashn.ai/v1/credits` is not documented on the pages above. The dashboard calls it, caches the JSON for 60 seconds, and treats any failure as "credits unknown" rather than breaking the page. The client accepts `{ credits }` or `{ credits_remaining }`.

## Limits this worker enforces

- At most 6 predictions in flight.
- At most 50 `/v1/run` calls per 60 seconds.
- At most 50 `/v1/status` calls per 10 seconds, with poll spacing starting at 2s and backing off to 5s.

## Logging

Never log the API key, image bytes, data URIs, or full request bodies. Log prediction id, model name, latency, and credit count only.
