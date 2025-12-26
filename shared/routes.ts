import { z } from "zod";
import { insertUserSchema, users } from "./schema";

export type InsertUser = z.infer<typeof insertUserSchema>;

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  badRequest: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    register: {
      method: "POST" as const,
      path: "/api/register",
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    login: {
      method: "POST" as const,
      path: "/api/login",
      input: insertUserSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: z.object({ message: z.string() }),
      },
    },
    logout: {
      method: "POST" as const,
      path: "/api/logout",
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: "GET" as const,
      path: "/api/user",
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: z.null(),
      },
    },
  },
  game: {
    move: {
      method: "POST" as const,
      path: "/api/game/move",
      input: z.object({ x: z.number(), y: z.number() }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
      },
    },
    mine: {
      method: "POST" as const,
      path: "/api/game/mine",
      input: z.object({ resourceType: z.string() }), // We trust client for resource type existence in this simple MVP
      responses: {
        200: z.object({
          inventory: z.record(z.number()),
          message: z.string(),
        }),
        400: errorSchemas.badRequest,
      },
    },
    craft: {
      method: "POST" as const,
      path: "/api/game/craft",
      input: z.object({}), // Just tries to upgrade current pickaxe
      responses: {
        200: z.object({
          pickaxeLevel: z.number(),
          inventory: z.record(z.number()),
          message: z.string(),
        }),
        400: errorSchemas.badRequest,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
