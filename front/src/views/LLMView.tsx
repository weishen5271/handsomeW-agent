import { Download, Loader2, Package, ShoppingBag, Star, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { SKILL_SHOP_PAGE_SIZE } from "../config";
import { formatCompactCount, skillAccentClass } from "../utils/app";
import type { SkillShopItem, UserSkillConfig } from "../types/app";

type LLMViewProps = {
  llmProvider: string;
  llmModel: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmApiKeySet: boolean;
  llmSkills: UserSkillConfig[];
  skillShopItems: SkillShopItem[];
  addingSkillName: string;
  deletingSkillName: string;
  llmLoading: boolean;
  llmSaving: boolean;
  llmError: string;
  llmSuccess: string;
  onProviderChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onSkillsChange: (skills: UserSkillConfig[]) => void;
  onSave: () => void | Promise<void>;
  onRefresh: (keyword?: string, reset?: boolean) => Promise<{ hasMore: boolean }>;
  onAddSkill: (shopItem: SkillShopItem) => void | Promise<void>;
  onRemoveSkill: (skill: UserSkillConfig) => void | Promise<void>;
};

export default function LLMView({
  llmProvider,
  llmModel,
  llmBaseUrl,
  llmApiKey,
  llmApiKeySet,
  llmSkills,
  skillShopItems,
  addingSkillName,
  deletingSkillName,
  llmLoading,
  llmSaving,
  llmError,
  llmSuccess,
  onProviderChange,
  onModelChange,
  onBaseUrlChange,
  onApiKeyChange,
  onSkillsChange,
  onSave,
  onRefresh,
  onAddSkill,
  onRemoveSkill,
}: LLMViewProps) {
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [skillShopSearch, setSkillShopSearch] = useState("");
  const [skillShopSort, setSkillShopSort] = useState<"comprehensive" | "downloads" | "stars" | "latest">(
    "comprehensive",
  );
  const [skillShopHasMore, setSkillShopHasMore] = useState(skillShopItems.length >= SKILL_SHOP_PAGE_SIZE);
  const [skillShopLoading, setSkillShopLoading] = useState(false);
  const [skillShopLoadingMore, setSkillShopLoadingMore] = useState(false);

  const skillShopDisplayItems = useMemo(() => {
    if (skillShopSort === "comprehensive") return skillShopItems;
    return [...skillShopItems].sort((a, b) => {
      if (skillShopSort === "downloads") return (b.downloads ?? 0) - (a.downloads ?? 0);
      if (skillShopSort === "stars") return (b.stars ?? 0) - (a.stars ?? 0);
      const av = (a.version || "").replace(/^v/i, "");
      const bv = (b.version || "").replace(/^v/i, "");
      return bv.localeCompare(av, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [skillShopItems, skillShopSort]);

  const loadShop = async (reset: boolean, keyword?: string) => {
    if (reset) {
      setSkillShopLoading(true);
    } else {
      setSkillShopLoadingMore(true);
    }
    try {
      const result = await onRefresh(keyword, reset);
      setSkillShopHasMore(result.hasMore);
    } finally {
      setSkillShopLoading(false);
      setSkillShopLoadingMore(false);
    }
  };

  return (
    <section className="flex-1 overflow-y-auto bg-[var(--color-surface-raised)] p-6">
      <div className="card rounded-2xl p-5">
        <h2 className="mb-3 font-display text-xl font-bold text-[var(--color-text)]">我的模型 API 配置</h2>
        <p className="mb-4 text-sm text-[var(--color-text-weak)]">每个账号独立保存，聊天请求会优先使用当前账号配置。</p>

        {llmError && <p className="mb-3 text-sm text-red-500">{llmError}</p>}
        {llmSuccess && <p className="mb-3 text-sm text-emerald-600 dark:text-emerald-400">{llmSuccess}</p>}

        {llmLoading ? (
          <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[rgba(27,97,201,0.1)] px-3 py-2 text-[var(--color-text-weak)]">
            <Loader2 size={14} className="animate-spin text-primary" />
            <span>加载配置中...</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-[var(--color-text-weak)]">Provider</span>
                <input
                  className="input"
                  value={llmProvider}
                  onChange={(e) => onProviderChange(e.target.value)}
                  placeholder="openai / deepseek / qwen ..."
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-[var(--color-text-weak)]">Model</span>
                <input
                  className="input"
                  value={llmModel}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder="gpt-4o-mini"
                />
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--color-text-weak)]">Base URL</span>
              <input
                className="input"
                value={llmBaseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-[var(--color-text-weak)]">API Key {llmApiKeySet ? "(已保存)" : "(未保存)"}</span>
              <input
                type="password"
                className="input"
                value={llmApiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                placeholder="留空则保持现有密钥不变"
              />
            </label>

            <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--color-text)]">Skills（用户隔离）</p>
                <button
                  type="button"
                  className="btn-secondary inline-flex h-8 items-center justify-center gap-1 px-3 text-xs"
                  onClick={() => {
                    setShopModalOpen(true);
                    void loadShop(true, skillShopSearch);
                  }}
                >
                  <ShoppingBag size={14} />
                  Skill 商店
                </button>
              </div>
              {!llmSkills.length ? (
                <p className="text-sm text-[var(--color-text-weak)]">当前没有可配置的 Skill。</p>
              ) : (
                <div className="space-y-2">
                  {llmSkills.map((skill) => (
                    <div
                      key={skill.name}
                      className="flex items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2"
                    >
                      <label className="flex min-w-0 flex-1 items-start gap-2">
                        <input
                          type="checkbox"
                          checked={skill.enabled}
                          onChange={(e) =>
                            onSkillsChange(
                              llmSkills.map((item) =>
                                item.name === skill.name ? { ...item, enabled: e.target.checked } : item,
                              ),
                            )
                          }
                          className="mt-1 h-4 w-4 rounded border-[var(--color-border)] text-primary focus:ring-primary"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--color-text)]">
                            {skill.name}
                            <span className="ml-2 text-xs font-normal text-[var(--color-text-weak)]">({skill.source})</span>
                          </span>
                          <span className="block truncate text-xs text-[var(--color-text-weak)]">{skill.path}</span>
                          <span className="block text-xs text-[var(--color-text-weak)]">{skill.description || "无描述"}</span>
                        </span>
                      </label>
                      <button
                        type="button"
                        className="btn-danger inline-flex h-8 shrink-0 items-center justify-center gap-1 px-2 text-xs"
                        onClick={() => void onRemoveSkill(skill)}
                        disabled={deletingSkillName === skill.name}
                      >
                        {deletingSkillName === skill.name ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn-primary inline-flex h-10 items-center justify-center"
              onClick={() => void onSave()}
              disabled={llmSaving}
            >
              {llmSaving ? <Loader2 size={14} className="animate-spin" /> : "保存配置"}
            </button>
          </div>
        )}
      </div>

      {shopModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.4)] p-4">
          <div className="card flex h-[78vh] w-full max-w-7xl flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-base font-semibold text-[var(--color-text)]">Skill 商店</p>
              <button
                type="button"
                className="btn-secondary inline-flex h-8 w-8 items-center justify-center"
                onClick={() => setShopModalOpen(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-raised)] px-5 py-4">
              <div className="flex items-center gap-3">
                <input
                  className="input h-12 flex-1"
                  placeholder="搜索 skill 名称、来源、描述..."
                  value={skillShopSearch}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSkillShopSearch(next);
                    void loadShop(true, next);
                  }}
                />
                <select
                  className="input h-12 min-w-[132px]"
                  value={skillShopSort}
                  onChange={(e) => setSkillShopSort(e.target.value as "comprehensive" | "downloads" | "stars" | "latest")}
                >
                  <option value="comprehensive">综合排序</option>
                  <option value="downloads">下载量优先</option>
                  <option value="stars">星标优先</option>
                  <option value="latest">版本优先</option>
                </select>
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-surface-raised)] p-5"
              onScroll={(e) => {
                const el = e.currentTarget;
                const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
                if (nearBottom && skillShopHasMore && !skillShopLoadingMore && !skillShopLoading) {
                  void loadShop(false, skillShopSearch);
                }
              }}
            >
              {skillShopLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-[var(--color-text-weak)]">
                  <Loader2 size={14} className="mr-2 animate-spin text-primary" />
                  加载中...
                </div>
              ) : !skillShopItems.length ? (
                <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-8 text-center text-sm text-[var(--color-text-weak)]">
                  没有匹配的 Skill
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {skillShopDisplayItems.map((item) => {
                    const iconText = item.name.trim().slice(0, 1).toUpperCase() || "S";
                    const iconStyle = skillAccentClass(item.name);
                    return (
                      <article
                        key={item.external_id}
                        className="card rounded-3xl p-5 transition hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            {item.icon_url ? (
                              <img src={item.icon_url} alt={item.name} className="h-14 w-14 rounded-2xl border border-[var(--color-border)] object-cover" />
                            ) : (
                              <div
                                className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border text-2xl font-semibold ${iconStyle}`}
                              >
                                {iconText}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-xl font-semibold text-[var(--color-text)]">{item.name}</p>
                              <div className="mt-1 flex items-center gap-2">
                                {item.tag && <span className="rounded-full bg-[var(--color-surface-raised)] px-2 py-0.5 text-[11px] text-[var(--color-text-weak)]">{item.tag}</span>}
                                <span className="truncate text-xs text-[var(--color-text-weak)]">{item.source}</span>
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-primary inline-flex h-9 shrink-0 items-center justify-center px-3 text-xs"
                            disabled={item.added || addingSkillName === item.external_id}
                            onClick={() => void onAddSkill(item)}
                          >
                            {item.added ? "已加入" : addingSkillName === item.external_id ? "加入中..." : "加入"}
                          </button>
                        </div>
                        <p
                          className="mt-3 min-h-12 text-sm leading-6 text-[var(--color-text-weak)]"
                          style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                        >
                          {item.description || "暂无描述"}
                        </p>
                        <div className="mt-4 flex items-center gap-4 text-sm text-[var(--color-text-weak)]">
                          <span className="inline-flex items-center gap-1">
                            <Download size={14} />
                            {formatCompactCount(item.downloads)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Star size={14} />
                            {formatCompactCount(item.stars)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Package size={14} />
                            {item.version || "v0.1.0"}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {skillShopLoadingMore && <div className="py-2 text-center text-xs text-[var(--color-text-weak)]">正在加载更多...</div>}
              {!skillShopLoading && skillShopHasMore && !skillShopLoadingMore && (
                <div className="py-2 text-center text-xs text-[var(--color-text-weak)]">下滑加载更多...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
