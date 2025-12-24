import { db } from "./db";
import { users, type User, type InsertUser } from "@shared/schema";
import { eq } from "drizzle-orm";

import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserLocation(id: number, x: number, y: number): Promise<User>;
  updateUserInventory(id: number, inventory: Record<string, number>): Promise<User>;
  updateUserPickaxe(id: number, level: number, inventory: Record<string, number>): Promise<User>;
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserLocation(id: number, x: number, y: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ x, y })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserInventory(id: number, inventory: Record<string, number>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ inventory })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async updateUserPickaxe(id: number, pickaxeLevel: number, inventory: Record<string, number>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ pickaxeLevel, inventory })
      .where(eq(users.id, id))
      .returning();
    return user;
  }
}

export const storage = new DatabaseStorage();
