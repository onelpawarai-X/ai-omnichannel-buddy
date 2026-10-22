/**
 * Agent prompt and orchestration loop.
 *
 * The loop is a plain tool-calling cycle over /chat/completions: send the
 * system prompt plus the timeline snapshot, execute any tool calls the model
 * returns, feed the results back, and repeat until the model calls `finish` or
 * the round budget runs out. If the model answers with a ```json fenced block
 * of ops instead of tool calls, those ops are applied directly.
 */
import {
  completeChat,
  streamChat,
  type ChatMessage,
  type ChatResult,
  type ContentPart,
  type ToolCall,
  type ToolDef,
} from "../zyraxon";
import type { Op } from "./ops";
import { TOOLS, TOOL_BY_NAME, type AgentContext } from "./agent-tools";
import { EFFECTS } from "./effects";
import { describeTimeline, type TimelineState } from "./ops";
import { SEED_ANIMATIONS } from "./animations";

export type AgentAttachment = {
  kind: "image" | "video" | "audio";
  name: string;
  /** data URL or http(s) URL */
  url: string;
  /** extracted stills for video, so the model can see the content */
  frames?: string[];
  /** labelled spectrogram for audio: the provider reads pictures, not sound */
  spectrogram?: string;
  note?: string;
};

export type AgentEvent =
  | { type: "assistant_delta"; text: string }
  | { type: "assistant_text"; text: string }
  | { type: "tool"; name: string; args: unknown; ok: boolean; result?: unknown; error?: string }
  | { type: "ops"; ops: Op[]; notes: string[] }
  | { type: "round"; index: number; max: number }
  | { type: "error"; message: string }
  | { type: "done"; summary: string };

export type RunOptions = {
  prompt: string;
  attachments: AgentAttachment[];
  history: ChatMessage[];
  state: TimelineState;
  ctx: AgentContext;
  model: string;
  maxRounds?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
  /** stream assistant prose as it arrives */
  stream?: boolean;
};

const EFFECT_TEXT = EFFECTS.map((e) => `${e.id} (${e.category}): ${e.description}`).join("\n");

const ANIMATION_TEXT = SEED_ANIMATIONS.map((a) => `${a.name} -> ${a.url}`).join("\n");

