# Home Network Setup

## Network Equipment

- **Router:** Ubiquiti EdgeRouter X (ER-X, model `ER-e50`) on EdgeOS v3.0.1. `eth0` is the firewalled WAN uplink (DHCP from the ISP); `eth1`–`eth4` are switch ports bridged into `switch0`, which holds the LAN gateway at `192.168.0.2/24`. Hardware offload (`system offload hwnat`) is on and must stay on: without it the ER-X routes in software and tops out near 300 Mbps.
- **Access Points:** TP-Link APs managed via Omada controller (runs in a container when needed). IoT devices are isolated here at the SSID level, not by a router subnet or VLAN. The router runs a single flat LAN (`vlan-aware disable`).
- **Rack:** Half-depth 3U wall-mounted rack, ~1/3 occupied by patch panel and pis.

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

## Stacks

### Network Monitoring

- Pi-hole DNS lookups, not router byte counts: NetFlow cannot be hardware offloaded, and turning `hwnat` off cut LAN throughput to about a third. Router Traffic Analysis was tried and dropped because with `hwnat` on its counters miss nearly all traffic (a 105 MB download counted as about 5 KB).
- The `pihole-collector` container copies Pi-hole's query log into InfluxDB as per-minute lookup counts per device and site, backfilling Pi-hole's 91 days on first start. It shows activity, not data volume.
- Devices are keyed by MAC address. Names come from `homelab.networkMonitoring.deviceNames` (MAC to name) in the user config, else Pi-hole's reported hostname for that device, and the dashboard looks them up at query time, so a rename applies to all history. Pi-hole only keeps when each device was last seen at each IP, so the MAC behind older lookups is an estimate, and lookups it can't place show as IPs.
- Dashboard queries stick to storage-side functions (`sum`, `count`, `aggregateWindow`). Per-point functions like `difference` and `map` on raw data time out on the Pi. Names are applied by renaming pivoted columns, since a per-row lookup (`join`, or `map` with a `dict`) takes about 20 s on the Pi. Whenever making changes to the dashboard, make sure to see how it actually performs. It is really easy to over-stress the PI.
- InfluxDB 2.x, not 3.x: InfluxDB 3 Core (the free 3.x line) is built for recent data and caps a single query near 72 hours, since the compaction that lifts the cap is Enterprise only. Activity history wants days and weeks, so 2.x is the fit, and it is lighter on 1GB of RAM. The image is pinned to `influxdb:2` because the `latest` tag switches to 3 Core on 2026-09-15.
