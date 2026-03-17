import { useSettingsStore } from "@store/settingsSlice";
import { Card, CardContent } from "@ui/Card";
import { AlertTriangle, ArrowLeft, CheckCircle, Wrench } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router";

const PROVIDER_KEY_NAMES: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export function SettingsPage() {
  const navigate = useNavigate();

  const providers = useSettingsStore((s) => s.providers);
  const providersLoaded = useSettingsStore((s) => s.providersLoaded);
  const providersError = useSettingsStore((s) => s.providersError);
  const loadProviders = useSettingsStore((s) => s.loadProviders);

  const tools = useSettingsStore((s) => s.tools);
  const toolsLoaded = useSettingsStore((s) => s.toolsLoaded);
  const toolsError = useSettingsStore((s) => s.toolsError);
  const loadTools = useSettingsStore((s) => s.loadTools);

  useEffect(() => {
    loadProviders();
    loadTools();
  }, [loadProviders, loadTools]);

  const hasError = providersError || toolsError;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <header className="flex h-12 items-center gap-3 border-b border-zinc-800 px-6">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft size={14} />
          Home
        </button>
        <span className="text-zinc-700">/</span>
        <h1 className="text-sm font-semibold">Settings</h1>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-8">
          {hasError && (
            <div className="rounded-lg border border-amber-800 bg-amber-950/50 px-4 py-3 text-sm text-amber-200">
              <AlertTriangle
                size={14}
                className="mr-2 inline-block text-amber-400"
              />
              Could not connect to execution server. Check that Docker is
              running.
            </div>
          )}

          {/* LLM Providers section */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              LLM Providers
            </h2>
            {!providersLoaded && !providersError ? (
              <p className="text-sm text-zinc-500">
                Loading provider status...
              </p>
            ) : providers ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {Object.entries(providers).map(([name, status]) => (
                  <Card key={name}>
                    <CardContent>
                      <p className="mb-2 text-sm font-medium capitalize">
                        {name}
                      </p>
                      {status.configured ? (
                        <div className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle size={13} />
                          <span className="text-xs">Configured</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1.5 text-amber-400">
                            <AlertTriangle size={13} />
                            <span className="text-xs">Not configured</span>
                          </div>
                          <p className="mt-1 text-[10px] text-zinc-500">
                            Set{" "}
                            <code className="rounded bg-zinc-800 px-1">
                              {PROVIDER_KEY_NAMES[name] ??
                                `${name.toUpperCase()}_API_KEY`}
                            </code>{" "}
                            in .env
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}
          </section>

          {/* Available Tools section */}
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              Available Tools
              {toolsLoaded && tools.length > 0 && (
                <span className="ml-2 text-zinc-500">({tools.length})</span>
              )}
            </h2>
            {!toolsLoaded && !toolsError ? (
              <p className="text-sm text-zinc-500">Loading tools...</p>
            ) : tools.length > 0 ? (
              <Card>
                <div className="divide-y divide-zinc-800">
                  {tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="flex items-start gap-3 px-4 py-2.5"
                    >
                      <Wrench
                        size={12}
                        className="mt-0.5 shrink-0 text-amber-400"
                      />
                      <div>
                        <span className="text-xs font-medium text-zinc-200">
                          {tool.name}
                        </span>
                        {tool.description && (
                          <p className="text-[10px] text-zinc-500">
                            {tool.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : toolsLoaded ? (
              <p className="text-sm text-zinc-500">No tools registered.</p>
            ) : null}
          </section>
        </div>
      </main>
    </div>
  );
}
