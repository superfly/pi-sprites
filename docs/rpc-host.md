# Durable Pi RPC host

The RPC-host extension installs Pi RPC mode as a managed Sprite service. It provides a durable remote agent process that can be reached through a local TCP proxy or, when explicitly configured, the Sprite's HTTP routing.

## Commands

```text
/sprite-rpc status
/sprite-rpc install
/sprite-rpc proxy [local-port]
/sprite-rpc remove
```

- `install` ensures Pi is available, uploads the bundled host script, and creates or replaces the `pi-rpc-host` service.
- `status` reports service state and internal port.
- `proxy` creates a session-scoped local TCP proxy.
- `remove` deletes the service definition after confirmation but leaves Pi session data on disk.

The `sprite_rpc_host` model tool can inspect, install, or proxy the host. Removal remains a confirmed user command.

## HTTP interface

The bundled service exposes:

- `GET /health`
- `POST /rpc`
- `GET /events` for server-sent events

The host translates HTTP requests to Pi's JSON-line RPC process. Create a local connection with:

```text
/sprite-rpc install
/sprite-rpc proxy
```

By default this is available only through the local proxy.

## Configuration

```json
{
  "rpcHost": {
    "port": 43120,
    "localPort": 43120,
    "piCommand": "pi",
    "secretEnv": "PI_SPRITES_RPC_SECRET"
  }
}
```

- `port`: internal service port, default `43120`.
- `localPort`: preferred local proxy port. Use `0` to choose a free port.
- `piCommand`: executable used inside the Sprite. If it is not found, install attempts `npm install -g @earendil-works/pi-coding-agent`.
- `httpPort`: optional Sprite HTTP port declaration. Omitted by default.
- `secretEnv`: local environment variable containing the bearer secret, default `PI_SPRITES_RPC_SECRET`.

## Public HTTP safety

Setting `httpPort` opts into Sprite HTTP routing. Installation then requires the environment variable named by `secretEnv` and passes its value to the remote service as `PI_SPRITES_RPC_SECRET`. Clients must send:

```text
Authorization: Bearer <secret>
```

The secret is copied into this service only when HTTP exposure is configured. Rotate it by changing the local value and running `/sprite-rpc install` again.

The local proxy itself does not add authentication. Treat its listening address as access to the Pi session and close the Pi session when the proxy is no longer needed.
