"use client";

import { useState, useEffect } from "react";

const API = "http://localhost:5038/api";

const DEV_ACCOUNTS = [
  { email: "admin@test.com", password: "password123", role: "Admin", name: "Admin User" },
  { email: "analyst@test.com", password: "password123", role: "SecurityAnalyst", name: "Analyst User" },
  { email: "viewer@test.com", password: "password123", role: "Viewer", name: "Viewer User" },
];

type User = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  organizationId: string;
  organizationName: string;
};

export default function AuthTestPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rawCookies, setRawCookies] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const fetchMe = async () => {
    try {
      const res = await fetch(`${API}/auth/me`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setError("");
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
    setRawCookies(document.cookie);
  };

  useEffect(() => {
    fetchMe();
  }, []);

  const login = async (loginEmail: string, loginPassword: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Login failed");
        setLoading(false);
        return;
      }

      await fetchMe();
    } catch {
      setError("Network error - is backend running on :5038?");
    }
    setLoading(false);
  };

  const logout = async () => {
    setLoading(true);
    try {
      await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    setUser(null);
    setRawCookies(document.cookie);
    setLoading(false);
  };

  const fillAndLogin = (acc: typeof DEV_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    login(acc.email, acc.password);
  };

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">VelcozSharp Auth Test</h1>
      <p className="text-gray-500 mb-6">Cookie-based session auth with ASP.NET Core Identity</p>

      {!user ? (
        <div className="space-y-6">
          {/* Manual Login Form */}
          <div className="bg-white border rounded-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold">Manual Login</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="user@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <button
              onClick={() => login(email, password)}
              disabled={loading || !email || !password}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
            {error && (
              <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>
            )}
          </div>

          {/* Dev Accounts Quick Login */}
          <div className="bg-gray-50 border rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Dev Accounts (Quick Login)</h2>
            <div className="space-y-3">
              {DEV_ACCOUNTS.map((acc) => (
                <div
                  key={acc.email}
                  className="flex items-center justify-between bg-white p-3 rounded-md border"
                >
                  <div className="text-sm">
                    <div className="font-medium">{acc.name}</div>
                    <div className="text-gray-500 font-mono text-xs">{acc.email} / {acc.password}</div>
                  </div>
                  <button
                    onClick={() => fillAndLogin(acc)}
                    disabled={loading}
                    className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-50"
                  >
                    {loading ? "..." : `Login as ${acc.role}`}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Session */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-green-900">Session Active</h2>
              <button
                onClick={logout}
                disabled={loading}
                className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? "..." : "Logout"}
              </button>
            </div>

            <div className="bg-white rounded-md p-4 space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <span className="text-gray-500">User ID:</span>
                <span className="col-span-2 font-mono text-xs">{user.userId}</span>

                <span className="text-gray-500">Email:</span>
                <span className="col-span-2">{user.email}</span>

                <span className="text-gray-500">Display Name:</span>
                <span className="col-span-2">{user.displayName}</span>

                <span className="text-gray-500">Role:</span>
                <span className="col-span-2">
                  <span className="inline-block px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-medium">
                    {user.role}
                  </span>
                </span>

                <span className="text-gray-500">Organization:</span>
                <span className="col-span-2">{user.organizationName}</span>

                <span className="text-gray-500">Org ID:</span>
                <span className="col-span-2 font-mono text-xs">{user.organizationId}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Browser Cookies */}
      <div className="mt-8">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Browser Cookies
        </h3>
        <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto">
          {rawCookies || "(no cookies)"}
        </pre>
      </div>
    </div>
  );
}
