import React, { useEffect, useState } from "react";

export default function AdminClientDashboard() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ [key: string]: any[] }>({});

  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch("/api/admin/getClients");
        const data = await res.json();
        console.log("Fetched clients:", data);
        setClients(data.clients || []);
      } catch (err) {
        console.error("Error fetching clients:", err);
      }
    }
    fetchClients();
  }, []);

  async function handleMatch(clientId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/search/matchClients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, topK: 5 }),
      });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [clientId]: data.topMatches || [] }));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {clients.length === 0 ? (
        <p className="text-gray-400 text-center text-lg">
          No recruiter entries found.
        </p>
      ) : (
        clients.map((client) => (
          <div
            key={client._id}
            className="bg-neutral-900/70 border border-orange-500/40 rounded-2xl p-6 shadow-lg"
          >
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold text-orange-400">
                  {client.companyName}
                </h2>
                <p className="text-gray-300">{client.roleTitle}</p>
                <p className="text-sm text-gray-500">
                  {client.companyWebsite?.replace(/^https?:\/\//, "")}
                </p>
              </div>

              <button
                onClick={() => handleMatch(client._id)}
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition"
              >
                {loading ? "Loading..." : "Get Top 5 Matches"}
              </button>
            </div>

            <div className="mt-3 text-gray-400 space-y-1">
              <p>
                <strong>Skills:</strong> {client.skills}
              </p>
              <p>
                <strong>Mindset:</strong> {client.mindset}
              </p>
              <p>
                <strong>Work Mode:</strong> {client.workMode?.join(", ")}
              </p>
              <p>
                <strong>Compensation:</strong> {client.compensation}
              </p>
            </div>

            {results[client._id] && (
              <div className="mt-4 bg-neutral-800 p-4 rounded-xl">
                <h3 className="text-lg text-orange-400 mb-2">Top Matches</h3>
                {results[client._id].length === 0 ? (
                  <p>No matches found.</p>
                ) : (
                  <ul className="space-y-2">
                    {results[client._id].map((match, i) => (
                      <li key={i} className="border-b border-gray-700 pb-2">
                        <p className="text-white font-semibold">
                          {match.email}
                        </p>
                        <a
                          href={match.resumeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-400 text-sm hover:underline"
                        >
                          View Resume
                        </a>
                        <p className="text-gray-400 text-sm">
                          Score: {(match.score * 100).toFixed(2)}%
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
