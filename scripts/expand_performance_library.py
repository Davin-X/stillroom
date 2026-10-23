#!/usr/bin/env python3
"""Expand an existing Stillroom fixture into a path-count stress library.

Creates cheap APFS clones of the downloaded media where possible. The contents
remain the real downloaded samples, while unique paths exercise folder walking,
database indexing, grids, selection, and timeline pagination. No media is
downloaded by this script.
"""

from __future__ import annotations

import argparse
import ctypes
import errno
import os
from pathlib import Path
import sys

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}


def clone_file(source: Path, target: Path) -> str:
    """Make an independent file, preferring cheap APFS copy-on-write clones."""
    if sys.platform == "darwin":
        libc = ctypes.CDLL(None, use_errno=True)
        clonefile = libc.clonefile
        clonefile.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
        clonefile.restype = ctypes.c_int
        if clonefile(os.fsencode(source), os.fsencode(target), 0) == 0:
            return "APFS clone"
        error = ctypes.get_errno()
        if error not in (errno.ENOTSUP, errno.EINVAL, errno.EXDEV, errno.ENOSYS):
            raise OSError(error, os.strerror(error), str(target))
    # A hard link costs no media space and is safe for this read-only scan/UI
    # workload. The source samples themselves are never edited by the app.
    os.link(source, target)
    return "hard link"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.home() / "Downloads" / "Stillroom Performance Test",
    )
    parser.add_argument("--photos", type=int, default=10_000, help="total photo paths to create")
    parser.add_argument("--videos", type=int, default=300, help="total video paths to create")
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"Fixture folder does not exist: {root}")

    folders = sorted(path for path in root.iterdir() if path.is_dir())
    if len(folders) != 20:
        raise SystemExit(f"Expected exactly 20 category folders, found {len(folders)}")
    photos = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]
    videos = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS]
    if not photos or not videos:
        raise SystemExit("The fixture must contain at least one source photo and one source video")
    if len(photos) > args.photos or len(videos) > args.videos:
        raise SystemExit("Existing fixture already exceeds one requested target")

    method_counts = {"APFS clone": 0, "hard link": 0}
    for index in range(len(photos), args.photos):
        folder = folders[index % len(folders)]
        source = photos[index % len(photos)]
        target = folder / f"stress-photo-{index + 1:05d}{source.suffix.lower()}"
        if not target.exists():
            method_counts[clone_file(source, target)] += 1

    video_folders = {path: path.parent for path in videos}
    for index in range(len(videos), args.videos):
        source = videos[index % len(videos)]
        target = video_folders[source] / f"stress-video-{index + 1:04d}{source.suffix.lower()}"
        if not target.exists():
            method_counts[clone_file(source, target)] += 1

    print(f"Fixture: {root}")
    print(f"Category folders: {len(folders)}")
    print(f"Photo paths: {sum(1 for p in root.rglob('*') if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS)}")
    print(f"Video paths: {sum(1 for p in root.rglob('*') if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS)}")
    print(f"Created via APFS clones: {method_counts['APFS clone']}")
    print(f"Created via hard links: {method_counts['hard link']}")
    print("Each duplicate has a distinct path; media bytes are reused to keep disk usage low.")


if __name__ == "__main__":
    main()
