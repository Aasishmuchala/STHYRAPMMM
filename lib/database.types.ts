export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_log: {
        Row: {
          action: string
          at: string
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          at?: string
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bom_items: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string
          id: string
          item: string
          qty: number
          transaction_id: string | null
          unit: string | null
          unit_cost_paise: number
          vendor: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id: string
          id?: string
          item: string
          qty?: number
          transaction_id?: string | null
          unit?: string | null
          unit_cost_paise?: number
          vendor?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string
          id?: string
          item?: string
          qty?: number
          transaction_id?: string | null
          unit?: string | null
          unit_cost_paise?: number
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bom_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bom_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      division_members: {
        Row: {
          created_at: string
          division_id: string
          id: string
          role: Database["public"]["Enums"]["division_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          division_id: string
          id?: string
          role?: Database["public"]["Enums"]["division_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          division_id?: string
          id?: string
          role?: Database["public"]["Enums"]["division_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "division_members_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "division_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: Database["public"]["Enums"]["division_slug"]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: Database["public"]["Enums"]["division_slug"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: Database["public"]["Enums"]["division_slug"]
        }
        Relationships: []
      }
      documents: {
        Row: {
          body_md: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string
          doc_type: string | null
          id: string
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id: string
          doc_type?: string | null
          id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          body_md?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string
          doc_type?: string | null
          id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_allowlist: {
        Row: {
          email: string
          full_name: string | null
          global_role: Database["public"]["Enums"]["global_role"]
          invited_at: string
        }
        Insert: {
          email: string
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          invited_at?: string
        }
        Update: {
          email?: string
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          invited_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_paise: number
          counterparty: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string
          due_on: string | null
          id: string
          issued_on: string | null
          number: string
          paid_on: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
        }
        Insert: {
          amount_paise: number
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id: string
          due_on?: string | null
          id?: string
          issued_on?: string | null
          number: string
          paid_on?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Update: {
          amount_paise?: number
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string
          due_on?: string | null
          id?: string
          issued_on?: string | null
          number?: string
          paid_on?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          global_role: Database["public"]["Enums"]["global_role"]
          id: string
          is_active: boolean
          theme: string | null
          wallpaper: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          id: string
          is_active?: boolean
          theme?: string | null
          wallpaper?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          global_role?: Database["public"]["Enums"]["global_role"]
          id?: string
          is_active?: boolean
          theme?: string | null
          wallpaper?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          client: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          division_id: string
          id: string
          name: string
          status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          client?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          division_id?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["project_status"]
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      ra_bills: {
        Row: {
          certified_on: string | null
          created_at: string
          created_by: string | null
          deduction_paise: number
          deleted_at: string | null
          division_id: string
          gross_paise: number
          id: string
          net_paise: number | null
          period: string | null
          project_id: string | null
          sequence: number
          status: string
        }
        Insert: {
          certified_on?: string | null
          created_at?: string
          created_by?: string | null
          deduction_paise?: number
          deleted_at?: string | null
          division_id: string
          gross_paise?: number
          id?: string
          net_paise?: number | null
          period?: string | null
          project_id?: string | null
          sequence: number
          status?: string
        }
        Update: {
          certified_on?: string | null
          created_at?: string
          created_by?: string | null
          deduction_paise?: number
          deleted_at?: string | null
          division_id?: string
          gross_paise?: number
          id?: string
          net_paise?: number | null
          period?: string | null
          project_id?: string | null
          sequence?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ra_bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ra_bills_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ra_bills_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          division_id: string
          doc_id: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          status_key: string
          title: string
          transaction_id: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          division_id: string
          doc_id?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_key?: string
          title: string
          transaction_id?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          division_id?: string
          doc_id?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          status_key?: string
          title?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_key_fkey"
            columns: ["status_key"]
            isOneToOne: false
            referencedRelation: "task_stages"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "tasks_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      task_stages: {
        Row: {
          color: string
          created_at: string
          is_done: boolean
          key: string
          label: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          is_done?: boolean
          key: string
          label: string
          position?: number
        }
        Update: {
          color?: string
          created_at?: string
          is_done?: boolean
          key?: string
          label?: string
          position?: number
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount_paise: number
          category: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          division_id: string
          id: string
          kind: Database["public"]["Enums"]["txn_kind"]
          note: string | null
          occurred_on: string
          project_id: string | null
          status: Database["public"]["Enums"]["txn_status"]
        }
        Insert: {
          amount_paise: number
          category?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          direction: Database["public"]["Enums"]["txn_direction"]
          division_id: string
          id?: string
          kind: Database["public"]["Enums"]["txn_kind"]
          note?: string | null
          occurred_on?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
        }
        Update: {
          amount_paise?: number
          category?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          direction?: Database["public"]["Enums"]["txn_direction"]
          division_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["txn_kind"]
          note?: string | null
          occurred_on?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["txn_status"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_lead_of: { Args: { div: string }; Returns: boolean }
      is_member_of: { Args: { div: string }; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      shares_division: { Args: { other: string }; Returns: boolean }
    }
    Enums: {
      division_role: "lead" | "member"
      division_slug: "studios" | "digital" | "construction" | "living_twin"
      doc_status: "draft" | "active" | "archived"
      global_role: "owner" | "member"
      invoice_status: "draft" | "sent" | "paid" | "overdue"
      project_status: "active" | "paused" | "done"
      task_priority: "lowest" | "low" | "medium" | "high" | "highest"
      task_status: "todo" | "doing" | "review" | "done"
      txn_direction: "in" | "out"
      txn_kind: "revenue" | "cost" | "invoice"
      txn_status: "draft" | "pending" | "cleared" | "void"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      division_role: ["lead", "member"],
      division_slug: ["studios", "digital", "construction", "living_twin"],
      doc_status: ["draft", "active", "archived"],
      global_role: ["owner", "member"],
      invoice_status: ["draft", "sent", "paid", "overdue"],
      project_status: ["active", "paused", "done"],
      task_priority: ["lowest", "low", "medium", "high", "highest"],
      task_status: ["todo", "doing", "review", "done"],
      txn_direction: ["in", "out"],
      txn_kind: ["revenue", "cost", "invoice"],
      txn_status: ["draft", "pending", "cleared", "void"],
    },
  },
} as const

export type DivisionSlug = Database["public"]["Enums"]["division_slug"]