/** The system prompt. Kept explicit about the one endpoint and about limits. */
export function systemPrompt(): string {
  return `You are ZYRAXON Studio, the editing agent inside a cloud video editor. You edit the timeline directly with your tools. You never tell the user to do something by hand that you can do yourself.

HOW YOU WORK
You are a collaborator, not a batch job. Talk as you work: before each batch of tool calls write one short sentence saying what you are about to do and why, then call the tools. After the results, say briefly what changed. The user watches these lines arrive in the chat, so they must read as a running commentary, not a report saved for the end.
Read the timeline with list_timeline before you change anything, and again when you need ids.
Prefer acting over asking. If the request is under-specified, choose a sensible, tasteful edit and say what you chose.
Ask only when you are genuinely stuck or the request cannot be carried out without a decision only the user can make - for example a YouTube video that will not resolve, or an edit that needs footage you do not have. When you do ask, use ask_user, ask one clear question, and stop; do not keep calling tools in the same turn. Never ask about something you can decide yourself.
Work in small steps: import media, place clips, then grade, effect, animate, caption. Several tool calls in one turn is normal.
When the edit is complete, call finish with a short summary in the user's own language.
Never invent media ids, clip ids or effect ids. Use ids from list_timeline, or resolve by name.
Times are seconds on the global timeline. A clip has start, duration, and in (offset inside the source).

MEDIA
You can import from any direct URL with import_media, including a YouTube watch URL.
search_assets searches open libraries: YouTube, Wikimedia Commons (video and images), Openverse (music and images), Iconify (icons). Pass the returned url to import_media.
The user can also browse YouTube directly in the media panel: kind=browse returns trending videos, and with a query it searches. Every result imports as a normal video clip.
search_stock reads the Mixkit shelves - real footage overlays and backgrounds: fire, smoke, light leaks, particles, rain, snow, clouds, water, countdowns, green screen - and returns direct mp4 urls. Import one to lay it over the picture, or use it as a background.
Choosing between them: search_stock for photographic overlays and backgrounds (fire, smoke, sparks, dust, flare, ink, splash); search_lottie for vector motion graphics (icons, arrows, confetti, lower thirds, animated titles). Do not use run_media_command to fake either one.
run_media_command runs ffmpeg, ffprobe, ImageMagick and python3 on the media worker. Use it to synthesise test footage, tone, silence, countdowns, colour bars, a title card, a waveform image, or to probe a file. Anything you write in the working directory comes back as a playable url which you then import.
Use run_media_command at most twice per request, and only when you actually need a new file or a probe you cannot get any other way. It is not a way to inspect audio you have already been given: the spectrogram is attached, so read it instead. If a command fails, read the log it returns, fix the cause or choose a different approach - never repeat the same command.

WHAT YOU RECEIVE
Uploaded images arrive as image parts: you see them.
Uploaded video arrives as a sequence of stills taken across its length, plus its exact duration, so you can judge content and timing.
Audio arrives twice: as a local analysis (duration, loudness, detected beats, silence spans) and as a labelled spectrogram picture, because this provider reads pictures but silently drops input_audio parts. Spectrograms of every audio file in the pool are attached to each of your turns, and uploaded audio comes with its own. Read them for content - speech shows harmonic stacks with syllable gaps, music shows a steady beat grid and sustained low-frequency energy - and use the analysis numbers for exact timings. Never claim you cannot hear the audio: the spectrogram is how you hear it, so describe what it shows and cut to it.
If the user gives only video and no music, do not stop. Lay the video out, cut on the detected scene changes, add motion, text and effects, and if the user asked for sound, make it with run_media_command.

EFFECTS
${EFFECT_TEXT}

ANIMATIONS
Lottie overlays composite above the picture; they never move the clip underneath. Available seeds (add_animation with animationId after the library loads, or url):
${ANIMATION_TEXT}
For anything not in that seed list, call search_lottie first. It searches the live LottieFiles catalogue - millions of animations, from a stock ticker to a glitch title to confetti. Take the url from a hit and pass it to add_animation; do not guess a lottiefiles url, because guessed urls 403.

RULES THAT KEEP THE EDIT CORRECT
Edit what you were given. If the user uploaded no video and no audio, do not invent a project out of library stock: either use exactly the media in the timeline, or ask what they want. Never claim you edited something you were not given.
Decide the look once. Apply each effect or transition at most once per clip. If you dislike the result, change the values with update_clip, or remove it - do not apply and strip the same effect repeatedly, that wastes your steps and leaves the edit worse.
An overlay, animation, text or effect sits on its own track above the video. Never move or retime the video to fit an overlay.
Keep audio and video in step: if you speed a clip up, trim its duration to match, and keep the audio clip's in/start consistent with the video it belongs to.
Captions: put them on a text track with set_captions, one entry per spoken line.
Grading is per clip: update_clip with filter, or apply_effect for the library looks.

OUTPUT SHAPE
Use the tools. If you cannot, you may reply with a fenced json block containing an array of ops, and the editor will apply it:
\`\`\`json
[{"op":"add_clip","clip":{"kind":"video","mediaId":"media_abc","start":0,"duration":5}}]
\`\`\`
Write your one-line commentary as ordinary prose in the same message as the tool calls. Prose plus tool calls is the normal shape; only the final answer stands alone.`;
}

/** Build the user turn, mixing text, images, video stills and the analysis. */
export function buildUserParts(prompt: string, attachments: AgentAttachment[], state: TimelineState): ContentPart[] {
  const parts: ContentPart[] = [];
  const header = [`TIMELINE NOW`, describeTimeline(state), ``, `REQUEST`, prompt].join("\n");
  parts.push({ type: "text", text: header });

  // Audio already in the pool: its spectrogram travels with every turn, so the
  // agent can hear the music it is being asked to cut to.
  const poolAudio = state.media.filter((item) => item.kind === "audio" && item.spectrogram).slice(0, 4);
  if (poolAudio.length) {
    parts.push({
      type: "text",
      text: `SPECTROGRAMS of the ${poolAudio.length} audio file(s) in the pool (time in seconds left to right, frequency in kHz bottom to top):`,
    });
    for (const item of poolAudio) {
      parts.push({ type: "text", text: `"${item.name}" (${item.duration.toFixed(2)}s)` });
      parts.push({ type: "image_url", image_url: { url: item.spectrogram as string } });
    }
  }

  for (const attachment of attachments) {
    const lines: string[] = [`ATTACHMENT "${attachment.name}" (${attachment.kind})`];
    if (attachment.note) lines.push(attachment.note);
    parts.push({ type: "text", text: lines.join("\n") });

    if (attachment.kind === "image") {
      if (attachment.url.startsWith("data:") || /^https?:/.test(attachment.url)) {
        parts.push({ type: "image_url", image_url: { url: attachment.url } });
      }
      continue;
    }
    if (attachment.kind === "video") {
      const frames = attachment.frames ?? [];
      frames.slice(0, 6).forEach((frame, index) => {
        parts.push({ type: "text", text: `frame ${index + 1} of ${frames.length}` });
        parts.push({ type: "image_url", image_url: { url: frame } });
      });
      if (attachment.url.startsWith("data:") && frames.length === 0) {
        parts.push({ type: "video_url", video_url: { url: attachment.url } });
      }
      continue;
    }
    if (attachment.kind === "audio") {
      // The provider drops `input_audio`, so sound arrives as a labelled
      // spectrogram image. The model reads speech, music and rhythm off it.
      if (attachment.spectrogram) {
        parts.push({ type: "text", text: "labelled spectrogram of the audio above (time in seconds, frequency in kHz)" });
        parts.push({ type: "image_url", image_url: { url: attachment.spectrogram } });
      }
      continue;
    }
  }
  return parts;
}

