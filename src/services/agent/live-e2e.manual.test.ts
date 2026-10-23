import { describe, expect, it } from "vitest";
import { runTurn } from "@openreel/agent";
import { useProjectStore } from "../../stores/project-store";
import { LiveEditorHost } from "./live-host";
import { makeZyraxonClient } from "./zyraxon-transport";
import {
  EDITING_SYSTEM,
  editingToolDefs,
  editingToolReadOnly,
  executeEditingTool,
} from "./editing-tools";

/**
 * Opt-in: this talks to the live public gateway, so it stays out of the default
 * run. Start it with ZYRAXON_LIVE=1 to confirm the real loop end to end.
 */
const live = process.env.ZYRAXON_LIVE ? describe : describe.skip;

/**
 * Strips what is allowed to stay Latin — generated ids, field names, enum
 * values and the user's own asset names — so what remains must be Bengali.
 */
function proseOnly(text: string): string {
  return text
    .replace(/`[^`]*`/g, " ")
    .replace(/\b[\w.]+-[\w-]{6,}\b/g, " ")
    .replace(/\b[a-z_]+:\s*/gi, " ")
    .replace(/\b(?:track|clip|media|Video|Audio|Image|Text|Graphics)\s*\d*\b/gi, " ");
}

live("ZYRAXON live end-to-end", () => {
  it("answers in Bengali and really edits the timeline through tool calls", async () => {
    useProjectStore.getState().createNewProject();
    const host = new LiveEditorHost();
    const llm = makeZyraxonClient({ model: "zyraxon-apex" });

    const result = await runTurn({
      host,
      llm,
      tools: editingToolDefs("openai"),
      system: EDITING_SYSTEM,
      messages: [
        { role: "user", content: "একটা ভিডিও ট্র্যাক যোগ করো, তারপর কী কী আছে বলো।" },
      ],
      execute: executeEditingTool,
      readOnly: editingToolReadOnly,
      atomic: true,
      confirmGate: () => "approve_for_turn",
      limits: { maxSteps: 6 },
      turnLabel: "live-e2e",
    });

    // The turn really ran: the gateway answered, the model called tools, and
    // the timeline changed.
    expect(result.stoppedReason).not.toBe("error");
    expect(result.toolCalls).toBeGreaterThan(0);
    expect(host.getProject().timeline.tracks.length).toBeGreaterThan(0);

    // Bengali-only prose: Bengali script present, no English words in the prose.
    expect(result.text).toMatch(/[\u0980-\u09FF]/);
    expect(proseOnly(result.text)).not.toMatch(/[A-Za-z]{3,}/);
  }, 240_000);
});
