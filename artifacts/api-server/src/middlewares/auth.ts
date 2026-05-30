import type { Request, Response, NextFunction } from "express";

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = process.env.API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "API_KEY not configured on server", code: "SERVER_MISCONFIGURED" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Missing Authorization header",
      code: "UNAUTHORIZED",
      suggestion: "Include 'Authorization: Bearer {API_KEY}' in your request",
    });
    return;
  }

  const token = authHeader.slice(7);
  if (token !== apiKey) {
    res.status(401).json({
      error: "Invalid API key",
      code: "INVALID_API_KEY",
      suggestion: "Check your API_KEY environment variable",
    });
    return;
  }

  next();
}
