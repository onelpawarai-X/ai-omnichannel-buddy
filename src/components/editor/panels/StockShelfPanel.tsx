import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Film, Image as ImageIcon, Loader2, Music, Search, Shapes, Sparkles, Youtube } from "@/icons/lucide-compat";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftCard as Card } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { ToolcraftTextInputControl as TextInput } from "@openreel/ui";
import { toast } from "../../../stores/notification-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { importStockAsset } from "../../../services/stock-import";
import {
  MIXKIT_CATEGORIES,
  STOCK_SOURCES,
  searchSource,
  type StockAsset,
  type StockSourceId,
} from "../../../services/stock-library";

const SOURCE_ICONS: Record<StockSourceId, React.ElementType> = {
  mixkit: Film,
  lottiefiles: Sparkles,
  commons: ImageIcon,
  "openverse-image": ImageIcon,
  "openverse-audio": Music,
  iconify: Shapes,
  youtube: Youtube,
};

export const StockShelfPanel: React.FC = () => {
  const [source, setSource] = useState<StockSourceId>("mixkit");
  const [query, setQuery] = useState("");
  const [assets, setAssets] = useState<StockAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const playheadPosition = useTimelineStore((state) => state.playheadPosition);

  const activeSource = useMemo(
    () => STOCK_SOURCES.find((entry) => entry.id === source) ?? STOCK_SOURCES[0],
    [source],
  );

  const run = useCallback(
    async (sourceId: StockSourceId, term: string) => {
      setLoading(true);
      try {
        const results = await searchSource(sourceId, term, 24);
        setAssets(results);
      } catch (error) {
        setAssets([]);
        toast.error("Could not reach that library", error instanceof Error ? error.message : undefined);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void run(source, source === "mixkit" ? "abstract" : query);
  }, [source, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToTimeline = useCallback(
    async (asset: StockAsset) => {
      if (!asset.importUrl) {
        toast.error("That result has no downloadable file");
        return;
      }
      setBusyId(asset.id);
      try {
        await importStockAsset(asset, playheadPosition);
      } catch (error) {
        toast.error("Could not add that clip", error instanceof Error ? error.message : undefined);
      } finally {
        setBusyId(null);
      }
    },
    [playheadPosition],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/70 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <TextInput
            value={query}
            onChange={(value) => setQuery(value)}
            placeholder={source === "mixkit" ? "Category, e.g. fire" : "Search this library"}
            aria-label="Search stock libraries"
            onKeyDown={(event: React.KeyboardEvent) => {
              if (event.key === "Enter") void run(source, query);
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void run(source, query)}
            aria-label="Search"
          >
            <Search size={14} aria-hidden />
          </Button>
        </div>
        <Text type="supporting" color="secondary" className="mt-1 block text-[10px]">
          {activeSource.note}
        </Text>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border/70 px-2 py-1.5">
        {STOCK_SOURCES.map((entry) => {
          const Icon = SOURCE_ICONS[entry.id];
          const isActive = entry.id === source;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setSource(entry.id)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors ${
                isActive ? "bg-selected text-accent font-semibold" : "text-fg-muted hover:text-fg"
              }`}
            >
              <Icon size={12} aria-hidden />
              {entry.label}
            </button>
          );
        })}
      </div>

      {source === "mixkit" && (
        <div className="flex flex-wrap gap-1 border-b border-border/70 px-2 py-1.5">
          {MIXKIT_CATEGORIES.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => {
                setQuery(category.slug);
                void run("mixkit", category.slug);
              }}
              className="rounded-md border border-border px-2 py-0.5 text-[10px] text-fg-muted hover:border-primary/50 hover:text-fg"
            >
              {category.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-fg-muted">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            <Text type="supporting" color="secondary" className="text-[11px]">
              Reading the library...
            </Text>
          </div>
        )}

        {!loading && assets.length === 0 && (
          <div className="py-8 text-center">
            <Text type="supporting" color="secondary" className="text-[11px]">
              Nothing here yet. Search, or pick a category above.
            </Text>
          </div>
        )}

        {!loading && assets.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <Card key={asset.id} variant="muted" padding={1} className="overflow-hidden">
                <div className="relative mb-1 aspect-video w-full overflow-hidden rounded bg-bg-2">
                  {asset.previewUrl ? (
                    <img
                      src={asset.previewUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-fg-3">
                      <ImageIcon size={18} aria-hidden />
                    </div>
                  )}
                </div>
                <Text type="supporting" color="primary" className="block truncate text-[10px]" title={asset.title}>
                  {asset.title}
                </Text>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <Text type="supporting" color="secondary" className="truncate text-[9px]">
                    {asset.sourceLabel}
                    {asset.author ? ` · ${asset.author}` : ""}
                  </Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busyId === asset.id || !asset.importUrl}
                    onClick={() => void addToTimeline(asset)}
                    aria-label={`Add ${asset.title}`}
                  >
                    {busyId === asset.id ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : (
                      <Download size={12} aria-hidden />
                    )}
                  </Button>
                </div>
                {asset.unavailable && (
                  <Text type="supporting" color="secondary" className="mt-0.5 block text-[9px] leading-tight">
                    {asset.unavailable}
                  </Text>
                )}
                {asset.pageUrl && (
                  <a
                    href={asset.pageUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-0.5 block text-[9px] text-accent underline"
                  >
                    Open source page
                  </a>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
