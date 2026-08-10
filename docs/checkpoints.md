# Transactional checkpoints

The checkpoints extension captures a Sprite's filesystem state before risky work, creates named checkpoints on demand, and restores earlier state with explicit user confirmation.

Checkpoints include the filesystem, installed packages, configuration, and on-disk databases. They do not capture running processes, memory, or open network connections.

## Commands

```text
/sprite-checkpoint [comment]
/sprite-checkpoints
/sprite-restore <checkpoint-id>
/sprite-undo
```

- `/sprite-checkpoint` creates a checkpoint and remembers its ID for this Pi session.
- `/sprite-checkpoints` lists checkpoints newest first.
- `/sprite-restore` restores a specific checkpoint after confirmation.
- `/sprite-undo` restores the latest checkpoint created by this extension in the current session, also after confirmation.

A selected Sprite is required unless Pi itself is running inside a Sprite, where the extension uses `sprite-env`.

## Automatic safety checkpoints

```json
{
  "checkpoint": { "mode": "risky" }
}
```

Modes are:

- `off`: no automatic checkpoints.
- `risky` (default): once per turn, before the first write, edit, recognized destructive shell command, or service, policy, or RPC-host model-tool call. Those three model tools are conservatively treated as risky for every action, including inspection.
- `turn`: once per turn before the first tool call, whether or not that tool is expected to mutate state.

If a required automatic checkpoint fails, the mutation is blocked rather than allowed to continue without a recovery point.

Bootstrap, CI, and worker tool calls do not checkpoint the user's selected Sprite because those operations use separately provisioned Sprite handles.

## Model tool

`sprite_checkpoint` can create, list, or inspect checkpoints. Restore is deliberately unavailable to the model and remains a confirmed user command.

## Limitations

Checkpoint deletion and filesystem diff are not implemented. The installed public JavaScript SDK does not expose those operations, and implementing them would require a hand-written API call or an unstable on-disk layout. `pi-sprites` avoids both.

Restoring may terminate active processes and sessions. Services should restart according to the Sprite service manager, but arbitrary foreground processes will not be recreated.
