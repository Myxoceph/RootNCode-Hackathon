"""Repairs Konya's GTFS before OpenTripPlanner reads it (deploy/otp/prepare.sh).

The November 2025 export cuts most trips of the main tram (route 150-B, the ones marked direction 1)
after Belediye: Zafer, Alaaddin and the way back to the campus are missing, so a visitor routed by such
a trip was dropped at Belediye and walked. Every tram runs the whole line (confirmed by the team), and
the route's complete trips give the stops and running times after Belediye.

Each cut trip keeps its own times and gets the missing stops at the running times of the complete
trips. Usage: python3 fix_gtfs.py <gtfs.zip in> <gtfs.zip out>
"""
import csv
import io
import sys
import zipfile
from collections import defaultdict

ROUTES = {"150-A", "150-B"}


def seconds(hhmmss):
    h, m, s = (int(part) for part in hhmmss.split(":"))
    return h * 3600 + m * 60 + s


def hhmmss(total):
    return f"{total // 3600:02d}:{total % 3600 // 60:02d}:{total % 60:02d}"


def read(archive, name):
    with archive.open(name) as raw:
        reader = csv.DictReader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
        return reader.fieldnames, list(reader)


def main(src, dst):
    with zipfile.ZipFile(src) as archive:
        names = archive.namelist()
        files = {name: archive.read(name) for name in names}
        _, trips = read(archive, "trips.txt")
        header, stop_times = read(archive, "stop_times.txt")

    route_of = {t["trip_id"]: t["route_id"] for t in trips if t["route_id"] in ROUTES}
    by_trip = defaultdict(list)
    for row in stop_times:
        if row["trip_id"] in route_of:
            by_trip[row["trip_id"]].append(row)
    for rows in by_trip.values():
        rows.sort(key=lambda r: int(r["stop_sequence"]))

    # The longest trip of a route is its whole line; a cut trip is a prefix of it.
    template = {}
    for trip_id, rows in by_trip.items():
        route = route_of[trip_id]
        if len(rows) > len(template.get(route, [])):
            template[route] = rows

    added = []
    fixed = 0
    for trip_id, rows in by_trip.items():
        full = template[route_of[trip_id]]
        if len(rows) >= len(full) or [r["stop_id"] for r in rows] != [r["stop_id"] for r in full[: len(rows)]]:
            continue
        shift = seconds(rows[-1]["departure_time"]) - seconds(full[len(rows) - 1]["departure_time"])
        sequence = int(rows[-1]["stop_sequence"])
        for step in full[len(rows):]:
            sequence += 1
            added.append({
                **{key: "" for key in header},
                "trip_id": trip_id,
                "arrival_time": hhmmss(shift + seconds(step["arrival_time"])),
                "departure_time": hhmmss(shift + seconds(step["departure_time"])),
                "stop_id": step["stop_id"],
                "stop_sequence": str(sequence),
                "stop_headsign": step.get("stop_headsign", ""),
            })
        fixed += 1

    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=header, lineterminator="\n")
    writer.writeheader()
    # GTFS does not need a trip's rows together; stop_sequence orders them.
    writer.writerows(stop_times + added)
    files["stop_times.txt"] = out.getvalue().encode("utf-8")

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in names:
            archive.writestr(name, files[name])
    print(f"GTFS: completed {fixed} cut tram trips with {len(added)} stop times")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
