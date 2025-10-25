import React, { useState } from "react";

export default function AdminJobSearch() {
  const [formData, setFormData] = useState({
    roleTitle: "",
    roleDescription: "",
    skills: "",
    mindset: "",
  });
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResults([]);

    const query = `
      Role Title: ${formData.roleTitle}
      Description: ${formData.roleDescription}
      Skills: ${formData.skills}
      Mindset: ${formData.mindset}
    `;

    try {
      const res = await fetch("/api/search/vector-only", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, filters: {} }),
      });
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl h-auto flex flex-col bg-neutral-900/70 border border-dashed border-neutral-700 rounded-2xl shadow-lg p-6 backdrop-blur-md text-white">
      <h1 className="text-2xl font-semibold text-orange-500 mb-6 text-center">
        Job Description Search
      </h1>

      {/* FORM */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-lg mb-2 text-gray-200">Role Title</label>
          <input
            name="roleTitle"
            value={formData.roleTitle}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-gray-500"
            placeholder="e.g., Frontend Developer Intern"
          />
        </div>

        <div>
          <label className="block text-lg mb-2 text-gray-200">Role Description</label>
          <textarea
            name="roleDescription"
            value={formData.roleDescription}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-gray-500 min-h-[100px]"
            placeholder="Paste the full job description or summary here..."
          />
        </div>

        <div>
          <label className="block text-lg mb-2 text-gray-200">Ideal Candidate Skills</label>
          <textarea
            name="skills"
            value={formData.skills}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-gray-500 min-h-[80px]"
            placeholder="Python, React, Node, TensorFlow..."
          />
        </div>

        <div>
          <label className="block text-lg mb-2 text-gray-200">Preferred Mindset</label>
          <textarea
            name="mindset"
            value={formData.mindset}
            onChange={handleChange}
            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white placeholder-gray-500 min-h-[80px]"
            placeholder="Curious, Entrepreneurial, Fast learner..."
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white border border-dashed border-[#ef9248] rounded-lg"
        >
          {loading ? "Searching..." : "Search Builders"}
        </button>
      </form>

      {/* RESULTS */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-3 text-white">Results ({results.length})</h2>
        {loading && <p className="text-gray-400">Running semantic search...</p>}
        {!loading && results.length === 0 && (
          <p className="text-gray-500">No results yet. Fill out the form and hit Search.</p>
        )}
        {results.map((r, i) => (
          <div
            key={i}
            className="p-4 mb-3 border border-dashed border-gray-700 bg-[#0d0d0d] rounded-lg"
          >
            <p className="text-orange-400 font-semibold mb-1">
              {Math.round(r.match_score * 100)}%
            </p>
            <p className="text-white text-sm">{r.email || `User ${r.user_id}`}</p>
            <p className="text-gray-400 text-xs mb-1">{r.major}</p>
            <p className="text-gray-300 text-sm line-clamp-2">{r.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
