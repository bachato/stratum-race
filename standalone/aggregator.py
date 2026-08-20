"""Background aggregator: race stats + pool stats polling."""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from lib.aggregation import run_all_aggregations
from lib.local_store import LocalStorage
from lib.pool_stats import (
    fetch_pool_stats,
    compute_validation_status,
    append_snapshot,
    build_pool_stats_latest,
    fetch_pool_blocks,
)

logger = logging.getLogger(__name__)

STARTUP_DELAY_S = 10  # Run fairly quickly after start (well within 30s requirement)
CYCLE_INTERVAL_S = 300  # Every 5 minutes


async def aggregator_loop(
    storage: LocalStorage,
    stop: asyncio.Event,
    trigger: asyncio.Event | None = None,
) -> None:

    # Initial delay before first cycle (within 30s requirement)
    try:
        await asyncio.wait_for(stop.wait(), timeout=STARTUP_DELAY_S)
        return  # Stop was signaled during startup delay
    except asyncio.TimeoutError:
        pass  # Normal — startup delay elapsed, proceed

    while not stop.is_set():
        try:
            now = datetime.now(timezone.utc)
            logger.info("Aggregation cycle starting at %s", now.strftime("%H:%M:%S"))
            run_all_aggregations(storage, now)
            logger.info("Aggregation cycle complete")
        except Exception:
            logger.exception("Aggregation cycle failed — will retry next cycle")

        # Poll pool stats (hashrate, validation, blocks)
        try:
            await poll_pool_stats(storage)
        except Exception:
            logger.exception("Pool stats polling failed — will retry next cycle")

        # Clear the trigger so we can detect new races during the wait
        if trigger is not None:
            trigger.clear()

        # Wait for either: stop signal, trigger (new race), or 5-min timeout
        try:
            if trigger is not None:
                # Wait for whichever comes first: stop, trigger, or timeout
                done, _ = await asyncio.wait(
                    [
                        asyncio.create_task(stop.wait()),
                        asyncio.create_task(trigger.wait()),
                    ],
                    timeout=CYCLE_INTERVAL_S,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                # Cancel pending tasks from the wait set
                for task in _:
                    task.cancel()
                if stop.is_set():
                    return
            else:
                await asyncio.wait_for(stop.wait(), timeout=CYCLE_INTERVAL_S)
                return  # Stop was signaled
        except asyncio.TimeoutError:
            pass  # Normal — interval elapsed, run next cycle



BLOCKS_FETCH_INTERVAL = 3600  # Fetch blocks from mempool.space at most once per hour
_last_blocks_fetch = 0.0


async def poll_pool_stats(storage: LocalStorage) -> None:
    # runs in executor so network calls dont block the event loop
    global _last_blocks_fetch

    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, _poll_pool_stats_sync, storage)
    except Exception:
        logger.exception("Pool stats polling failed — will retry next cycle")


