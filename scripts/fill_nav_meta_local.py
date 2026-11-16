#!/usr/bin/env python3
"""本机补填 nav_sites.monthly_visits 与 language（直连 RDS）。

月访：rankmeter.io 免费估算（按独立主机名查一次，回写同主机名下所有空行）。
语种：抓取页面 html[lang] / og:locale / content-language。

依赖：pip install pymysql
读取项目根 .env 的 DB_*。

环境变量：
  WA_META_LANG_WORKERS  语种并发，默认 12
  WA_META_LANG_BATCH    语种每批，默认 80
  WA_META_LANG_TIMEOUT  抓页超时秒，默认 10
  WA_META_VISITS_INTERVAL  月访请求间隔秒，默认 12（约 300/小时）
  WA_META_ONLY          lang | visits | all，默认 all
"""

from __future__ import annotations

import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
LANG_WORKERS = int(os.environ.get("WA_META_LANG_WORKERS", "12"))
LANG_BATCH = int(os.environ.get("WA_META_LANG_BATCH", "80"))
LANG_TIMEOUT = int(os.environ.get("WA_META_LANG_TIMEOUT", "10"))
VISITS_INTERVAL = float(os.environ.get("WA_META_VISITS_INTERVAL", "12"))
ONLY = (os.environ.get("WA_META_ONLY") or "all").strip().lower()
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
CTX = ssl._create_unverified_context()
UINT_MAX = 4_294_967_295


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
    cur.execute("SHOW COLUMNS FROM nav_sites LIKE 'language'")
    if not cur.fetchone():
        cur.execute(
            "ALTER TABLE `nav_sites` ADD COLUMN `language` "
            "VARCHAR(8) NULL DEFAULT NULL COMMENT '语种如 zh/en'"
        )


def host_of(url: str) -> str:
    host = (urlparse(url or "").hostname or "").lower().strip(".")
    if host.startswith("www."):
        host = host[4:]
    return host


def clean_language(value: str | None) -> str | None:
    text = re.sub(r"[^a-zA-Z-]", "", str(value or "").strip().lower().replace("_", "-"))
    if not text:
        return None
    if not re.fullmatch(r"[a-z]{2}(-[a-z]{2})?", text):
        # zh-hans -> zh
        m = re.fullmatch(r"([a-z]{2})(?:-[a-z]+)?", text)
        if not m:
            return None
        text = m.group(1)
    return text[:8]


def detect_language(url: str) -> str | None:
    target = (url or "").strip()
    if not target.lower().startswith(("http://", "https://")):
        return None
    req = urllib.request.Request(
        target,
        method="GET",
        headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
    )
    try:
        with urllib.request.urlopen(req, timeout=LANG_TIMEOUT, context=CTX) as resp:
            chunk = resp.read(65536).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None

    patterns = (
        r'<html[^>]*\slang=["\']([a-zA-Z_-]{2,12})["\']',
        r'property=["\']og:locale["\'][^>]*content=["\']([a-zA-Z_-]{2,12})["\']',
        r'content=["\']([a-zA-Z_-]{2,12})["\'][^>]*property=["\']og:locale["\']',
        r'http-equiv=["\']content-language["\'][^>]*content=["\']([a-zA-Z_-]{2,12})["\']',
        r'content=["\']([a-zA-Z_-]{2,12})["\'][^>]*http-equiv=["\']content-language["\']',
    )
    for pattern in patterns:
        m = re.search(pattern, chunk, re.I)
        if m:
            return clean_language(m.group(1))
    return None


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
    except urllib.error.HTTPError as exc:
        if exc.code in (429, 503):
            raise
        return None
    except Exception:  # noqa: BLE001
        return None

    estimate = data.get("estimate") or {}
    raw = estimate.get("visits_month")
    if raw is None:
        return None
    try:
        visits = int(round(float(raw)))
    except (TypeError, ValueError):
        return None
    if visits < 0:
        return None
    return min(UINT_MAX, visits)


def connect():
    import pymysql

    host = os.environ.get("DB_HOST", "").strip()
    user = os.environ.get("DB_USER", "").strip()
    password = os.environ.get("DB_PASSWORD", "")
    database = os.environ.get("DB_NAME", "").strip()
    if not all([host, user, database]):
        raise SystemExit("缺少 DB_HOST/DB_USER/DB_NAME")
    return pymysql.connect(
        host=host,
        user=user,
        password=password,
        database=database,
        charset="utf8mb4",
        connect_timeout=10,
        read_timeout=120,
        write_timeout=120,
        autocommit=True,
    )


