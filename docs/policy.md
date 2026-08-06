# Policies

The policy extension inspects and changes a Sprite's outbound network, Linux privilege, and memory resource policies.

## Commands

```text
/sprite-policy show
/sprite-policy allow <domain>
/sprite-policy deny <domain>
/sprite-policy defaults
/sprite-policy apply
/sprite-policy unrestricted
```

- `show` prints all three policy groups.
- `allow` and `deny` append a domain rule unless the exact rule already exists.
- `defaults` adds the Sprites development-default rule set.
- `apply` replaces configured policy groups with values from `.pi/sprites.json`.
- `unrestricted` clears every network rule after confirmation.

An empty network rule list means unrestricted outbound access; it does not mean deny-all.

## Configuration

```json
{
  "policy": {
    "network": {
      "rules": [
        { "include": "defaults" },
        { "domain": "api.example.com", "action": "allow" },
        { "domain": "telemetry.example.com", "action": "deny" }
      ]
    },
    "privileges": {
      "profile": "standard",
      "noNewPrivileges": true,
      "devices": []
    },
    "resources": {
      "memory": { "limitMB": 2048, "autoscale": true }
    }
  }
}
```

Bootstrap applies these configured policies automatically. Fields that are omitted are not changed.

## Model tool

`sprite_policy` can inspect policies, add an allow or deny domain, include development defaults, or apply configured policy. Clearing all network restrictions remains a confirmed user command.

## Operational notes

Rules are submitted to the Sprites API; `pi-sprites` does not emulate enforcement locally. Applying a configured network policy replaces the current network object, while the interactive `allow`, `deny`, and `defaults` actions append to the current rules.

Test connectivity after tightening network policy, especially before package installation or calls to model providers. Credential-brokered API access can use the bundled `sprite-api-gateway` skill without placing provider credentials in the Sprite.
