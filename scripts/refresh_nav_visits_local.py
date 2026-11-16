#!/usr/bin/env python3
"""常态小批量：每次刷新最多 5 条「月访数据超过 6 个月」的导航网址。

调 rankmeter.io 写 monthly_visits，并刷新 visits_updated_at。
无估值也打时间戳，避免反复打同一站。可与 fill_nav_meta_local.py 并行：
那边补空值，这边按过期时间轮询。

依赖：pip install pymysql
读取项目根 .env 的 DB_*。

环境变量：
  WA_VISITS_LIMIT   每批条数，默认 5，最大 10
"""

from __future__ import annotations

import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
LIMIT = min(10, max(1, int(os.environ.get("WA_VISITS_LIMIT", "5"))))
STALE_MONTHS = 6
UINT_MAX = 4_294_967_295
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
CTX = ssl._create_unverified_context()


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def ensure_columns(cur) -> None:
    cur.execute("SHOW COLUMNS FROM nav_sites LIKE 'monthly_visits'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE `nav_sites` ADD COLUMN `monthly_visits` "
            "INT UNSIGNED NULL DEFAULT NULL COMMENT '近一月访问量'"
        )
    cur.execute("SHOW COLUMNS FROM nav_sites LIKE 'visits_updated_at'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE `nav_sites` ADD COLUMN `visits_updated_at` "
            "DATETIME NULL DEFAULT NULL COMMENT '月访问量最近拉取时间'"
        )
        cur.execute(
            "UPDATE nav_sites SET visits_updated_at = DATE_SUB(NOW(), INTERVAL 1 YEAR) "
            "WHERE visits_updated_at IS NULL"
        )


def host_of(url: str) -> str:
    host = (urlparse(url or "").hostname or "").lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    return host


def fetch_monthly_visits(domain: str) -> int | None:
    if not domain or "." not in domain:
        return None
    req = urllib.request.Request(
        f"https://rankmeter.io/api/v1/rank/{domain}",
        headers={"User-Agent": UA, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as resp:
            data = json.loads(resp.read().decode("utf-8", "replace"))
    except Exception:  # noqa: BLE001
        return None
    raw = (data.get("estimate") or {}).get("visits_month")
    if raw is None:
        return None
    try:
        visits = int(round(float(raw)))
    except (TypeError, ValueError):
        return None
    if visits < 0:
        return None
    return min(UINT_MAX, visits)


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    try:
        import pymysql
    except ImportError:
        print("请先安装 pymysql：pip install pymysql", file=sys.stderr)
        return 1

    conn = pymysql.connect(
        host=os.environ["DB_HOST"].strip(),
        user=os.environ["DB_USER"].strip(),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ["DB_NAME"].strip(),
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=60,
        write_timeout=60,
        autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            ensure_columns(cur)
            cur.execute(
                """
                SELECT id, url FROM nav_sites
                WHERE visits_updated_at IS NULL
                   OR visits_updated_at < DATE_SUB(NOW(), INTERVAL %s MONTH)
                ORDER BY visits_updated_at IS NULL ASC, visits_updated_at ASC, id ASC
                LIMIT %s
                """,
                (STALE_MONTHS, LIMIT),
            )
            rows = cur.fetchall()
            if not rows:
                print(json.dumps({"done": True, "picked": 0, "updated": 0}, ensure_ascii=False))
                return 0

            by_host: dict[str, list[int]] = {}
            for site_id, url in rows:
                host = host_of(url)
                if not host:
                    continue
                by_host.setdefault(host, []).append(int(site_id))

            results = []
            updated = 0
            for host, ids in by_host.items():
                visits = fetch_monthly_visits(host)
                placeholders = ",".join(["%s"] * len(ids))
                cur.execute(
                    f"""
                    UPDATE nav_sites
                    SET monthly_visits = COALESCE(%s, monthly_visits),
                        visits_updated_at = NOW(),
                        updated_at = NOW()
                    WHERE id IN ({placeholders})
                    """,
                    [visits, *ids],
                )
                affected = int(cur.rowcount or 0)
                updated += affected
                results.append(
                    {
                        "host": host,
                        "ids": ids,
                        "monthly_visits": visits,
                        "updated": affected,
                    }
                )

            cur.execute(
                """
                SELECT COUNT(*) FROM nav_sites
                WHERE visits_updated_at IS NULL
                   OR visits_updated_at < DATE_SUB(NOW(), INTERVAL %s MONTH)
                """,
                (STALE_MONTHS,),
            )
            remaining = int(cur.fetchone()[0])
            print(
                json.dumps(
                    {
                        "done": remaining <= 0,
                        "limit": LIMIT,
                        "picked": len(rows),
                        "hosts": len(by_host),
                        "updated": updated,
                        "remaining": remaining,
                        "results": results,
                    },
                    ensure_ascii=False,
                )
            )
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
