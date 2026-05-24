"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Sparkles,
  ArrowLeft,
  Save,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  category: string;
  tags: string | null;
  author: string | null;
  status: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PostSummary = Omit<BlogPost, "content" | "metaDescription" | "metaKeywords">;

const CATEGORY_LABELS: Record<string, string> = {
  grants: "Grants",
  sbir: "SBIR/STTR",
  tips: "Tips",
  news: "News",
  personal: "Personal",
};

const CATEGORY_COLORS: Record<string, string> = {
  grants: "bg-blue-100 text-blue-700",
  sbir: "bg-purple-100 text-purple-700",
  tips: "bg-green-100 text-green-700",
  news: "bg-amber-100 text-amber-700",
  personal: "bg-pink-100 text-pink-700",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${
        status === "published"
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {status}
    </span>
  );
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [counts, setCounts] = useState({ total: 0, published: 0, draft: 0 });
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateCategory, setGenerateCategory] = useState("");
  const [generateTopic, setGenerateTopic] = useState("");
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [showGenerateForm, setShowGenerateForm] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/blog");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const data = await res.json();
      setPosts(data.posts || []);
      setCounts(data.counts || { total: 0, published: 0, draft: 0 });
    } catch {
      setForbidden(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: generateCategory || undefined,
          topic: generateTopic || undefined,
          autoPublish: false,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setShowGenerateForm(false);
        setGenerateCategory("");
        setGenerateTopic("");
        await loadPosts();
      }
    } catch {}
    setGenerating(false);
  }

  async function handleToggleStatus(post: PostSummary) {
    const newStatus = post.status === "published" ? "draft" : "published";
    await fetch(`/api/admin/blog/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await loadPosts();
  }

  async function handleDelete(post: PostSummary) {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    await fetch(`/api/admin/blog/${post.id}`, { method: "DELETE" });
    await loadPosts();
  }

  async function handleEdit(postId: number) {
    const res = await fetch(`/api/admin/blog/${postId}`);
    const data = await res.json();
    setEditingPost(data);
  }

  async function handleSave() {
    if (!editingPost) return;
    setSaving(true);
    await fetch(`/api/admin/blog/${editingPost.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editingPost.title,
        excerpt: editingPost.excerpt,
        content: editingPost.content,
        metaDescription: editingPost.metaDescription,
        metaKeywords: editingPost.metaKeywords,
        category: editingPost.category,
        tags: editingPost.tags,
        status: editingPost.status,
      }),
    });
    setSaving(false);
    setEditingPost(null);
    await loadPosts();
  }

  const filteredPosts = posts.filter((p) => {
    if (filter === "published") return p.status === "published";
    if (filter === "draft") return p.status === "draft";
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <FileText className="w-10 h-10 text-muted" />
        <p className="text-sm text-muted">Access denied.</p>
      </div>
    );
  }

  // Edit view
  if (editingPost) {
    return (
      <div className="p-6 max-w-4xl space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setEditingPost(null)}
            className="text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold flex-1">Edit Post</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs text-muted block mb-1">Title</label>
            <input
              value={editingPost.title}
              onChange={(e) =>
                setEditingPost({ ...editingPost, title: e.target.value })
              }
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Excerpt */}
          <div>
            <label className="text-xs text-muted block mb-1">Excerpt</label>
            <textarea
              value={editingPost.excerpt}
              onChange={(e) =>
                setEditingPost({ ...editingPost, excerpt: e.target.value })
              }
              rows={2}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Category + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted block mb-1">Category</label>
              <select
                value={editingPost.category}
                onChange={(e) =>
                  setEditingPost({ ...editingPost, category: e.target.value })
                }
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              >
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Status</label>
              <select
                value={editingPost.status || "draft"}
                onChange={(e) =>
                  setEditingPost({ ...editingPost, status: e.target.value })
                }
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs text-muted block mb-1">
              Tags (comma-separated)
            </label>
            <input
              value={editingPost.tags || ""}
              onChange={(e) =>
                setEditingPost({ ...editingPost, tags: e.target.value })
              }
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Meta Description */}
          <div>
            <label className="text-xs text-muted block mb-1">
              Meta Description
            </label>
            <textarea
              value={editingPost.metaDescription || ""}
              onChange={(e) =>
                setEditingPost({
                  ...editingPost,
                  metaDescription: e.target.value,
                })
              }
              rows={2}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Meta Keywords */}
          <div>
            <label className="text-xs text-muted block mb-1">
              Meta Keywords
            </label>
            <input
              value={editingPost.metaKeywords || ""}
              onChange={(e) =>
                setEditingPost({
                  ...editingPost,
                  metaKeywords: e.target.value,
                })
              }
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Content */}
          <div>
            <label className="text-xs text-muted block mb-1">
              Content (Markdown)
            </label>
            <textarea
              value={editingPost.content}
              onChange={(e) =>
                setEditingPost({ ...editingPost, content: e.target.value })
              }
              rows={20}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm font-mono resize-y"
            />
          </div>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <FileText className="w-5 h-5 text-accent" />
            <h1 className="text-2xl font-bold">Blog Management</h1>
          </div>
          <p className="text-sm text-muted">
            {counts.total} posts ({counts.published} published, {counts.draft}{" "}
            drafts)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app/admin"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Back to Admin
          </Link>
          <button
            onClick={() => setShowGenerateForm(!showGenerateForm)}
            className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Generate Post
          </button>
        </div>
      </div>

      {/* Generate Form */}
      {showGenerateForm && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-sm">Generate New Blog Post</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted block mb-1">
                Category (optional — auto-rotates if empty)
              </label>
              <select
                value={generateCategory}
                onChange={(e) => setGenerateCategory(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Auto-select</option>
                {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">
                Topic (optional — auto-selects if empty)
              </label>
              <input
                value={generateTopic}
                onChange={(e) => setGenerateTopic(e.target.value)}
                placeholder="e.g., How to write an SBIR Phase I proposal"
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 bg-accent text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate as Draft
                </>
              )}
            </button>
            <button
              onClick={() => setShowGenerateForm(false)}
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-0.5 w-fit">
        {(["all", "published", "draft"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              filter === f
                ? "bg-accent text-white"
                : "text-muted hover:text-foreground"
            }`}
          >
            {f === "all" ? `All (${counts.total})` : f === "published" ? `Published (${counts.published})` : `Drafts (${counts.draft})`}
          </button>
        ))}
      </div>

      {/* Posts List */}
      {filteredPosts.length === 0 ? (
        <div className="text-center py-12 text-muted">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No posts found. Generate your first post!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-card border border-border rounded-lg p-4 flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                      CATEGORY_COLORS[post.category] ||
                      "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {CATEGORY_LABELS[post.category] || post.category}
                  </span>
                  <StatusBadge status={post.status || "draft"} />
                </div>
                <h3 className="font-medium text-sm truncate">{post.title}</h3>
                <p className="text-xs text-muted truncate">{post.excerpt}</p>
                <div className="text-[11px] text-muted mt-1">
                  {post.publishedAt
                    ? `Published ${new Date(post.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                    : `Created ${new Date(post.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {post.status === "published" && (
                  <a
                    href={`/blog/${post.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 text-muted hover:text-accent transition-colors"
                    title="View post"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => handleEdit(post.id)}
                  className="p-2 text-muted hover:text-accent transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleToggleStatus(post)}
                  className="p-2 text-muted hover:text-accent transition-colors"
                  title={
                    post.status === "published" ? "Unpublish" : "Publish"
                  }
                >
                  {post.status === "published" ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => handleDelete(post)}
                  className="p-2 text-muted hover:text-red-500 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
