# Home Network Security Monitoring Plan

## Current Network Setup

See [home-network-setup.md](./home-network-setup.md) for hardware inventory and SSH access details.

- **Router:** Ubiquiti EdgeRouter X (SSH access preferred)
- **Access Points:** TP-Link APs managed via Omada controller (runs in a container when needed)
- **Network separation:** IoT devices are on a separate network from the primary WiFi — this is a meaningful security boundary since cross-network traffic must be routed through the EdgeRouter and is therefore visible to monitoring

## Goals

- Detect devices phoning home to suspicious IPs or domains
- Detect known bad traffic patterns (C2 communication, malware signatures)
- Monitor for unusual outbound connections (odd hours, unusual volumes)
- Detect lateral movement — particularly IoT devices probing the main network

## Key Architectural Decisions

### Single Pi approach

Run everything on the **Pi 3B+** (slightly faster, 1GB RAM). The Pi 3B sits powered off as a cold spare — most importantly as a Pi-hole failover, since if the monitoring Pi goes down and all DNS is pointed at it, the whole network loses DNS resolution.

### Why the Omada APs don't add monitoring value

The Omada controller only exposes management-level stats (client counts, traffic volume totals). It cannot export flow data or per-connection details. This doesn't matter: all internet-bound traffic from wireless devices still passes through the EdgeRouter, so NetFlow on the router captures everything — wired and wireless alike.

### What the EdgeRouter can and cannot see

**Can see (via NetFlow):**
- All traffic between devices and the internet
- All cross-network traffic (IoT network ↔ main network) since it must be routed

**Cannot see (Layer 2, never hits the router CPU):**
- Two devices on the same subnet talking directly to each other

Lateral movement at the LAN-to-LAN level requires a managed switch with port mirroring to observe. This is deferred — a managed switch can be added later and Suricata can be introduced at that point.

## Planned Stack (Single Pi 3B+, Docker Compose)

| Component | Purpose |
|---|---|
| **Pi-hole** | DNS server for all networks; logs every domain query from every device with timestamps |
| **ntopng Community** | Receives NetFlow from EdgeRouter; visualizes every connection (src, dst, port, bytes, duration); has built-in threat feed integration |
| **Grafana Loki** | Lightweight log storage for syslog forwarded from the EdgeRouter |
| **Grafana** | Dashboard layer over Loki for visualizing router events, firewall hits, DHCP leases |

All four run as Docker containers managed by a single Docker Compose file on the Pi 3B+.

## EdgeRouter Configuration Needed

Three exports to configure via SSH:

1. **NetFlow export** → Pi 3B+ IP (consumed by ntopng)
2. **Syslog forwarding** → Pi 3B+ IP (consumed by Loki)
3. **DHCP DNS option** → point all devices on both networks at Pi-hole for DNS

## What This Stack Detects

- Any device querying a suspicious domain (Pi-hole logs + threat feed blocklists)
- Outbound connections to known-bad IPs (ntopng threat feeds)
- Unusual traffic patterns by time of day or volume (ntopng)
- IoT devices attempting to reach the main network (NetFlow cross-network flows)
- Router-level events: firewall blocks, auth attempts, new DHCP leases (Grafana/Loki)

## What It Does Not Detect (Yet)

- Device-to-device traffic on the same subnet (requires managed switch + port mirror + Suricata)

## Next Steps

1. ~~Source a **Samsung Pro Endurance 32GB micro SD** for `pi3-bplus-1`~~ ✓
2. ~~Flash **Raspberry Pi OS Lite** via Raspberry Pi Imager — pre-configure hostname, SSH key (from MacBook Pro M2), enable SSH, skip desktop~~ ✓ (done for both `pi3-bplus-1` and `pi3-b-1`)
3. Mount both Pis in a **UCTRONICS 1U rack bracket** in the wall rack
4. Boot `pi3-bplus-1`, SSH in from MacBook Pro M2, install Docker
5. Write Docker Compose config for Pi-hole + ntopng + Loki + Grafana
6. Configure EdgeRouter via SSH: NetFlow export, syslog forwarding, DHCP DNS → Pi-hole
