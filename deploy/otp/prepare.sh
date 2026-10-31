#!/usr/bin/env bash
# Builds the OpenTripPlanner graph for the Konya transit pilot (docs/deploy.md, "Toplu taşıma").
#
#   deploy/otp/prepare.sh        download Konya's GTFS and OSM, cut Konya out, build data/graph.obj
#
# Run once, and again when Konya publishes a new GTFS. Needs Docker and ~1 GB of free disk while it runs
# (the Türkiye OSM file is deleted after the cut).
set -euo pipefail

cd "$(dirname "$0")"
DATA=data
mkdir -p "$DATA"

# Konya Büyükşehir Belediyesi açık veri, CC BY 4.0 (https://acikveri.konya.bel.tr/dataset/toplu-tasima-gtfs-verileri).
GTFS_PACKAGE="https://acikveri.konya.bel.tr/api/3/action/package_show?id=toplu-tasima-gtfs-verileri"
OSM_TURKEY="https://download.geofabrik.de/europe/turkey-latest.osm.pbf"
# Every GTFS stop lies inside, with a margin for walking to the first stop (min lon, min lat, max lon, max lat).
BBOX="32.28,37.60,32.95,38.27"
OTP_IMAGE="opentripplanner/opentripplanner:2.10.0"
# osmium from Debian's own package: the osmium images on Docker Hub were all re-pushed recently.
OSMIUM_IMAGE="debian:12-slim"

gtfs_url=$(curl -fsS -m 60 "$GTFS_PACKAGE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["resources"][0]["url"])')
echo "GTFS: $gtfs_url"
curl -fsS -m 300 -o "$DATA/konya-gtfs-original.zip" "$gtfs_url"
# The export cuts most main-tram trips after Belediye (fix_gtfs.py).
python3 fix_gtfs.py "$DATA/konya-gtfs-original.zip" "$DATA/konya-gtfs.zip"

if [[ ! -f "$DATA/konya.osm.pbf" ]]; then
  echo "OSM: Türkiye (~650 MB), then the Konya cut"
  # Geofabrik redirects to a mirror.
  curl -fsSL -m 1800 -o "$DATA/turkey.osm.pbf" "$OSM_TURKEY"
  docker run --rm -v "$PWD/$DATA:/data" "$OSMIUM_IMAGE" sh -c \
    "apt-get update -qq && apt-get install -y -qq osmium-tool > /dev/null && osmium extract -b $BBOX /data/turkey.osm.pbf -o /data/konya.osm.pbf --overwrite"
  rm "$DATA/turkey.osm.pbf"
fi

cp build-config.json router-config.json "$DATA/"
docker run --rm -v "$PWD/$DATA:/var/opentripplanner" -e JAVA_TOOL_OPTIONS=-Xmx3g "$OTP_IMAGE" --build --save
ls -lh "$DATA/graph.obj"
