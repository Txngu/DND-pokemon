export type UserRole = "trainer" | "admin";
export type ItemCategory = "item" | "poke_ball" | "evolution_item" | "key_item";
export type PokemonStatus = "healthy" | "poisoned" | "burned" | "paralyzed" | "asleep" | "frozen" | "fainted";

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
      species: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id: number;
          name: string;
        };
        Update: {
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      items_catalog: {
        Row: {
          id: string;
          name: string;
          category: ItemCategory;
          pokeapi_slug: string;
          description: string | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          name: string;
          category: ItemCategory;
          pokeapi_slug: string;
          description?: string | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          name?: string;
          category?: ItemCategory;
          pokeapi_slug?: string;
          description?: string | null;
          sort_order?: number;
        };
        Relationships: [];
      };
      trainer_pokemon: {
        Row: {
          id: string;
          profile_id: string;
          species_id: number;
          nickname: string | null;
          level: number;
          nature: string;
          ability: string;
          held_item_id: string | null;
          current_hp: number;
          max_hp: number;
          status: PokemonStatus;
          is_favorite: boolean;
          caught_at: string;
          party_slot: number | null;
          box_id: string | null;
          box_slot: number | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          species_id: number;
          nickname?: string | null;
          level?: number;
          nature?: string;
          ability: string;
          held_item_id?: string | null;
          current_hp: number;
          max_hp: number;
          status?: PokemonStatus;
          is_favorite?: boolean;
          caught_at?: string;
          party_slot?: number | null;
          box_id?: string | null;
          box_slot?: number | null;
        };
        Update: {
          id?: string;
          profile_id?: string;
          species_id?: number;
          nickname?: string | null;
          level?: number;
          nature?: string;
          ability?: string;
          held_item_id?: string | null;
          current_hp?: number;
          max_hp?: number;
          status?: PokemonStatus;
          is_favorite?: boolean;
          caught_at?: string;
          party_slot?: number | null;
          box_id?: string | null;
          box_slot?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "trainer_pokemon_species_id_fkey";
            columns: ["species_id"];
            isOneToOne: false;
            referencedRelation: "species";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_pokemon_held_item_id_fkey";
            columns: ["held_item_id"];
            isOneToOne: false;
            referencedRelation: "items_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_pokemon_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_pokemon_box_id_fkey";
            columns: ["box_id"];
            isOneToOne: false;
            referencedRelation: "pc_boxes";
            referencedColumns: ["id"];
          }
        ];
      };
      pc_boxes: {
        Row: {
          id: string;
          profile_id: string;
          box_number: number;
          name: string;
          capacity: number;
        };
        Insert: {
          id?: string;
          profile_id: string;
          box_number: number;
          name: string;
          capacity?: number;
        };
        Update: {
          id?: string;
          profile_id?: string;
          box_number?: number;
          name?: string;
          capacity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "pc_boxes_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      trainer_items: {
        Row: {
          id: string;
          profile_id: string;
          item_id: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          profile_id: string;
          item_id: string;
          quantity?: number;
        };
        Update: {
          id?: string;
          profile_id?: string;
          item_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trainer_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items_catalog";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trainer_items_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
      is_own_profile: {
        Args: { p_profile_id: string };
        Returns: boolean;
      };
      set_held_item: {
        Args: { p_pokemon_id: string; p_item_id: string | null };
        Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"];
      };
      swap_pokemon_slots: {
        Args: { p_pokemon_a: string; p_pokemon_b: string };
        Returns: void;
      };
    };
    Enums: {
      user_role: UserRole;
      item_category: ItemCategory;
      pokemon_status: PokemonStatus;
    };
  };
}

export type City = Database["public"]["Tables"]["cities"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];
export type Species = Database["public"]["Tables"]["species"]["Row"];
export type ItemCatalogEntry = Database["public"]["Tables"]["items_catalog"]["Row"];
export type TrainerPokemonRow = Database["public"]["Tables"]["trainer_pokemon"]["Row"];
export type TrainerItemRow = Database["public"]["Tables"]["trainer_items"]["Row"];
export type PcBox = Database["public"]["Tables"]["pc_boxes"]["Row"];

/** trainer_pokemon joined with its species + held item, as fetched by useTrainerPokemon(). */
export interface TrainerPokemon extends TrainerPokemonRow {
  species: Species;
  held_item: ItemCatalogEntry | null;
}

/** trainer_items joined with its catalog entry, as fetched by useTrainerItems(). */
export interface TrainerItem extends TrainerItemRow {
  item: ItemCatalogEntry;
}
