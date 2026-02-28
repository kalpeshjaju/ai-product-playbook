"""
FILE PURPOSE: Generate synthetic evaluation data from production samples

WHY: Playbook §22 — scale eval datasets 10-50x from production samples.
     Real production data is limited; synthetic variants let us test edge
     cases, distribution shifts, and rare scenarios.

HOW: 1. Load seed data from ai_generations (high-quality accepted examples)
     2. Use Gretel SDK to generate synthetic variants preserving distribution
     3. Validate generated data against basic quality checks
     4. Export as Promptfoo-compatible JSONL for eval pipelines

USAGE:
    python scripts/generate-synthetic-eval-data.py \\
        --task-type classification \\
        --multiplier 10 \\
        --output evals/synthetic-classification.jsonl

AUTHOR: Claude Opus 4.6
LAST UPDATED: 2026-02-28
"""

import argparse
import json
import os
import sys
from datetime import datetime

import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    """Connect to PostgreSQL using DATABASE_URL."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)
    return psycopg2.connect(database_url)


def load_seed_data(conn, task_type: str, limit: int = 100) -> list[dict]:
    """
    Load high-quality seed examples from ai_generations.
    Filters by task_type and user_feedback = 'accepted'.
    """
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT
            prompt_hash, prompt_version, task_type,
            response_hash, quality_score, user_feedback,
            model, input_tokens, output_tokens
        FROM ai_generations
        WHERE task_type = %s
          AND user_feedback = 'accepted'
          AND quality_score >= 0.7
        ORDER BY quality_score DESC
        LIMIT %s
        """,
        (task_type, limit),
    )
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()
    cursor.close()
    return [dict(zip(columns, row)) for row in rows]


def generate_with_gretel(
    seed_data: list[dict], multiplier: int
) -> list[dict]:
    """
    Use Gretel SDK to generate synthetic variants from seed data.
    Falls back to simple augmentation if Gretel API key is not set.
    """
    api_key = os.environ.get("GRETEL_API_KEY")

    if not api_key:
        print(
            "INFO: GRETEL_API_KEY not set — using simple augmentation fallback",
            file=sys.stderr,
        )
        return simple_augmentation(seed_data, multiplier)

    try:
        from gretel_client import Gretel

        gretel = Gretel(api_key=api_key)

        # Convert seed data to tabular format for Gretel
        import pandas as pd

        df = pd.DataFrame(seed_data)

        # Use Gretel's tabular model for synthetic generation
        synthetic = gretel.submit_train(
            "tabular-actgan",
            data_source=df,
            params={"epochs": 100, "batch_size": min(64, len(seed_data))},
        )

        num_records = len(seed_data) * multiplier
        generated_df = synthetic.submit_generate(num_records=num_records)
        return generated_df.to_dict("records")

    except ImportError:
        print(
            "WARN: gretel-client not installed — using simple augmentation",
            file=sys.stderr,
        )
        return simple_augmentation(seed_data, multiplier)
    except Exception as e:
        print(
            f"WARN: Gretel generation failed: {e} — using simple augmentation",
            file=sys.stderr,
        )
        return simple_augmentation(seed_data, multiplier)


def simple_augmentation(seed_data: list[dict], multiplier: int) -> list[dict]:
    """
    Simple augmentation fallback when Gretel is unavailable.
    Creates variants by adding noise to numerical fields and
    generating permutations of categorical fields.
    """
    import random

    augmented = []
    for _ in range(multiplier):
        for seed in seed_data:
            variant = dict(seed)
            # Add noise to numerical fields
            if "quality_score" in variant and variant["quality_score"] is not None:
                noise = random.uniform(-0.1, 0.1)
                score = float(variant["quality_score"]) + noise
                variant["quality_score"] = max(0.0, min(1.0, round(score, 3)))
            if "input_tokens" in variant and variant["input_tokens"] is not None:
                variant["input_tokens"] = max(
                    1, int(variant["input_tokens"]) + random.randint(-50, 50)
                )
            if "output_tokens" in variant and variant["output_tokens"] is not None:
                variant["output_tokens"] = max(
                    1, int(variant["output_tokens"]) + random.randint(-30, 30)
                )
            variant["_synthetic"] = True
            variant["_source"] = "simple_augmentation"
            augmented.append(variant)
    return augmented


def validate_synthetic_data(data: list[dict]) -> list[dict]:
    """
    Basic quality checks on synthetic data.
    Removes entries with obviously invalid values.
    """
    valid = []
    for entry in data:
        # Check required fields exist
        if not entry.get("task_type"):
            continue
        # Check quality score range
        qs = entry.get("quality_score")
        if qs is not None and (float(qs) < 0 or float(qs) > 1):
            continue
        # Check token counts are positive
        if entry.get("input_tokens") is not None and int(entry["input_tokens"]) <= 0:
            continue
        valid.append(entry)

    removed = len(data) - len(valid)
    if removed > 0:
        print(f"Validation removed {removed}/{len(data)} invalid entries")
    return valid


def export_promptfoo_jsonl(data: list[dict], output_path: str):
    """
    Export as Promptfoo-compatible JSONL format.
    Each line is a test case with vars and assert fields.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    with open(output_path, "w") as f:
        for entry in data:
            promptfoo_entry = {
                "vars": {
                    "task_type": entry.get("task_type", "unknown"),
                    "prompt_hash": entry.get("prompt_hash", ""),
                    "prompt_version": entry.get("prompt_version", ""),
                    "model": entry.get("model", ""),
                    "input_tokens": entry.get("input_tokens", 0),
                },
                "assert": [
                    {
                        "type": "javascript",
                        "value": "output.length > 0",
                    },
                ],
                "metadata": {
                    "quality_score": entry.get("quality_score"),
                    "synthetic": entry.get("_synthetic", False),
                    "source": entry.get("_source", "production"),
                    "generated_at": datetime.utcnow().isoformat(),
                },
            }
            f.write(json.dumps(promptfoo_entry) + "\n")

    print(f"Exported {len(data)} entries to {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate synthetic evaluation data from production samples"
    )
    parser.add_argument(
        "--task-type",
        required=True,
        help="Task type to generate data for (e.g., classification, extraction)",
    )
    parser.add_argument(
        "--multiplier",
        type=int,
        default=10,
        help="How many synthetic variants per seed example (default: 10)",
    )
    parser.add_argument(
        "--output",
        default="evals/synthetic-eval-data.jsonl",
        help="Output JSONL file path",
    )
    parser.add_argument(
        "--seed-limit",
        type=int,
        default=100,
        help="Maximum seed examples to load from DB",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Load seeds and print stats without generating",
    )
    args = parser.parse_args()

    conn = get_db_connection()
    try:
        seed_data = load_seed_data(conn, args.task_type, limit=args.seed_limit)
        print(f"Loaded {len(seed_data)} seed examples for task_type='{args.task_type}'")

        if len(seed_data) == 0:
            print("No seed data found — nothing to generate", file=sys.stderr)
            sys.exit(0)

        if args.dry_run:
            print(f"DRY RUN — would generate {len(seed_data) * args.multiplier} synthetic entries")
            sys.exit(0)

        synthetic = generate_with_gretel(seed_data, args.multiplier)
        print(f"Generated {len(synthetic)} synthetic entries (multiplier={args.multiplier})")

        validated = validate_synthetic_data(synthetic)
        print(f"Validated: {len(validated)} entries passed quality checks")

        export_promptfoo_jsonl(validated, args.output)

    finally:
        conn.close()


if __name__ == "__main__":
    main()
