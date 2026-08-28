export type SlotDirection = "to-campus" | "to-motel";

export interface SlotDef {
  id: string;
  direction: SlotDirection;
  label: string; // e.g. "3:00 PM"
  from: string;
  to: string;
}

export const VAN_CAPACITY_TOTAL = 15; // includes driver
export const MAX_RIDERS_PER_SLOT = VAN_CAPACITY_TOTAL - 1; // 14 paying riders
export const PRICE_PER_RIDER_CENTS = 2000; // $20.00 — what the organizer nets per rider either way

export const PICKUP_ADDRESS = "770 Copperfield Dr, Norman, OK 73072";
export const DROPOFF_ADDRESS = "900 College Ave, Norman, OK 73072";

// Each slot is an independent trip with its own 14-seat cap.
export const SLOTS: SlotDef[] = [
  {
    id: "to-campus-1500",
    direction: "to-campus",
    label: "3:00 PM",
    from: PICKUP_ADDRESS,
    to: DROPOFF_ADDRESS,
  },
  {
    id: "to-campus-1630",
    direction: "to-campus",
    label: "4:30 PM",
    from: PICKUP_ADDRESS,
    to: DROPOFF_ADDRESS,
  },
  {
    id: "to-campus-1800",
    direction: "to-campus",
    label: "6:00 PM",
    from: PICKUP_ADDRESS,
    to: DROPOFF_ADDRESS,
  },
  {
    id: "to-motel-2230",
    direction: "to-motel",
    label: "10:30 PM",
    from: DROPOFF_ADDRESS,
    to: PICKUP_ADDRESS,
  },
  {
    id: "to-motel-0000",
    direction: "to-motel",
    label: "12:00 AM",
    from: DROPOFF_ADDRESS,
    to: PICKUP_ADDRESS,
  },
];

export function getSlotById(id: string): SlotDef | undefined {
  return SLOTS.find((s) => s.id === id);
}

export function directionLabel(dir: SlotDirection): string {
  return dir === "to-campus" ? "To Campus" : "Return to Motel";
}
