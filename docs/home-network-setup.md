# Home Network Setup

## Network Equipment

- **Router:** Ubiquiti EdgeRouter X (ER-X, model `ER-e50`) on EdgeOS v3.0.1. `eth0` is the firewalled WAN uplink (DHCP from the ISP); `eth1`–`eth4` are switch ports bridged into `switch0`, which holds the LAN gateway at `192.168.0.2/24`. Hardware offload (`system offload hwnat`) is on, so flow-accounting undercounts forwarded traffic until it is disabled.
- **Access Points:** TP-Link APs managed via Omada controller (runs in a container when needed). IoT devices are isolated here at the SSID level, not by a router subnet or VLAN. The router runs a single flat LAN (`vlan-aware disable`).
- **Rack:** Half-depth 3U wall-mounted rack, ~1/6 occupied by a patch panel.

## Addressing

- One DHCP network: `shared-network-name LAN`, subnet `192.168.0.0/24`, pool `192.168.0.38`–`.243`, plus static mappings (cameras, Pis, etc.).
- The router resolves DNS itself (dnsmasq on `switch0`) and hands its own `192.168.0.2` out as the DHCP DNS server by default. The `router-dns` deployable repoints that at the Pi-hole host.

## Hardware Inventory

| Device           | Hostname      | Role                          | Status | Power               |
| ---------------- | ------------- | ----------------------------- | ------ | ------------------- |
| Raspberry Pi 3B+ | `pi3-bplus-1` | Primary monitoring server     | Ready  | 5V/3A via micro USB |
| Raspberry Pi 3B  | `pi3-b-1`     | Cold spare / Pi-hole failover | Ready  | 5V/3A via micro USB |

## SSH Access

- The Pis and the router are key-based SSH only. The key lives on the **MacBook Pro M2** at `~/.ssh/id_ed25519`; access from any other machine requires adding a new key from that one.
- The router is reached at `192.168.0.2`. Its EdgeOS login user can be overridden per machine via `homelab.machineCreds` in the user config, keyed by machine identifier (e.g. `edgerouter-x`).
