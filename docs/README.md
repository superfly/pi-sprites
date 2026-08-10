# Extension guide

`pi-sprites` is one Pi package containing eight independently filterable extensions. This directory documents what each extension does, when to use it, its commands and model-facing tool, relevant configuration, and important limitations.

| Extension | Purpose |
|---|---|
| [Core remote environment](./core.md) | Select Sprites and route Pi's native filesystem and shell tools into one. |
| [Transactional checkpoints](./checkpoints.md) | Create safety checkpoints and restore filesystem state. |
| [Services](./services.md) | Manage durable processes that survive disconnects and restart after failures. |
| [Policies](./policy.md) | Inspect and apply network, privilege, and resource policies. |
| [Reproducible bootstrap](./bootstrap.md) | Create or converge a Sprite from trusted project configuration. |
| [Retained CI](./ci.md) | Run CI in an isolated Sprite and keep failures for investigation. |
| [Worker pool](./workers.md) | Fan shell jobs or Pi prompts out across isolated Sprites. |
| [Durable Pi RPC host](./rpc-host.md) | Run Pi RPC mode as a Sprite service and connect through HTTP/SSE. |

Testing guides:

- [Automated testing](./automated-testing.md)
- [Manual test plan](./manual-test-plan.md)
- [Release process](./releasing.md)

## How Pi treats these files

Pi packages have runtime resource types for extensions, skills, prompts, and themes. There is no separate documentation resource type. These Markdown files are shipped with the package and linked from the top-level README, but are deliberately absent from the `pi` manifest. Pi therefore does not load them as prompts or place them in model context. See Pi's [package documentation](https://pi.dev/docs/latest/packages) for the resource and filtering model.

Commands beginning with `/sprite-` are always available when their extension is loaded and are initiated by the user. Tools named `sprite_*` are callable by the model. With the default `toolActivation: "auto"`, those model tools become active only after a Sprite is selected or when Pi itself is running inside a Sprite. See [Core remote environment](./core.md#model-tool-activation) for the other activation modes.

## Shared prerequisites

- Node.js 24 or later.
- A Sprites token in `SPRITES_TOKEN`, `SPRITE_TOKEN`, or the variable named by `tokenEnv`.
- A selected or configured Sprite for extensions that operate on the current environment. Checkpoints can also use `sprite-env` when Pi itself runs inside a Sprite. Bootstrap, CI, and workers can provision explicitly named Sprites without changing the user's selection.
- Project trust before `.pi/sprites.json` or `.pi/sprites.local.json` is honored. Global `~/.pi/agent/sprites.json` remains available outside a trusted project. Add `.pi/sprites.local.json` to the consuming project's `.gitignore` before using it for local-only values.

Start with the configuration template at [`templates/sprites.json`](../templates/sprites.json).

## Filtering extensions

Pi package filters can narrow the extension list. For example, this entry in the project's `.pi/settings.json` keeps only core routing and checkpoints for the current Git installation:

```json
{
  "packages": [
    {
      "source": "git:github.com/superfly/pi-sprites",
      "extensions": [
        "+extensions/core.ts",
        "+extensions/checkpoints.ts"
      ]
    }
  ]
}
```

Keep `core.ts` when you want native `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls` routing or interactive selection. Other modules initialize configuration and cleanup independently and can use a Sprite named in configuration. The checkpoints module also has an inside-Sprite `sprite-env` path.
