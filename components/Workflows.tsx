"use client";

import { useState } from "react";
import { AGENT_PRESETS } from "@/lib/agent/prompts";
import { PROVIDERS, PROVIDER_ORDER } from "@/lib/catalog";
import {
  blankWorkflow,
  wfUid,
  type Workflow,
  type WorkflowStep,
} from "@/lib/workflows";
import type { ProviderId } from "@/lib/types";

export function Workflows({
  workflows,
  onChange,
  onClose,
  onRun,
  streaming,
}: {
  workflows: Workflow[];
  onChange: (list: Workflow[]) => void;
  onClose: () => void;
  onRun: (wf: Workflow, input: string) => void;
  streaming: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    workflows[0]?.id ?? null,
  );
  const [input, setInput] = useState("");

  const selected =
    workflows.find((w) => w.id === selectedId) ?? workflows[0] ?? null;

  const patchWf = (patch: Partial<Workflow>) => {
    if (!selected) return;
    onChange(
      workflows.map((w) =>
        w.id === selected.id ? { ...w, ...patch, updatedAt: Date.now() } : w,
      ),
    );
  };
  const patchStep = (sid: string, patch: Partial<WorkflowStep>) =>
    patchWf({
      steps: (selected?.steps ?? []).map((s) =>
        s.id === sid ? { ...s, ...patch } : s,
      ),
    });
  const addStep = () =>
    patchWf({
      steps: [
        ...(selected?.steps ?? []),
        {
          id: wfUid(),
          name: `Step ${(selected?.steps.length ?? 0) + 1}`,
          agentId: "chat",
          prompt: "{{previous}}",
        },
      ],
    });
  const removeStep = (sid: string) =>
    patchWf({ steps: (selected?.steps ?? []).filter((s) => s.id !== sid) });
  const moveStep = (i: number, dir: number) => {
    if (!selected) return;
    const s = [...selected.steps];
    const j = i + dir;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    patchWf({ steps: s });
  };
  const newWorkflow = () => {
    const w = blankWorkflow();
    onChange([w, ...workflows]);
    setSelectedId(w.id);
  };
  const duplicate = () => {
    if (!selected) return;
    const w: Workflow = {
      ...selected,
      id: wfUid(),
      name: selected.name + " copy",
      steps: selected.steps.map((s) => ({ ...s, id: wfUid() })),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onChange([w, ...workflows]);
    setSelectedId(w.id);
  };
  const deleteWorkflow = () => {
    if (!selected) return;
    const rest = workflows.filter((w) => w.id !== selected.id);
    onChange(rest);
    setSelectedId(rest[0]?.id ?? null);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center p-4 md:p-10 overflow-y-auto"
      style={{ background: "rgba(2,4,8,0.72)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="panel neon-border w-full max-w-2xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edge-accent flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="flex items-center gap-3">
            <span className="glow-cyan font-bold tracking-widest">
              ▷ WORKFLOWS
            </span>
            <span className="tag">chain agents into pipelines</span>
          </div>
          <button
            onClick={onClose}
            className="focus-ring px-2 text-ink-dim hover:text-cyber-cyan"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[74vh] overflow-y-auto">
          {/* workflow chips */}
          <div className="flex flex-wrap gap-1.5">
            {workflows.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedId(w.id)}
                className="focus-ring px-2.5 py-1 text-[12px] border"
                style={{
                  borderColor:
                    selected?.id === w.id ? "var(--cyan)" : "var(--line)",
                  color: selected?.id === w.id ? "var(--cyan)" : "var(--ink-dim)",
                  background:
                    selected?.id === w.id
                      ? "rgba(0,229,255,0.06)"
                      : "transparent",
                }}
              >
                {w.name}
              </button>
            ))}
            <button
              onClick={newWorkflow}
              className="focus-ring px-2.5 py-1 text-[12px] border border-line-bright text-cyber-cyan"
            >
              + new
            </button>
          </div>

          {!selected ? (
            <p className="text-ink-faint text-[12.5px]">
              No workflows yet — create one with “+ new”.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <input
                  value={selected.name}
                  onChange={(e) => patchWf({ name: e.target.value })}
                  className="focus-ring w-full bg-bg-soft border border-line px-3 py-1.5 text-[13px] text-ink"
                  placeholder="workflow name"
                />
                <input
                  value={selected.description ?? ""}
                  onChange={(e) => patchWf({ description: e.target.value })}
                  className="focus-ring w-full bg-bg-soft border border-line px-3 py-1.5 text-[12px] text-ink-dim"
                  placeholder="description (optional)"
                />
              </div>

              {/* steps */}
              <div className="space-y-3">
                {selected.steps.map((step, i) => (
                  <div key={step.id} className="panel border border-line p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-cyber-violet text-[12px]">
                        ▷ {i + 1}
                      </span>
                      <input
                        value={step.name}
                        onChange={(e) =>
                          patchStep(step.id, { name: e.target.value })
                        }
                        className="focus-ring flex-1 bg-bg-soft border border-line px-2 py-1 text-[12.5px]"
                        placeholder="step name"
                      />
                      <button
                        onClick={() => moveStep(i, -1)}
                        className="focus-ring text-ink-faint hover:text-cyber-cyan px-1"
                        title="move up"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => moveStep(i, 1)}
                        className="focus-ring text-ink-faint hover:text-cyber-cyan px-1"
                        title="move down"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => removeStep(step.id)}
                        className="focus-ring text-ink-faint hover:text-cyber-red px-1"
                        title="remove step"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <select
                        value={step.agentId}
                        onChange={(e) =>
                          patchStep(step.id, { agentId: e.target.value })
                        }
                        className="focus-ring bg-bg-soft border border-line px-2 py-1 text-[12px]"
                        title="agent mode"
                      >
                        {AGENT_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <select
                        value={step.providerId ?? ""}
                        onChange={(e) =>
                          patchStep(step.id, {
                            providerId: e.target.value as ProviderId | "",
                          })
                        }
                        className="focus-ring bg-bg-soft border border-line px-2 py-1 text-[12px]"
                        title="provider override"
                      >
                        <option value="">— current —</option>
                        {PROVIDER_ORDER.map((id) => (
                          <option key={id} value={id}>
                            {PROVIDERS[id].label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={step.model ?? ""}
                        onChange={(e) =>
                          patchStep(step.id, { model: e.target.value })
                        }
                        className="focus-ring bg-bg-soft border border-line px-2 py-1 text-[12px]"
                        placeholder="model (opt)"
                      />
                    </div>

                    <textarea
                      value={step.prompt}
                      onChange={(e) =>
                        patchStep(step.id, { prompt: e.target.value })
                      }
                      rows={3}
                      className="focus-ring w-full bg-bg-soft border border-line px-2 py-1.5 text-[12.5px] resize-y"
                      placeholder="prompt…  use {{input}}, {{previous}}, {{step1}}"
                    />
                  </div>
                ))}
                <button
                  onClick={addStep}
                  className="focus-ring text-[12px] text-cyber-sky hover:text-cyber-cyan"
                >
                  + add step
                </button>
              </div>

              <p className="tag">
                variables: {"{{input}}"} · {"{{previous}}"} · {"{{step1}}"} …
              </p>

              <div className="flex gap-2 border-t border-line pt-3">
                <button
                  onClick={duplicate}
                  className="focus-ring px-3 py-1.5 text-[12px] border border-line text-ink-dim hover:text-cyber-cyan"
                >
                  duplicate
                </button>
                <button
                  onClick={deleteWorkflow}
                  className="focus-ring px-3 py-1.5 text-[12px] border border-line text-ink-faint hover:text-cyber-red"
                >
                  delete
                </button>
              </div>

              {/* run */}
              <div className="border-t border-line pt-3 space-y-2">
                <label className="tag">run input → {"{{input}}"}</label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={2}
                  className="focus-ring w-full bg-bg-soft border border-line px-3 py-2 text-[13px]"
                  placeholder="what should this workflow run on?"
                />
                <button
                  onClick={() => onRun(selected, input)}
                  disabled={streaming || !selected.steps.length}
                  className="focus-ring w-full px-4 py-2 text-[13px] border border-cyber-cyan text-cyber-cyan hover:shadow-glow disabled:opacity-40"
                >
                  ▷ run workflow ({selected.steps.length}{" "}
                  {selected.steps.length === 1 ? "step" : "steps"})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
