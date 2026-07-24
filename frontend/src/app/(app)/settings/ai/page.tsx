"use client";

import { useState, useEffect, useRef } from "react";
import { useOrg, useApiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Brain, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";

type AiSettings = {
  id: string;
  name: string;
  isAiEnabled: boolean;
  aiChunkSize: number;
  aiMaxCvesPerAsset?: number | null;
  aiMinScore: number;
};

export default function AiSettingsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const mountedRef = useRef(true);

  const [org, setOrg] = useState<AiSettings | null>(null);
  const [isAiEnabled, setIsAiEnabled] = useState(false);
  const [chunkSize, setChunkSize] = useState(50);
  const [maxCves, setMaxCves] = useState<string>("");
  const [minScore, setMinScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!orgId) return () => controller.abort();
    setLoading(true);
    apiFetch(`/organizations/${orgId}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.ok && mountedRef.current) {
          const data = await res.json();
          setOrg(data);
          setIsAiEnabled(data.isAiEnabled ?? false);
          setChunkSize(data.aiChunkSize ?? 50);
          setMaxCves(data.aiMaxCvesPerAsset != null ? String(data.aiMaxCvesPerAsset) : "");
          setMinScore(data.aiMinScore ?? 0);
        }
      })
      .catch((err: any) => {
        if (err?.name === "AbortError") return;
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => controller.abort();
  }, [orgId, apiFetch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !org) return;
    setSaving(true);
    setMessage("");

    const maxCvesValue = maxCves.trim() === "" ? null : parseInt(maxCves, 10);

    try {
      const res = await apiFetch(`/organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: org.name,
          description: null,
          nvdApiKey: null,
          isAiEnabled,
          aiChunkSize: Math.max(1, chunkSize),
          aiMaxCvesPerAsset: maxCvesValue && maxCvesValue > 0 ? maxCvesValue : null,
          aiMinScore: Math.max(0, Math.min(100, minScore)),
        }),
      });
      if (res.ok && mountedRef.current) {
        setMessage("AI settings saved.");
      } else if (mountedRef.current) {
        const err = await res.text();
        setMessage(`Save failed: ${err}`);
      }
    } catch {
      if (mountedRef.current) setMessage("Save failed.");
    }
    setSaving(false);
  };

  if (loading || !authReady) {
    return <div className="text-muted-foreground">Loading AI settings...</div>;
  }

  if (!org) {
    return <div className="text-red-600">Failed to load organization.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={<><Brain className="w-6 h-6" /> AI Settings</>}
        description="Configure how the AI deep scan pipeline behaves."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Deep Scan</CardTitle>
            <CardDescription>Enable or disable AI-powered scanning for this organization.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="aiEnabled"
                checked={isAiEnabled}
                onCheckedChange={(checked) => setIsAiEnabled(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="aiEnabled" className="font-medium cursor-pointer">
                  Enable AI Deep Scan
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, new scans default to AI mode unless overridden. AI scans are slower but produce
                  relevance scores and mitigation suggestions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tuning</CardTitle>
            <CardDescription>Fine-tune the AI pipeline for your organization's needs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="chunkSize">AI Chunk Size</Label>
              <Input
                id="chunkSize"
                type="number"
                min={1}
                max={200}
                value={chunkSize}
                onChange={(e) => setChunkSize(parseInt(e.target.value, 10) || 1)}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Number of assets processed in a single AI call. Lower values are slower but reduce timeouts.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxCves">Max CVEs Per Asset</Label>
              <Input
                id="maxCves"
                type="number"
                min={1}
                placeholder="Unlimited"
                value={maxCves}
                onChange={(e) => setMaxCves(e.target.value)}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Maximum CVEs sent to the AI for scoring per asset. Leave empty for unlimited.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="minScore">Minimum AI Relevance Score</Label>
              <Input
                id="minScore"
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={(e) => setMinScore(parseInt(e.target.value, 10) || 0)}
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                CVEs with an AI relevance score below this value will not be saved. 0 keeps everything the AI scores.
              </p>
            </div>
          </CardContent>
        </Card>

        {message && (
          <div className="text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded">{message}</div>
        )}

        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save AI Settings"}
        </Button>
      </form>
    </div>
  );
}
