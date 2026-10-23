#!/usr/bin/env python3
"""Build a disposable, openly licensed Stillroom media fixture in ~/Downloads.

Uses Wikimedia Commons category files and two Blender Foundation demo clips.
The script uses only the Python standard library and caps downloaded data at
600 MiB. It never removes an existing test folder; use --replace only when you
intend to replace this generated fixture.
"""

from __future__ import annotations

import argparse
import html
import json
import random
import re
import shutil
import tempfile
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


USER_AGENT = "StillroomPerformanceFixture/1.0 (https://github.com/Davin-X/stillroom)"
MAX_TOTAL_BYTES = 600 * 1024 * 1024
MAX_PHOTO_BYTES = 12 * 1024 * 1024
PHOTOS_PER_CATEGORY = 3
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}

# Each folder has a few Commons categories to try, in order. Category pages
# vary in size and contents, so fallbacks keep the fixture useful over time.
CATEGORIES: dict[str, tuple[str, ...]] = {
    "01-wildlife": ("Wildlife", "Animals"),
    "02-architecture": ("Architecture", "Buildings"),
    "03-beaches": ("Beaches", "Seascapes"),
    "04-birds": ("Birds", "Birds in flight"),
    "05-cars": ("Automobiles", "Cars"),
    "06-cities": ("Cityscapes", "Cities"),
    "07-flowers": ("Flowers", "Flowers in nature"),
    "08-food": ("Food", "Food photography"),
    "09-forests": ("Forests", "Woodlands"),
    "10-landscapes": ("Landscape photography", "Landscapes"),
    "11-mountains": ("Mountains", "Mountain landscapes"),
    "12-night-scenes": ("Night photography", "Night scenes"),
    "13-people": ("People", "Portraits"),
    "14-pets": ("Cats", "Dogs"),
    "15-sports": ("Sports", "Sports photography"),
    "16-space": ("Space", "Astronomical objects"),
    "17-trains": ("Trains", "Rail transport"),
    "18-aircraft": ("Aircraft", "Airplanes"),
    "19-underwater": ("Underwater photography", "Underwater"),
    "20-waterfalls": ("Waterfalls", "Rivers"),
}

VIDEO_ARCHIVES = [
    {
        "folder": "01-wildlife",
        "name": "big-buck-bunny.mp4",
        "archive": "https://download.blender.org/demo/movies/BBB/bbb_sunflower_1080p_30fps_normal.mp4.zip",
        "title": "Big Buck Bunny (1080p 30fps)",
        "creator": "Blender Foundation",
        "license": "Creative Commons Attribution 3.0",
        "license_url": "https://creativecommons.org/licenses/by/3.0/",
        "source": "https://peach.blender.org/about/",
    },
    {
        "folder": "02-architecture",
        "name": "elephants-dream-teaser.mp4",
        "archive": "https://download.blender.org/demo/movies/elephantsdream_teaser.mp4.zip",
        "title": "Elephants Dream teaser",
        "creator": "Blender Foundation",
        "license": "Creative Commons Attribution 2.5",
        "license_url": "https://creativecommons.org/licenses/by/2.5/",
        "source": "https://orange.blender.org/",
    },
]


def fetch(url: str, timeout: int = 60) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def commons_files(category: str) -> list[dict]:
    params = {
        "action": "query",
        "generator": "categorymembers",
        "gcmtitle": f"Category:{category}",
        "gcmtype": "file",
        "gcmlimit": "100",
        "prop": "imageinfo",
        "iiprop": "url|size|extmetadata",
        "iiurlwidth": "2560",
        "format": "json",
        "formatversion": "2",
    }
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    try:
        payload = json.loads(fetch(url).decode("utf-8"))
    except Exception as exc:
        print(f"  Commons category unavailable ({category}): {exc}")
        return []
    files = []
    for page in payload.get("query", {}).get("pages", []):
        infos = page.get("imageinfo", [])
        if not infos:
            continue
        info = infos[0]
        title = page.get("title", "")
        ext = Path(title).suffix.lower()
        meta = info.get("extmetadata", {})
        license_name = html.unescape(meta.get("LicenseShortName", {}).get("value", "")).strip()
        license_url = html.unescape(meta.get("LicenseUrl", {}).get("value", "")).strip()
        artist = html.unescape(meta.get("Artist", {}).get("value", "")).strip()
        artist = re.sub(r"<[^>]*>", " ", artist)
        artist = re.sub(r"\s+", " ", artist).strip()
        if ext not in IMAGE_EXTENSIONS or not license_name or not info.get("url"):
            continue
        size = int(info.get("size", 0))
        if size < 100_000 or size > MAX_PHOTO_BYTES:
            continue
        files.append({
            "title": title,
            "url": info["url"],
            "size": size,
            "extension": ext,
            "license": license_name,
            "license_url": license_url,
            "creator": artist,
            "source": info.get("descriptionurl", ""),
        })
    return files


