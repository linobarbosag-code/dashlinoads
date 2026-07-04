// lib/whatsapp.ts — adaptador uazapi v2
// Env: UAZAPI_URL (ex: https://alumix.uazapi.com), UAZAPI_TOKEN (token da instância)

const URL_BASE = process.env.UAZAPI_URL!;
const TOKEN = process.env.UAZAPI_TOKEN!;

async function uaz(path: string, body?: any, method = "POST") {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: { token: TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`uazapi ${path} [${res.status}]: ${json.error ?? json.message ?? JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

/** Status da instância (conectado ao WhatsApp?). */
export async function instanceStatus() {
  const json = await uaz("/instance/status", undefined, "GET");
  const inst = json.instance ?? json;
  return {
    connected: inst.status === "connected" || json.status === "connected",
    raw: inst.status ?? json.status ?? "desconhecido",
    name: inst.profileName ?? inst.name ?? null,
  };
}

/** Lista os grupos da instância. */
export async function listGroups(): Promise<{ id: string; name: string }[]> {
  let json: any;
  try {
    json = await uaz("/group/list", undefined, "GET");
  } catch {
    json = await uaz("/group/list", { force: false });
  }
  const arr = Array.isArray(json) ? json : json.groups ?? json.data ?? [];
  return arr
    .map((g: any) => ({
      id: g.JID ?? g.jid ?? g.id ?? "",
      name: g.Name ?? g.name ?? g.subject ?? "(sem nome)",
    }))
    .filter((g: any) => g.id);
}

/** Envia texto para número ou grupo (JID). */
export async function sendText(number: string, text: string) {
  return uaz("/send/text", { number, text });
}

/** Envia PDF (base64) como documento. */
export async function sendDocument(
  number: string,
  base64: string,
  filename: string,
  caption?: string
) {
  return uaz("/send/media", {
    number,
    type: "document",
    file: base64,
    docName: filename,
    text: caption ?? "",
  });
}
