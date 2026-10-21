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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: number
          org_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: never
          org_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: never
          org_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      export_history: {
        Row: {
          created_at: string
          dataset: string
          filters: Json
          format: string
          id: string
          org_id: string
          record_count: number
          template_id: string | null
          template_name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          dataset: string
          filters?: Json
          format: string
          id?: string
          org_id: string
          record_count?: number
          template_id?: string | null
          template_name?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          dataset?: string
          filters?: Json
          format?: string
          id?: string
          org_id?: string
          record_count?: number
          template_id?: string | null
          template_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "export_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      export_templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string
          dataset: string
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string
          dataset: string
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string
          dataset?: string
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_balances: {
        Row: {
          expiry_date: string | null
          location_id: string
          lot: string
          material_id: string
          org_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          expiry_date?: string | null
          location_id: string
          lot?: string
          material_id: string
          org_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          expiry_date?: string | null
          location_id?: string
          lot?: string
          material_id?: string
          org_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_balances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          count_id: string
          counted_qty: number
          created_at: string
          difference: number
          expected_qty: number
          id: string
          location_id: string
          lot: string
          material_id: string
          movement_id: string | null
          org_id: string
          reason: string
          user_id: string
        }
        Insert: {
          count_id: string
          counted_qty: number
          created_at?: string
          difference: number
          expected_qty: number
          id?: string
          location_id: string
          lot?: string
          material_id: string
          movement_id?: string | null
          org_id: string
          reason: string
          user_id: string
        }
        Update: {
          count_id?: string
          counted_qty?: number
          created_at?: string
          difference?: number
          expected_qty?: number
          id?: string
          location_id?: string
          lot?: string
          material_id?: string
          movement_id?: string | null
          org_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_count_id_fkey"
            columns: ["count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          org_id: string
          status: string
          warehouse_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          org_id: string
          status?: string
          warehouse_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          org_id?: string
          status?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      location_levels: {
        Row: {
          created_at: string
          id: string
          is_storage: boolean
          name: string
          org_id: string
          sort_order: number
          warehouse_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_storage?: boolean
          name: string
          org_id: string
          sort_order?: number
          warehouse_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_storage?: boolean
          name?: string
          org_id?: string
          sort_order?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_levels_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_levels_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          capacity: number | null
          capacity_unit: string | null
          code: string
          created_at: string
          id: string
          level_id: string
          name: string
          notes: string | null
          org_id: string
          parent_id: string | null
          pos_x: number
          pos_y: number
          status: Database["public"]["Enums"]["location_status"]
          updated_at: string
          warehouse_id: string
        }
        Insert: {
          active?: boolean
          capacity?: number | null
          capacity_unit?: string | null
          code: string
          created_at?: string
          id?: string
          level_id: string
          name: string
          notes?: string | null
          org_id: string
          parent_id?: string | null
          pos_x?: number
          pos_y?: number
          status?: Database["public"]["Enums"]["location_status"]
          updated_at?: string
          warehouse_id: string
        }
        Update: {
          active?: boolean
          capacity?: number | null
          capacity_unit?: string | null
          code?: string
          created_at?: string
          id?: string
          level_id?: string
          name?: string
          notes?: string | null
          org_id?: string
          parent_id?: string | null
          pos_x?: number
          pos_y?: number
          status?: Database["public"]["Enums"]["location_status"]
          updated_at?: string
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "location_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      material_attributes: {
        Row: {
          created_at: string
          data_type: string
          id: string
          key: string
          label: string
          org_id: string
          required: boolean
        }
        Insert: {
          created_at?: string
          data_type?: string
          id?: string
          key: string
          label: string
          org_id: string
          required?: boolean
        }
        Update: {
          created_at?: string
          data_type?: string
          id?: string
          key?: string
          label?: string
          org_id?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "material_attributes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          attributes: Json
          barcode: string | null
          category: string
          code: string
          created_at: string
          description: string
          id: string
          min_stock: number
          org_id: string
          status: string
          tracks_lot: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          category: string
          code: string
          created_at?: string
          description: string
          id?: string
          min_stock?: number
          org_id: string
          status?: string
          tracks_lot?: boolean
          unit: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          category?: string
          code?: string
          created_at?: string
          description?: string
          id?: string
          min_stock?: number
          org_id?: string
          status?: string
          tracks_lot?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          counted_qty: number | null
          created_at: string
          expected_qty: number | null
          from_location_id: string | null
          id: string
          lot: string
          material_id: string
          notes: string | null
          number: number
          org_id: string
          quantity: number
          reason: string | null
          reference: string | null
          request_id: string | null
          reversal_of: string | null
          reversed_by: string | null
          to_location_id: string | null
          type: Database["public"]["Enums"]["movement_type"]
          user_id: string
        }
        Insert: {
          counted_qty?: number | null
          created_at?: string
          expected_qty?: number | null
          from_location_id?: string | null
          id?: string
          lot?: string
          material_id: string
          notes?: string | null
          number?: never
          org_id: string
          quantity: number
          reason?: string | null
          reference?: string | null
          request_id?: string | null
          reversal_of?: string | null
          reversed_by?: string | null
          to_location_id?: string | null
          type: Database["public"]["Enums"]["movement_type"]
          user_id: string
        }
        Update: {
          counted_qty?: number | null
          created_at?: string
          expected_qty?: number | null
          from_location_id?: string | null
          id?: string
          lot?: string
          material_id?: string
          notes?: string | null
          number?: never
          org_id?: string
          quantity?: number
          reason?: string | null
          reference?: string | null
          request_id?: string | null
          reversal_of?: string | null
          reversed_by?: string | null
          to_location_id?: string | null
          type?: Database["public"]["Enums"]["movement_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          location_id: string | null
          material_id: string | null
          movement_id: string | null
          org_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          location_id?: string | null
          material_id?: string | null
          movement_id?: string | null
          org_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          location_id?: string | null
          material_id?: string | null
          movement_id?: string | null
          org_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          active: boolean
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _apply_adjustment: {
        Args: {
          _at?: string
          _count: string
          _counted: number
          _location: string
          _lot: string
          _material: string
          _org: string
          _reason: string
          _user: string
        }
        Returns: string
      }
      _apply_movement: {
        Args: {
          _at?: string
          _from: string
          _lot: string
          _material: string
          _notes: string
          _org: string
          _qty: number
          _reason: string
          _reference: string
          _request: string
          _reversal_of?: string
          _to: string
          _type: Database["public"]["Enums"]["movement_type"]
          _user: string
        }
        Returns: string
      }
      _check_location: {
        Args: { _for_allocation: boolean; _loc: string; _org: string }
        Returns: undefined
      }
      _seed_demo: { Args: { _org: string; _user: string }; Returns: undefined }
      add_member_by_email: {
        Args: {
          _email: string
          _org: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
      create_organization: {
        Args: { _name: string; _with_demo?: boolean }
        Returns: string
      }
      has_org_role: {
        Args: { _min: Database["public"]["Enums"]["app_role"]; _org: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
      ensure_demo_workspace: {
        Args: { _consulta: string; _gestao: string; _operacao: string }
        Returns: string
      }
      load_demo_data: { Args: { _org: string }; Returns: undefined }
      register_adjustment: {
        Args: {
          _count?: string
          _counted: number
          _location: string
          _lot: string
          _material: string
          _org: string
          _reason: string
        }
        Returns: string
      }
      register_movement: {
        Args: {
          _from?: string
          _lot?: string
          _material: string
          _notes?: string
          _org: string
          _qty: number
          _reference?: string
          _request?: string
          _to?: string
          _type: Database["public"]["Enums"]["movement_type"]
        }
        Returns: string
      }
      remove_member: { Args: { _member: string }; Returns: undefined }
      reverse_movement: {
        Args: { _movement: string; _reason: string }
        Returns: string
      }
      set_member_role: {
        Args: {
          _member: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "consulta" | "operacao" | "gestao"
      location_status: "disponivel" | "bloqueado" | "reservado"
      movement_type:
        | "entrada"
        | "saida"
        | "transferencia"
        | "ajuste"
        | "estorno"
      task_priority: "baixa" | "media" | "alta" | "urgente"
      task_status: "a_fazer" | "em_andamento" | "aguardando" | "concluida"
      task_type:
        | "recebimento"
        | "conferencia"
        | "armazenagem"
        | "separacao"
        | "transferencia"
        | "inventario"
        | "expedicao"
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
    Enums: {
      app_role: ["consulta", "operacao", "gestao"],
      location_status: ["disponivel", "bloqueado", "reservado"],
      movement_type: ["entrada", "saida", "transferencia", "ajuste", "estorno"],
      task_priority: ["baixa", "media", "alta", "urgente"],
      task_status: ["a_fazer", "em_andamento", "aguardando", "concluida"],
      task_type: [
        "recebimento",
        "conferencia",
        "armazenagem",
        "separacao",
        "transferencia",
        "inventario",
        "expedicao",
      ],
    },
  },
} as const
