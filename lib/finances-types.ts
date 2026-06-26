import type { FinanceImportBatch, RecurringPayment } from "@/lib/recurring";

export type Txn = {
  id: string; division_id: string; division_name: string; division_slug: string;
  project_name: string | null; kind: string; direction: string; amount_paise: number;
  category: string | null; status: string; occurred_on: string; counterparty: string | null;
};
export type Inv = {
  id: string; division_id: string; division_name: string; division_slug: string;
  number: string; counterparty: string | null; amount_paise: number; status: string;
  issued_on: string | null; due_on: string | null; paid_on: string | null;
};
export type Bom = {
  id: string; division_id: string; division_name: string; division_slug: string;
  item: string; qty: number; unit: string | null; unit_cost_paise: number;
  category: string | null; vendor: string | null;
};
export type Ra = {
  id: string; division_id: string; division_name: string; division_slug: string;
  project_name: string | null; sequence: number; period: string | null;
  gross_paise: number; deduction_paise: number; net_paise: number | null;
  status: string; certified_on: string | null;
};
export type EmployeeOption = {
  id: string;
  full_name: string | null;
  email: string | null;
  is_active: boolean;
};

export type { FinanceImportBatch, RecurringPayment };

export type FinView = "ledger" | "invoices" | "pnl" | "bom" | "ra" | "recurring";
