#!/usr/bin/env python3
"""本机探测 nav_sites 打开耗时并直连 RDS 写库（GitHub/MCP 部署不可用时的补跑路径）。

依赖：pip install pymysql
读取项目根 .env 的 DB_*。打不开则停用（is_enabled=0）并写 open_seconds=60。
"""

from __future__ import annotations

import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIMEOUT = int(os.environ.get("WA_OPEN_TIMEOUT", "8"))
WORKERS = int(os.environ.get("WA_OPEN_WORKERS", "12"))
BATCH = int(os.environ.get("WA_OPEN_BATCH", "80"))
# 打不开/超时写入的秒数，避免后台看到空或 0
FAIL_SECONDS = float(os.environ.get("WA_OPEN_FAIL_SECONDS", "60"))
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


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
    cur.execute("SHOW COLUMNS FROM nav_sites LIKE 'open_seconds'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE `nav_sites` ADD COLUMN `open_seconds` "
            "DECIMAL(10,3) NULL DEFAULT NULL COMMENT '打开耗时秒'"
        )
    cur.execute("SHOW COLUMNS FROM nav_sites LIKE 'is_enabled'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE `nav_sites` ADD COLUMN `is_enabled` "
            "TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用'"
        )
    # 存量软删迁成未启用（列可能仍在，但代码不再依赖）
    cur.execute("SHOW COLUMNS FROM nav_sites LIKE 'is_deleted'")
    if cur.fetchone():
        cur.execute(
            "UPDATE nav_sites SET is_enabled = 0, updated_at = NOW() "
            "WHERE is_deleted = 1 AND (is_enabled = 1 OR is_enabled IS NULL)"
        )
        cur.execute("UPDATE nav_sites SET is_deleted = 0 WHERE is_deleted = 1")


def measure_open(url: str) -> tuple[bool, float | None, str]:
    target = (url or "").strip()
    if not target.lower().startswith(("http://", "https://")):
        return True, 0.0, "unsupported_url"
    # 探测只关心能不能打开，证书链不完整的站点在浏览器里往往也能开
    ctx = ssl._create_unverified_context()
    req = urllib.request.Request(
        target,
        method="GET",
        headers={"User-Agent": UA, "Accept": "text/html,*/*"},
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=ctx) as resp:
            # 读一点即可，表示页面已打开
            resp.read(1024)
            seconds = round(time.perf_counter() - started, 3)
            return True, min(999999.0, seconds), f"http_{resp.status}"
    except Exception as exc:  # noqa: BLE001
        name = type(exc).__name__
        message = str(exc)
        if isinstance(exc, socket.timeout) or "timed out" in message.lower():
            return False, None, "timeout"
        if isinstance(exc, urllib.error.HTTPError):
            # 有 HTTP 响应也算打开了
            seconds = round(time.perf_counter() - started, 3)
            return True, min(999999.0, seconds), f"http_{exc.code}"
        return False, None, f"{name}:{message[:120]}"


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    try:
        import pymysql
    except ImportError:
        print("请先安装 pymysql：pip install pymysql", file=sys.stderr)
        return 1

    host = os.environ.get("DB_HOST", "").strip()
    user = os.environ.get("DB_USER", "").strip()
    password = os.environ.get("DB_PASSWORD", "")
    database = os.environ.get("DB_NAME", "").strip()
    if not all([host, user, database]):
        print("缺少 DB_HOST/DB_USER/DB_NAME", file=sys.stderr)
        return 1

    try:
        conn = pymysql.connect(
            host=host,
            user=user,
            password=password,
            database=database,
            charset="utf8mb4",
            connect_timeout=10,
            read_timeout=60,
            write_timeout=60,
            autocommit=True,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"连接数据库失败：{exc}", file=sys.stderr)
        return 1

    probed = disabled = skipped = failed = 0
    try:
        with conn.cursor() as cur:
            ensure_columns(cur)
            cur.execute(
                """
                SELECT COUNT(*) FROM nav_sites
                WHERE (is_enabled = 1 OR is_enabled IS NULL)
                  AND open_seconds IS NULL
                """
            )
            missing = int(cur.fetchone()[0])
            print(
                f"待探测约 {missing}（并发 {WORKERS}，每批 {BATCH}，超时 {TIMEOUT}s）",
                flush=True,
            )

            after_id = 0
            while True:
                cur.execute(
                    """
                    SELECT id, url FROM nav_sites
                    WHERE id > %s
                      AND (is_enabled = 1 OR is_enabled IS NULL)
                      AND open_seconds IS NULL
                    ORDER BY id ASC
                    LIMIT %s
                    """,
                    (after_id, BATCH),
                )
                rows = cur.fetchall()
                if not rows:
                    break

                results = []
                with ThreadPoolExecutor(max_workers=WORKERS) as pool:
                    futures = {
                        pool.submit(measure_open, url): (site_id, url)
                        for site_id, url in rows
                    }
                    for fut in as_completed(futures):
                        site_id, url = futures[fut]
                        ok, seconds, detail = fut.result()
                        results.append((site_id, ok, seconds, detail))

                results.sort(key=lambda item: item[0])
                for site_id, ok, seconds, detail in results:
                    after_id = max(after_id, site_id)
                    if ok:
                        cur.execute(
                            "UPDATE nav_sites SET open_seconds = %s, updated_at = NOW() WHERE id = %s",
                            (seconds, site_id),
                        )
                        if detail == "unsupported_url":
                            skipped += 1
                        else:
                            probed += 1
                    else:
                        cur.execute(
                            "UPDATE nav_sites SET open_seconds = %s, is_enabled = 0, "
                            "updated_at = NOW() WHERE id = %s",
                            (FAIL_SECONDS, site_id),
                        )
                        disabled += 1
                        print(
                            f"停用 id={site_id} {detail} open_seconds={FAIL_SECONDS}",
                            flush=True,
                        )

                print(
                    f"after_id={after_id} 累计测到={probed} 累计停用={disabled} "
                    f"跳过={skipped} 本批={len(rows)}",
                    flush=True,
                )
    except Exception as exc:  # noqa: BLE001
        print(f"运行失败：{exc}", file=sys.stderr)
        failed += 1
        return 1
    finally:
        conn.close()

    print(
        f"完成：测到 {probed}，停用 {disabled}，跳过 {skipped}，失败 {failed}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
