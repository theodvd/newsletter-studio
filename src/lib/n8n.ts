/**
 * Client minimal de l'API REST n8n (création/activation/suppression
 * des workflows « fins » par utilisateur).
 * Le workflow fin = Schedule Trigger (cron du user) → Execute Workflow (moteur partagé).
 */

const ENGINE_NODE_NAME = "Lancer le moteur";

function baseUrl(): string {
  const url = process.env.N8N_API_URL;
  if (!url) throw new Error("N8N_API_URL manquant dans .env");
  // Tolère une URL sans schéma (ex: "n8n.exemple.com")
  const withScheme = /^https?:\/\//.test(url) ? url : `https://${url}`;
  return withScheme.replace(/\/$/, "");
}

async function n8nFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${baseUrl()}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-N8N-API-KEY": process.env.N8N_API_KEY ?? "",
      ...init.headers,
    },
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`n8n API ${res.status} sur ${path}: ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : null;
}

/** Construit le JSON du workflow fin pour une subscription. */
function thinWorkflow(opts: { name: string; cron: string; subscriptionId: string }) {
  const engineId = process.env.N8N_ENGINE_WORKFLOW_ID;
  if (!engineId) throw new Error("N8N_ENGINE_WORKFLOW_ID manquant dans .env");

  return {
    name: `Veille · ${opts.name}`,
    settings: { executionOrder: "v1" },
    nodes: [
      {
        id: "schedule-trigger",
        name: "Planification",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [0, 0],
        parameters: {
          rule: { interval: [{ field: "cronExpression", expression: opts.cron }] },
        },
      },
      {
        id: "call-engine",
        name: ENGINE_NODE_NAME,
        type: "n8n-nodes-base.executeWorkflow",
        typeVersion: 1.2,
        position: [220, 0],
        parameters: {
          workflowId: { __rl: true, value: engineId, mode: "id" },
          workflowInputs: {
            mappingMode: "defineBelow",
            value: { subscription_id: opts.subscriptionId },
            matchingColumns: [],
            schema: [
              {
                id: "subscription_id",
                displayName: "subscription_id",
                required: false,
                defaultMatch: false,
                display: true,
                canBeUsedToMatch: true,
                type: "string",
              },
            ],
          },
          options: {},
        },
      },
    ],
    connections: {
      Planification: {
        main: [[{ node: ENGINE_NODE_NAME, type: "main", index: 0 }]],
      },
    },
  };
}

export async function createUserWorkflow(opts: {
  name: string;
  cron: string;
  subscriptionId: string;
}): Promise<string> {
  const created = (await n8nFetch("/workflows", {
    method: "POST",
    body: JSON.stringify(thinWorkflow(opts)),
  })) as { id: string };
  await n8nFetch(`/workflows/${created.id}/activate`, { method: "POST" });
  return created.id;
}

/** Met à jour le workflow fin d'une veille active (nom, cron) puis le réactive. */
export async function updateUserWorkflow(
  workflowId: string,
  opts: { name: string; cron: string; subscriptionId: string }
): Promise<void> {
  await n8nFetch(`/workflows/${workflowId}`, {
    method: "PUT",
    body: JSON.stringify(thinWorkflow(opts)),
  });
  try {
    await n8nFetch(`/workflows/${workflowId}/activate`, { method: "POST" });
  } catch {
    // Déjà actif : l'API peut refuser, sans conséquence
  }
}

export async function setWorkflowActive(workflowId: string, active: boolean): Promise<void> {
  await n8nFetch(`/workflows/${workflowId}/${active ? "activate" : "deactivate"}`, {
    method: "POST",
  });
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  await n8nFetch(`/workflows/${workflowId}`, { method: "DELETE" });
}
