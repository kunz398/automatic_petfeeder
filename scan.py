"""Print the feeder's raw data points so the DP_* numbers in .env can be confirmed.

Run inside the container:  docker compose run --rm petfeeder python scan.py
Tip: change something in the Genio app, run this again, and see which DP changed.
"""

import json

from dotenv import load_dotenv

load_dotenv()

from feeder import Feeder, decode_meal_plan  # noqa: E402

f = Feeder()
dps = f.raw_status()
print(json.dumps(dps, indent=2))
plan = dps.get(f.dp["meal_plan"])
if isinstance(plan, str):
    print("\nDecoded meal plan (DP %s):" % f.dp["meal_plan"])
    for m in decode_meal_plan(plan):
        print("  ", m)
