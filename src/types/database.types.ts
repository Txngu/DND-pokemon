export type UserRole = "trainer" | "admin";
export type ItemCategory = "poke_ball" | "medicine" | "evolution" | "battle" | "key_item" | "quest" | "other";
export type PokemonStatus = "healthy" | "poisoned" | "burned" | "paralyzed" | "asleep" | "frozen" | "fainted";
export type TradeStatus = "pending" | "accepted" | "declined" | "cancelled" | "completed";
export type RewardKind = "money" | "items" | "pokemon";
export type RewardStatus = "draft" | "sent";
export type RewardRecipientMode = "user" | "users" | "all" | "city";
export type EvolutionMethod = "level" | "item" | "held_item" | "trade" | "friendship" | "custom";
export type BattleStatus = "active" | "completed" | "lost" | "rewarded" | "ended";
export type BattleMode = "manual" | "auto";
export type PokemonType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice" | "fighting" | "poison" | "ground"
  | "flying" | "psychic" | "bug" | "rock" | "ghost" | "dragon" | "dark" | "steel" | "fairy";
export type MoveCategory = "physical" | "special";
export type RewardSplitMode = "equal" | "per_player" | "custom";
export type TcgLanguage = "en" | "de" | "fr" | "it" | "es" | "pt-br";
export type BattleTargetType = "trainer_pokemon" | "enemy" | "system";
/** items_catalog.battle_effect — see 0009_battle_data.sql. */
export interface ItemBattleEffect {
  heal?: number;
  heal_full?: boolean;
  revive?: number;
  cure?: boolean | PokemonStatus[];
}
export interface NotificationPrefs {
  trades: boolean;
  purchases: boolean;
  system: boolean;
}

