import React, { useState } from "react";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Loader2, Search } from "lucide-react";

const inputClass = "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40";

export const BuilderRegistryCheckPage: React.FC = () => {
  const [links, setLinks] = useState({ linkedin: "", github: "", devpost: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const check = async () => {
    setBusy(true);
    setMessage("Checking existing DevLabs registry...");
    try {
      const res = await fetch("/api/builder/registry-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(links),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(data.found ? "Profile found. Opening confirmation..." : "No profile found. Opening profile builder...");
        window.setTimeout(() => {
          window.location.href = data.next;
        }, 500);
      } else {
        setMessage(data.error || "Could not check registry.");
      }
    } catch {
      setMessage("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar />
      <main className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-2xl items-center px-4 py-10">
        <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#fa7d22]/10 text-[#fa7d22]">
            <Search className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Checking Profile in Existing Registry</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Add any links you want us to match against existing builder records.
          </p>
          <div className="mt-6 space-y-3">
            <input className={inputClass} placeholder="LinkedIn URL" value={links.linkedin} onChange={(e) => setLinks({ ...links, linkedin: e.target.value })} />
            <input className={inputClass} placeholder="GitHub URL" value={links.github} onChange={(e) => setLinks({ ...links, github: e.target.value })} />
            <input className={inputClass} placeholder="Devpost URL" value={links.devpost} onChange={(e) => setLinks({ ...links, devpost: e.target.value })} />
          </div>
          {message && <p className="mt-4 text-sm text-muted-foreground">{message}</p>}
          <button
            type="button"
            onClick={check}
            disabled={busy}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </button>
        </section>
      </main>
    </div>
  );
};

export default BuilderRegistryCheckPage;