/** Extract an ops array from a fenced ```json or ```tool block, if present. */
export function parseOpsFromText(text: string): Op[] {
  const blocks = [...text.matchAll(/```(?:json|tool|ops)?\s*\n([\s\S]*?)```/g)];
  for (const block of blocks) {
    const body = block[1]?.trim();
    if (!body) continue;
    const parsed = tryParseOps(body);
    if (parsed.length) return parsed;
  }
  return [];
}

function tryParseOps(body: string): Op[] {
  try {
    const json = JSON.parse(body) as unknown;
    return collectOps(json);
  } catch {
    return [];
  }
}

function collectOps(value: unknown): Op[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectOps(entry));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["op"] === "string") return [record as unknown as Op];
    for (const key of ["ops", "operations", "actions", "edits"]) {
      const nested = record[key];
      if (nested) {
        const ops = collectOps(nested);
        if (ops.length) return ops;
      }
    }
  }
  return [];
}

/** Extract fenced ```tool blocks written as {"name":..., "arguments":{...}}. */
export function parseToolCallsFromText(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const blocks = [...text.matchAll(/```(?:tool|tool_call|json)?\s*\n([\s\S]*?)```/g)];
  for (const block of blocks) {
    const body = block[1]?.trim();
    if (!body) continue;
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      continue;
    }
    const entries = Array.isArray(json) ? json : [json];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as Record<string, unknown>;
      const name = typeof record["name"] === "string" ? record["name"] : typeof record["tool"] === "string" ? record["tool"] : "";
      if (!name || !TOOL_BY_NAME.has(name)) continue;
      const args = record["arguments"] ?? record["args"] ?? record["input"] ?? {};
      calls.push({
        id: `text_${calls.length}`,
        type: "function",
        function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
      });
    }
  }
  return calls;
}