export interface Database {
  public: {
    Tables: {
      cities: {
        Row: {
          id: string;
          name: string;
          theme_key: string;
          accent_color: string;
          badge_emoji: string;
          wallpaper_key: string;
        };
        Insert: {
          id?: string;
          name: string;
          theme_key?: string;
          accent_color?: string;
          badge_emoji?: string;
          wallpaper_key?: string;
        };
        Update: {
          id?: string;
          name?: string;
          theme_key?: string;
          accent_color?: string;
          badge_emoji?: string;
          wallpaper_key?: string;
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
          notification_prefs: NotificationPrefs;
          tcg_language: TcgLanguage;
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
          notification_prefs?: NotificationPrefs;
          tcg_language?: TcgLanguage;
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
          notification_prefs?: NotificationPrefs;
          tcg_language?: TcgLanguage;
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
          type1: PokemonType | null;
          type2: PokemonType | null;
        };
        Insert: {
          id: number;
          name: string;
          type1?: PokemonType | null;
          type2?: PokemonType | null;
        };
        Update: {
          id?: number;
          name?: string;
          type1?: PokemonType | null;
          type2?: PokemonType | null;
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
          battle_effect: ItemBattleEffect | null;
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
          battle_effect?: ItemBattleEffect | null;
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
          battle_effect?: ItemBattleEffect | null;
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
      reward_batches: {
        Row: {
          id: string;
          admin_id: string;
          kind: RewardKind;
          status: RewardStatus;
          message: string;
          payload: Record<string, unknown>;
          recipient_mode: RewardRecipientMode;
          recipient_target: Record<string, unknown>;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          admin_id: string;
          kind: RewardKind;
          status?: RewardStatus;
          message?: string;
          payload?: Record<string, unknown>;
          recipient_mode: RewardRecipientMode;
          recipient_target?: Record<string, unknown>;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          admin_id?: string;
          kind?: RewardKind;
          status?: RewardStatus;
          message?: string;
          payload?: Record<string, unknown>;
          recipient_mode?: RewardRecipientMode;
          recipient_target?: Record<string, unknown>;
          created_at?: string;
          sent_at?: string | null;
        };
        Relationships: [];
      };
      reward_deliveries: {
        Row: {
          id: string;
          batch_id: string;
          recipient_id: string;
          delivered_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          recipient_id: string;
          delivered_at?: string;
        };
        Update: {
          id?: string;
          batch_id?: string;
          recipient_id?: string;
          delivered_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reward_deliveries_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "reward_batches";
            referencedColumns: ["id"];
          }
        ];
      };
      admin_activity_log: {
        Row: {
          id: string;
          admin_id: string | null;
          action: string;
          target_profile_id: string | null;
          details: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          action: string;
          target_profile_id?: string | null;
          details?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          action?: string;
          target_profile_id?: string | null;
          details?: Record<string, unknown>;
          created_at?: string;
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
          xp: number;
          is_dead: boolean;
          is_shiny: boolean;
          bonus_attack: number;
          bonus_defense: number;
          bonus_sp_attack: number;
          bonus_sp_defense: number;
          bonus_speed: number;
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
          xp?: number;
          is_dead?: boolean;
          is_shiny?: boolean;
          bonus_attack?: number;
          bonus_defense?: number;
          bonus_sp_attack?: number;
          bonus_sp_defense?: number;
          bonus_speed?: number;
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
          xp?: number;
          is_dead?: boolean;
          is_shiny?: boolean;
          bonus_attack?: number;
          bonus_defense?: number;
          bonus_sp_attack?: number;
          bonus_sp_defense?: number;
          bonus_speed?: number;
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
      game_config: {
        Row: { key: string; value: unknown; description: string | null };
        Insert: { key: string; value: unknown; description?: string | null };
        Update: { key?: string; value?: unknown; description?: string | null };
        Relationships: [];
      };
      evolution_rules: {
        Row: {
          id: string;
          from_species_id: number;
          to_species_id: number;
          method: EvolutionMethod;
          level_required: number | null;
          item_id: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          from_species_id: number;
          to_species_id: number;
          method: EvolutionMethod;
          level_required?: number | null;
          item_id?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          from_species_id?: number;
          to_species_id?: number;
          method?: EvolutionMethod;
          level_required?: number | null;
          item_id?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "evolution_rules_from_species_id_fkey";
            columns: ["from_species_id"];
            isOneToOne: false;
            referencedRelation: "species";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evolution_rules_to_species_id_fkey";
            columns: ["to_species_id"];
            isOneToOne: false;
            referencedRelation: "species";
            referencedColumns: ["id"];
          }
        ];
      };
      battle_encounters: {
        Row: {
          id: string;
          name: string;
          enemy_name: string;
          enemy_species_id: number | null;
          enemy_sprite_url: string | null;
          level: number;
          current_kp: number;
          max_kp: number;
          notes: string | null;
          status: BattleStatus;
          created_by: string | null;
          created_at: string;
          ended_at: string | null;
          mode: BattleMode;
          enemy_auto_attack: boolean;
          enemy_damage_scale: number;
          completed_at: string | null;
          rewarded_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          enemy_name: string;
          enemy_species_id?: number | null;
          enemy_sprite_url?: string | null;
          level?: number;
          current_kp: number;
          max_kp: number;
          notes?: string | null;
          status?: BattleStatus;
          created_by?: string | null;
          created_at?: string;
          ended_at?: string | null;
          mode?: BattleMode;
          enemy_auto_attack?: boolean;
          enemy_damage_scale?: number;
          completed_at?: string | null;
          rewarded_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          enemy_name?: string;
          enemy_species_id?: number | null;
          enemy_sprite_url?: string | null;
          level?: number;
          current_kp?: number;
          max_kp?: number;
          notes?: string | null;
          status?: BattleStatus;
          created_by?: string | null;
          created_at?: string;
          ended_at?: string | null;
          mode?: BattleMode;
          enemy_auto_attack?: boolean;
          enemy_damage_scale?: number;
          completed_at?: string | null;
          rewarded_at?: string | null;
        };
        Relationships: [];
      };
      battle_participants: {
        Row: { id: string; encounter_id: string; pokemon_id: string; profile_id: string; joined_at: string };
        Insert: { id?: string; encounter_id: string; pokemon_id: string; profile_id: string; joined_at?: string };
        Update: { id?: string; encounter_id?: string; pokemon_id?: string; profile_id?: string; joined_at?: string };
        Relationships: [];
      };
      battle_logs: {
        Row: {
          id: string;
          encounter_id: string | null;
          target_type: BattleTargetType;
          target_pokemon_id: string | null;
          target_label: string;
          previous_kp: number;
          new_kp: number;
          delta: number;
          author_id: string | null;
          note: string | null;
          created_at: string;
          action: string | null;
          actor_profile_id: string | null;
          enemy_id: string | null;
          move_name: string | null;
          is_critical: boolean | null;
          effectiveness: number | null;
          message: string | null;
        };
        Insert: {
          id?: string;
          encounter_id?: string | null;
          target_type: BattleTargetType;
          target_pokemon_id?: string | null;
          target_label: string;
          previous_kp: number;
          new_kp: number;
          delta: number;
          author_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          encounter_id?: string | null;
          target_type?: BattleTargetType;
          target_pokemon_id?: string | null;
          target_label?: string;
          previous_kp?: number;
          new_kp?: number;
          delta?: number;
          author_id?: string | null;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      moves: {
        Row: {
          id: number;
          name: string;
          type: PokemonType;
          category: MoveCategory;
          power: number;
          accuracy: number | null;
          description: string | null;
        };
        Insert: {
          id?: number;
          name: string;
          type: PokemonType;
          category: MoveCategory;
          power: number;
          accuracy?: number | null;
          description?: string | null;
        };
        Update: {
          id?: number;
          name?: string;
          type?: PokemonType;
          category?: MoveCategory;
          power?: number;
          accuracy?: number | null;
          description?: string | null;
        };
        Relationships: [];
      };
      battle_enemies: {
        Row: {
          id: string;
          encounter_id: string;
          slot: number;
          name: string;
          species_id: number | null;
          sprite_url: string | null;
          level: number;
          current_hp: number;
          max_hp: number;
          attack: number;
          defense: number;
          sp_attack: number;
          sp_defense: number;
          speed: number;
          type1: PokemonType;
          type2: PokemonType | null;
          move_ids: number[];
          fainted_at: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      battle_players: {
        Row: {
          id: string;
          encounter_id: string;
          profile_id: string;
          active_pokemon_id: string | null;
          damage_dealt: number;
          joined_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "battle_players_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "battle_encounters";
            referencedColumns: ["id"];
          }
        ];
      };
      battle_rewards: {
        Row: {
          id: string;
          encounter_id: string;
          admin_id: string | null;
          money_mode: RewardSplitMode;
          money_input: number;
          total_money: number;
          xp_mode: RewardSplitMode;
          xp_input: number;
          total_xp: number;
          participant_count: number;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      battle_reward_recipients: {
        Row: {
          id: string;
          reward_id: string;
          encounter_id: string;
          profile_id: string;
          money: number;
          xp: number;
          xp_pokemon_id: string | null;
          xp_pokemon_name: string | null;
          xp_claimed_at: string | null;
          level_before: number | null;
          level_after: number | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "battle_reward_recipients_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "battle_encounters";
            referencedColumns: ["id"];
          }
        ];
      };
      money_transactions: {
        Row: {
          id: string;
          profile_id: string;
          amount: number;
          balance_after: number;
          kind: string;
          source_type: string | null;
          source_id: string | null;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tcg_collection: {
        Row: {
          id: string;
          profile_id: string;
          card_id: string;
          lang: TcgLanguage;
          quantity: number;
          is_favorite: boolean;
          name: string;
          category: string | null;
          dex_ids: number[];
          set_id: string | null;
          set_name: string | null;
          local_id: string | null;
          set_total: number | null;
          rarity: string | null;
          hp: number | null;
          types: string[];
          image_url: string | null;
          card_data: Record<string, unknown>;
          added_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      tcg_card_links: {
        Row: { id: string; collection_id: string; pokemon_id: string; profile_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "tcg_card_links_collection_id_fkey";
            columns: ["collection_id"];
            isOneToOne: false;
            referencedRelation: "tcg_collection";
            referencedColumns: ["id"];
          }
        ];
      };
      trainer_pokemon_moves: {
        Row: { pokemon_id: string; slot: number; move_id: number };
        Insert: { pokemon_id: string; slot: number; move_id: number };
        Update: { pokemon_id?: string; slot?: number; move_id?: number };
        Relationships: [];
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
      send_admin_reward: {
        Args: { p_batch_id: string };
        Returns: number;
      };
      adjust_pokemon_kp: {
        Args: { p_pokemon_id: string; p_delta: number; p_note?: string | null; p_encounter_id?: string | null };
        Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"];
      };
      heal_pokemon: {
        Args: { p_pokemon_id: string };
        Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"];
      };
      revive_pokemon: {
        Args: { p_pokemon_id: string };
        Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"];
      };
      admin_set_pokemon_dead: {
        Args: { p_pokemon_id: string; p_note?: string | null };
        Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"];
      };
      grant_pokemon_xp: {
        Args: { p_pokemon_id: string; p_amount: number; p_note?: string | null };
        Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"];
      };
      evolve_with_item: {
        Args: { p_pokemon_id: string; p_rule_id: string };
        Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"];
      };
      join_battle: {
        Args: { p_encounter_id: string; p_pokemon_id: string };
        Returns: void;
      };
      admin_adjust_enemy_kp: {
        Args: { p_encounter_id: string; p_delta: number; p_note?: string | null };
        Returns: Database["public"]["Tables"]["battle_encounters"]["Row"];
      };
      admin_end_encounter: {
        Args: { p_encounter_id: string };
        Returns: void;
      };
      get_battle_state: { Args: { p_encounter_id: string }; Returns: unknown };
      get_my_battle: { Args: Record<string, never>; Returns: unknown };
      battle_choose_pokemon: { Args: { p_encounter_id: string; p_pokemon_id: string }; Returns: unknown };
      battle_attack: { Args: { p_encounter_id: string; p_move_id: number; p_target_enemy_id?: string | null }; Returns: unknown };
      battle_use_item: { Args: { p_encounter_id: string; p_item_id: string; p_pokemon_id: string }; Returns: unknown };
      pokemon_battle_profile: { Args: { p_pokemon_id: string }; Returns: unknown };
      admin_set_pokemon_battle_setup: {
        Args: { p_pokemon_id: string; p_move_ids: number[] | null; p_bonus?: Record<string, number> | null };
        Returns: unknown;
      };
      admin_create_battle: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_player_ids: string[];
          p_enemies: unknown;
          p_enemy_auto_attack?: boolean;
          p_enemy_damage_scale?: number;
        };
        Returns: string;
      };
      admin_add_battle_players: { Args: { p_encounter_id: string; p_player_ids: string[] }; Returns: number };
      admin_adjust_enemy_hp: { Args: { p_enemy_id: string; p_delta: number; p_note?: string | null }; Returns: unknown };
      admin_enemy_attack: {
        Args: { p_encounter_id: string; p_enemy_id: string; p_target_pokemon_id?: string | null };
        Returns: unknown;
      };
      admin_set_battle_status: { Args: { p_encounter_id: string; p_status: string }; Returns: void };
      admin_give_battle_rewards: {
        Args: {
          p_encounter_id: string;
          p_money_mode: RewardSplitMode;
          p_money_value: number;
          p_xp_mode: RewardSplitMode;
          p_xp_value: number;
          p_custom?: unknown;
          p_expected?: unknown;
        };
        Returns: unknown;
      };
      claim_battle_xp: { Args: { p_recipient_id: string; p_pokemon_id: string }; Returns: unknown };
      heal_party: { Args: { p_pokemon_ids?: string[] | null }; Returns: unknown };
      move_pokemon_to_team: { Args: { p_pokemon_id: string }; Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"] };
      move_pokemon_to_pc: { Args: { p_pokemon_id: string }; Returns: Database["public"]["Tables"]["trainer_pokemon"]["Row"] };
      repair_pokemon_locations: {
        Args: Record<string, never>;
        Returns: { pokemon_id: string; owner: string; pokemon: string; problem: string; moved_to: string }[];
      };
      tcg_add_card: { Args: { p_card: unknown; p_lang: TcgLanguage }; Returns: unknown };
      tcg_remove_card: { Args: { p_collection_id: string; p_all?: boolean }; Returns: number };
      tcg_set_favorite: { Args: { p_collection_id: string; p_favorite: boolean }; Returns: void };
      tcg_link_card: { Args: { p_collection_id: string; p_pokemon_id: string }; Returns: unknown };
      tcg_unlink_card: { Args: { p_link_id: string }; Returns: void };
      suggest_moves: {
        Args: { p_type1: string; p_type2: string | null; p_level: number };
        Returns: Database["public"]["Tables"]["moves"]["Row"][];
      };
    };
    Enums: {
      user_role: UserRole;
      item_category: ItemCategory;
      pokemon_status: PokemonStatus;
      trade_status: TradeStatus;
      reward_kind: RewardKind;
      reward_status: RewardStatus;
      reward_recipient_mode: RewardRecipientMode;
      evolution_method: EvolutionMethod;
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
export type RewardBatch = Database["public"]["Tables"]["reward_batches"]["Row"];
export type RewardDelivery = Database["public"]["Tables"]["reward_deliveries"]["Row"];
export type AdminActivityLogEntry = Database["public"]["Tables"]["admin_activity_log"]["Row"];

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

export type GameConfigRow = Database["public"]["Tables"]["game_config"]["Row"];
export type EvolutionRuleRow = Database["public"]["Tables"]["evolution_rules"]["Row"];
export type BattleEncounter = Database["public"]["Tables"]["battle_encounters"]["Row"];
export type BattleParticipantRow = Database["public"]["Tables"]["battle_participants"]["Row"];
export type BattleLogRow = Database["public"]["Tables"]["battle_logs"]["Row"];

/** An evolution rule joined with both species' names and the required item (if any). */
export interface EvolutionRule extends EvolutionRuleRow {
  from_species: Species;
  to_species: Species;
  item: ItemCatalogEntry | null;
}

/** A battle participant joined with its Pokémon and trainer. */
export interface BattleParticipant extends BattleParticipantRow {
  pokemon: TrainerPokemon;
  trainer: TrainerDirectoryEntry;
}

export type Move = Database["public"]["Tables"]["moves"]["Row"];
export type MoneyTransaction = Database["public"]["Tables"]["money_transactions"]["Row"];
export type BattleRewardRecipientRow = Database["public"]["Tables"]["battle_reward_recipients"]["Row"];

// ---------------------------------------------------------------------------
// Shapes returned by the battle RPCs (0010_battle_engine.sql)
// ---------------------------------------------------------------------------
export interface BattleMove {
  id: number;
  name: string;
  type: PokemonType;
  category: MoveCategory;
  power: number;
  accuracy: number | null;
}

export interface BattleEnemyState {
  id: string;
  slot: number;
  name: string;
  species_id: number | null;
  sprite_url: string | null;
  level: number;
  current_hp: number;
  max_hp: number;
  type1: PokemonType;
  type2: PokemonType | null;
  fainted: boolean;
  /** Game Master only */
  attack?: number;
  defense?: number;
  sp_attack?: number;
  sp_defense?: number;
  speed?: number;
  moves?: BattleMove[];
}

export interface BattleActivePokemon {
  id: string;
  name: string;
  species_id: number;
  level: number;
  current_hp: number;
  max_hp: number;
  status: PokemonStatus;
  is_shiny: boolean;
  type1: PokemonType | null;
  type2: PokemonType | null;
}

export interface BattlePlayerState {
  id: string;
  profile_id: string;
  username: string;
  avatar: string | null;
  damage_dealt: number;
  joined_at: string;
  usable_count: number;
  active_pokemon: BattleActivePokemon | null;
}

export interface BattlePartyPokemon extends BattleActivePokemon {
  is_dead: boolean;
  party_slot: number;
  speed: number;
  moves: BattleMove[];
}

export interface BattleBagItem {
  item_id: string;
  name: string;
  quantity: number;
  effect: ItemBattleEffect;
  pokeapi_slug: string | null;
  icon_url: string | null;
  icon_emoji: string | null;
  description: string | null;
}

export interface BattleLogEntry {
  id: string;
  action: string | null;
  target_type: BattleTargetType;
  target_label: string;
  previous_kp: number;
  new_kp: number;
  delta: number;
  move_name: string | null;
  is_critical: boolean | null;
  effectiveness: number | null;
  message: string | null;
  actor_profile_id: string | null;
  enemy_id: string | null;
  target_pokemon_id: string | null;
  created_at: string;
}

export interface BattleRewardRecipient {
  id: string;
  profile_id: string;
  username: string;
  money: number;
  xp: number;
  xp_pokemon_id: string | null;
  xp_pokemon_name: string | null;
  xp_claimed_at: string | null;
  level_before: number | null;
  level_after: number | null;
}

export interface BattleRewardState {
  id: string;
  money_mode: RewardSplitMode;
  money_input: number;
  total_money: number;
  xp_mode: RewardSplitMode;
  xp_input: number;
  total_xp: number;
  participant_count: number;
  created_at: string;
  recipients: BattleRewardRecipient[];
}

export interface BattleState {
  encounter: BattleEncounter;
  is_admin: boolean;
  enemies: BattleEnemyState[];
  players: BattlePlayerState[];
  logs: BattleLogEntry[];
  reward: BattleRewardState | null;
  me?: {
    battle_player_id: string;
    profile_id: string;
    active_pokemon_id: string | null;
    damage_dealt: number;
    party: BattlePartyPokemon[];
    items: BattleBagItem[];
  };
}

/** One step of a resolved battle action, played back in order by the battle screen. */
export interface BattleEvent {
  type: "attack" | "faint" | "blocked" | "status" | "chip" | "item" | "switch" | "victory" | "defeat";
  side?: "player" | "enemy";
  message: string;
  detail?: string | null;
  attacker_id?: string;
  attacker_name?: string;
  attacker_profile_id?: string;
  move_name?: string;
  move_type?: PokemonType;
  target_id?: string;
  target_name?: string;
  target_profile_id?: string;
  missed?: boolean;
  damage?: number;
  effectiveness?: number;
  critical?: boolean;
  hp_before?: number;
  hp_after?: number;
  max_hp?: number;
  fainted?: boolean;
  pokemon_id?: string;
  pokemon_name?: string;
  profile_id?: string;
  species_id?: number;
  item_name?: string;
  revived?: boolean;
  cured?: boolean;
  status_after?: PokemonStatus;
}

export interface BattleActionResult {
  events: BattleEvent[];
}

export interface PokemonBattleProfile {
  type1: PokemonType | null;
  type2: PokemonType | null;
  stats: { attack: number; defense: number; sp_attack: number; sp_defense: number; speed: number };
  bonus: { attack: number; defense: number; sp_attack: number; sp_defense: number; speed: number };
  custom_moves: boolean;
  moves: BattleMove[];
}

export interface PartyHealResult {
  id: string;
  name: string;
  species_id: number;
  result: "revived" | "healed" | "unchanged" | "dead";
  hp_before: number;
  hp_after: number;
  max_hp: number;
  status_before: PokemonStatus;
}

export interface XpClaimResult {
  pokemon_id: string;
  name: string;
  xp: number;
  level_before: number;
  level_after: number;
  species_before: number;
  species_after: number;
  species_after_name: string;
}

export type TcgCollectionEntry = Database["public"]["Tables"]["tcg_collection"]["Row"];
export type TcgCardLink = Database["public"]["Tables"]["tcg_card_links"]["Row"];
