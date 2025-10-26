import express from "express";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";
import { getPulseToken, getPulseTokenTool, } from "./tools/get_pulse_token.js";
import { listPulseMetrics, listPulseMetricsTool, } from "./tools/list_pulse_metrics.js";
import { getMetricInsight, getMetricInsightTool, } from "./tools/get_metric_insight.js";
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../ops/dev.env") });
const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
// Security: rate limiting for token generation
const tokenLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 requests per minute
    message: "Too many token requests, please try again later",
});
app.use(express.json());
// Health check
app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "apps-pulse-mcp" });
});
// Tool metadata endpoint
app.get("/api/tools", (_req, res) => {
    res.json({
        tools: [getPulseTokenTool, listPulseMetricsTool, getMetricInsightTool],
    });
});
// Tool execution endpoints
app.post("/api/tools/get_pulse_token", tokenLimiter, async (req, res) => {
    try {
        const result = await getPulseToken(req.body);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        });
    }
});
app.post("/api/tools/list_pulse_metrics", async (req, res) => {
    try {
        const result = await listPulseMetrics(req.body);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        });
    }
});
app.post("/api/tools/get_metric_insight", async (req, res) => {
    try {
        const result = await getMetricInsight(req.body);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({
            content: [
                {
                    type: "text",
                    text: `Error: ${error instanceof Error ? error.message : String(error)}`,
                },
            ],
            isError: true,
        });
    }
});
// UI widget endpoint
app.get("/widget", (_req, res) => {
    try {
        const templatePath = join(dirname(fileURLToPath(import.meta.url)), "ui-template.html");
        const template = readFileSync(templatePath, "utf-8");
        res.setHeader("Content-Type", "text/html");
        res.send(template);
    }
    catch (error) {
        res.status(500).send(`Failed to load widget: ${error}`);
    }
});
app.listen(PORT, () => {
    console.log(`🚀 Tableau Pulse MCP server running on port ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   MCP endpoint: http://localhost:${PORT}/mcp`);
});
//# sourceMappingURL=server.js.map