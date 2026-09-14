export type UserRole = "trainer" | "admin";

export interface Database {
  public: {
    Tables: {
      cities: {
        Row: {
          id: string;
          name: string;
        };
        Insert: {
          id?: string;
          name: string;
        };
        Update: {
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          auth_id: string;
          username: string;
          email: string;
          avatar: string | null;
          wallpaper: string | null;
          city_id: string | null;
          money: number;
          trainer_id: string;
          favorite_pokemon: string | null;
          role: UserRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_id: string;
          username: string;
          email: string;
          avatar?: string | null;
          wallpaper?: string | null;
          city_id?: string | null;
          money?: number;
          trainer_id?: string;
          favorite_pokemon?: string | null;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          id?: string;
          auth_id?: string;
          username?: string;
          email?: string;
          avatar?: string | null;
          wallpaper?: string | null;
          city_id?: string | null;
          money?: number;
          trainer_id?: string;
          favorite_pokemon?: string | null;
          role?: UserRole;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_city_id_fkey";
            columns: ["city_id"];
            isOneToOne: false;
            referencedRelation: "cities";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
    };
    Enums: {
      user_role: UserRole;
    };
  };
}

export type City = Database["public"]["Tables"]["cities"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
