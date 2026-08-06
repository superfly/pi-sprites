---
name: sprite-api-gateway
description: Use policy-controlled Sprite Connectors for GitHub, OpenRouter, and custom HTTP APIs without exposing provider tokens. Use when an agent running commands inside a Sprite needs an external API.
---

# Sprite API Gateway

Gateway requests must originate inside a running Sprite. Do not call the gateway from the local Pi process unless its shell tools are currently routed to a selected Sprite.

## Discover connectors

Run inside the Sprite:

```bash
curl -sS https://api.sprites.dev/v1/gateway/list
```

Use the returned `gateway_base_url` and provider-specific usage snippet. Do not guess connector IDs or gateway paths.

If a provider is available but not configured, give the user the returned `setup_url`. If scopes are insufficient, give the returned `request_scopes_url`. Never ask the user to paste the provider token into the Sprite.

## Calling a connector

The gateway URL has this form:

```text
https://api.sprites.dev/v1/gateway/<provider>/<connection-id>/<provider-path>
```

Do not add the provider's authorization header. The gateway authenticates the calling Sprite and attaches the stored credential after evaluating connector access policy.

Treat `403` as a policy or endpoint restriction, and `401` as evidence the call did not originate from a valid Sprite. Do not weaken policy automatically.
