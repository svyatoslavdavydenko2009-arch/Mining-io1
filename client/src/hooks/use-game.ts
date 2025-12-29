import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import type { ResourceType } from "@shared/schema";

export function useGame() {
  const queryClient = useQueryClient();

  const moveMutation = useMutation({
    mutationFn: async (position: { x: number; y: number }) => {
      const res = await fetch(api.game.move.path, {
        method: api.game.move.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(position),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to move");
      return api.game.move.responses[200].parse(await res.json());
    },
    // Optimistic updates handled in UI, this syncs state eventually
    onSuccess: (data) => {
      queryClient.setQueryData([api.auth.me.path], data);
    },
  });

  const mineMutation = useMutation({
    mutationFn: async (resourceType: string) => {
      const res = await fetch(api.game.mine.path, {
        method: api.game.mine.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resourceType }),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.game.mine.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Mining failed");
      }
      return api.game.mine.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      // Update inventory in user cache
      queryClient.setQueryData([api.auth.me.path], (old: any) => {
        if (!old) return old;
        return { ...old, inventory: data.inventory };
      });
    },
  });

  const craftMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(api.game.craft.path, {
        method: api.game.craft.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.game.craft.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Crafting failed");
      }
      return api.game.craft.responses[200].parse(await res.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData([api.auth.me.path], (old: any) => {
        if (!old) return old;
        return { 
          ...old, 
          inventory: data.inventory, 
          pickaxeLevel: data.pickaxeLevel 
        };
      });
    },
  });

  const [hitboxEnabled, setHitboxEnabled] = useState(() => {
    const saved = localStorage.getItem("hitboxEnabled");
    return saved !== null ? JSON.parse(saved) : true;
  });

  const toggleHitbox = () => {
    setHitboxEnabled((prev: boolean) => {
      const next = !prev;
      localStorage.setItem("hitboxEnabled", JSON.stringify(next));
      return next;
    });
  };

  return {
    move: moveMutation,
    mine: mineMutation,
    craft: craftMutation,
    hitboxEnabled,
    toggleHitbox,
  };
}
