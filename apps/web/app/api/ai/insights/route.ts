// NEXUS — GET /api/ai/insights
// AI-powered insights endpoint: anomaly detection, burnout risk, demand forecast

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withRole } from "@/lib/auth";
import { detectAnomalies } from "@/lib/ai/anomaly-detection";
import { assessBurnoutRisk } from "@/lib/ai/burnout-risk";
import { forecastDemand } from "@/lib/ai/demand-forecast";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleAiInsights(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const url = new URL(req.url);
    const type = url.searchParams.get("type"); // "anomaly", "burnout", "forecast"
    const userId = url.searchParams.get("userId");
    const departmentId = url.searchParams.get("departmentId");

    if (!type) {
        return error("MISSING_TYPE", "Query parameter 'type' required: anomaly, burnout, or forecast", 400);
    }

    switch (type) {
        case "anomaly": {
            if (!userId) return error("MISSING_USER_ID", "userId required for anomaly detection", 400);
            const result = await detectAnomalies(userId);
            return success(result);
        }

        case "burnout": {
            if (!userId) return error("MISSING_USER_ID", "userId required for burnout assessment", 400);
            const result = await assessBurnoutRisk(userId);
            return success(result);
        }

        case "forecast": {
            if (!departmentId) return error("MISSING_DEPT_ID", "departmentId required for demand forecast", 400);
            const days = Math.min(60, Math.max(7, parseInt(url.searchParams.get("days") || "14", 10)));
            const result = await forecastDemand(departmentId, days);
            return success(result);
        }

        case "team-burnout": {
            // Bulk burnout assessment for a manager's team
            const { auth } = context;
            const reports = await prisma.user.findMany({
                where: { managerId: auth.sub, status: "ACTIVE" },
                select: { id: true, fullName: true },
            });

            const assessments = await Promise.all(
                reports.map(async (r: any) => {
                    const assessment = await assessBurnoutRisk(r.id);
                    return { ...assessment, fullName: r.fullName };
                })
            );

            // Sort by risk score descending
            assessments.sort((a, b) => b.riskScore - a.riskScore);

            const highRisk = assessments.filter(a => a.riskLevel === "CRITICAL" || a.riskLevel === "HIGH");

            return success({
                teamSize: reports.length,
                assessments,
                summary: {
                    highRiskCount: highRisk.length,
                    avgRiskScore: assessments.length > 0
                        ? +(assessments.reduce((s, a) => s + a.riskScore, 0) / assessments.length).toFixed(1)
                        : 0,
                    topConcern: highRisk[0]
                        ? `${highRisk[0].fullName} (score: ${highRisk[0].riskScore})`
                        : "No high-risk employees",
                },
            });
        }

        default:
            return error("INVALID_TYPE", `Unknown insight type: ${type}. Use: anomaly, burnout, forecast, team-burnout`, 400);
    }
}

export const GET = withRole("MGR", "HRBP", "HRA", "SADM")(handleAiInsights);
