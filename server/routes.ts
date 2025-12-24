import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import { setupAuth } from "./auth";
import { RESOURCES, PICKAXES, type ResourceType } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Set up authentication routes and middleware
  setupAuth(app);

  // --- Game Routes ---

  // Move
  app.post(api.game.move.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const { x, y } = api.game.move.input.parse(req.body);
    const user = await storage.updateUserLocation(req.user!.id, x, y);
    res.json(user);
  });

  // Mine
  app.post(api.game.mine.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const { resourceType } = api.game.mine.input.parse(req.body);
    const resource = RESOURCES[resourceType as ResourceType];

    if (!resource) {
      return res.status(400).json({ message: "Unknown resource" });
    }

    if (req.user!.pickaxeLevel < resource.minPickaxeLevel) {
      return res.status(400).json({ message: "Pickaxe level too low" });
    }

    const currentInventory = { ...req.user!.inventory };
    currentInventory[resourceType] = (currentInventory[resourceType] || 0) + 1;

    const updatedUser = await storage.updateUserInventory(req.user!.id, currentInventory);
    
    res.json({ 
      inventory: updatedUser.inventory, 
      message: `Mined ${resource.name}!` 
    });
  });

  // Craft (Upgrade Pickaxe)
  app.post(api.game.craft.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const nextLevel = req.user!.pickaxeLevel + 1;
    const nextPickaxe = PICKAXES.find(p => p.level === nextLevel);

    if (!nextPickaxe) {
      return res.status(400).json({ message: "Max level reached!" });
    }

    // Check costs
    const inventory = { ...req.user!.inventory };
    for (const [resType, amount] of Object.entries(nextPickaxe.cost)) {
      if ((inventory[resType] || 0) < amount) {
        return res.status(400).json({ message: `Not enough ${RESOURCES[resType as ResourceType].name}` });
      }
    }

    // Deduct costs
    for (const [resType, amount] of Object.entries(nextPickaxe.cost)) {
      inventory[resType] -= amount;
    }

    const updatedUser = await storage.updateUserPickaxe(req.user!.id, nextLevel, inventory);

    res.json({
      pickaxeLevel: updatedUser.pickaxeLevel,
      inventory: updatedUser.inventory,
      message: `Upgraded to ${nextPickaxe.name}!`
    });
  });

  return httpServer;
}
