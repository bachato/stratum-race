# StratumRace Pool Stats API Specification

## Overview

StratumRace collects and displays pool statistics for every pool in its directory.
To have your pool's stats (hashrate, users, workers, device types) displayed on
stratumrace.com, expose a single JSON endpoint that StratumRace can poll every
5 minutes.

## How to Get Listed

1. Expose a public JSON endpoint matching this spec (no auth required)
2. Open an issue at [github.com/proofofmike/stratum-race/issues](https://github.com/proofofmike/stratum-race/issues) with:
   - Pool name and website
   - Stratum host and port
   - Stats API endpoint URL
   - Payout type and fee
3. StratumRace will add your pool to the directory

## Endpoint Requirements

- Must be reachable via HTTPS (HTTP accepted but not recommended)
- Must respond within 10 seconds
- Must return valid JSON with `Content-Type: application/json`
- No authentication required (public endpoint)
- Polled every 5 minutes from AWS us-east-1

## Response Format

### Tier 1 — Required Fields

These fields are required for your pool's stats to be displayed:

```json
{
  "timestamp": 1785686370,
  "poolHashrate": {
    "value": 1.7983e16,
    "formatted": "17.98 PH/s"
  },
  "activeUsers": 1118
}
```

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | number | Unix epoch (seconds) when this data was generated |
| `poolHashrate.value` | number | Current pool hashrate in H/s (raw numeric) |
| `poolHashrate.formatted` | string | Human-readable hashrate string |
| `activeUsers` | number | Number of unique users currently mining |

### Tier 2 — Optional Fields

These fields are shown if present but not required:

```json
{
  "timestamp": 1785686370,
  "poolHashrate": {
    "value": 1.7983e16,
    "formatted": "17.98 PH/s"
  },
  "activeUsers": 1118,
  "activeWorkers": 2001,
  "poolFee": 1.5,
  "minerTypes": [
    {
      "device": "Bitaxe",
      "workers": 16225,
      "hashrate": {
        "value": 1.78e16,
        "formatted": "17.8 PH/s"
      },
      "bestDifficulty": {
        "value": 3.241e10,
        "formatted": "32.41G"
      }
    },
    {
      "device": "NerdQAxe++",
      "workers": 428,
      "hashrate": {
        "value": 2.11e15,
        "formatted": "2.11 PH/s"
      },
      "bestDifficulty": {
        "value": 8.15e9,
        "formatted": "8.15G"
      }
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `activeWorkers` | number | Total connected workers (devices) |
| `poolFee` | number | Pool fee as a percentage (e.g. 1.5 = 1.5%) |
| `minerTypes` | array | Device type breakdown (see below) |
| `minerTypes[].device` | string | Normalized device name (e.g. "Bitaxe", "S21", "cgminer") |
| `minerTypes[].workers` | number | Number of workers of this type |
| `minerTypes[].hashrate.value` | number | Combined hashrate for this device type in H/s |
| `minerTypes[].hashrate.formatted` | string | Human-readable hashrate |
| `minerTypes[].bestDifficulty.value` | number | Best share difficulty submitted by this device type |
| `minerTypes[].bestDifficulty.formatted` | string | Human-readable difficulty |

## Notes

- `poolHashrate.value` must be in raw H/s (not TH/s or PH/s) for accurate
  calculations (expected time to block, etc.)
- `minerTypes` should be sorted by hashrate descending
- `minerTypes` should group by normalized device name, not raw user-agent string
  (e.g. all Bitaxe firmware versions grouped under "Bitaxe")
- `bestDifficulty` is optional within each miner type entry
- Top 10-15 device types is sufficient; no need to list every variant

## Existing Formats We Support

If your pool already exposes stats in one of these formats, we can ingest it
without changes:

| Format | Used by | Notes |
|--------|---------|-------|
| ckpool multi-line JSON | CKPool, HeliosPool, Braiins Solo | `pool.status` endpoint |
| Public Pool `/api/info` | Public Pool, SoloMining DE, BitcoinMerch | userAgents array |
| 2Miners `/api/stats` | 2Miners (all regions) | Raw H/s hashrate |
| Custom JSON | AtlasPool, SoloFury, BlitzPool | Various formats |

If your format isn't listed, either adopt the standard format above or
let us know in your GitHub issue and we'll write a parser.

## What StratumRace Does NOT Verify

StratumRace displays pool-reported stats as-is with clear attribution:

> "Pool stats are sourced directly from the pool's own reporting.
> StratumRace collects and displays this data but cannot independently verify it."

The only data StratumRace independently verifies is:
- **Validation status** — is the pool delivering work on the correct prevhash?
- **Block notification speed** — how quickly does the pool send new templates?

These are measured by StratumRace's own infrastructure and cannot be
influenced by pool-reported data.

## Questions?

Open an issue at [github.com/proofofmike/stratum-race](https://github.com/proofofmike/stratum-race/issues)
or contact @proofofmike.
