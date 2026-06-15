import asyncio
from backend.src.simulation import run_simulation, SimConfig, Origin
from backend.src.api.routes.spatial import VENUE_CENTERS

def generate():
    for venue in ["galway", "ullevaal"]:
        center = VENUE_CENTERS[venue]
        for scenario in ["ingress", "egress", "bidirectional"]:
            print(f"Generating {venue} {scenario}...")
            config = SimConfig(
                num_agents=10,
                scenario=scenario,
                total_time=600,
                desired_speed=1.2,
                domain_radius=1200,
                origins=[],
                avoid_polygons=[]
            )
            run_simulation(config, center)
            print("Done")

generate()
