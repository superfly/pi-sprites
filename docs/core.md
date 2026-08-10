# Core remote environment

The core extension selects the Sprite that represents the user's current workspace and routes Pi's native tools into it. It also provides Sprite lifecycle, exec-session, and local TCP proxy commands.

## What changes after selection

After `/sprite-use` or `/sprite-new`, these normal Pi operations target `remoteCwd` in the selected Sprite:

- `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls`
- interactive `!` shell commands
- the working-directory line added to the agent's system prompt

`/sprite-local` returns those operations to the machine running Pi. When a Pi session starts, resumes, forks, or is replaced, transient selection resets and configuration is reapplied; a configured `sprite` may therefore become selected again. Open proxies and last-checkpoint state are cleared between sessions.

## Commands

```text
/sprite status
/sprite list
/sprite use <name> [remote-cwd]
/sprite new <name>
/sprite local
/sprite sessions
/sprite sessions kill <session-id>
/sprite proxy <remote-port> [local-port]
/sprite destroy <name>
```

Convenience aliases are also available:

```text
/sprite-use <name> [remote-cwd]
/sprite-new <name>
/sprite-local
/sprite-proxy <remote-port> [local-port]
/sprite-destroy <name>
```

Passing local port `0` asks the operating system to choose a free port. Destroy always asks for confirmation. A proxy lasts only for the current Pi session.

## Startup flags

```bash
pi --sprite pi-my-project --sprite-cwd /workspace/my-project
pi --sprite-local
```

`--sprite-local` overrides a configured Sprite for that run.

## Model tool

`sprite_manage` lets the model inspect status, list Sprites, create or select one, return to local mode, and list or kill exec sessions. Permanent destruction and TCP proxy creation remain user commands.

### Model-tool activation

The `toolActivation` setting controls all eight `sprite_*` tools in this package:

- `auto` (default): activate them after a Sprite is selected or when Pi runs inside a Sprite.
- `always`: keep them available even while native tools are local. This is useful when the model should provision bootstrap, CI, or workers itself.
- `off`: never expose them to the model. User commands still work.

The setting does not disable Pi's normal filesystem tools; it only changes whether the additional `sprite_*` tools are offered to the model.

## Configuration

```json
{
  "mode": "auto",
  "sprite": "pi-my-project",
  "remoteCwd": "/workspace/my-project",
  "baseURL": "https://api.sprites.dev",
  "tokenEnv": "SPRITES_TOKEN",
  "toolActivation": "auto"
}
```

- `mode`: `local` always keeps native tools on the Pi host; `remote` routes them when a Sprite is selected, including when Pi itself runs inside a Sprite; `auto` routes to a selected Sprite only when Pi is running outside one.
- `sprite`: initial configured Sprite name.
- `remoteCwd`: workspace directory inside the Sprite; otherwise `/workspace/<local-project-name>`.
- `baseURL`: optional Sprites API endpoint override.
- `tokenEnv`: preferred token variable. When it is unset, `SPRITES_TOKEN` and then `SPRITE_TOKEN` are checked as fallbacks.
- `toolActivation`: `auto`, `always`, or `off`.

## Example

```text
/sprite list
/sprite-use pi-my-project /workspace/my-project
!pwd
/sprite-proxy 3000 0
/sprite-local
```

Selecting a Sprite does not create or clone a project. Use [bootstrap](./bootstrap.md) for that workflow.
