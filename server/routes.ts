import type { Express } from "express";
import type { Server } from 'node:http';

// This app talks directly to Supabase's REST API from the client using the
// public anon key (protected by Postgres Row Level Security). There is no
// custom backend API — Express here only serves the Vite dev/build output.
export async function registerRoutes(
  httpServer: Server,
  _app: Express
): Promise<Server> {
  return httpServer;
}
