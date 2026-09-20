export type UserRole = "trainer" | "admin";
export type ItemCategory = "poke_ball" | "medicine" | "evolution" | "battle" | "key_item" | "quest" | "other";
export type PokemonStatus = "healthy" | "poisoned" | "burned" | "paralyzed" | "asleep" | "frozen" | "fainted";
export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled" | "completed";

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
          pokeapi_slug: string | null;
          icon_url: string | null;
          icon_emoji: string | null;
          description: string | null;
          value: number | null;
          is_tradable: boolean;
          is_sellable: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: ItemCategory;
          pokeapi_slug?: string | null;
          icon_url?: string | null;
          icon_emoji?: string | null;
          description?: string | null;
          value?: number | null;
          is_tradable?: boolean;
          is_sellable?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: ItemCategory;
          pokeapi_slug?: string | null;
          icon_url?: string | null;
          icon_emoji?: string | null;
          description?: string | null;
          value?: number | null;
          is_tradable?: boolean;
          is_sellable?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      shop_listings: {
        Row: {
          id: string;
          item_id: string;
          price: number;
          stock: number | null;
          is_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          price: number;
          stock?: number | null;
          is_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          price?: number;
          stock?: number | null;
          is_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shop_listings_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: true;
            referencedRelation: "items_catalog";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          profile_id: string;
          kind: string;
          title: string;
          body: string;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          kind?: string;
          title: string;
          body?: string;
          read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          kind?: string;
          title?: string;
          body?: string;
          read?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      trades: {
        Row: {
          id: string;
          initiator_id: string;
          recipient_id: string;
          status: TradeStatus;
          initiator_money: number;
          recipient_money: number;
          initiator_confirmed: boolean;
          recipient_confirmed: boolean;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          initiator_id: string;
          recipient_id: string;
          status?: TradeStatus;
          initiator_money?: number;
          recipient_money?: number;
          initiator_confirmed?: boolean;
          recipient_confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          initiator_id?: string;
          recipient_id?: string;
          status?: TradeStatus;
          initiator_money?: number;
          recipient_money?: number;
          initiator_confirmed?: boolean;
          recipient_confirmed?: boolean;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trades_initiator_id_fkey";
            columns: ["initiator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trades_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      trade_pokemon: {
        Row: {
          id: string;
          trade_id: string;
          profile_id: string;
          pokemon_id: string;
        };
        Insert: {
          id?: string;
          trade_id: string;
          profile_id: string;
          pokemon_id: string;
        };
        Update: {
          id?: string;
          trade_id?: string;
          profile_id?: string;
          pokemon_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trade_pokemon_trade_id_fkey";
            columns: ["trade_id"];
            isOneToOne: false;
            referencedRelation: "trades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trade_pokemon_pokemon_id_fkey";
            columns: ["pokemon_id"];
            isOneToOne: false;
            referencedRelation: "trainer_pokemon";
            referencedColumns: ["id"];
          }
        ];
      };
      trade_items: {
        Row: {
          id: string;
          trade_id: string;
          profile_id: string;
          item_id: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          trade_id: string;
          profile_id: string;
          item_id: string;
          quantity: number;
        };
        Update: {
          id?: string;
          trade_id?: string;
          profile_id?: string;
          item_id?: string;
          quantity?: number;
        };
        Relationships: [
          {
            foreignKeyName: "trade_items_trade_id_fkey";
            columns: ["trade_id"];
            isOneToOne: false;
            referencedRelation: "trades";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trade_items_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "items_catalog";
            referencedColumns: ["id"];
          }
        ];
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
    Views: {
      trainer_directory: {
        Row: {
          profile_id: string;
          username: string;
          trainer_id: string;
          avatar: string | null;
        };
        Relationships: [];
      };
    };
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
      purchase_item: {
        Args: { p_listing_id: string; p_quantity?: number };
        Returns: void;
      };
      my_profile_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      send_trade_request: {
        Args: { p_recipient_profile_id: string };
        Returns: string;
      };
      respond_trade_request: {
        Args: { p_trade_id: string; p_accept: boolean };
        Returns: void;
      };
      cancel_trade: {
        Args: { p_trade_id: string };
        Returns: void;
      };
      set_trade_offer: {
        Args: {
          p_trade_id: string;
          p_pokemon_ids: string[] | null;
          p_items: { item_id: string; quantity: number }[] | null;
          p_money: number;
        };
        Returns: void;
      };
      confirm_trade: {
        Args: { p_trade_id: string };
        Returns: void;
      };
    };
    Enums: {
      user_role: UserRole;
      item_category: ItemCategory;
      pokemon_status: PokemonStatus;
      trade_status: TradeStatus;
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
export type ShopListingRow = Database["public"]["Tables"]["shop_listings"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type TradeRow = Database["public"]["Tables"]["trades"]["Row"];
export type TrainerDirectoryEntry = Database["public"]["Views"]["trainer_directory"]["Row"];

/** shop_listings joined with its item_catalog entry, as fetched by useShopListings(). */
export interface ShopListing extends ShopListingRow {
  item: ItemCatalogEntry;
}

/** trainer_pokemon joined with its species + held item, as fetched by useTrainerPokemon(). */
export interface TrainerPokemon extends TrainerPokemonRow {
  species: Species;
  held_item: ItemCatalogEntry | null;
}

/** One side's offer in a trade detail view. */
export interface TradeOfferSide {
  profile: TrainerDirectoryEntry;
  money: number;
  confirmed: boolean;
  pokemon: TrainerPokemon[];
  items: { id: string; item_id: string; item: ItemCatalogEntry; quantity: number }[];
}

/** A trade fully assembled for display, as fetched by useTradeDetail(). */
export interface TradeDetail extends TradeRow {
  initiator: TradeOfferSide;
  recipient: TradeOfferSide;
}

/** A trade in list form, as fetched by useMyTrades() - other trainer only, no offer detail. */
export interface TradeListEntry extends TradeRow {
  otherTrainer: TrainerDirectoryEntry;
  isInitiator: boolean;
}

/** trainer_items joined with its catalog entry, as fetched by useTrainerItems(). */
export interface TrainerItem extends TrainerItemRow {
  item: ItemCatalogEntry;
}
