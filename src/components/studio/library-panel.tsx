/**
 * Library panel: effect rack, free stock assets, Lottie animations and YouTube.
 *
 * Every tab writes into the same document as the agent, so a clip added by hand
 * and a clip added by the model are indistinguishable afterwards.
 */
import { useEffect, useState } from "react";
import { Download, Film, ImageIcon, Loader2, Music, Search, Sparkles, Wand2, Youtube } from "lucide-react";

import { useEditor } from "@/lib/editor-store";
import { EFFECTS, EFFECT_CATEGORIES, type EffectCategory, type EffectDef } from "@/lib/engine/effects";
import { animationIds } from "@/lib/engine/animations";
import type { AssetResult } from "@/lib/engine/assets";

type Tab = "effects" | "stock" | "motion" | "youtube";

const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "effects", label: "ইফেক্ট", icon: <Wand2 className="h-3.5 w-3.5" /> },
  { id: "stock", label: "স্টক", icon: <ImageIcon className="h-3.5 w-3.5" /> },
  { id: "motion", label: "অ্যানিমেশন", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "youtube", label: "ইউটিউব", icon: <Youtube className="h-3.5 w-3.5" /> },
];

export function LibraryPanel(): React.ReactElement {
  const [tab, setTab] = useState<Tab>("effects");
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const dispatch = useEditor((s) => s.dispatch);
  const notify = useEditor((s) => s.notify);

  const assetQuery = useEditor((s) => s.assetQuery);
  const assetKind = useEditor((s) => s.assetKind);
  const assetResults = useEditor((s) => s.assetResults);
  const assetLoading = useEditor((s) => s.assetLoading);
  const setAssetQuery = useEditor((s) => s.setAssetQuery);
  const setAssetKind = useEditor((s) => s.setAssetKind);
  const runAssetSearch = useEditor((s) => s.runAssetSearch);
  const importAsset = useEditor((s) => s.importAsset);
  const importYouTube = useEditor((s) => s.importYouTube);
  const animations = useEditor((s) => s.animations);
  const loadAnimation = useEditor((s) => s.loadAnimation);

  const [category, setCategory] = useState<EffectCategory | "all">("all");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeMode, setYoutubeMode] = useState<"video" | "audio">("video");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab === "stock" && assetResults.length === 0) void runAssetSearch("cinematic", "all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const applyEffect = (effect: EffectDef): void => {
    if (!selectedClipId) {
      notify("আগে একটা ক্লিপ সিলেক্ট করুন, তারপর ইফেক্ট বসান", "error");
      return;
    }
    dispatch([{ op: "add_effect", clipId: selectedClipId, effectId: effect.id }]);
    notify(`"${effect.name}" যোগ হয়েছে`, "success");
  };

  const addAnimationToTimeline = (animationId: string): void => {
    dispatch([
      {
        op: "add_clip",
        clip: {
          kind: "effect",
          animationId,
          label: animations.find((a) => a.id === animationId)?.name ?? "animation",
          duration: animations.find((a) => a.id === animationId)?.duration ?? 3,
          blendMode: "screen",
        },
      },
    ]);
  };

  const loadAnimationUrl = async (): Promise<void> => {
    const url = window.prompt("Lottie JSON এর লিংক দিন (lottiefiles.com থেকে কপি করুন)");
    if (!url) return;
    setBusy(true);
    try {
      const id = await loadAnimation(url);
      addAnimationToTimeline(id);
      notify("অ্যানিমেশন লোড ও টাইমলাইনে বসানো হয়েছে", "success");
    } catch {
      notify("Lottie JSON লোড করা যায়নি", "error");
    } finally {
      setBusy(false);
    }
  };

  const runYoutube = async (): Promise<void> => {
    if (!youtubeUrl.trim()) return;
    setBusy(true);
    try {
      await importYouTube(youtubeUrl.trim(), youtubeMode);
      setYoutubeUrl("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "ইউটিউব থেকে আনা যায়নি", "error");
    } finally {
      setBusy(false);
    }
  };

  const filteredEffects = category === "all" ? EFFECTS : EFFECTS.filter((effect) => effect.category === category);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1.5">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors ${
              tab === entry.id ? "bg-panel-3 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry.icon}
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tab === "effects" && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCategory("all")}
                className={`rounded px-1.5 py-0.5 text-[10px] ${category === "all" ? "bg-primary text-primary-foreground" : "bg-panel-2 text-muted-foreground"}`}
              >
                সব
              </button>
              {EFFECT_CATEGORIES.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => setCategory(entry)}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${category === entry ? "bg-primary text-primary-foreground" : "bg-panel-2 text-muted-foreground"}`}
                >
                  {entry}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {selectedClipId ? "ক্লিক করলে সিলেক্টেড ক্লিপে বসবে" : "আগে একটা ক্লিপ সিলেক্ট করুন"} · মোট {filteredEffects.length}
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {filteredEffects.map((effect) => (
                <button
                  key={effect.id}
                  type="button"
                  onClick={() => applyEffect(effect)}
                  className="flex flex-col items-start gap-0.5 rounded-md border border-border bg-panel-2 p-1.5 text-left transition-colors hover:border-primary"
                  title={effect.description}
                >
                  <span className="text-[11px] font-medium text-foreground">{effect.name}</span>
                  <span className="text-[9px] text-muted-foreground">{effect.category}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "stock" && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-panel-2 p-1">
              <Search className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={assetQuery}
                onChange={(event) => setAssetQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runAssetSearch();
                }}
                placeholder="ভিডিও, ছবি, আইকন, সাউন্ড খুঁজুন"
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              <button type="button" className="btn-ghost h-6 px-2 text-[11px]" onClick={() => void runAssetSearch()}>
                খুঁজুন
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {(["all", "video", "image", "audio", "icon"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => {
                    setAssetKind(kind);
                    void runAssetSearch(assetQuery, kind);
                  }}
                  className={`rounded px-1.5 py-0.5 text-[10px] ${assetKind === kind ? "bg-primary text-primary-foreground" : "bg-panel-2 text-muted-foreground"}`}
                >
                  {kind}
                </button>
              ))}
            </div>
            {assetLoading && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> খোঁজা হচ্ছে…
              </p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {assetResults.map((asset) => (
                <AssetCard key={`${asset.source}-${asset.url}`} asset={asset} onAdd={() => void importAsset(asset)} />
              ))}
            </div>
            {!assetLoading && assetResults.length === 0 && (
              <p className="py-6 text-center text-[11px] text-muted-foreground">
                কিছু পাওয়া যায়নি। অন্য শব্দ দিয়ে খুঁজুন — স্টক কনটেন্ট Wikimedia, Openverse, Iconify ও পাবলিক ফিড থেকে আসে।
              </p>
            )}
          </div>
        )}

        {tab === "motion" && (
          <div className="space-y-2">
            <div className="flex gap-1.5">
              <button type="button" className="btn-ghost h-7 flex-1 border border-border text-[11px]" onClick={() => void loadAnimationUrl()} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Lottie লিংক
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {animations.length} অ্যানিমেশন লোডড ({animationIds().length} রেজিস্টার্ড)। ক্লিক করলে ইফেক্ট ট্র্যাকে বসবে।
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {animations.map((animation) => (
                <button
                  key={animation.id}
                  type="button"
                  onClick={() => addAnimationToTimeline(animation.id)}
                  className="flex flex-col gap-0.5 rounded-md border border-border bg-panel-2 p-1.5 text-left transition-colors hover:border-primary"
                >
                  <span className="truncate text-[11px] font-medium text-foreground">{animation.name}</span>
                  <span className="text-[9px] text-muted-foreground">
                    {animation.duration.toFixed(1)}s · {animation.tags.slice(0, 2).join(", ")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "youtube" && (
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground">
              ইউটিউব লিংক দিন — ভিডিও বা অডিও স্ট্রিম সরাসরি টাইমলাইনে বসবে। ডাউনলোড সার্ভার-সাইড প্রক্সির মাধ্যমে হয়।
            </p>
            <input
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="h-8 w-full rounded-md border border-border bg-panel-2 px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
            />
            <div className="flex gap-1.5">
              {(["video", "audio"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setYoutubeMode(mode)}
                  className={`h-7 flex-1 rounded text-[11px] ${youtubeMode === mode ? "bg-primary text-primary-foreground" : "bg-panel-2 text-muted-foreground"}`}
                >
                  {mode === "video" ? "ভিডিও" : "শুধু অডিও"}
                </button>
              ))}
            </div>
            <button type="button" className="btn-accent h-8 w-full text-xs" onClick={() => void runYoutube()} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
              টাইমলাইনে আনো
            </button>
            <p className="text-[10px] text-muted-foreground">
              দ্রষ্টব্য: কিছু ভিডিও অঞ্চল-লকড বা ডিআরএম-সুরক্ষিত থাকতে পারে। সেক্ষেত্রে অন্য ক্লিপ ব্যবহার করুন বা ফাইল আপলোড করুন।
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function AssetCard({ asset, onAdd }: { asset: AssetResult; onAdd: () => void }): React.ReactElement {
  const icon =
    asset.kind === "audio" ? <Music className="h-4 w-4" /> : asset.kind === "video" ? <Film className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-panel-2 text-left transition-colors hover:border-primary"
      title={`${asset.title} · ${asset.source}`}
    >
      <div className="relative h-16 w-full overflow-hidden bg-panel-3">
        {asset.thumb ? (
          <img src={asset.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">{icon}</div>
        )}
        <span className="absolute bottom-0.5 left-0.5 rounded-sm bg-black/60 px-1 text-[9px] text-white">{asset.kind}</span>
      </div>
      <span className="truncate px-1.5 py-1 text-[10px] text-foreground">{asset.title}</span>
      <span className="truncate px-1.5 pb-1 text-[9px] text-muted-foreground">
        {asset.source}
        {asset.license ? ` · ${asset.license}` : ""}
      </span>
    </button>
  );
}
