/**
 * Right-hand inspector: every property of the selected clip, plus the project
 * settings when nothing is selected. Values are written through ops, so the
 * agent sees the same document the user is editing.
 */
import { useEffect, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, KeyRound, Plus, Trash2, Wand2 } from "lucide-react";

import { useEditor } from "@/lib/editor-store";
import { EFFECTS, EFFECT_BY_ID, defaultValues, type EffectValues } from "@/lib/engine/effects";
import { TEXT_ANIMATIONS, TRANSITION_KINDS, type TextAnimation, type TransitionKind } from "@/lib/engine/model";
import { formatTime } from "@/lib/media";

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  step = 0.05,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  step?: number;
  min?: number;
  max?: number;
}): React.ReactElement {
  const [draft, setDraft] = useState(String(Number(value.toFixed(3))));
  useEffect(() => setDraft(String(Number(value.toFixed(3)))), [value]);
  return (
    <input
      value={draft}
      inputMode="decimal"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const parsed = Number(draft);
        if (Number.isFinite(parsed)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed)));
        else setDraft(String(Number(value.toFixed(3))));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      step={step}
      className="h-7 w-full rounded border border-border bg-panel-2 px-2 text-xs text-foreground outline-none focus:border-primary"
    />
  );
}

function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}): React.ReactElement {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-1.5 w-full accent-primary"
    />
  );
}

const BLEND_MODES = [
  "source-over",
  "screen",
  "multiply",
  "overlay",
  "lighten",
  "darken",
  "color-dodge",
  "hard-light",
  "soft-light",
  "difference",
];

