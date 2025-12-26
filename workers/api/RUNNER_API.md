# Design Run Runner API

This document describes the runner API endpoints for design run execution and callbacks.

## Overview

The runner API allows external job runners (e.g., Daytona workspaces) to update the status, events, and artifacts of design runs. Runner authentication uses a shared bearer secret (`RUNNER_AUTH_SECRET`).

## Authentication

All runner endpoints require Bearer token authentication:

```
Authorization: Bearer <RUNNER_AUTH_SECRET>
```

The `RUNNER_AUTH_SECRET` must be configured in the worker environment variables and provided to the runner.

## Endpoints

### Update Run Status

Updates the status of a design run.

**Endpoint:** `POST /api/runner/runs/:runId/status`

**Request Body:**
```json
{
  "status": "running" | "completed" | "failed" | "cancelled", // optional when only updating progress
  "progress": 0.42,                                                // optional (0-1)
  "error": "optional error message"
}
```

**Response:**
```json
{
  "ok": true
}
```

**Status Codes:**
- `200` - Status updated successfully
- `400` - Invalid status or request body
- `401` - Unauthorized (invalid or missing auth token)
- `404` - Run not found
- `503` - Database not available

**Notes:**
- Provide either `status`, `progress`, or both. Progress is clamped between 0 and 1.
- When status is set to `running`, `started_at` is set (if not already set).
- When status is set to `completed`, `failed`, or `cancelled`, `completed_at` is set and `progress` defaults to `1` if not provided.

### Add Run Event

Adds an event/log entry to a design run.

**Endpoint:** `POST /api/runner/runs/:runId/events`

**Request Body:**
```json
{
  "eventType": "string (required)",
  "message": "optional message",
  "metadata": {
    "optional": "metadata object"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "eventId": "uuid"
}
```

**Status Codes:**
- `200` - Event added successfully
- `400` - Missing eventType or invalid request body
- `401` - Unauthorized
- `404` - Run not found
- `503` - Database not available

**Notes:**
- You can send a single event or `{ "events": [ ... ] }` to batch insert multiple entries in one request.

**Example Event Types:**
- `agent.start`
- `agent.progress`
- `agent.tool_use`
- `agent.complete`
- `error`
- `warning`

### Add Run Artifact

Adds an artifact reference to a design run. Artifacts are stored in R2 and referenced here.

**Endpoint:** `POST /api/runner/runs/:runId/artifacts`

**Request Body:**
```json
{
  "artifactType": "string (required)",
  "storageKey": "string (required) - R2 object key",
  "contentType": "optional MIME type",
  "sizeBytes": 12345,
  "metadata": {
    "optional": "metadata object"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "artifactId": "uuid"
}
```

**Status Codes:**
- `200` - Artifact added successfully
- `400` - Missing required fields or invalid request body
- `401` - Unauthorized
- `404` - Run not found
- `503` - Database not available

**Notes:**
- Supports JSON payloads (artifact already uploaded elsewhere) or `multipart/form-data` with `file`, `artifactType`, optional `metadata`, `storageKey`, and `contentType`. Multipart uploads store the file in the worker's R2 bucket before registering the artifact row.

**Example Artifact Types:**
- `source_code`
- `build_output`
- `screenshot`
- `report`
- `design_system`

## Daytona Integration

When a design run is created via `POST /api/design/runs`, the worker automatically triggers a Daytona job by calling the Daytona API:

**Daytona Job Request:**
```json
{
  "runId": "uuid",
  "accountId": "account-id",
  "prompt": "user prompt",
  "config": { },
  "callbackUrl": "https://worker.example.com/api/runner/runs/:runId",
  "runnerSecret": "<RUNNER_AUTH_SECRET>"
}
```

The Daytona runner should:
1. Start the workspace and execute the design run
2. Update status to `running` via `POST /api/runner/runs/:runId/status`
3. Add events during execution via `POST /api/runner/runs/:runId/events`
4. Upload artifacts to R2 and register them via `POST /api/runner/runs/:runId/artifacts`
5. Update final status to `completed` or `failed`

Use `Authorization: Bearer <runnerToken>` for all callbacks. For legacy setups, the raw `RUNNER_AUTH_SECRET` is also accepted as the bearer token.

## Configuration

### Environment Variables

**Required for runner endpoints:**
- `RUNNER_AUTH_SECRET` - Shared secret used to sign/verify runner JWTs (also accepted directly as a legacy bearer token)

**Required for Daytona triggering:**
- `DAYTONA_API_URL` - Daytona API base URL (e.g., `https://daytona.example.com/api`)
- `DAYTONA_API_KEY` - API key for authenticating with Daytona
- `EXPO_PUBLIC_WORKER_ORIGIN` - Worker origin for callback URLs

### Configuration Files

Add to `workers/api/.dev.vars`:
```bash
RUNNER_AUTH_SECRET=your-secure-runner-secret-change-in-production
DAYTONA_API_URL=https://daytona.example.com/api
DAYTONA_API_KEY=your-daytona-api-key
```

Add to `wrangler.toml` (or use wrangler secrets for production):
```toml
[vars]
# Uncomment for production:
# RUNNER_AUTH_SECRET = "your-secure-secret"
# DAYTONA_API_URL = "https://daytona.example.com/api"
# DAYTONA_API_KEY = "your-api-key"
```

## User-Facing Endpoints

Users with authenticated sessions can access their design runs via:

- `GET /api/design/runs` - List runs for their account
- `POST /api/design/runs` - Create a new design run (triggers Daytona)
- `GET /api/design/runs/:runId` - Get run details
- `GET /api/design/runs/:runId/events` - Get run events
- `GET /api/design/runs/:runId/artifacts` - Get run artifacts
- `DELETE /api/design/runs/:runId` - Delete a run

All user endpoints require Better Auth session cookie authentication under `/api/*`.

## Security Notes

1. Runner endpoints are under `/api/runner/*` and use Bearer token auth (not session cookies)
2. User endpoints are under `/api/design/*` and use session cookie auth
3. The `RUNNER_AUTH_SECRET` should be a strong random secret (32+ characters)
4. In production, use Wrangler secrets instead of plaintext vars for sensitive data
5. The Daytona trigger is fire-and-forget (non-blocking) to avoid request timeouts
6. Runner tokens expire after ~24h; request a fresh `runnerToken` if a job is long-lived
