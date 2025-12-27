import { pgTable, text, serial, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  x: integer("x").default(0).notNull(), // Using integer but will interpret as fixed-point or just keep as float in runtime
  y: integer("y").default(0).notNull(),
  pickaxeLevel: integer("pickaxe_level").default(1).notNull(),
  // Store inventory as a JSON map: { "stone": 10, "copper_ore": 5 }
  inventory: jsonb("inventory").$type<Record<string, number>>().default({}).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

// Game Data Types
export type ResourceType = "stone" | "copper_ore" | "iron_ore" | "gold_ore" | "diamond" | "wood";

export interface ResourceDefinition {
  type: ResourceType;
  name: string;
  minPickaxeLevel: number; // Level required to mine
  color: string;
}

export const RESOURCES: Record<ResourceType, ResourceDefinition> = {
  stone: { type: "stone", name: "Stone", minPickaxeLevel: 1, color: "#78716c" },
  copper_ore: { type: "copper_ore", name: "Copper Ore", minPickaxeLevel: 1, color: "#b45309" },
  iron_ore: { type: "iron_ore", name: "Iron Ore", minPickaxeLevel: 2, color: "#d1d5db" },
  gold_ore: { type: "gold_ore", name: "Gold Ore", minPickaxeLevel: 3, color: "#fbbf24" },
  diamond: { type: "diamond", name: "Diamond", minPickaxeLevel: 4, color: "#3b82f6" },
  wood: { type: "wood", name: "Wood", minPickaxeLevel: 1, color: "#1b4d2b" },
};

export interface PickaxeDefinition {
  level: number;
  name: string;
  cost: Partial<Record<ResourceType, number>>;
}

export const PICKAXES: PickaxeDefinition[] = [
  { level: 1, name: "Wood Pickaxe", cost: {} },
  { level: 2, name: "Stone Pickaxe", cost: { stone: 20 } },
  { level: 3, name: "Copper Pickaxe", cost: { copper_ore: 20, stone: 50 } },
  { level: 4, name: "Iron Pickaxe", cost: { iron_ore: 20, copper_ore: 50 } },
  { level: 5, name: "Gold Pickaxe", cost: { gold_ore: 20, iron_ore: 50 } },
  { level: 6, name: "Diamond Pickaxe", cost: { diamond: 20, gold_ore: 50 } },
];
