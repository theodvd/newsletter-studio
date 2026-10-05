import { afterEach, describe, expect, it, vi } from "vitest";
import { canSendToList, sendBrevoCampaign, withUnsubscribeLink } from "./send";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canSendToList", () => {
  it("refuse tout le monde quand la liste blanche est vide ou absente", () => {
    vi.stubEnv("ENGINE_LIST_SEND_USER_IDS", "");
    expect(canSendToList("user-1")).toBe(false);
  });

  it("n'autorise que les comptes listés", () => {
    vi.stubEnv("ENGINE_LIST_SEND_USER_IDS", " user-1 , user-2 ");
    expect(canSendToList("user-1")).toBe(true);
    expect(canSendToList("user-2")).toBe(true);
    expect(canSendToList("user-3")).toBe(false);
  });
});

describe("withUnsubscribeLink", () => {
  it("insère le lien Brevo avant </body>", () => {
    const html = withUnsubscribeLink("<html><body><p>Édition</p></body></html>", "fr");
    expect(html).toMatch(/<p>Édition<\/p><p[^>]*><a href="\{\{ unsubscribe \}\}"[^>]*>Se désabonner<\/a><\/p><\/body>/);
  });

  it("ajoute en fin de document s'il n'y a pas de </body>, en anglais si besoin", () => {
    expect(withUnsubscribeLink("<div>x</div>", "en")).toMatch(/<div>x<\/div><p.*Unsubscribe<\/a><\/p>$/);
  });

  it("ne double pas un lien déjà présent", () => {
    const html = '<body><a href="{{unsubscribe}}">Se désabonner</a></body>';
    expect(withUnsubscribeLink(html, "fr")).toBe(html);
  });
});

describe("sendBrevoCampaign", () => {
  it("refait la vérification de la liste blanche, sans aucun appel réseau", async () => {
    vi.stubEnv("ENGINE_LIST_SEND_USER_IDS", "user-1");
    vi.stubEnv("BREVO_API_KEY", "xkeysib-test");
    vi.stubEnv("BREVO_SENDER_EMAIL", "sender@example.com");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await sendBrevoCampaign({
      ownerUserId: "intrus",
      listId: 7,
      name: "x",
      subject: "x",
      html: "<p>x</p>",
      senderName: "x",
    });

    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
