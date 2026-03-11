#!/usr/bin/env python3

import argparse
import csv
import json
import math
import sqlite3
from pathlib import Path


DEFAULT_K = 1.287e-11
DEFAULT_ALPHA = 1.686
DEFAULT_BETA = 1.226
DEFAULT_A = 99.02

METERS_PER_AU = 149_597_870_700.0
METERS_PER_LS = 299_792_458.0
SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE_ROOT = SCRIPT_DIR.parent.parent


def parse_args():
    parser = argparse.ArgumentParser(
        description="Generate FrontierHeatSense data-c5.json from eve_universe.db"
    )
    parser.add_argument(
        "--db",
        default=str(WORKSPACE_ROOT / "scripts/db/eve_universe.db"),
        help="Path to eve_universe.db",
    )
    parser.add_argument(
        "--stars-csv",
        default=str(WORKSPACE_ROOT / "scripts/db/stars.csv"),
        help="Path to the star export CSV used for class/temperature enrichment",
    )
    parser.add_argument(
        "--systems-csv",
        default=str(WORKSPACE_ROOT / "scripts/db/systems.csv"),
        help="Path to the system export CSV used for coordinate enrichment",
    )
    parser.add_argument(
        "--out",
        default=str(WORKSPACE_ROOT / "FrontierHeatSense/workers/systems/data-c5.json"),
        help="Output path for the generated worker data file",
    )
    return parser.parse_args()


def calculate_heat(distance_ls, temperature_k, radius_km):
    if distance_ls <= 0:
        return DEFAULT_A
    lambda_val = DEFAULT_K * (temperature_k ** DEFAULT_ALPHA) * (radius_km ** DEFAULT_BETA)
    return DEFAULT_A * (2.0 / math.pi) * math.atan((math.pi / 2.0) * (lambda_val / distance_ls))


def heat_status(heat_value):
    if heat_value <= 40.0:
        return "S"
    if heat_value < 80.0:
        return "M"
    if heat_value < 90.0:
        return "D"
    return "C"


def load_star_enrichment(stars_csv_path):
    stars_by_system = {}
    with open(stars_csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            solar_system_id = int(row["solar_system_id"])
            stars_by_system[solar_system_id] = {
                "class": row["spectral_class"].strip(),
                "temp": int(round(float(row["temperature"]))),
                "radius_km": int(round(float(row["radius"]) / 1000.0)),
            }
    return stars_by_system


def load_system_coords(systems_csv_path):
    coords_by_system = {}
    with open(systems_csv_path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            solar_system_id = int(row["solar_system_id"])
            coords_by_system[solar_system_id] = {
                "x": float(row["center_x"]),
                "y": float(row["center_y"]),
                "z": float(row["center_z"]),
            }
    return coords_by_system


def load_systems(conn):
    query = """
        SELECT s.solarSystemID, s.name, st.radius
        FROM systems s
        JOIN stars st ON st.solarSystemID = s.solarSystemID
        WHERE s.name IS NOT NULL AND TRIM(s.name) <> ''
        ORDER BY s.solarSystemID
    """
    return conn.execute(query).fetchall()


def load_coldest_distances(conn):
    query = """
        WITH orbital_candidates AS (
            SELECT solarSystemID, orbitRadius AS orbital_radius_m
            FROM planets
            WHERE orbitRadius IS NOT NULL AND orbitRadius > 0

            UNION ALL

            SELECT p.solarSystemID, p.orbitRadius + m.orbitRadius AS orbital_radius_m
            FROM moons m
            JOIN planets p ON p.planetID = m.planetID
            WHERE p.orbitRadius IS NOT NULL
              AND p.orbitRadius > 0
              AND m.orbitRadius IS NOT NULL
              AND m.orbitRadius > 0
        )
        SELECT solarSystemID, MAX(orbital_radius_m) AS coldest_radius_m
        FROM orbital_candidates
        GROUP BY solarSystemID
    """
    return {int(system_id): float(radius_m) for system_id, radius_m in conn.execute(query)}


def generate_data(db_path, stars_csv_path, systems_csv_path):
    conn = sqlite3.connect(db_path)
    try:
        systems = load_systems(conn)
        coldest_by_system = load_coldest_distances(conn)
    finally:
        conn.close()

    star_enrichment = load_star_enrichment(stars_csv_path)
    coords_by_system = load_system_coords(systems_csv_path)

    data = {}
    stats = {
        "systems_seen": 0,
        "systems_written": 0,
        "missing_star_enrichment": 0,
        "missing_coords": 0,
        "missing_orbit": 0,
    }

    for solar_system_id, name, db_radius_m in systems:
        stats["systems_seen"] += 1
        star = star_enrichment.get(solar_system_id)
        if not star:
            stats["missing_star_enrichment"] += 1
            continue

        coords = coords_by_system.get(solar_system_id)
        if not coords:
            stats["missing_coords"] += 1
            continue

        coldest_radius_m = coldest_by_system.get(solar_system_id)
        if not coldest_radius_m:
            stats["missing_orbit"] += 1
            continue

        coldest_au = coldest_radius_m / METERS_PER_AU
        coldest_ls = coldest_radius_m / METERS_PER_LS
        radius_km = star["radius_km"]

        if radius_km <= 0 and db_radius_m:
            radius_km = int(round(float(db_radius_m) / 1000.0))

        heat_value = round(calculate_heat(coldest_ls, star["temp"], radius_km), 2)
        data[name.upper()] = [
            solar_system_id,
            star["class"],
            star["temp"],
            radius_km,
            round(coldest_au, 3),
            round(coldest_ls, 1),
            heat_value,
            heat_status(heat_value),
            coords["x"],
            coords["y"],
            coords["z"],
        ]
        stats["systems_written"] += 1

    ordered = dict(sorted(data.items(), key=lambda item: item[1][0]))
    return ordered, stats


def main():
    args = parse_args()
    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data, stats = generate_data(args.db, args.stars_csv, args.systems_csv)

    with open(output_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")

    print(f"Wrote {output_path} with {stats['systems_written']} systems.")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
