"""Download the latest CER pipeline incident data for the dashboard.

Writes dashboard/public/pipeline-incidents-comprehensive-data.csv as UTF-8,
but only after checking that the download is a real, complete CSV, so a
broken or partial download never replaces good data.

Usage: python scripts/update_cer_data.py
"""
import csv
import io
import sys
import urllib.request
from pathlib import Path

URL = "https://www.cer-rec.gc.ca/open/incident/pipeline-incidents-comprehensive-data.csv"
TARGET = Path("dashboard/public/pipeline-incidents-comprehensive-data.csv")
REQUIRED = ["Incident Number", "Reported Date", "Province", "Company", "Year", "Significant"]


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (data refresh)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
    # The CER has published this file in both UTF-8 and Windows-1252.
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    raise ValueError("Could not decode the downloaded file")


def count_rows(text):
    reader = csv.DictReader(io.StringIO(text))
    missing = [c for c in REQUIRED if c not in (reader.fieldnames or [])]
    if missing:
        raise ValueError(f"Download is missing expected columns: {missing}")
    return sum(1 for _ in reader)


def main():
    new_text = download(URL).replace("\r\n", "\n")
    new_rows = count_rows(new_text)

    old_rows = 0
    if TARGET.exists():
        old_text = TARGET.read_text(encoding="utf-8")
        old_rows = count_rows(old_text)
        if new_text == old_text:
            print(f"No change: still {old_rows} incidents.")
            return

    # Incidents are only ever added, so a big drop means a bad download.
    if new_rows < old_rows * 0.95:
        sys.exit(f"Refusing to update: {new_rows} rows vs {old_rows} before.")

    TARGET.write_text(new_text, encoding="utf-8", newline="")
    print(f"Updated: {old_rows} -> {new_rows} incidents.")


if __name__ == "__main__":
    main()
