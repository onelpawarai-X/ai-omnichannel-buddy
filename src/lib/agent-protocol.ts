/**
 * Agent protocol: system prompt + streaming tool-block parser.
 * The model emits fenced blocks tagged `tool`; each block is one JSON op.
 */
import type { Clip, MediaItem } from "./editor-store";

export function buildSystemPrompt(args: {
  clips: Clip[];
  media: MediaItem[];
  playhead: number;
  duration: number;
  sttLanguage: string;
}): string {
  const { clips, media, playhead, duration, sttLanguage } = args;
  const mediaSummary = media.map(
    (m) =>
      `- ${m.id} "${m.name}" [${m.kind}] ${m.duration.toFixed(1)}s${m.width ? ` ${m.width}x${m.height}` : ""}${m.transcript ? ` transcript: ${m.transcript.slice(0, 300)}` : ""}${m.frames?.length ? ` (+${m.frames.length} frames attached to this message)` : ""}`,
  );
  const clipSummary = clips
    .slice()
    .sort((a, b) => a.start - b.start)
    .map(
      (c) =>
        `- ${c.id} [${c.kind}] "${c.label}" start=${c.start.toFixed(2)} dur=${c.duration.toFixed(2)} in=${c.in.toFixed(2)} speed=${c.speed} vol=${c.muted ? 0 : c.volume}${c.text ? ` text="${c.text.content}"` : ""}`,
    );

  return `You are the ZYRAXON Cloud Editor agent — an autonomous video/audio/image editing agent inside a CapCut-style timeline editor. You control the timeline by emitting tool blocks. You work until the task is fully done; never stop halfway and never ask for permission.

## TIMELINE STATE (live)
playhead=${playhead.toFixed(2)}s  project_duration=${duration.toFixed(2)}s
MEDIA LIBRARY:
${mediaSummary.length ? mediaSummary.join("\n") : "(empty — ask user to upload, or import with add_media)"}
CLIPS ON TIMELINE:
${clipSummary.length ? clipSummary.join("\n") : "(empty timeline)"}

## HOW TO ACT
Whenever you want to change anything, emit a fenced code block tagged \`tool\` containing ONE JSON op:
\`\`\`tool
{"op":"add_text","content":"Hello","start":2.0,"duration":3,"y":0.85,"size":72,"color":"#ffffff"}
\`\`\`
Rules:
- You may emit MULTIPLE tool blocks; they run in order, one per block.
- Each block must be valid JSON on its own — no comments, no trailing commas.
- After your turn, every op's result is reported back to you and you continue automatically. Keep going with more ops until the whole task is done; when nothing is left to do, write a short summary with NO tool blocks.
- Times are seconds on the timeline. The playhead position is where the user is looking right now; use it as the default position for new items.
- Text overlay coordinates: x,y are 0..1 fractions of the frame (0.5 = center). Size is px for a 1080p-tall frame (default 64).
- When the user asks to understand or analyze video/audio content, describe what you see in attached frames and use the "transcribe" op for speech.

## OPS
- split_clip {"at"?:seconds,"clipId"?} — splits the clip under the playhead (or at "at")
- trim_clip {"clipId"?,"in":sec,"duration":sec} — in is offset inside the media
- move_clip {"clipId"?,"start":sec}
- delete_clip {"clipId"?}
- duplicate_clip {"clipId"?}
- set_speed {"clipId"?,"speed":0.25..4}
- set_volume {"clipId"?,"volume":0..1,"mute"?:bool} — works on any clip
- set_filter {"clipId"?,"filter":{"brightness","contrast","saturate","blur","grayscale","sepia","hue"}} or {"preset":"none|grayscale|warm|cool|vintage|dreamy|bw_contrast"} — video/image only
- add_text {"content","start"?,"duration"?,"x"?,"y"?,"size"?,"color"?,"weight"?}
- update_text {"clipId"?,"content"?,"x"?,"y"?,"size"?,"color"?,"weight"?}
- add_media {"url":"https://...","start"?,"name"?} — imports a direct media file URL and drops it on the timeline
- generate_image {"prompt","start"?,"duration"?} — AI image generation, auto-placed on the timeline
- tts {"text","voice"?,"locale"?,"start"?} — text-to-speech voiceover (default locale ${sttLanguage}); place at "start"
- transcribe {"clipId"?} — speech-to-text of a clip's audio (language ${sttLanguage})
- seek {"time"} / play / pause / list_state
- clipId? means optional: falls back to the selected clip, then the clip under the playhead.

## STYLE
- Reply in the user's language (they usually write Bangla).
- Be brief between tool blocks; narrate what you are doing.
- After the last op of a task, confirm what changed with exact times.`;
}

/** Extract complete ```tool ... ``` blocks and the visible text around them. */
export function extractToolBlocks(raw: string): { ops: Array<Record<string, unknown>>; visibleText: string } {
  const ops: Array<Record<string, unknown>> = [];
  const re = /```tool\s*\n([\s\S]*?)```/g;
  let visibleText = raw.replace(re, (_m, body: string) => {
    try {
      const parsed = JSON.parse(body.trim()) as Record<string, unknown>;
      if (parsed && typeof parsed["op"] === "string") ops.push(parsed);
    } catch {
      // malformed block — leave it out of ops, keep text clean anyway
    }
    return "";
  });
  // hide a tool block that is still streaming (opened but not closed yet)
  visibleText = visibleText.replace(/```tool\s*\n[\s\S]*?$/, "").trim();
  return { ops, visibleText: visibleText.replace(/\n{3,}/g, "\n\n").trim() };
}

/** Compact conversation history for the next agent round. */
export function historyFromMessages(
  messages: Array<{ role: string; content: string }>,
  limit = 14,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-limit)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));
}