def _poll_pool_stats_sync(storage: LocalStorage) -> None:

    global _last_blocks_fetch

    # Load pools config
    config_path = storage.api_dir / "config" / "pools.json"
    if not config_path.exists():
        logger.warning("pools.json not found, skipping pool stats")
        return

    with open(config_path) as f:
        pools_config = json.load(f).get("pools", [])

    # Fetch network difficulty
    difficulty = _fetch_difficulty()

    # Load recent races for validation (from local race files)
    recent_races = _load_local_recent_races(storage)

    # Poll each pool's stats API
    snapshots = {}
    for pool in pools_config:
        name = pool["name"]
        stats_api = pool.get("stats_api")
        stats_api_type = pool.get("stats_api_type")

        if stats_api and stats_api_type:
            try:
                snap = fetch_pool_stats(stats_api, stats_api_type)
                snap["fetch_ok"] = True
                snap["fetch_error"] = None
                snap["fetched_utc"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                logger.info("Pool stats ✓ %s: %s", name, snap.get("hashrate_formatted", "?"))
            except Exception as e:
                snap = _empty_snap(f"fetch_failed: {str(e)[:80]}")
        else:
            snap = _empty_snap("no_api_configured")

        snapshots[name] = snap

        # Update per-pool history
        if snap.get("fetch_ok"):
            _update_history(storage, name, snap)

    # Compute validation for all pools
    validations = {}
    for pool in pools_config:
        name = pool["name"]
        validations[name] = compute_validation_status(
            pool_name=name,
            recent_races=recent_races,
            first_added_utc=pool.get("first_added_utc"),
            grace_hours=pool.get("validation_grace_hours", 48),
        )

    # Fetch blocks (hourly)
    blocks_data = {}
    now_ts = time.time()
    if now_ts - _last_blocks_fetch >= BLOCKS_FETCH_INTERVAL:
        for pool in pools_config:
            slugs = pool.get("mempool_slugs")
            if slugs:
                try:
                    bd = fetch_pool_blocks(slugs, limit=5)
                    blocks_data[pool["name"]] = bd
                except Exception as e:
                    logger.warning("Blocks fetch failed for %s: %s", pool["name"], e)
        _last_blocks_fetch = now_ts

    # Build and write latest file
    latest = build_pool_stats_latest(snapshots, validations, difficulty)
    for name, bd in blocks_data.items():
        if name in latest["pools"]:
            latest["pools"][name]["blocks_found"] = bd["total_blocks"]
            latest["pools"][name]["recent_blocks"] = bd["recent_blocks"]

    storage.write_aggregate("config/pool-stats-latest.json", latest)

    live_count = sum(1 for s in snapshots.values() if s.get("fetch_ok"))
    logger.info("Pool stats complete: %d/%d live", live_count, len(snapshots))


def _fetch_difficulty() -> float | None:

    try:
        import urllib.request
        import ssl
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            "https://mempool.space/api/v1/mining/hashrate/1d",
            headers={"User-Agent": "StratumRace/1.0"},
        )
        resp = urllib.request.urlopen(req, timeout=10, context=ctx)
        data = json.loads(resp.read(1_048_576))
        return data.get("currentDifficulty")
    except Exception:
        return None


def _load_local_recent_races(storage: LocalStorage) -> list:

    from datetime import timedelta
    races = []
    now = datetime.now(timezone.utc)
    for day_offset in range(2):
        day = (now - timedelta(days=day_offset))
        day_dir = storage.api_dir / "races" / day.strftime("%Y/%m/%d")
        if not day_dir.exists():
            continue
        for f in day_dir.glob("*.json"):
            if "_bundle" in f.name:
                continue
            try:
                with open(f) as fh:
                    race = json.load(fh)
                epoch = race.get("first_epoch", 0)
                if epoch > (now.timestamp() - 25 * 3600):
                    races.append(race)
            except Exception as e:
                logger.debug("Skipping malformed race file %s: %s", f.name, e)
                continue
    return races


def _update_history(storage: LocalStorage, pool_name: str, snapshot: dict) -> None:

    rel_path = f"pool-history/{pool_name}.json"
    target = storage.api_dir / rel_path

    history_data = []
    if target.exists():
        try:
            with open(target) as f:
                existing = json.load(f)
                history_data = existing.get("data", [])
        except Exception:
            pass

    history_data = append_snapshot(history_data, snapshot, cap=2016)

    output = {
        "pool_name": pool_name,
        "updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data": history_data,
    }
    target.parent.mkdir(parents=True, exist_ok=True)
    storage.write_aggregate(rel_path, output)


def _empty_snap(error: str) -> dict:
    return {
        "hashrate_value": None,
        "hashrate_formatted": None,
        "active_users": None,
        "active_workers": None,
        "pool_fee": None,
        "miner_types": None,
        "fetch_ok": False,
        "fetch_error": error,
        "fetched_utc": None,
    }
