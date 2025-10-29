import React, { useEffect, useState } from "react";
import PDFViewer from "./PDFViewer"; 

export default function AdminClientDashboard() {
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState<{ [key: string]: boolean }>({});
  const [results, setResults] = useState<{ [key: string]: any[] }>({});
  const [openResume, setOpenResume] = useState<{ [key: string]: string | null }>({});

  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch("/api/admin/getClients");
        const data = await res.json();
        setClients(data.clients || []);
      } catch (err) {
        console.error("Error fetching clients:", err);
      }
    }
    fetchClients();
  }, []);

  async function handleMatch(clientId: string) {
    setLoading((prev) => ({ ...prev, [clientId]: true }));
    try {
      const res = await fetch("/api/search/matchClients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, topK: 10 }),
      });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [clientId]: data.topMatches || [] }));
    } catch (err) {
      console.error(err);
    }
    setLoading((prev) => ({ ...prev, [clientId]: false }));
  }

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {clients.length === 0 ? (
        <p className="text-gray-400 text-center text-lg">
          No client entries found.
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

                <p className="text-sm text-gray-400">
                  <strong>Contact:</strong>{" "}
                  {client.contactName ? client.contactName : "N/A"}{" "}
                  {client.email && (
                    <>
                      {" | "}
                      <a
                        href={`mailto:${client.email}`}
                        className="text-orange-400 hover:underline"
                      >
                        {client.email}
                      </a>
                    </>
                  )}
                </p>
              </div>

              <button
                onClick={() => handleMatch(client._id)}
                disabled={loading[client._id]}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg transition"
              >
                {loading[client._id] ? "Loading..." : "Get Top 10 Matches"}
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
                    {results[client._id]
                      .sort((a, b) => b.score - a.score)
                      .map((match, i) => {
                        const cleanUrl = match.resumeUrl?.replace(
                          "/raw/upload/",
                          "/upload/"
                        );

                        return (
                          <li
                            key={i}
                            className="border-b border-gray-700 pb-2 flex flex-col space-y-2"
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-white font-semibold">
                                  {match.email}
                                </p>

                                
                                <button
                                  onClick={() =>
                                    setOpenResume((prev) => ({
                                      ...prev,
                                      [client._id]:
                                        openResume[client._id] === cleanUrl
                                          ? null
                                          : cleanUrl,
                                    }))
                                  }
                                  className="text-orange-400 text-sm hover:underline"
                                >
                                  {openResume[client._id] === cleanUrl
                                    ? "Hide Resume"
                                    : "View Resume"}
                                </button>

                                
                                {match.skills && match.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {match.skills
                                      .slice(0, 10)
                                      .map((skill: string, j: number) => (
                                        <span
                                          key={j}
                                          className="bg-orange-400/10 text-orange-300 border border-orange-400/30 text-xs px-2 py-1 rounded-full font-medium tracking-wide"
                                        >
                                          {skill}
                                        </span>
                                      ))}
                                  </div>
                                )}
                              </div>

                             
                              <p className="text-gray-400 text-sm">
                                Score:{" "}
                                {(
                                  match.score > 1
                                    ? match.score
                                    : match.score * 100
                                ).toFixed(2)}
                                %
                              </p>
                            </div>

                            
                            {openResume[client._id] === cleanUrl && (
                              <div className="mt-3 border border-white/10 rounded-lg overflow-hidden">
                                <PDFViewer url={cleanUrl} />

                              </div>
                            )}
                          </li>
                        );
                      })}
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
