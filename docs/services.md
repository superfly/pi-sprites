# Services

The services extension manages long-running processes through the Sprite service manager. Services are a better fit than foreground shell commands for dev servers, databases, agents, and daemons that should survive a disconnect or restart after failure.

## Commands

```text
/sprite-services
/sprite-service list
/sprite-service get <name>
/sprite-service create <name> <command> [args...]
/sprite-service start <name>
/sprite-service stop <name>
/sprite-service restart <name>
/sprite-service logs <name> [lines]
/sprite-service delete <name>
/sprite-service reconcile
```

The short `create` command uses the selected `remoteCwd` as the service directory. Use project configuration or the model tool when a service needs environment variables, dependencies, or an HTTP port. Delete asks for confirmation and removes the service definition; logs remain on disk.

## Declaring services

Services live under `bootstrap.services` because bootstrap reconciles them as part of creating an environment:

```json
{
  "bootstrap": {
    "services": [
      {
        "name": "web",
        "cmd": "npm",
        "args": ["run", "dev"],
        "dir": "/workspace/my-project",
        "env": { "NODE_ENV": "development" },
        "needs": [],
        "httpPort": 3000,
        "duration": "10s"
      }
    ]
  }
}
```

`/sprite-service reconcile` creates missing configured services. Existing services with the same name are left unchanged; reconciliation does not update or delete them.

`httpPort` exposes the service through the Sprite's HTTP routing. Omit it when the service should be reachable only inside the Sprite or through `/sprite-proxy`.

## Model tool

`sprite_service` can list, inspect, create, start, stop, restart, read logs, and reconcile services. Its create action accepts `command`, `args`, `dir`, `env`, `needs`, and `httpPort`. Service deletion remains a confirmed user command.

## Example

```text
/sprite-service create web npm run dev
/sprite-service logs web 200
/sprite-proxy 3000 3000
/sprite-service restart web
```

This extension operates on the selected or configured Sprite and does not itself select one.
