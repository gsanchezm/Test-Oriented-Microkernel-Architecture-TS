import { Router, type Request, type Response, type NextFunction } from 'express';

import type { RunPayload, Tool } from '../../shared/types.js';
import {
  ADAPTERS,
  makeMissingTool,
  normalizeTool,
  type AdapterContext,
} from '../normalize/index.js';
import { summarize } from '../normalize/shared.js';
import {
  getRawToolReport,
  getRunDir,
  getRunInfo,
  listRuns,
  ReportsPathError,
  RunNotFoundError,
  ToolReportMissingError,
} from '../runs-repo.js';

export const runsRouter = Router();

runsRouter.get('/api/runs', async (_req, res, next) => {
  try {
    const runs = await listRuns();
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

runsRouter.get('/api/runs/:runId', async (req, res, next) => {
  const { runId } = req.params;
  try {
    const runInfo = await getRunInfo(runId);
    const ctx: AdapterContext = {
      runId,
      runDir: getRunDir(runId),
      runInfo,
    };

    // Always emit one ToolSummary per known tool id. Missing JSON → placeholder
    // with `missing: true` and zeroed counts so the overview shows all cards.
    const tools = await Promise.all(
      Object.keys(ADAPTERS).map(async (id) => {
        try {
          const raw = await getRawToolReport(runId, id);
          const tool = await normalizeTool(id, raw, ctx);
          return summarize(tool);
        } catch (err) {
          if (err instanceof ToolReportMissingError) {
            return summarize(makeMissingTool(id));
          }
          throw err;
        }
      }),
    );

    const payload: RunPayload = { run: runInfo, tools };
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

runsRouter.get('/api/runs/:runId/tools/:toolId', async (req, res, next) => {
  const { runId, toolId } = req.params;
  if (!ADAPTERS[toolId]) {
    res.status(404).json({ error: 'tool_not_found', toolId });
    return;
  }
  try {
    const runInfo = await getRunInfo(runId);
    const ctx: AdapterContext = {
      runId,
      runDir: getRunDir(runId),
      runInfo,
    };
    let tool: Tool;
    try {
      const raw = await getRawToolReport(runId, toolId);
      tool = await normalizeTool(toolId, raw, ctx);
    } catch (err) {
      if (err instanceof ToolReportMissingError) {
        tool = makeMissingTool(toolId);
      } else {
        throw err;
      }
    }
    res.json(tool);
  } catch (err) {
    next(err);
  }
});

export function runsErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof RunNotFoundError) {
    res.status(404).json({ error: 'run_not_found', runId: err.runId });
    return;
  }
  if (err instanceof ToolReportMissingError) {
    res.status(500).json({ error: 'report_missing', file: err.file });
    return;
  }
  if (err instanceof ReportsPathError) {
    res.status(400).json({ error: 'bad_path', message: err.message });
    return;
  }
  const message = err instanceof Error ? err.message : 'internal_error';
  res.status(500).json({ error: 'internal_error', message });
}
