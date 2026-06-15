import sys
from backend.src.api.routes.stakeholders import _ensure_extraction

print("Running extraction...")
_ensure_extraction()
print("Done!")