def fill_languages(conn) -> None:
    filled = failed = 0
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) FROM nav_sites
            WHERE language IS NULL OR language = ''
            """
        )
        missing = int(cur.fetchone()[0])
        print(
            f"[lang] 待补 {missing}（并发 {LANG_WORKERS}，每批 {LANG_BATCH}，超时 {LANG_TIMEOUT}s）",
            flush=True,
        )
        after_id = 0
        while True:
            cur.execute(
                """
                SELECT id, url FROM nav_sites
                WHERE id > %s AND (language IS NULL OR language = '')
                ORDER BY id ASC
                LIMIT %s
                """,
                (after_id, LANG_BATCH),
            )
            rows = cur.fetchall()
            if not rows:
                break
            after_id = rows[-1][0]
            results = []
            with ThreadPoolExecutor(max_workers=LANG_WORKERS) as pool:
                futures = {pool.submit(detect_language, url): site_id for site_id, url in rows}
                for fut in as_completed(futures):
                    site_id = futures[fut]
                    try:
                        lang = fut.result()
                    except Exception:  # noqa: BLE001
                        lang = None
                    results.append((site_id, lang))
            for site_id, lang in results:
                if not lang:
                    failed += 1
                    continue
                cur.execute(
                    "UPDATE nav_sites SET language = %s, updated_at = NOW() WHERE id = %s "
                    "AND (language IS NULL OR language = '')",
                    (lang, site_id),
                )
                filled += 1
            print(
                f"[lang] 进度 id<={after_id} 已写入 {filled}，未识别 {failed}",
                flush=True,
            )
    print(f"[lang] 完成：写入 {filled}，未识别 {failed}", flush=True)


def fill_visits(conn) -> None:
    filled_hosts = skipped = errors = 0
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, url FROM nav_sites
            WHERE monthly_visits IS NULL
            ORDER BY id ASC
            """
        )
        rows = cur.fetchall()
        by_host: dict[str, list[int]] = {}
        for site_id, url in rows:
            host = host_of(url)
            if not host:
                continue
            by_host.setdefault(host, []).append(int(site_id))
        hosts = sorted(by_host.keys())
        print(
            f"[visits] 待查主机 {len(hosts)}（间隔 {VISITS_INTERVAL}s，约 {len(hosts) * VISITS_INTERVAL / 3600:.1f} 小时）",
            flush=True,
        )
        last_request = 0.0
        for index, host in enumerate(hosts, start=1):
            wait = VISITS_INTERVAL - (time.perf_counter() - last_request)
            if wait > 0:
                time.sleep(wait)
            while True:
                try:
                    last_request = time.perf_counter()
                    visits = fetch_monthly_visits(host)
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code not in (429, 503):
                        visits = None
                        break
                    errors += 1
                    print(f"[visits] {host} 限流 {exc.code}，等待 60s 后重试", flush=True)
                    time.sleep(60)
            if visits is None:
                skipped += 1
            else:
                ids = by_host[host]
                # 分批更新，避免超长 IN
                for i in range(0, len(ids), 200):
                    chunk = ids[i : i + 200]
                    placeholders = ",".join(["%s"] * len(chunk))
                    cur.execute(
                        f"UPDATE nav_sites SET monthly_visits = %s, updated_at = NOW() "
                        f"WHERE monthly_visits IS NULL AND id IN ({placeholders})",
                        [visits, *chunk],
                    )
                filled_hosts += 1
            if index % 20 == 0 or index == len(hosts):
                print(
                    f"[visits] {index}/{len(hosts)} 已写主机 {filled_hosts}，无数据 {skipped}，限流重试 {errors}；最近 {host}={visits}",
                    flush=True,
                )
    print(
        f"[visits] 完成：主机写入 {filled_hosts}，无数据 {skipped}，限流事件 {errors}",
        flush=True,
    )


def main() -> int:
    load_env_file(ROOT / ".env")
    load_env_file(ROOT / ".env.local")
    try:
        import pymysql  # noqa: F401
    except ImportError:
        print("请先安装 pymysql：pip install pymysql", file=sys.stderr)
        return 1

    only = ONLY if ONLY in {"all", "lang", "visits"} else "all"
    conn = connect()
    try:
        with conn.cursor() as cur:
            ensure_columns(cur)
        if only in {"all", "lang"}:
            fill_languages(conn)
        if only in {"all", "visits"}:
            fill_visits(conn)
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
