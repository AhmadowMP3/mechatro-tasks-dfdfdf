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
      invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string | null
          expires_at: string | null
          full_name: string | null
          id: string
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
          is_master_admin: boolean
          job_title: string | null
          language_pref: string
          last_task_done_on: string | null
          longest_streak: number
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
          is_master_admin?: boolean
          job_title?: string | null
          language_pref?: string
          last_task_done_on?: string | null
          longest_streak?: number
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
          is_master_admin?: boolean
          job_title?: string | null
          language_pref?: string
          last_task_done_on?: string | null
          longest_streak?: number
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
      close_ended_seasons: { Args: never; Returns: number }
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
      profile_status: "pending" | "active" | "suspended"
      project_status: "active" | "on_hold" | "done" | "archived"
      season_scope: "global" | "project"
      season_status: "upcoming" | "active" | "ended"
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
      profile_status: ["pending", "active", "suspended"],
      project_status: ["active", "on_hold", "done", "archived"],
      season_scope: ["global", "project"],
      season_status: ["upcoming", "active", "ended"],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: ["todo", "in_progress", "paused", "in_review", "done"],
    },
  },
} as const
