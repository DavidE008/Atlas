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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      mission_attachments: {
        Row: {
          id: string
          mission_id: string
          storage_path: string
          file_name: string
          content_type: string
          size_bytes: number
          sha256: string
          created_at: string
        }
        Insert: {
          id?: string
          mission_id: string
          storage_path: string
          file_name: string
          content_type: string
          size_bytes: number
          sha256: string
          created_at?: string
        }
        Update: never
        Relationships: [{
          foreignKeyName: "mission_attachments_mission_id_fkey"
          columns: ["mission_id"]
          isOneToOne: false
          referencedRelation: "missions"
          referencedColumns: ["id"]
        }]
      }
      aq_grid_points: {
        Row: {
          id: string
          latitude: number
          longitude: number
          name: string
        }
        Insert: {
          id?: string
          latitude: number
          longitude: number
          name: string
        }
        Update: {
          id?: string
          latitude?: number
          longitude?: number
          name?: string
        }
        Relationships: []
      }
      mission_submissions: {
        Row: {
          created_at: string
          evidence_hash: string
          id: string
          mission_id: string
          note: string
          participant_wallet: string
          photo_path: string | null
          tx_signature: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence_hash: string
          id?: string
          mission_id: string
          note: string
          participant_wallet: string
          photo_path?: string | null
          tx_signature: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence_hash?: string
          id?: string
          mission_id?: string
          note?: string
          participant_wallet?: string
          photo_path?: string | null
          tx_signature?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_submissions_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: true
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          category: string
          category_color: string
          created_at: string
          created_by: string
          custom_category: string | null
          description: string
          id: string
          is_demo: boolean
          latitude: number
          longitude: number
          mission_address: string | null
          mission_key: string
          neighborhood: string
          program_address: string
          review_by: string
          reward_lamports: number
          settlement_status: string | null
          settlement_tx_signature: string | null
          appealed_at: string | null
          appeal_tx_signature: string | null
          sponsor_wallet: string
          submit_by: string
          terms_hash: string | null
          title: string
        }
        Insert: {
          category?: string
          category_color?: string
          created_at?: string
          created_by: string
          custom_category?: string | null
          description: string
          id?: string
          is_demo?: boolean
          latitude: number
          longitude: number
          mission_address?: string | null
          mission_key: string
          neighborhood: string
          program_address: string
          review_by: string
          reward_lamports: number
          settlement_status?: string | null
          settlement_tx_signature?: string | null
          appealed_at?: string | null
          appeal_tx_signature?: string | null
          sponsor_wallet: string
          submit_by: string
          terms_hash?: string | null
          title: string
        }
        Update: {
          category?: string
          category_color?: string
          created_at?: string
          created_by?: string
          custom_category?: string | null
          description?: string
          id?: string
          is_demo?: boolean
          latitude?: number
          longitude?: number
          mission_address?: string | null
          mission_key?: string
          neighborhood?: string
          program_address?: string
          review_by?: string
          reward_lamports?: number
          settlement_status?: string | null
          settlement_tx_signature?: string | null
          appealed_at?: string | null
          appeal_tx_signature?: string | null
          sponsor_wallet?: string
          submit_by?: string
          terms_hash?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      account_settings: {
        Row: {
          updated_at: string
          user_id: string
          wallet_address: string | null
        }
        Insert: {
          updated_at?: string
          user_id: string
          wallet_address?: string | null
        }
        Update: {
          updated_at?: string
          user_id?: string
          wallet_address?: string | null
        }
        Relationships: []
      }
      report_verifications: {
        Row: {
          created_at: string
          id: string
          report_id: string
          tx_signature: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_id: string
          tx_signature: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          id?: string
          report_id?: string
          tx_signature?: string
          wallet_address?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_verifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          latitude: number
          longitude: number
          neighborhood: string | null
          photo_path: string | null
          status: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          latitude: number
          longitude: number
          neighborhood?: string | null
          photo_path?: string | null
          status?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          latitude?: number
          longitude?: number
          neighborhood?: string | null
          photo_path?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
