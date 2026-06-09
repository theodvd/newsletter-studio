const input = $input.first().json;

function uuid() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

const traceId = uuid();
const now = new Date().toISOString();

const body = {
  batch: [
    {
      id: uuid(),
      type: "trace-create",
      timestamp: now,
      body: {
        id: traceId,
        name: "growfin-newsletter",
        tags: ["growfin", "production"],
        metadata: {
          workflow_id: "J0CZEnL6X594BINK",
          date_edition: input.date_edition || now
        }
      }
    },
    {
      id: uuid(),
      type: "generation-create",
      timestamp: now,
      body: {
        id: uuid(),
        traceId: traceId,
        name: "claude-sonnet-newsletter",
        model: "claude-sonnet-4-20250514",
        input: { role: "user", content: "(articles RSS)" },
        output: input.newsletter ? input.newsletter.substring(0, 5000) : "",
        usage: {
          input: input.input_tokens || 0,
          output: input.output_tokens || 0,
          total: (input.input_tokens || 0) + (input.output_tokens || 0)
        }
      }
    }
  ]
};

return [{ json: { ...input, langfuse_body: body, langfuse_trace_id: traceId } }];
