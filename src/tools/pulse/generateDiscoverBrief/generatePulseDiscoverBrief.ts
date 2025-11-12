import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';
import z from 'zod';

import { getConfig } from '../../../config.js';
import { useRestApi } from '../../../restApiInstance.js';
import { Server } from '../../../server.js';
import { getDiscoverBriefFootnote, getFollowupQuestions } from '../../../utils/pulseInsightHelpers.js';
import { Tool } from '../../tool.js';
import { getPulseDisabledError } from '../getPulseDisabledError.js';

const paramsSchema = {
  question: z
    .string()
    .min(1)
    .describe(
      'The question to ask about the metrics. Example: "What caused the increase in sales last month?"',
    ),
  metricIds: z
    .array(z.string())
    .min(1)
    .describe(
      'Array of Pulse metric IDs to use as context for answering the question. At least one metric ID is required.',
    ),
  actionType: z
    .string()
    .optional()
    .default('ACTION_TYPE_ANSWER')
    .describe('The type of action to perform (default: ACTION_TYPE_ANSWER)'),
  role: z
    .string()
    .optional()
    .default('ROLE_USER')
    .describe('The role of the user asking the question (default: ROLE_USER)'),
};

export const getGeneratePulseDiscoverBriefTool = (server: Server): Tool<typeof paramsSchema> => {
  const generatePulseDiscoverBriefTool = new Tool({
    server,
    name: 'generate-pulse-discover-brief',
    description: `
Generate an AI-powered Pulse Discover brief that answers questions about Tableau Pulse metrics.

**What is Pulse Discover?**
Pulse Discover is Tableau's AI-powered feature that can answer natural language questions about your metrics by analyzing metric data and generating insights with supporting visualizations and footnotes.

**Parameters:**
- \`question\` (required): The natural language question to ask about the metrics
- \`metricIds\` (required): Array of Pulse metric IDs to use as context for answering the question
- \`actionType\` (optional): The type of action (default: 'ACTION_TYPE_ANSWER')
- \`role\` (optional): The role of the user (default: 'ROLE_USER')

**Example Usage:**
\`\`\`json
{
  "question": "What caused the decrease in sales last quarter?",
  "metricIds": ["CF32DDCC-362B-4869-9487-37DA4D152552", "BBC908D8-29ED-48AB-A78E-ACF8A424C8C3"]
}
\`\`\`

**Returns:**
A Discover brief containing:
- \`markup\`: AI-generated answer with footnotes referencing specific insights and metrics
- \`follow_up_questions\`: Suggested followup questions the user can ask
- \`source_insights\`: Array of insights that support the answer (with visualizations)
- \`footnotes\`: Parsed footnotes mapping numbers to metric IDs and insights

**Footnote Format:**
Footnotes in the markup are in the format \`[[N]](definitionId|metricId)\` where N is the footnote number.
Use the footnotes array in the response to look up which metric each footnote references.

**Use Cases:**
- "Why did my sales metric increase last month?"
- "What are the top contributors to my revenue metric?"
- "How does my customer satisfaction compare to last year?"
- "What trends should I be aware of in my metrics?"

**Required Scopes:**
- \`tableau:insights:read\`
- \`tableau:insight_metrics:read\`
- \`tableau:insight_definitions_metrics:read\`
`,
    paramsSchema,
    annotations: {
      title: 'Generate Pulse Discover Brief',
      readOnlyHint: true,
      openWorldHint: false,
    },
    callback: async (
      { question, metricIds, actionType, role },
      { requestId },
    ): Promise<CallToolResult> => {
      const config = getConfig();
      return await generatePulseDiscoverBriefTool.logAndExecute({
        requestId,
        args: { question, metricIds, actionType, role },
        callback: async () => {
          return await useRestApi({
            config,
            requestId,
            server,
            jwtScopes: [
              'tableau:insights:read',
              'tableau:insight_metrics:read',
              'tableau:insight_definitions_metrics:read',
            ],
            callback: async (restApi) => {
              const briefResult = await restApi.pulseMethods.generatePulseDiscoverBrief(
                question,
                metricIds,
                actionType,
                role,
              );

              if (briefResult.isErr()) {
                throw new Error(`Failed to generate Discover brief: ${briefResult.error}`);
              }

              const brief = briefResult.value;

              // Parse all footnotes from the markup
              const footnotes: Array<{ number: number; metricId: string; insight: any }> = [];
              const regex = /\[\[(\d+)\]\]/g;
              let match;

              while ((match = regex.exec(brief.markup)) !== null) {
                const footnoteNumber = parseInt(match[1], 10);
                const footnoteData = getDiscoverBriefFootnote(brief, footnoteNumber);

                if (footnoteData) {
                  footnotes.push({
                    number: footnoteNumber,
                    metricId: footnoteData.metricId,
                    insight: footnoteData.insight,
                  });
                }
              }

              // Get followup questions
              const followupQuestions = getFollowupQuestions(brief);

              // Build response text
              let responseText = `## Pulse Discover Answer\n\n${brief.markup}\n\n`;

              if (followupQuestions.length > 0) {
                responseText += `### Suggested Followup Questions:\n`;
                followupQuestions.forEach((q, i) => {
                  responseText += `${i + 1}. ${q}\n`;
                });
                responseText += '\n';
              }

              if (footnotes.length > 0) {
                responseText += `### Footnotes:\n`;
                footnotes.forEach((f) => {
                  responseText += `[${f.number}] Metric ID: ${f.metricId}\n`;
                });
              }

              return new Ok({
                content: [
                  {
                    type: 'text',
                    text: responseText,
                  },
                ],
                structuredContent: {
                  markup: brief.markup,
                  follow_up_questions: followupQuestions,
                  footnotes,
                  source_insights: brief.source_insights,
                  group_context: brief.group_context,
                  metricIds,
                },
              });
            },
          });
        },
        getErrorText: getPulseDisabledError,
      });
    },
  });

  return generatePulseDiscoverBriefTool;
};
