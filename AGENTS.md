# Project architecture

- Keep the four dashboard camera players mounted while switching between overview and detail; unmounting interrupts live streams and independent analysis.
- Render CAM 1 overview from its existing source canvas and CAM 2–4 from their existing video elements; opening extra streams wastes camera connections and device resources.