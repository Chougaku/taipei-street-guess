import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Ctx } from '../app.ts';
import { listReports, reportLocation, REPORT_REASONS, requireAdmin, resolveReports } from '../services/reports.ts';

export function registerReportRoutes(api: FastifyInstance, ctx: Ctx) {
  api.post('/reports', async (req) => {
    const user = await ctx.requireUser(req);
    const body = z
      .object({
        gameId: z.string().uuid().optional(),
        roundNo: z.number().int().min(1).optional(),
        panoId: z.string().max(200).optional(),
        reason: z.enum(REPORT_REASONS),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);
    return reportLocation(ctx.db, user.id, body);
  });

  api.get('/admin/reports', async (req) => {
    const user = await ctx.requireUser(req);
    await requireAdmin(ctx.db, user.id);
    return listReports(ctx.db);
  });

  api.post('/admin/reports/resolve', async (req) => {
    const user = await ctx.requireUser(req);
    await requireAdmin(ctx.db, user.id);
    const body = z.object({ panoId: z.string().max(200), action: z.enum(['disable', 'dismiss']) }).parse(req.body);
    return resolveReports(ctx.db, body.panoId, body.action);
  });
}