/** Tool definitions in the shape the provider expects. */
export function toolDefs(): ToolDef[] {
  return TOOLS.map((tool) => ({
    type: "function" as const,
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Run one tool call and describe it for the transcript. */
async function runTool(call: ToolCall, ctx: AgentContext): Promise<{ ok: boolean; payload: unknown }> {
  const tool = TOOL_BY_NAME.get(call.function.name);
  if (!tool) return { ok: false, payload: { error: `unknown tool ${call.function.name}` } };
  const args = safeJson(call.function.arguments);
  try {
    const result = await tool.run(args, ctx);
    if (result.ok) return { ok: true, payload: result.data ?? { ok: true } };
    // Carry the tool's detail through on failure too. run_media_command returns
    // the command log there, and without it the model cannot see why a command
    // failed - so it retries the same failing command until the rounds run out.
    const payload: Record<string, unknown> = { error: result.error ?? "failed" };
    if (result.data && typeof result.data === "object") Object.assign(payload, result.data);
    return { ok: false, payload };
  } catch (error) {
    return { ok: false, payload: { error: error instanceof Error ? error.message : String(error) } };
  }
}

const TOOL_RESULT_LIMIT = 6000;

/**
 * The media worker is a last resort, not the main tool. Left unbounded, a model
 * that likes shell commands spends every round synthesising files and never
 * gets to the edit, so the budget is enforced here rather than asked for in the
 * prompt.
 */
const MAX_COMMANDS_PER_TURN = 4;

/** True when two argument objects describe the same call. */
function identical(a: unknown, b: unknown): boolean {
  return a !== undefined && JSON.stringify(a) === JSON.stringify(b);
}

/** Tools that only observe state, so repeating them is harmless and expected. */
const READ_ONLY_TOOLS = new Set([
  "list_timeline",
  "list_effects",
  "list_animations",
  "search_assets",
  "search_lottie",
  "search_stock",
]);
/** Tools that end the turn: the model asks or reports, then waits for the user. */
const TERMINAL_TOOLS = new Set(["finish", "ask_user"]);

function trimPayload(payload: unknown): string {
  const text = JSON.stringify(payload ?? null);
  return text.length > TOOL_RESULT_LIMIT ? `${text.slice(0, TOOL_RESULT_LIMIT)}…(truncated)` : text;
}

/**
 * The full agent loop. Returns the messages added to the conversation so the
 * caller can persist them for the next turn.
 */
export async function runAgent(options: RunOptions): Promise<{ summary: string; messages: ChatMessage[]; opsApplied: number }> {
  const emit = (event: AgentEvent): void => options.onEvent?.(event);
  // Beat-synced and multi-clip edits legitimately take many steps: read the
  // timeline, make the sound, cut, grade each piece. 12 rounds ran out mid-edit.
  const maxRounds = options.maxRounds ?? 24;
  const messages: ChatMessage[] = [...options.history];
  const added: ChatMessage[] = [];

  const push = (message: ChatMessage): void => {
    messages.push(message);
    added.push(message);
  };

  if (messages.length === 0 || messages[0]?.role !== "system") {
    messages.unshift({ role: "system", content: systemPrompt() });
  }

  const parts = buildUserParts(options.prompt, options.attachments, options.state);
  push({ role: "user", content: parts });

  let summary = "";
  let opsApplied = 0;
  const tools = toolDefs();
  /** results of calls already made this turn, keyed by tool name + arguments */
  const callCache = new Map<string, unknown>();
  const repeatCounts = new Map<string, number>();
  /** last result and arguments per tool name, to catch a re-issued call after prose */
  const recentCalls = new Map<string, unknown>();
  const recentArgs = new Map<string, unknown>();
  /** commands spent this turn, so a shell-happy model cannot burn the whole run */
  let commandBudget = MAX_COMMANDS_PER_TURN;

  for (let round = 0; round < maxRounds; round++) {
    if (options.signal?.aborted) break;
    emit({ type: "round", index: round + 1, max: maxRounds });

    let result: ChatResult;
    try {
      if (options.stream !== false) {
        result = await streamRound(options, messages, tools, emit);
      } else {
        result = await completeChat({
          model: options.model,
          messages,
          tools,
          maxTokens: 8192,
          ...(options.signal ? { signal: options.signal } : {}),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ type: "error", message });
      break;
    }

    const text = result.content.trim();
    if (text) emit({ type: "assistant_text", text });

    let calls = result.toolCalls;
    if (calls.length === 0 && text) {
      calls = parseToolCallsFromText(text);
      if (calls.length) {
        emit({ type: "assistant_text", text: "(recovered tool calls from the text answer)" });
      }
    }

    if (calls.length === 0) {
      // no tools: accept a fenced ops block, otherwise treat the prose as the answer
      const ops = text ? parseOpsFromText(text) : [];
      if (ops.length) {
        const applied = await options.ctx.dispatch(ops);
        opsApplied += ops.length;
        emit({ type: "ops", ops, notes: applied.notes });
        push({ role: "assistant", content: text });
        push({ role: "user", content: `applied: ${applied.notes.join("; ") || "ok"}. Continue, or call finish.` });
        continue;
      }
      summary = text;
      break;
    }

    const assistantMessage: ChatMessage = { role: "assistant", content: text, tool_calls: calls };
    push(assistantMessage);

    let finished = false;
    for (const call of calls) {
      const args = safeJson(call.function.arguments);
      // A model that repeats an identical call is stuck: it is not reading the
      // result. Answer from the cache and tell it plainly, rather than spending
      // the remaining rounds on the same command.
      // Read-only tools may be called as often as the model likes: re-reading the
      // timeline is normal, and answering it from a stale cache would be wrong.
      const fingerprint = `${call.function.name}:${JSON.stringify(args)}`;
      const seen = READ_ONLY_TOOLS.has(call.function.name) ? undefined : callCache.get(fingerprint);
      if (seen !== undefined) {
        const repeats = (repeatCounts.get(fingerprint) ?? 1) + 1;
        repeatCounts.set(fingerprint, repeats);
        emit({ type: "tool", name: call.function.name, args, ok: false, error: "repeated call" });
        push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            error: "you already called this with the same arguments",
            previousResult: seen,
            instruction: "Do not repeat it. Use the result above, change the arguments, or call finish.",
          }),
        });
        if (repeats >= 3 && !TERMINAL_TOOLS.has(call.function.name)) {
          push({ role: "user", content: "Stop repeating. Call finish now with what you have completed." });
        }
        continue;
      }
      // The model likes to announce a command in prose and then re-issue the call it
      // already made. Answer the announcement from the cache instead of running the
      // command a second time.
      if (!READ_ONLY_TOOLS.has(call.function.name)) {
        const byName = recentCalls.get(call.function.name);
        if (byName !== undefined && identical(recentArgs.get(call.function.name), args)) {
          emit({ type: "tool", name: call.function.name, args, ok: true, result: byName });
          push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ ok: true, note: "same call as the previous step; result reused", result: byName }),
          });
          continue;
        }
      }
      if (call.function.name === "run_media_command") {
        if (commandBudget <= 0) {
          const refusal = {
            error: "command budget for this request is spent",
            instruction:
              "Do not run more commands. Build the edit from the media already in the pool and from the shelves, then call finish.",
          };
          emit({ type: "tool", name: call.function.name, args, ok: false, error: refusal.error });
          push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(refusal) });
          continue;
        }
        commandBudget -= 1;
      }
      const { ok, payload } = await runTool(call, options.ctx);
      callCache.set(fingerprint, payload);
      if (!READ_ONLY_TOOLS.has(call.function.name)) {
        recentCalls.set(call.function.name, payload);
        recentArgs.set(call.function.name, args);
      }
      emit({ type: "tool", name: call.function.name, args, ok, ...(ok ? { result: payload } : { error: String((payload as { error?: string }).error ?? "failed") }) });
      push({ role: "tool", tool_call_id: call.id, content: trimPayload(payload) });
      if (call.function.name === "finish") {
        finished = true;
        const record = payload as { summary?: string };
        summary = record.summary ?? summary;
      }
      if (call.function.name === "ask_user") {
        // The model needs the user. Stop here rather than letting it burn the
        // remaining rounds guessing at an answer it cannot know.
        finished = true;
        const record = payload as { asked?: string; options?: string[] };
        const choices = record.options?.length ? `\n${record.options.map((o) => `• ${o}`).join("\n")}` : "";
        summary = `${record.asked ?? "আমার একটা প্রশ্ন আছে।"}${choices}`;
      }
    }
    if (finished) break;

    if (round === maxRounds - 1) {
      // Out of rounds with the model still working. Ask once more with the tools
      // withheld so it reports what it actually got done, rather than us
      // inventing a summary that claims the edit finished.
      const wrapUp = await wrapUpSummary(options, messages, emit);
      if (wrapUp) summary = wrapUp;
    }
  }

  if (!summary) {
    summary = "সম্পাদনা সম্পন্ন হয়েছে।"; 
  }
  emit({ type: "done", summary });
  return { summary, messages: added, opsApplied };
}

