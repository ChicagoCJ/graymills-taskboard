import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftFromMessage, reviewLink, readSelectedMessage } from "../outlook-addin/handoff.js";

const message = { itemId: "ews-message-id", subject: "Supplier follow-up", from: { displayName: "Vendor", emailAddress: "vendor@example.test" } };

test("selected Outlook message becomes a review draft without inferred assignments or dates", () => {
  const draft = draftFromMessage(message, "Confirm arrival timing", "rest/message+id");
  assert.equal(draft.title, message.subject);
  assert.equal(draft.source.from, "Vendor <vendor@example.test>");
  assert.equal(draft.source.receivedAt, undefined);
  assert.equal(draft.suggestedOwner, undefined);
  assert.equal(draft.dueDate, undefined);
  assert.equal(draft.status, undefined);
  assert.equal(draft.priority, undefined);
  assert(draft.description.includes("Confirm arrival timing"));
  assert.equal(new URL(draft.source.url).searchParams.get("ItemID"), "rest/message+id");
});

test("review links fit the receiving limit and do not place the email in a request query", () => {
  const draft = draftFromMessage(message, "零件清洗".repeat(2000), "rest-id");
  const url = new URL(reviewLink("https://taskboard.example.test/", draft));
  assert.equal(url.search, "");
  assert(url.hash.length < 12000);
  const decoded = JSON.parse(decodeURIComponent(url.hash.slice("#email-task=".length)));
  assert.equal(decoded.source.subject, message.subject);
  assert(decoded.description.length < draft.description.length);
  assert.throws(() => reviewLink("http://taskboard.example.test/", draft));
});

function officeMock(item, getAsync) {
  return {
    CoercionType: { Text: "text" }, AsyncResultStatus: { Succeeded: "succeeded" }, MailboxEnums: { RestVersion: { v2_0: "v2" } },
    context: { mailbox: { item: { ...item, body: { getAsync } }, convertToRestId(id, version) { assert.equal(id, message.itemId); assert.equal(version, "v2"); return "rest-id"; } } },
  };
}

test("Outlook handoff reads only the selected item and uses plain text", async () => {
  const office = officeMock(message, (type, callback) => { assert.equal(type, "text"); callback({ status: "succeeded", value: "Supplier's message" }); });
  const draft = await readSelectedMessage(office);
  assert.equal(draft.title, message.subject);
  assert(draft.description.includes("Supplier's message"));
  await assert.rejects(readSelectedMessage({ context: { mailbox: { item: null } } }), /Select an email/);
});

test("changing the selected email while its body loads cannot send the previous item", async () => {
  let finish;
  const office = officeMock(message, (_type, callback) => { finish = callback; });
  const result = readSelectedMessage(office);
  office.context.mailbox.item = { itemId: "different-message" };
  finish({ status: "succeeded", value: "Previous email" });
  await assert.rejects(result, /selected email changed/);
});

test("a body-read failure still creates a reviewable draft with its source rather than a saved task", async () => {
  const office = officeMock(message, (_type, callback) => callback({ status: "failed" }));
  const draft = await readSelectedMessage(office);
  assert.equal(draft.description, "Review this email and enter the next action.");
  assert(draft.source.url.includes("rest-id"));
});

test("the Outlook manifest requests ReadItem and exposes only the message-read command", () => {
  const manifest = readFileSync(new URL("../outlook-addin/manifest.xml", import.meta.url), "utf8");
  assert(manifest.includes("<Permissions>ReadItem</Permissions>"));
  assert(manifest.includes('xsi:type="MessageReadCommandSurface"'));
  assert(!manifest.includes("ReadWrite"));
  assert(!manifest.includes("MessageComposeCommandSurface"));
});
