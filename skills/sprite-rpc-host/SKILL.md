---
name: sprite-rpc-host
description: Install and operate a durable Pi RPC-mode service inside a Sprite. Use when Pi sessions need to survive local disconnects or be driven by another application through HTTP and server-sent events.
---

# Pi RPC Host on Sprites

Use `/sprite-rpc install` to install the service and `/sprite-rpc proxy` for local-only access. The proxy exposes:

- `GET /health` — service health.
- `POST /rpc` — one Pi RPC JSON command; returns its correlated response.
- `GET /events` — server-sent Pi events.

The service is not exposed through the Sprite URL by default. If `rpcHost.httpPort` is configured, `PI_SPRITES_RPC_SECRET` (or the configured secret environment variable) must be set first. Do not make an unauthenticated RPC host public.

Pi session files remain on the persistent Sprite filesystem when the service is removed or the Sprite hibernates.
