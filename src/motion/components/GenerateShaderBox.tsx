import type { JSX } from "react";
import { useState } from "react";
import { Sparkles } from "@/icons/lucide-compat";
import type { MotionShaderCategory, MotionShaderDef } from "@openreel/core";
import { ToolcraftText } from "@openreel/ui";
import { generateAiShader, type LlmMessage } from "../../services/ai-shader";
import { makeZyraxonClient } from "../../services/agent/zyraxon-transport";
import { useProjectStore } from "../../stores/project-store";
import { useAIConnectionStore } from "../../stores/ai-connection-store";
import { Button, Field, TextInput } from "./primitives";

interface GenerateShaderBoxProps {
  category: MotionShaderCategory;
  onGenerated: (def: MotionShaderDef) => void;
}

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "generating" }
  | { readonly kind: "error"; readonly message: string };

const PICK_MODEL = "Pick a ZYRAXON model in the chat box";

export function GenerateShaderBox({
  category,
  onGenerated,
}: GenerateShaderBoxProps): JSX.Element {
  const [prompt, setPrompt] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const busy = phase.kind === "generating";

  const runGenerate = async (): Promise<void> => {
    const trimmed = prompt.trim();
    if (trimmed === "" || busy) return;

    setPhase({ kind: "generating" });

    const model = useAIConnectionStore.getState().model.trim();
    if (!model) {
      setPhase({ kind: "error", message: PICK_MODEL });
      return;
    }

    const client = makeZyraxonClient({ model });
    const send = async (messages: readonly LlmMessage[]): Promise<string> => {
      const response = await client.complete({
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        tools: [],
      });
      return response.text;
    };

    let result;
    try {
      result = await generateAiShader(trimmed, category, { send });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Shader generation failed";
      setPhase({ kind: "error", message });
      return;
    }

    if (!result.ok) {
      setPhase({ kind: "error", message: result.error });
      return;
    }

    const { def } = result;
    const dispatched = await useProjectStore.getState().executeAction({
      type: "project/registerGeneratedShader",
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      params: { def },
    });
    if (!dispatched.success) {
      setPhase({
        kind: "error",
        message: dispatched.error?.message ?? "Could not save the shader",
      });
      return;
    }

    setPrompt("");
    setPhase({ kind: "idle" });
    onGenerated(def);
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border bg-bg-2 p-3">
      <ToolcraftText
        as="span"
        type="label"
        color="primary"
        weight="semibold"
        className="flex items-center gap-1.5"
      >
        <Sparkles size={13} />
        Generate with AI
      </ToolcraftText>
      <Field label="Shader prompt">
        <TextInput
          value={prompt}
          onChange={setPrompt}
          placeholder="Describe a shader, e.g. holographic foil"
          disabled={busy}
        />
      </Field>
      <Button
        label="Generate shader"
        variant="solid"
        onClick={() => void runGenerate()}
        disabled={busy || prompt.trim() === ""}
      />
      {phase.kind === "generating" ? (
        <ToolcraftText type="supporting" color="secondary">
          Generating shader...
        </ToolcraftText>
      ) : null}
      {phase.kind === "error" ? (
        <span className="block text-[11px] leading-relaxed text-status-error">
          {phase.message}
        </span>
      ) : null}
    </div>
  );
}
