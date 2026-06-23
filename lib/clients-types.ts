export type Client = {
  id: string;
  division_id: string;
  division_name: string;
  division_slug: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  stage: string;
  value_paise: number;
  note: string | null;
};

export const CLIENT_STAGES: { key: string; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "contacted", label: "Contacted" },
  { key: "proposal", label: "Proposal" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

export const OPEN_STAGES = ["lead", "contacted", "proposal"];