/**
 * Ask for a closing report with no tools attached, so the model cannot start
 * another round of work. Returns its prose, or an empty string on failure.
 */
async function wrapUpSummary(options: RunOptions, messages: ChatMessage[], emit: (event: AgentEvent) => void): Promise<string> {
  try {
    const result = await completeChat({
      model: options.model,
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "You are out of steps and the tools are gone. In the user's language, say plainly what you did manage to change and what is still missing. Do not claim anything you did not do.",
        },
      ],
      maxTokens: 1024,
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const text = result.content.trim();
    if (text) emit({ type: "assistant_text", text });
    return text;
  } catch (error) {
    emit({ type: "error", message: error instanceof Error ? error.message : String(error) });
    return "";
  }
}

/** One streaming round; emits prose deltas as they arrive. */
async function streamRound(
  options: RunOptions,
  messages: ChatMessage[],
  tools: ToolDef[],
  emit: (event: AgentEvent) => void,
): Promise<ChatResult> {
  let text = "";
  let result: ChatResult | undefined;
  const stream = streamChat({
    model: options.model,
    messages,
    tools,
    maxTokens: 8192,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  for await (const event of stream) {
    if (event.type === "text") {
      text += event.delta;
      emit({ type: "assistant_delta", text: event.delta });
    } else if (event.type === "done") {
      result = event.result;
    }
  }
  if (result) return result;
  return { content: text, toolCalls: [], model: options.model };
}
