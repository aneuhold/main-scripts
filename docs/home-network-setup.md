# Home Network Setup

## Network Equipment

- **Router:** Ubiquiti EdgeRouter X
- **Access Points:** TP-Link APs managed via Omada controller (runs in a container when needed)
- **Rack:** Half-depth 3U wall-mounted rack, ~1/6 occupied by a patch panel
- **Networks:** IoT devices are on a separate network from the primary WiFi

## Hardware Inventory

| Device           | Hostname      | Role                          | Status |
| ---------------- | ------------- | ----------------------------- | ------ |
| Raspberry Pi 3B+ | `pi3-bplus-1` | Primary monitoring server     | Ready  |
| Raspberry Pi 3B  | `pi3-b-1`     | Cold spare / Pi-hole failover | Ready  |

## SSH Access

- Both `pi3-bplus-1` and `pi3-b-1` are configured for key-based SSH only
- The SSH key lives on the **MacBook Pro M2** at `~/.ssh/id_ed25519`
- Access from any other machine requires adding a new key using that original machine.