export function Inspector(): React.ReactElement {
  const timeline = useEditor((s) => s.timeline);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const dispatch = useEditor((s) => s.dispatch);
  const select = useEditor((s) => s.select);
  const clip = timeline.clips.find((c) => c.id === selectedClipId);

  if (!clip) {
    return (
      <div className="flex flex-col gap-3.5 p-3.5">
        <p className="text-xs text-muted-foreground">
          একটি ক্লিপ সিলেক্ট করলে তার সব প্রপার্টি এখানে আসবে। এখন প্রজেক্ট সেটিংস দেখানো হচ্ছে।
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="প্রস্থ">
            <NumberInput
              value={timeline.project.width}
              step={1}
              onChange={(value) => dispatch([{ op: "set_project", patch: { width: Math.round(value) } }])}
            />
          </Field>
          <Field label="উচ্চতা">
            <NumberInput
              value={timeline.project.height}
              step={1}
              onChange={(value) => dispatch([{ op: "set_project", patch: { height: Math.round(value) } }])}
            />
          </Field>
          <Field label="ফ্রেম রেট">
            <NumberInput
              value={timeline.project.fps}
              step={1}
              onChange={(value) => dispatch([{ op: "set_project", patch: { fps: Math.round(value) } }])}
            />
          </Field>
          <Field label="ব্যাকগ্রাউন্ড">
            <input
              type="color"
              value={timeline.project.background}
              onChange={(event) => dispatch([{ op: "set_project", patch: { background: event.target.value } }])}
              className="h-7 w-full rounded border border-border bg-panel-2"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "16:9 · 1080p", w: 1920, h: 1080 },
            { label: "9:16 · শর্টস", w: 1080, h: 1920 },
            { label: "1:1 · ফিড", w: 1080, h: 1080 },
            { label: "4:5 · পোর্ট্রেট", w: 1080, h: 1350 },
            { label: "21:9 · সিনেমা", w: 2560, h: 1080 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="btn-ghost border border-border px-2 py-1 text-[11px]"
              onClick={() => dispatch([{ op: "set_project", patch: { width: preset.w, height: preset.h } }])}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="rounded-md border border-border bg-panel-2 p-2 text-[11px] text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">প্রজেক্টে {timeline.clips.length} ক্লিপ</p>
          <p>
            মোট দৈর্ঘ্য{" "}
            {formatTime(timeline.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0))} ·{" "}
            {timeline.tracks.length} ট্র্যাক
          </p>
        </div>
      </div>
    );
  }

  const patch = (values: Record<string, unknown>): void => {
    dispatch([{ op: "set_clip", clipId: clip.id, patch: values }]);
  };
  const setFilter = (values: Record<string, number>): void => {
    dispatch([{ op: "set_filter", clipId: clip.id, filter: values }]);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">{clip.label}</p>
          <p className="text-[10px] text-muted-foreground">
            {clip.kind} · {formatTime(clip.start)} → {formatTime(clip.start + clip.duration)}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost h-7 w-7"
          title="ক্লিপ মুছুন"
          onClick={() => {
            dispatch([{ op: "remove_clip", clipId: clip.id }]);
            select(undefined);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="শুরু">
          <NumberInput value={clip.start} min={0} onChange={(value) => dispatch([{ op: "move_clip", clipId: clip.id, start: value }])} />
        </Field>
        <Field label="দৈর্ঘ্য">
          <NumberInput
            value={clip.duration}
            min={0.05}
            onChange={(value) => dispatch([{ op: "trim_clip", clipId: clip.id, duration: value }])}
          />
        </Field>
        <Field label="ভেতরে">
          <NumberInput value={clip.in} min={0} onChange={(value) => dispatch([{ op: "trim_clip", clipId: clip.id, in: value }])} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="স্পিড">
          <NumberInput value={clip.speed} min={0.1} max={8} step={0.05} onChange={(value) => patch({ speed: value })} />
        </Field>
        <Field label="ভলিউম">
          <Slider value={clip.volume} min={0} max={2} onChange={(value) => patch({ volume: value })} />
        </Field>
        <Field label="ফেড ইন">
          <NumberInput value={clip.fadeIn} min={0} onChange={(value) => patch({ fadeIn: value })} />
        </Field>
        <Field label="ফেড আউট">
          <NumberInput value={clip.fadeOut} min={0} onChange={(value) => patch({ fadeOut: value })} />
        </Field>
      </div>

      <div className="rounded-md border border-border bg-panel-2 p-2">
        <p className="mb-2 text-[11px] font-semibold text-foreground">ট্রান্সফর্ম</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label="X">
            <Slider value={clip.x} min={-0.5} max={1.5} onChange={(value) => patch({ x: value })} />
          </Field>
          <Field label="Y">
            <Slider value={clip.y} min={-0.5} max={1.5} onChange={(value) => patch({ y: value })} />
          </Field>
          <Field label="স্কেল">
            <Slider value={clip.scale} min={0.05} max={4} onChange={(value) => patch({ scale: value })} />
          </Field>
          <Field label="ঘূর্ণন">
            <Slider value={clip.rotation} min={-180} max={180} step={1} onChange={(value) => patch({ rotation: value })} />
          </Field>
          <Field label="অপাসিটি">
            <Slider value={clip.opacity} min={0} max={1} onChange={(value) => patch({ opacity: value })} />
          </Field>
          <Field label="ব্লেন্ড">
            <select
              value={clip.blendMode}
              onChange={(event) => patch({ blendMode: event.target.value })}
              className="h-7 w-full rounded border border-border bg-panel-2 px-1 text-[11px] text-foreground outline-none"
            >
              {BLEND_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className={`btn-ghost h-7 flex-1 border border-border text-[11px] ${clip.flipH ? "text-primary" : ""}`}
            onClick={() => patch({ flipH: !clip.flipH })}
          >
            ⇄ ফ্লিপ
          </button>
          <button
            type="button"
            className={`btn-ghost h-7 flex-1 border border-border text-[11px] ${clip.flipV ? "text-primary" : ""}`}
            onClick={() => patch({ flipV: !clip.flipV })}
          >
            ⇅ ফ্লিপ
          </button>
          <button
            type="button"
            className={`btn-ghost h-7 flex-1 border border-border text-[11px] ${clip.muted ? "text-destructive" : ""}`}
            onClick={() => patch({ muted: !clip.muted })}
          >
            {clip.muted ? "নীরব" : "শব্দ"}
          </button>
        </div>
      </div>

      <div className="rounded-md border border-border bg-panel-2 p-2">
        <p className="mb-2 text-[11px] font-semibold text-foreground">গ্রেড</p>
        <div className="space-y-2">
          {(
            [
              ["brightness", "উজ্জ্বলতা", 0, 200],
              ["contrast", "কনট্রাস্ট", 0, 200],
              ["saturate", "স্যাচুরেশন", 0, 300],
              ["blur", "ব্লার", 0, 24],
              ["grayscale", "গ্রে", 0, 100],
              ["sepia", "সেপিয়া", 0, 100],
              ["hue", "হিউ", -180, 180],
              ["invert", "ইনভার্ট", 0, 100],
            ] as Array<[keyof typeof clip.filter, string, number, number]>
          ).map(([key, label, min, max]) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[10px] text-muted-foreground">{label}</span>
              <Slider value={clip.filter[key]} min={min} max={max} step={1} onChange={(value) => setFilter({ [key]: value })} />
              <span className="w-9 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                {Math.round(clip.filter[key])}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-ghost mt-2 h-7 w-full border border-border text-[11px]"
          onClick={() =>
            setFilter({ brightness: 100, contrast: 100, saturate: 100, blur: 0, grayscale: 0, sepia: 0, hue: 0, invert: 0 })
          }
        >
          গ্রেড রিসেট
        </button>
      </div>

      <div className="rounded-md border border-border bg-panel-2 p-2">
        <p className="mb-2 text-[11px] font-semibold text-foreground">ইফেক্ট স্ট্যাক ({clip.effects.length})</p>
        <div className="mb-2 space-y-1.5">
          {clip.effects.length === 0 && <p className="text-[10px] text-muted-foreground">কোনো ইফেক্ট নেই — নিচ থেকে যোগ করুন।</p>}
          {clip.effects.map((id) => {
            const def = EFFECT_BY_ID.get(id);
            if (!def) return null;
            const values = (clip.effectValues[id] ?? defaultValues(def)) as EffectValues;
            return (
              <div key={id} className="rounded border border-border/70 bg-panel p-1.5">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] font-medium text-foreground">{def.name}</span>
                  <button
                    type="button"
                    className="btn-ghost h-5 w-5"
                    title="ইফেক্ট সরান"
                    onClick={() => dispatch([{ op: "remove_effect", clipId: clip.id, effectId: id }])}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {def.params.slice(0, 3).map((param) => (
                  <div key={param.key} className="mt-1 flex items-center gap-2">
                    <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{param.key}</span>
                    {param.type === "color" ? (
                      <input
                        type="color"
                        value={String(values[param.key] ?? "#ffffff")}
                        onChange={(event) =>
                          dispatch([
                            { op: "set_effect_values", clipId: clip.id, effectId: id, values: { [param.key]: event.target.value } },
                          ])
                        }
                        className="h-5 w-10 rounded border border-border bg-panel-2"
                      />
                    ) : param.type === "bool" ? (
                      <input
                        type="checkbox"
                        checked={Boolean(values[param.key])}
                        onChange={(event) =>
                          dispatch([
                            { op: "set_effect_values", clipId: clip.id, effectId: id, values: { [param.key]: event.target.checked } },
                          ])
                        }
                        className="accent-primary"
                      />
                    ) : (
                      <>
                        <input
                          type="range"
                          min={param.min ?? 0}
                          max={param.max ?? 1}
                          step={param.step ?? 0.01}
                          value={Number(values[param.key] ?? param.def)}
                          onChange={(event) =>
                            dispatch([
                              {
                                op: "set_effect_values",
                                clipId: clip.id,
                                effectId: id,
                                values: { [param.key]: Number(event.target.value) },
                              },
                            ])
                          }
                          className="h-1 flex-1 accent-primary"
                        />
                        <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                          {Number(values[param.key] ?? param.def).toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) dispatch([{ op: "add_effect", clipId: clip.id, effectId: event.target.value }]);
          }}
          className="h-7 w-full rounded border border-border bg-panel px-1 text-[11px] text-foreground outline-none"
        >
          <option value="">+ ইফেক্ট যোগ করুন…</option>
          {EFFECTS.map((effect) => (
            <option key={effect.id} value={effect.id}>
              {effect.category} · {effect.name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md border border-border bg-panel-2 p-2">
        <p className="mb-2 text-[11px] font-semibold text-foreground">ট্রানজিশন</p>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={clip.transition.kind}
            onChange={(event) =>
              dispatch([{ op: "set_transition", clipId: clip.id, kind: event.target.value as TransitionKind }])
            }
            className="h-7 rounded border border-border bg-panel px-1 text-[11px] text-foreground outline-none"
          >
            {TRANSITION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <NumberInput
            value={clip.transition.duration}
            min={0}
            max={5}
            onChange={(value) =>
              dispatch([{ op: "set_transition", clipId: clip.id, kind: clip.transition.kind, duration: value }])
            }
          />
        </div>
      </div>

      <div className="rounded-md border border-border bg-panel-2 p-2">
        <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-foreground">
          <KeyRound className="h-3 w-3" /> কীফ্রেম ({clip.keyframes.length})
        </p>
        <div className="space-y-1">
          {clip.keyframes.map((frame, index) => (
            <div key={`${frame.t}-${index}`} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-10 font-mono">{frame.t.toFixed(2)}s</span>
              <span className="flex-1 truncate">
                x{frame.x.toFixed(2)} y{frame.y.toFixed(2)} s{frame.scale.toFixed(2)} r{frame.rotation.toFixed(0)} o
                {frame.opacity.toFixed(2)}
              </span>
              <button
                type="button"
                className="btn-ghost h-5 w-5"
                onClick={() =>
                  dispatch([
                    {
                      op: "add_keyframes",
                      clipId: clip.id,
                      keyframes: clip.keyframes.filter((_, i) => i !== index).map((f) => ({ ...f })),
                    },
                    { op: "clear_keyframes", clipId: clip.id },
                  ])
                }
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            className="btn-ghost h-7 flex-1 border border-border text-[11px]"
            onClick={() =>
              dispatch([
                {
                  op: "add_keyframes",
                  clipId: clip.id,
                  keyframes: [
                    { t: 0, scale: clip.scale, opacity: clip.opacity },
                    { t: Math.max(0.5, clip.duration / 2), scale: clip.scale * 1.2, opacity: clip.opacity },
                    { t: clip.duration, scale: clip.scale, opacity: clip.opacity },
                  ],
                },
              ])
            }
          >
            <Wand2 className="h-3 w-3" /> জুম কীফ্রেম
          </button>
          <button
            type="button"
            className="btn-ghost h-7 flex-1 border border-border text-[11px]"
            onClick={() => dispatch([{ op: "clear_keyframes", clipId: clip.id }])}
          >
            <Trash2 className="h-3 w-3" /> সব মুছুন
          </button>
        </div>
      </div>

      {clip.text && (
        <div className="rounded-md border border-border bg-panel-2 p-2">
          <p className="mb-2 text-[11px] font-semibold text-foreground">টেক্সট</p>
          <textarea
            value={clip.text.content}
            rows={2}
            onChange={(event) => dispatch([{ op: "set_text", clipId: clip.id, patch: { content: event.target.value } }])}
            className="w-full resize-none rounded border border-border bg-panel px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="সাইজ">
              <NumberInput value={clip.text.size} min={8} step={2} onChange={(value) => dispatch([{ op: "set_text", clipId: clip.id, patch: { size: value } }])} />
            </Field>
            <Field label="রং">
              <input
                type="color"
                value={clip.text.color}
                onChange={(event) => dispatch([{ op: "set_text", clipId: clip.id, patch: { color: event.target.value } }])}
                className="h-7 w-full rounded border border-border bg-panel"
              />
            </Field>
            <Field label="X">
              <Slider value={clip.text.x} min={0} max={1} onChange={(value) => dispatch([{ op: "set_text", clipId: clip.id, patch: { x: value } }])} />
            </Field>
            <Field label="Y">
              <Slider value={clip.text.y} min={0} max={1} onChange={(value) => dispatch([{ op: "set_text", clipId: clip.id, patch: { y: value } }])} />
            </Field>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="অ্যানিমেশন">
              <select
                value={clip.text.animation}
                onChange={(event) =>
                  dispatch([{ op: "set_text", clipId: clip.id, patch: { animation: event.target.value as TextAnimation } }])
                }
                className="h-7 w-full rounded border border-border bg-panel px-1 text-[11px] text-foreground outline-none"
              >
                {TEXT_ANIMATIONS.map((animation) => (
                  <option key={animation} value={animation}>
                    {animation}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ব্যাকগ্রাউন্ড">
              <input
                type="color"
                value={clip.text.background ?? "#000000"}
                onChange={(event) => dispatch([{ op: "set_text", clipId: clip.id, patch: { background: event.target.value } }])}
                className="h-7 w-full rounded border border-border bg-panel"
              />
            </Field>
          </div>
          <div className="mt-2 flex gap-1.5">
            {(
              [
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const
            ).map(([align, Icon]) => (
              <button
                key={align}
                type="button"
                className={`btn-ghost h-7 flex-1 border border-border ${clip.text?.align === align ? "text-primary" : ""}`}
                onClick={() => dispatch([{ op: "set_text", clipId: clip.id, patch: { align } }])}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
            <button
              type="button"
              className={`btn-ghost h-7 flex-1 border border-border text-[11px] ${clip.text.stroke ? "text-primary" : ""}`}
              onClick={() => dispatch([{ op: "set_text", clipId: clip.id, patch: { stroke: !clip.text?.stroke } }])}
            >
              আউটলাইন
            </button>
            <button
              type="button"
              className="btn-ghost h-7 flex-1 border border-border text-[11px]"
              onClick={() => dispatch([{ op: "set_text", clipId: clip.id, patch: { background: null } }])}
            >
              বক্স বন্ধ
            </button>
          </div>
        </div>
      )}

      <div className="rounded-md border border-border bg-panel-2 p-2">
        <p className="mb-2 text-[11px] font-semibold text-foreground">ক্রোমা কী</p>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={clip.chroma?.enabled ?? false}
            onChange={(event) =>
              patch({
                chroma: {
                  enabled: event.target.checked,
                  color: clip.chroma?.color ?? "#00ff00",
                  similarity: clip.chroma?.similarity ?? 0.35,
                  smoothness: clip.chroma?.smoothness ?? 0.15,
                },
              })
            }
            className="accent-primary"
          />
          <input
            type="color"
            value={clip.chroma?.color ?? "#00ff00"}
            onChange={(event) =>
              patch({
                chroma: {
                  enabled: true,
                  color: event.target.value,
                  similarity: clip.chroma?.similarity ?? 0.35,
                  smoothness: clip.chroma?.smoothness ?? 0.15,
                },
              })
            }
            className="h-6 w-10 rounded border border-border bg-panel"
          />
          <Slider
            value={clip.chroma?.similarity ?? 0.35}
            min={0.01}
            max={1}
            onChange={(value) =>
              patch({
                chroma: {
                  enabled: true,
                  color: clip.chroma?.color ?? "#00ff00",
                  similarity: value,
                  smoothness: clip.chroma?.smoothness ?? 0.15,
                },
              })
            }
          />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">সবুজ স্ক্রিন ক্লিপের জন্য।</p>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn-ghost h-7 flex-1 border border-border text-[11px]"
          onClick={() => dispatch([{ op: "split_clip", clipId: clip.id, time: clip.start + clip.duration / 2 }])}
        >
          মাঝখানে কাট
        </button>
        <button
          type="button"
          className="btn-ghost h-7 flex-1 border border-border text-[11px]"
          onClick={() => dispatch([{ op: "add_track", kind: clip.kind === "audio" ? "audio" : "effect" }])}
        >
          <Plus className="h-3 w-3" /> ট্র্যাক
        </button>
      </div>
    </div>
  );
}
