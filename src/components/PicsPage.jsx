import { useState } from "react";
import { Plus, Trash2, ExternalLink, Image as ImageIcon, Calendar, Link2 } from "lucide-react";

export default function PicsPage({ data, setData, isAdmin, NavBar, view, setView, role }) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({
    title: "",
    albumUrl: "",
    coverImageUrl: "",
    eventDate: new Date().toISOString().split("T")[0],
    description: "",
  });

  const albums = data.photoAlbums || [];

  function addAlbum() {
    if (!form.title.trim() || !form.albumUrl.trim()) {
      return alert("Please enter both an Album Title and the Google Photos Album Link.");
    }
    let cleanUrl = form.albumUrl.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = "https://" + cleanUrl;
    }

    const newAlbum = {
      id: Date.now().toString(),
      title: form.title.trim(),
      albumUrl: cleanUrl,
      coverImageUrl: form.coverImageUrl.trim(),
      eventDate: form.eventDate,
      description: form.description.trim(),
      createdAt: new Date().toISOString(),
    };

    setData((prev) => ({
      ...prev,
      photoAlbums: [newAlbum, ...(prev.photoAlbums || [])],
    }));

    setForm({
      title: "",
      albumUrl: "",
      coverImageUrl: "",
      eventDate: new Date().toISOString().split("T")[0],
      description: "",
    });
    setShowNew(false);
  }

  function deleteAlbum(id) {
    if (!window.confirm("Remove this photo album link?")) return;
    setData((prev) => ({
      ...prev,
      photoAlbums: (prev.photoAlbums || []).filter((a) => a.id !== id),
    }));
  }

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-pink-600 to-rose-700 text-white p-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">📸 Community Pics & Albums</h1>
            <p className="text-pink-100 text-sm mt-1">
              {data.building?.name || "GM Jelani Heights"} · Shared Google Photos Galleries
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowNew(!showNew)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-rose-700 rounded-xl font-bold text-sm hover:bg-pink-50 shadow transition"
            >
              <Plus size={15} /> Add Album Link
            </button>
          )}
        </div>
      </header>

      <NavBar view={view} setView={setView} role={role} />

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Admin Add Form */}
        {showNew && isAdmin && (
          <div className="bg-white rounded-2xl shadow-md border-l-4 border-rose-500 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-800 text-base">➕ Add Google Photos Album</h3>
              <button
                onClick={() => setShowNew(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Album / Event Title *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Independence Day Celebration 2026"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Event Date
                </label>
                <input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Google Photos Shared Album Link *
                </label>
                <input
                  type="url"
                  value={form.albumUrl}
                  onChange={(e) => setForm({ ...form, albumUrl: e.target.value })}
                  placeholder="https://photos.app.goo.gl/..."
                  className="w-full px-3 py-2 border rounded-lg text-sm font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">
                  In Google Photos, open your album → click Share → Create Link → Copy and paste here. Zero Firebase storage used!
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Cover Photo URL (Optional)
                </label>
                <input
                  type="url"
                  value={form.coverImageUrl}
                  onChange={(e) => setForm({ ...form, coverImageUrl: e.target.value })}
                  placeholder="Optional direct image link for album thumbnail"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Short note about the event or photos..."
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={addAlbum}
                className="px-5 py-2 bg-rose-600 text-white rounded-xl font-bold text-sm hover:bg-rose-700"
              >
                ✓ Save Album Link
              </button>
              <button
                onClick={() => setShowNew(false)}
                className="px-5 py-2 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {albums.length === 0 && !showNew && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <ImageIcon size={48} className="mx-auto text-pink-300 mb-3" />
            <h3 className="text-lg font-bold text-gray-700">No Photo Albums Added Yet</h3>
            <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
              {isAdmin
                ? "Click '+ Add Album Link' above to share a Google Photos album with all residents."
                : "Community event albums shared by the managing committee will appear here."}
            </p>
          </div>
        )}

        {/* Album Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {albums.map((album) => (
            <div
              key={album.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition flex flex-col"
            >
              {/* Cover Banner */}
              <div className="h-44 bg-gradient-to-br from-pink-500 via-rose-500 to-amber-500 relative flex items-center justify-center overflow-hidden">
                {album.coverImageUrl ? (
                  <img
                    src={album.coverImageUrl}
                    alt={album.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-center text-white p-4">
                    <span className="text-5xl block mb-1">📷</span>
                    <span className="text-xs font-bold uppercase tracking-wider bg-black bg-opacity-20 px-3 py-1 rounded-full">
                      Google Photos Album
                    </span>
                  </div>
                )}

                {isAdmin && (
                  <button
                    onClick={() => deleteAlbum(album.id)}
                    className="absolute top-3 right-3 p-2 bg-white bg-opacity-90 hover:bg-red-50 text-red-600 rounded-full shadow transition"
                    title="Delete Album Link"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* Card Body */}
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  {album.eventDate && (
                    <p className="text-xs font-semibold text-rose-600 flex items-center gap-1 mb-1">
                      <Calendar size={12} /> {fmtDate(album.eventDate)}
                    </p>
                  )}
                  <h3 className="font-bold text-gray-800 text-base leading-snug">{album.title}</h3>
                  {album.description && (
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">{album.description}</p>
                  )}
                </div>

                <a
                  href={album.albumUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 w-full py-2.5 px-4 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Link2 size={14} /> Open Google Photos Album <ExternalLink size={13} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
