// Static seed data for P0 (the visual shell). P1 replaces this with Supabase queries.

export type DivisionSlug = "studios" | "digital" | "construction" | "living_twin";

export const financeTiles = [
  { label: "Money in · MTD", value: "₹38.4L", delta: "+12.6% vs May", tone: "up" as const, arrow: "up" as const },
  { label: "Money out · MTD", value: "₹26.1L", delta: "BOM-heavy (Living Twin)", tone: "warn" as const, arrow: "down" as const },
  { label: "Owed to us", value: "₹14.7L", delta: "2 invoices overdue", tone: "down" as const, arrow: "clock" as const },
  { label: "Blended margin", value: "23.8%", delta: "Services-band · on plan", tone: "dim" as const, arrow: "none" as const },
];

export const divisionHealth = [
  { name: "Studios", tag: "4 active", tagTone: "dim" as const, value: "₹9.2L", bar: 72, foot: "CHRONO 4DGS · Abhigna film", delta: "+31%", deltaTone: "up" as const },
  { name: "Digital", tag: "3 active", tagTone: "dim" as const, value: "₹6.8L", bar: 54, foot: "2 sprints in review", delta: "+8%", deltaTone: "up" as const },
  { name: "Construction", tag: "RA due", tagTone: "warn" as const, value: "₹17.5L", bar: 61, foot: "Veranza · Tower B · RA-7", delta: "cert pending", deltaTone: "warn" as const },
  { name: "Living Twin", tag: "Pilot", tagTone: "accent" as const, value: "₹4.1L", bar: 38, foot: "Energy cluster · BOM ₹75k", delta: "phase 1", deltaTone: "dim" as const },
];

export const myTasks = [
  { prio: "high" as const, title: "Sign off Veranza Tower B RA-7 certificate", division: "Construction", due: "Today" },
  { prio: "med" as const, title: "Review CHRONO 4DGS volumetric render pass", division: "Studios", due: "Tomorrow" },
  { prio: "med" as const, title: "Send empanelment deck to Sundaram BNP HFC", division: "Living Twin", due: "24 Jun" },
  { prio: "low" as const, title: "Ship invoicing module to staging", division: "Digital", due: "26 Jun" },
  { prio: "low" as const, title: "Calibrate Selec EM2M energy meters vs BESCOM", division: "Living Twin", due: "27 Jun" },
];

export const attention = [
  { kind: "danger" as const, title: "Invoice STD-0142 overdue 11 days", value: "₹3.2L" },
  { kind: "warn" as const, title: "Living Twin BOM 18% over estimate", value: "+₹1.4L" },
  { kind: "accent" as const, title: "Sundaram HFC LOI ready to counter-sign", value: "review" },
];

export const pilotDoc = {
  tag: "Living Twin · Operations / Pilot Dossier",
  title: "Energy Cluster — Pilot Readiness",
  byline: "Internal · revised 22 Jun 2026",
  lead: "Pilot one cluster of roughly twenty-five sensors on the Energy department first — cheapest, Modbus-native, and ground-truthable against the BESCOM net meter. Prove accurate data before any 3D or twin work.",
  figures: [
    { k: "₹75k", l: "Pilot capex" },
    { k: "<2%", l: "Accuracy target" },
    { k: "<7d", l: "To first data" },
  ],
  body: "Stack is WiFi-first: Selec EM2M and Eastron SDM630 meters to an ESP32 bridge over Modbus/RS485, MQTT into a self-hosted ThingsBoard instance. No LoRaWAN, no per-device SIMs.",
};
