"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useOrg, useApiFetch } from "@/lib/api";
import { useJobs } from "@/lib/jobs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function DevToolsPage() {
  const { orgId, authReady } = useOrg();
  const apiFetch = useApiFetch();
  const { jobs, activeJobs, refresh: refreshJobs } = useJobs();
  const mountedRef = useRef(true);

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [rawPath, setRawPath] = useState("/assets?pageSize=5");
  const [rawMethod, setRawMethod] = useState("GET");
  const [rawBody, setRawBody] = useState("");
  const [rawResponse, setRawResponse] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!orgId) return;
    apiFetch("/assets?pageSize=100").then(async (res) => {
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setAssets(data.items ?? []);
      }
    });
    fetchAuditLogs();
  }, [orgId, apiFetch]);

  const loginAsAdmin = async () => {
    setLoading(true);
    setMessage("Logging in...");
    try {
      const res = await fetch("http://localhost:5038/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: "admin@test.com", password: "password123" }),
      });
      const data = await res.json();
      if (mountedRef.current) {
        setUser(data);
        setMessage(`Logged in as ${data.email}`);
      }
    } catch {
      if (mountedRef.current) setMessage("Login failed");
    }
    setLoading(false);
  };

  const checkMe = async () => {
    try {
      const res = await apiFetch("/auth/me");
      const data = await res.json();
      if (mountedRef.current) setUser(data);
    } catch {
      if (mountedRef.current) setUser(null);
    }
  };

  const seedDemoAssets = async () => {
    setLoading(true);
    setMessage("Seeding demo assets...");
    try {
      const res = await apiFetch("/seed/demo-assets", { method: "POST" });
      const data = await res.json();
      if (mountedRef.current) {
        setMessage(`Created ${data.assets?.length ?? 0} demo assets`);
      }
    } catch {
      if (mountedRef.current) setMessage("Seed failed");
    }
    setLoading(false);
  };

  const scanAll = async () => {
    setLoading(true);
    setMessage("Queueing scan all job...");
    try {
      const res = await apiFetch("/scan/assets/all", { method: "POST" });
      const data = await res.json();
      if (mountedRef.current) {
        setMessage(`Job ${data.jobId} queued (${data.totalAssets} assets)`);
      }
    } catch {
      if (mountedRef.current) setMessage("Scan all failed");
    }
    setLoading(false);
  };

  const scanSingle = async (assetId: string) => {
    try {
      const res = await apiFetch(`/scan/assets/${assetId}`, { method: "POST" });
      const data = await res.json();
      if (mountedRef.current) {
        setMessage(`Single scan job ${data.jobId} queued`);
      }
    } catch {
      if (mountedRef.current) setMessage("Single scan failed");
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await apiFetch("/audit-logs?pageSize=20");
      if (res.ok && mountedRef.current) {
        const data = await res.json();
        setAuditLogs(data.items ?? []);
      }
    } catch {}
  };

  const createTestNotification = async () => {
    try {
      const res = await apiFetch("/notifications/test", { method: "POST" });
      if (res.ok && mountedRef.current) {
        setMessage("Test notification created");
      } else {
        setMessage("Failed to create test notification");
      }
    } catch {
      if (mountedRef.current) setMessage("Failed to create test notification");
    }
  };

  const sendRawRequest = async () => {
    setRawResponse("Loading...");
    try {
      const options: RequestInit = {
        method: rawMethod,
        credentials: "include",
      };
      if (rawMethod !== "GET" && rawBody) {
        options.body = rawBody;
        options.headers = { "Content-Type": "application/json" };
      }
      const res = await fetch(`http://localhost:5038/api${rawPath}`, options);
      const text = await res.text();
      setRawResponse(text);
    } catch (err: any) {
      setRawResponse(`Error: ${err.message}`);
    }
  };

  if (!authReady) {
    return <div className="max-w-7xl mx-auto p-6">Loading auth...</div>;
  }

  const statusColors: Record<string, string> = {
    Queued: "bg-yellow-100 text-yellow-700",
    Running: "bg-blue-100 text-blue-700 animate-pulse",
    Completed: "bg-green-100 text-green-700",
    Failed: "bg-red-100 text-red-700",
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Dev Tools</h1>
          <p className="text-sm text-gray-600">Test endpoints and inspect background jobs</p>
        </div>
        {activeJobs.length > 0 && (
          <Badge className="bg-blue-100 text-blue-700 animate-pulse">
            {activeJobs.length} active job(s)
          </Badge>
        )}
      </div>

      {message && (
        <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-sm">{message}</div>
      )}

      {/* Auth Section */}
      <Card>
        <CardHeader>
          <CardTitle>Auth</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={loginAsAdmin} disabled={loading}>Login as admin@test.com</Button>
            <Button onClick={checkMe} variant="outline">Check /auth/me</Button>
          </div>
          {user && (
            <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">{JSON.stringify(user, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      {/* Seed & Scan Section */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={seedDemoAssets} disabled={loading} className="bg-purple-600 hover:bg-purple-700">
              Seed Demo Assets
            </Button>
            <Button onClick={scanAll} disabled={loading} className="bg-red-600 hover:bg-red-700">
              Scan All Assets (Async)
            </Button>
            <Button onClick={refreshJobs} variant="outline">Refresh Jobs</Button>
            <Button onClick={fetchAuditLogs} variant="outline">Refresh Audit Logs</Button>
          </div>

          {assets.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Scan single asset:</p>
              <div className="flex flex-wrap gap-2">
                {assets.slice(0, 5).map((a) => (
                  <Button key={a.id} variant="outline" size="sm" onClick={() => scanSingle(a.id)}>
                    {a.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Jobs Section */}
      <Card>
        <CardHeader>
          <CardTitle>Scan Jobs ({jobs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <div className="text-sm text-gray-500">No scan jobs yet</div>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="border rounded p-3 flex justify-between items-center">
                  <div>
                    <div className="font-medium">
                      {job.type} Scan
                      <Badge className={`ml-2 ${statusColors[job.status] ?? "bg-gray-100"}`}>
                        {job.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500">
                      {job.processedAssets}/{job.totalAssets} assets | {job.newVulnerabilitiesFound} CVEs
                      {job.currentAssetName && job.status === "Running" && (
                        <span className="ml-2 text-blue-600">scanning {job.currentAssetName}...</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">{new Date(job.createdAt).toLocaleString()}</div>
                    {job.errorMessage && <div className="text-xs text-red-600">{job.errorMessage}</div>}
                  </div>
                  <div className="text-xs font-mono text-gray-400">{job.id.slice(0, 8)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audit Logs Section */}
      <Card>
        <CardHeader>
          <CardTitle>Audit Logs ({auditLogs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLogs.length === 0 ? (
            <div className="text-sm text-gray-500">No audit logs yet. Try changing a CVE status.</div>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="border rounded p-3">
                  <div className="flex justify-between">
                    <span className="font-medium">{log.action}</span>
                    <span className="text-xs text-gray-400">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {log.entityType} {log.entityId}
                  </div>
                  {(log.beforeJson || log.afterJson) && (
                    <div className="text-xs font-mono bg-gray-100 p-1 rounded mt-1">
                      {log.beforeJson} → {log.afterJson}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notifications Test Section */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={createTestNotification} variant="outline">
              Create Test Notification
            </Button>
            <Button onClick={() => apiFetch("/notifications/mark-all-read", { method: "POST" })} variant="outline">
              Mark All Read
            </Button>
          </div>
          <p className="text-sm text-gray-500">
            The bell icon in the navbar polls every 5 seconds. Click "Create Test Notification" and watch the badge update.
          </p>
        </CardContent>
      </Card>

      {/* AI Chat Test Section */}
      <Card>
        <CardHeader>
          <CardTitle>AI / OpenRouter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Link href="/ai-chat" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2">
              Open AI Chat Demo
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            Test the OpenRouter connection with the DeepSeek Chat free model. Requires <code>OpenRouter:ApiKey</code> in backend appsettings.
          </p>
        </CardContent>
      </Card>

      {/* Raw API Playground */}
      <Card>
        <CardHeader>
          <CardTitle>Raw API Playground</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <select
              value={rawMethod}
              onChange={(e) => setRawMethod(e.target.value)}
              className="border rounded px-2 py-1 text-sm"
            >
              <option>GET</option>
              <option>POST</option>
              <option>PATCH</option>
              <option>DELETE</option>
            </select>
            <input
              type="text"
              value={rawPath}
              onChange={(e) => setRawPath(e.target.value)}
              className="border rounded px-2 py-1 text-sm flex-1"
              placeholder="/assets?pageSize=5"
            />
            <Button onClick={sendRawRequest}>Send</Button>
          </div>
          {rawMethod !== "GET" && (
            <textarea
              value={rawBody}
              onChange={(e) => setRawBody(e.target.value)}
              className="border rounded px-2 py-1 text-sm w-full h-20 font-mono"
              placeholder='{"key":"value"}'
            />
          )}
          {rawResponse && (
            <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-64">{rawResponse}</pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