def safe_name(value: str) -> str:
    base = Path(value).stem.lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return (base[:72] or "commons-photo")


def download_to(url: str, target: Path, remaining: int) -> int:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    written = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(request, timeout=90) as response, target.open("wb") as output:
            declared = int(response.headers.get("Content-Length", "0"))
            if declared and declared > remaining:
                raise ValueError("fixture download size cap reached")
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > remaining:
                    raise ValueError("fixture download size cap reached")
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path.home() / "Downloads" / "Stillroom Performance Test",
        help="destination directory (default: ~/Downloads/Stillroom Performance Test)",
    )
    parser.add_argument("--replace", action="store_true", help="replace an existing generated fixture")
    args = parser.parse_args()
    output = args.output.expanduser().resolve()
    if output.exists() and any(output.iterdir()):
        if not args.replace:
            raise SystemExit(f"Refusing to overwrite non-empty directory: {output} (pass --replace to replace it)")
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=True)
    for folder in CATEGORIES:
        (output / folder).mkdir(exist_ok=True)

    manifest: dict = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "purpose": "Disposable local Stillroom scan, grid, timeline, and video playback fixture",
        "max_download_bytes": MAX_TOTAL_BYTES,
        "items": [],
    }
    total_bytes = 0
    randomizer = random.Random(20261023)

    for folder, category_names in CATEGORIES.items():
        selected: list[dict] = []
        seen_titles: set[str] = set()
        for category in category_names:
            candidates = commons_files(category)
            randomizer.shuffle(candidates)
            for candidate in candidates:
                if candidate["title"] in seen_titles:
                    continue
                seen_titles.add(candidate["title"])
                selected.append(candidate)
                if len(selected) >= PHOTOS_PER_CATEGORY:
                    break
            if len(selected) >= PHOTOS_PER_CATEGORY:
                break

        for index, item in enumerate(selected[:PHOTOS_PER_CATEGORY], start=1):
            if total_bytes + item["size"] > MAX_TOTAL_BYTES - 350 * 1024 * 1024:
                print("Photo download budget reserved for the video fixtures; stopping photo downloads.")
                break
            name = f"photo-{index:02d}-{safe_name(item['title'])}{item['extension']}"
            destination = output / folder / name
            if destination.exists():
                continue
            try:
                size = download_to(item["url"], destination, MAX_TOTAL_BYTES - total_bytes - 350 * 1024 * 1024)
            except Exception as exc:
                print(f"  Skipping {item['title']}: {exc}")
                continue
            total_bytes += size
            manifest["items"].append({"path": str(destination.relative_to(output)), **item, "downloaded_bytes": size})
        print(f"{folder}: {sum(1 for row in manifest['items'] if row['path'].startswith(folder + '/'))} photos")
        time.sleep(0.2)

    with tempfile.TemporaryDirectory(prefix="stillroom-video-fixtures-") as scratch:
        scratch_path = Path(scratch)
        for video in VIDEO_ARCHIVES:
            archive = scratch_path / (Path(video["archive"]).name)
            target_dir = output / video["folder"]
            target = target_dir / video["name"]
            try:
                size = download_to(video["archive"], archive, MAX_TOTAL_BYTES - total_bytes)
                total_bytes += size
                with zipfile.ZipFile(archive) as bundle:
                    mp4_name = next((name for name in bundle.namelist() if name.lower().endswith(".mp4")), None)
                    if not mp4_name:
                        raise ValueError("archive did not contain an MP4")
                    with bundle.open(mp4_name) as source, target.open("wb") as dest:
                        shutil.copyfileobj(source, dest)
                manifest["items"].append({
                    "path": str(target.relative_to(output)),
                    "title": video["title"],
                    "url": video["source"],
                    "archive_url": video["archive"],
                    "creator": video["creator"],
                    "license": video["license"],
                    "license_url": video["license_url"],
                    "downloaded_bytes": target.stat().st_size,
                })
                print(f"Downloaded video: {target.relative_to(output)} ({target.stat().st_size / 1024 / 1024:.1f} MiB)")
            except Exception as exc:
                print(f"Video fixture unavailable ({video['title']}): {exc}")
                target.unlink(missing_ok=True)

    manifest["downloaded_bytes"] = total_bytes
    manifest["item_count"] = len(manifest["items"])
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nFixture: {output}\nItems: {manifest['item_count']}\nDownloaded: {total_bytes / 1024 / 1024:.1f} MiB (cap {MAX_TOTAL_BYTES / 1024 / 1024:.0f} MiB)")
    print("Photos and videos remain local; manifest.json records source and license details.")


if __name__ == "__main__":
    main()
