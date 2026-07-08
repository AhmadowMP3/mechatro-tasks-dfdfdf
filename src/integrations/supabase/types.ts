export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          meta: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          meta?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          meta?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          id: boolean
          master_admin_email: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          master_admin_email?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          master_admin_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      backup_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          error: string | null
          id: string
          requested_at: string
          requested_by: string | null
          result_file: string | null
          status: Database["public"]["Enums"]["backup_request_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          id?: string
          requested_at?: string
          requested_by?: string | null
          result_file?: string | null
          status?: Database["public"]["Enums"]["backup_request_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          error?: string | null
          id?: string
          requested_at?: string
          requested_by?: string | null
          result_file?: string | null
          status?: Database["public"]["Enums"]["backup_request_status"]
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          company: string | null
          created_at: string
          created_by: string | null
          default_currency: Database["public"]["Enums"]["currency_code"]
          email: string | null
          id: string
          name_ar: string | null
          name_en: string | null
          notes: string | null
          phone: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          email?: string | null
          id?: string
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          email?: string | null
          id?: string
          name_ar?: string | null
          name_en?: string | null
          notes?: string | null
          phone?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_categories: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name_ar: string
          name_en: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name_ar: string
          name_en: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name_ar?: string
          name_en?: string
          sort_order?: number
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description_ar: string | null
          description_en: string | null
          exchange_rate_to_usd: number | null
          expense_date: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          project_id: string | null
          receipt_path: string | null
          reference: string | null
          status: Database["public"]["Enums"]["expense_status"]
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description_ar?: string | null
          description_en?: string | null
          exchange_rate_to_usd?: number | null
          expense_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          project_id?: string | null
          receipt_path?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description_ar?: string | null
          description_en?: string | null
          exchange_rate_to_usd?: number | null
          expense_date?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          project_id?: string | null
          receipt_path?: string | null
          reference?: string | null
          status?: Database["public"]["Enums"]["expense_status"]
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_reminders_log: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          reminder_type: string
          sent_on: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          reminder_type: string
          sent_on?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          reminder_type?: string
          sent_on?: string
        }
        Relationships: []
      }
      financial_settings: {
        Row: {
          bank_details_ar: string | null
          bank_details_en: string | null
          company_address_ar: string | null
          company_address_en: string | null
          company_email: string | null
          company_name_ar: string | null
          company_name_en: string | null
          company_phone: string | null
          default_currency: Database["public"]["Enums"]["currency_code"]
          default_tax_rate: number
          id: boolean
          invoice_next_number: number
          invoice_number_prefix: string
          invoice_terms_ar: string | null
          invoice_terms_en: string | null
          signature_url: string | null
          stamp_url: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          bank_details_ar?: string | null
          bank_details_en?: string | null
          company_address_ar?: string | null
          company_address_en?: string | null
          company_email?: string | null
          company_name_ar?: string | null
          company_name_en?: string | null
          company_phone?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          default_tax_rate?: number
          id?: boolean
          invoice_next_number?: number
          invoice_number_prefix?: string
          invoice_terms_ar?: string | null
          invoice_terms_en?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          bank_details_ar?: string | null
          bank_details_en?: string | null
          company_address_ar?: string | null
          company_address_en?: string | null
          company_email?: string | null
          company_name_ar?: string | null
          company_name_en?: string | null
          company_phone?: string | null
          default_currency?: Database["public"]["Enums"]["currency_code"]
          default_tax_rate?: number
          id?: boolean
          invoice_next_number?: number
          invoice_number_prefix?: string
          invoice_terms_ar?: string | null
          invoice_terms_en?: string | null
          signature_url?: string | null
          stamp_url?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fx_rates: {
        Row: {
          created_at: string
          created_by: string | null
          effective_date: string
          id: string
          note: string | null
          syp_per_usd: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_date: string
          id?: string
          note?: string | null
          syp_per_usd: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_date?: string
          id?: string
          note?: string | null
          syp_per_usd?: number
        }
        Relationships: []
      }
      income_entries: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          description_ar: string | null
          description_en: string | null
          exchange_rate_to_usd: number | null
          id: string
          income_date: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          reference: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description_ar?: string | null
          description_en?: string | null
          exchange_rate_to_usd?: number | null
          id?: string
          income_date?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          reference?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          description_ar?: string | null
          description_en?: string | null
          exchange_rate_to_usd?: number | null
          id?: string
          income_date?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          reference?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string | null
          full_name: string | null
          id: string
          max_devices: number
          password_attempts: number
          password_hash: string | null
          password_locked_until: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["app_role"]
          token: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          full_name?: string | null
          id?: string
          max_devices?: number
          password_attempts?: number
          password_hash?: string | null
          password_locked_until?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          expires_at?: string | null
          full_name?: string | null
          id?: string
          max_devices?: number
          password_attempts?: number
          password_hash?: string | null
          password_locked_until?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          token?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          description_ar: string | null
          description_en: string | null
          discount_amount: number
          id: string
          invoice_id: string
          line_total: number
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          description_ar?: string | null
          description_en?: string | null
          discount_amount?: number
          id?: string
          invoice_id: string
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          description_ar?: string | null
          description_en?: string | null
          discount_amount?: number
          id?: string
          invoice_id?: string
          line_total?: number
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          exchange_rate_to_usd: number | null
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          paid_at: string
          proof_path: string | null
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: Database["public"]["Enums"]["currency_code"]
          exchange_rate_to_usd?: number | null
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          proof_path?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          exchange_rate_to_usd?: number | null
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          paid_at?: string
          proof_path?: string | null
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          discount_amount: number
          due_date: string | null
          exchange_rate_to_usd: number | null
          id: string
          issue_date: string
          notes_ar: string | null
          notes_en: string | null
          number: string
          pdf_path: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          tax_rate: number
          terms_ar: string | null
          terms_en: string | null
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          discount_amount?: number
          due_date?: string | null
          exchange_rate_to_usd?: number | null
          id?: string
          issue_date?: string
          notes_ar?: string | null
          notes_en?: string | null
          number: string
          pdf_path?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          terms_ar?: string | null
          terms_en?: string | null
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string
          discount_amount?: number
          due_date?: string | null
          exchange_rate_to_usd?: number | null
          id?: string
          issue_date?: string
          notes_ar?: string | null
          notes_en?: string | null
          number?: string
          pdf_path?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          terms_ar?: string | null
          terms_en?: string | null
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      league_seasons: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          name: string
          project_id: string | null
          scope: Database["public"]["Enums"]["season_scope"]
          starts_at: string
          status: Database["public"]["Enums"]["season_status"]
          updated_at: string
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          name: string
          project_id?: string | null
          scope?: Database["public"]["Enums"]["season_scope"]
          starts_at: string
          status?: Database["public"]["Enums"]["season_status"]
          updated_at?: string
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          name?: string
          project_id?: string | null
          scope?: Database["public"]["Enums"]["season_scope"]
          starts_at?: string
          status?: Database["public"]["Enums"]["season_status"]
          updated_at?: string
          winner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      member_reports: {
        Row: {
          compare_member_a: string | null
          compare_member_b: string | null
          compare_report_a: string | null
          compare_report_b: string | null
          created_at: string
          generated_by: string | null
          generated_by_name_snapshot: string | null
          id: string
          kind: string
          kpi_snapshot: Json
          language: string
          member_id: string | null
          member_name_snapshot: string | null
          page_count: number | null
          pdf_path: string
          pdf_size_bytes: number | null
          range_from: string | null
          range_key: string
          range_to: string | null
          snapshot_version: number
          updated_at: string
        }
        Insert: {
          compare_member_a?: string | null
          compare_member_b?: string | null
          compare_report_a?: string | null
          compare_report_b?: string | null
          created_at?: string
          generated_by?: string | null
          generated_by_name_snapshot?: string | null
          id?: string
          kind?: string
          kpi_snapshot?: Json
          language: string
          member_id?: string | null
          member_name_snapshot?: string | null
          page_count?: number | null
          pdf_path: string
          pdf_size_bytes?: number | null
          range_from?: string | null
          range_key: string
          range_to?: string | null
          snapshot_version?: number
          updated_at?: string
        }
        Update: {
          compare_member_a?: string | null
          compare_member_b?: string | null
          compare_report_a?: string | null
          compare_report_b?: string | null
          created_at?: string
          generated_by?: string | null
          generated_by_name_snapshot?: string | null
          id?: string
          kind?: string
          kpi_snapshot?: Json
          language?: string
          member_id?: string | null
          member_name_snapshot?: string | null
          page_count?: number | null
          pdf_path?: string
          pdf_size_bytes?: number | null
          range_from?: string | null
          range_key?: string
          range_to?: string | null
          snapshot_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_reports_compare_member_a_fkey"
            columns: ["compare_member_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_compare_member_a_fkey"
            columns: ["compare_member_a"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_compare_member_b_fkey"
            columns: ["compare_member_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_compare_member_b_fkey"
            columns: ["compare_member_b"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_compare_report_a_fkey"
            columns: ["compare_report_a"]
            isOneToOne: false
            referencedRelation: "member_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_compare_report_b_fkey"
            columns: ["compare_report_b"]
            isOneToOne: false
            referencedRelation: "member_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_reports_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      member_salary_settings: {
        Row: {
          base_salary: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          notes: string | null
          other_fixed_allowance: number
          points_bonus_rate: number
          transport_allowance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_salary?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          notes?: string | null
          other_fixed_allowance?: number
          points_bonus_rate?: number
          transport_allowance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_salary?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          notes?: string | null
          other_fixed_allowance?: number
          points_bonus_rate?: number
          transport_allowance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_salary_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_salary_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      note_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          mime_type: string | null
          note_id: string
          size: number | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          mime_type?: string | null
          note_id: string
          size?: number | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          mime_type?: string | null
          note_id?: string
          size?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "note_attachments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          note_id: string
          resolved: boolean
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          note_id: string
          resolved?: boolean
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          note_id?: string
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "note_comments_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
        ]
      }
      note_folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      note_shares: {
        Row: {
          created_at: string
          note_id: string
          permission: string
          shared_with_user_id: string
        }
        Insert: {
          created_at?: string
          note_id: string
          permission?: string
          shared_with_user_id: string
        }
        Update: {
          created_at?: string
          note_id?: string
          permission?: string
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_shares_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_shares_shared_with_user_id_fkey"
            columns: ["shared_with_user_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      note_tag_links: {
        Row: {
          note_id: string
          tag_id: string
        }
        Insert: {
          note_id: string
          tag_id: string
        }
        Update: {
          note_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "note_tag_links_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "note_tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "note_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      note_tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          color: string
          content_html: string
          content_text: string
          cover_url: string | null
          created_at: string
          emoji: string | null
          folder_id: string | null
          id: string
          is_favorite: boolean
          is_pinned: boolean
          owner_id: string
          title: string
          updated_at: string
        }
        Insert: {
          color?: string
          content_html?: string
          content_text?: string
          cover_url?: string | null
          created_at?: string
          emoji?: string | null
          folder_id?: string | null
          id?: string
          is_favorite?: boolean
          is_pinned?: boolean
          owner_id: string
          title?: string
          updated_at?: string
        }
        Update: {
          color?: string
          content_html?: string
          content_text?: string
          cover_url?: string | null
          created_at?: string
          emoji?: string | null
          folder_id?: string | null
          id?: string
          is_favorite?: boolean
          is_pinned?: boolean
          owner_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "note_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          id: string
          read: boolean
          title_ar: string
          title_en: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          read?: boolean
          title_ar: string
          title_en: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          id?: string
          read?: boolean
          title_ar?: string
          title_en?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          base_salary: number
          created_at: string
          currency: Database["public"]["Enums"]["currency_code"]
          deductions: number
          id: string
          manual_bonus: number
          net_amount: number
          notes: string | null
          other_allowance: number
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          period_id: string
          points_bonus: number
          points_snapshot: number
          streak_bonus: number
          tasks_done_snapshot: number
          transport_allowance: number
          updated_at: string
          user_id: string
        }
        Insert: {
          base_salary?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          deductions?: number
          id?: string
          manual_bonus?: number
          net_amount?: number
          notes?: string | null
          other_allowance?: number
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_id: string
          points_bonus?: number
          points_snapshot?: number
          streak_bonus?: number
          tasks_done_snapshot?: number
          transport_allowance?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          base_salary?: number
          created_at?: string
          currency?: Database["public"]["Enums"]["currency_code"]
          deductions?: number
          id?: string
          manual_bonus?: number
          net_amount?: number
          notes?: string | null
          other_allowance?: number
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          period_id?: string
          points_bonus?: number
          points_snapshot?: number
          streak_bonus?: number
          tasks_done_snapshot?: number
          transport_allowance?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          created_at: string
          created_by: string | null
          finalized_at: string | null
          id: string
          month: number
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["payroll_period_status"]
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          month: number
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payroll_period_status"]
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finalized_at?: string | null
          id?: string
          month?: number
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["payroll_period_status"]
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          created_at: string
          current_streak: number
          email: string | null
          full_name: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_finance_admin: boolean
          is_master_admin: boolean
          job_title: string | null
          language_pref: string
          last_task_done_on: string | null
          longest_streak: number
          max_devices: number
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["profile_status"]
          suspend_reason: string | null
          suspended_at: string | null
          suspended_by: string | null
          theme_pref: string
          total_points: number
          username: string | null
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_finance_admin?: boolean
          is_master_admin?: boolean
          job_title?: string | null
          language_pref?: string
          last_task_done_on?: string | null
          longest_streak?: number
          max_devices?: number
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          theme_pref?: string
          total_points?: number
          username?: string | null
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          created_at?: string
          current_streak?: number
          email?: string | null
          full_name?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_finance_admin?: boolean
          is_master_admin?: boolean
          job_title?: string | null
          language_pref?: string
          last_task_done_on?: string | null
          longest_streak?: number
          max_devices?: number
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          suspend_reason?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          theme_pref?: string
          total_points?: number
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          name_ar: string
          name_en: string
          start_date: string | null
          status: Database["public"]["Enums"]["project_status"]
        }
        Insert: {
          archived?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name_ar: string
          name_en: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status"]
        }
        Update: {
          archived?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          name_ar?: string
          name_en?: string
          start_date?: string | null
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
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      references: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          pinned: boolean
          tags: string[]
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          pinned?: boolean
          tags?: string[]
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          pinned?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      season_scores: {
        Row: {
          last_rank: number | null
          points: number
          season_id: string
          tasks_done: number
          updated_at: string
          user_id: string
        }
        Insert: {
          last_rank?: number | null
          points?: number
          season_id: string
          tasks_done?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          last_rank?: number | null
          points?: number
          season_id?: string
          tasks_done?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "season_scores_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "league_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          allowed_pages: string[]
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string
          last_used_at: string | null
          max_uses: number | null
          password_hash: string | null
          password_salt: string | null
          revoked: boolean
          token: string
          updated_at: string
          use_count: number
        }
        Insert: {
          allowed_pages?: string[]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          max_uses?: number | null
          password_hash?: string | null
          password_salt?: string | null
          revoked?: boolean
          token: string
          updated_at?: string
          use_count?: number
        }
        Update: {
          allowed_pages?: string[]
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          last_used_at?: string | null
          max_uses?: number | null
          password_hash?: string | null
          password_salt?: string | null
          revoked?: boolean
          token?: string
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions_expense: {
        Row: {
          amount: number
          auto_create_expense: boolean
          category: string | null
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          cycle: Database["public"]["Enums"]["subscription_cycle"]
          id: string
          name: string
          next_renewal_date: string
          notes: string | null
          reminder_days: number
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          auto_create_expense?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          cycle?: Database["public"]["Enums"]["subscription_cycle"]
          id?: string
          name: string
          next_renewal_date: string
          notes?: string | null
          reminder_days?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          auto_create_expense?: boolean
          category?: string | null
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          cycle?: Database["public"]["Enums"]["subscription_cycle"]
          id?: string
          name?: string
          next_renewal_date?: string
          notes?: string | null
          reminder_days?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_expense_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_expense_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions_income: {
        Row: {
          amount: number
          auto_create_invoice: boolean
          created_at: string
          created_by: string | null
          currency: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          cycle: Database["public"]["Enums"]["subscription_cycle"]
          description: string | null
          id: string
          next_invoice_date: string
          notes: string | null
          plan_name: string
          reminder_days: number
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          amount?: number
          auto_create_invoice?: boolean
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id: string
          cycle?: Database["public"]["Enums"]["subscription_cycle"]
          description?: string | null
          id?: string
          next_invoice_date: string
          notes?: string | null
          plan_name: string
          reminder_days?: number
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_create_invoice?: boolean
          created_at?: string
          created_by?: string | null
          currency?: Database["public"]["Enums"]["currency_code"]
          customer_id?: string
          cycle?: Database["public"]["Enums"]["subscription_cycle"]
          description?: string | null
          id?: string
          next_invoice_date?: string
          notes?: string | null
          plan_name?: string
          reminder_days?: number
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_income_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_income_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_income_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_files: {
        Row: {
          added_by: string | null
          created_at: string
          drive_url: string
          file_name: string
          file_type: string | null
          id: string
          task_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          drive_url: string
          file_name: string
          file_type?: string | null
          id?: string
          task_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          drive_url?: string
          file_name?: string
          file_type?: string | null
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_files_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_files_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          points: number
          points_awarded_amount: number | null
          points_awarded_at: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          progress: number
          project_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          points?: number
          points_awarded_amount?: number | null
          points_awarded_at?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          project_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          points?: number
          points_awarded_amount?: number | null
          points_awarded_at?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          progress?: number
          project_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
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
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
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
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          awarded_at: string
          code: string
          id: string
          meta: Json
          user_id: string
        }
        Insert: {
          awarded_at?: string
          code: string
          id?: string
          meta?: Json
          user_id: string
        }
        Update: {
          awarded_at?: string
          code?: string
          id?: string
          meta?: Json
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          device_id: string
          id: string
          last_seen_at: string
          revoked_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      work_sessions: {
        Row: {
          duration_minutes: number | null
          ended_at: string | null
          id: string
          started_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          started_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_sessions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "team_directory"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      team_directory: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_subscription_date: {
        Args: {
          base_date: string
          c: Database["public"]["Enums"]["subscription_cycle"]
        }
        Returns: string
      }
      can_view_note: {
        Args: { _note_id: string; _user_id: string }
        Returns: boolean
      }
      close_ended_seasons: { Args: never; Returns: number }
      is_note_owner: {
        Args: { _note_id: string; _user_id: string }
        Returns: boolean
      }
      next_invoice_number: { Args: never; Returns: string }
      resolve_login_email: { Args: { p_name: string }; Returns: string }
      sync_master_admin: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "manager" | "member" | "viewer"
      backup_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "completed"
        | "failed"
        | "expired"
      currency_code: "SYP" | "USD"
      expense_status: "pending" | "paid" | "cancelled"
      invoice_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "cheque"
        | "card"
        | "other"
        | "sham_cash"
      payroll_period_status: "draft" | "finalized" | "paid"
      profile_status: "pending" | "active" | "suspended"
      project_status: "active" | "on_hold" | "done" | "archived"
      season_scope: "global" | "project"
      season_status: "upcoming" | "active" | "ended"
      subscription_cycle: "monthly" | "quarterly" | "semiannual" | "annual"
      subscription_status: "active" | "paused" | "canceled"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "paused" | "in_review" | "done"
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
      app_role: ["admin", "manager", "member", "viewer"],
      backup_request_status: [
        "pending",
        "approved",
        "rejected",
        "completed",
        "failed",
        "expired",
      ],
      currency_code: ["SYP", "USD"],
      expense_status: ["pending", "paid", "cancelled"],
      invoice_status: [
        "draft",
        "issued",
        "partially_paid",
        "paid",
        "overdue",
        "void",
      ],
      payment_method: [
        "cash",
        "bank_transfer",
        "cheque",
        "card",
        "other",
        "sham_cash",
      ],
      payroll_period_status: ["draft", "finalized", "paid"],
      profile_status: ["pending", "active", "suspended"],
      project_status: ["active", "on_hold", "done", "archived"],
      season_scope: ["global", "project"],
      season_status: ["upcoming", "active", "ended"],
      subscription_cycle: ["monthly", "quarterly", "semiannual", "annual"],
      subscription_status: ["active", "paused", "canceled"],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["todo", "in_progress", "paused", "in_review", "done"],
    },
  },
} as const
