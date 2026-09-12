# Server document creation receipts

Migration: `core.0037_server_document_creation`. Apply it before enabling the new Meet minutes delivery client. Existing calls without an idempotency header keep their current response and email behavior.

## Create

`POST /api/v1.0/documents/create-for-owner/` with the existing server-to-server Bearer token and a UUID `Idempotency-Key` header. The body uses the existing trusted `sub`, title and Markdown content fields; optional email/language/message/subject remain part of the frozen request hash. Unknown fields are rejected. Title is limited to 255 characters, content to one million characters and two million UTF-8 bytes.

Keys are scoped to the trusted owner `sub`, not an email address or a rotating bearer token. Persist the exact key, owner and request body before sending. The keyed path suppresses creation email; the calling application's delivery/notification workflow owns notification policy.

| HTTP | Body | Meaning |
| --- | --- | --- |
| 201 | `{"state":"ready","id":"uuid","replayed":false}` | Created and receipt committed |
| 200 | `{"state":"ready","id":"uuid","replayed":true}` | Same request, same document; no content rewrite |
| 409 | `{"state":"processing"}` | Another worker is executing this owner/key |
| 409 | `{"state":"conflict"}` | Key reused with a different validated request |
| 410 | `{"state":"unavailable"}` | Previously created document was deleted or owner access is gone; never recreate automatically |

## Recover a lost response

`GET /api/v1.0/documents/create-for-owner-result/?sub=trusted-owner-sub`, with the same token and `Idempotency-Key` header. This operation does not create users, documents or messages.

Ready/unavailable use the same bodies as above. HTTP 202 with `state=processing` means creation is in flight; HTTP 404 with **`state=not_found`** means no committed receipt and no active creation for that key at the instant of lookup. Retry only with the original payload/key. A generic 404 from an older Docs deployment is **not** evidence of non-creation; clients must validate the response state.

## Consistency and scope

PostgreSQL transaction advisory locks serialize each owner/key without waiting behind conversion requests. The document row, ownership and immutable receipt commit together. Result reads use the same lock to distinguish in-flight work from absence. A unique database constraint provides an additional identity guard. Physical deletion sets the receipt document FK to null and retains the key; soft deletion, transferred ownership and inactive owners are also unavailable.

Receipts retain only the request hash, owner subject, key and document relation. They contain no Markdown, token, media URL or device lease. Successful/state responses are `private, no-store`. Blob storage is not transactionally coupled to PostgreSQL: a failed object upload or later SQL rollback can leave an unreferenced private blob; existing object lifecycle cleanup remains an operator concern. This is not a guarantee of distributed storage atomicity.

Validation: 8 new PostgreSQL tests cover replay, lookup, scoped conflicts, no notification, concurrent POST/GET, rollback, unavailable tombstones, inactive owners and legacy behavior. Seven existing validation/authentication/conversion-failure tests also pass. Conversion and blob writes are mocked; no external document, email or production deployment was performed. Migration state check, Django check and Ruff pass. Meet integration is the next batch.
