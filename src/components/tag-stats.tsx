/**
 * Tag statistics overview table.
 * Shows aggregate frequency of all generated tags across images.
 */

"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TagStatsData {
  tag: string;
  count: number;    // number of images containing this tag
  percentage: number;
}

type SortField = "tag" | "count";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TagStatsProps {
  /** All tag lists, one per image. */
  tagLists: string[][];
  /** Total number of images (including those that errored and have no tags). */
  totalImages: number;
}

export function TagStats({ tagLists, totalImages }: TagStatsProps) {
  const [sortField, setSortField] = useState<SortField>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [searchFilter, setSearchFilter] = useState("");

  const stats = useMemo(() => {
    const freqMap = new Map<string, number>();

    for (const tags of tagLists) {
      const seen = new Set<string>();
      for (const tag of tags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          freqMap.set(tag, (freqMap.get(tag) ?? 0) + 1);
        }
      }
    }

    const entries: TagStatsData[] = Array.from(freqMap.entries()).map(
      ([tag, count]) => ({
        tag,
        count,
        percentage: totalImages > 0 ? (count / totalImages) * 100 : 0,
      }),
    );

    // Sort
    entries.sort((a, b) => {
      const mult = sortDir === "asc" ? 1 : -1;
      if (sortField === "count") {
        return (a.count - b.count) * mult;
      }
      return a.tag.localeCompare(b.tag) * mult;
    });

    // Filter
    if (searchFilter.trim()) {
      const filter = searchFilter.trim().toLowerCase();
      return entries.filter((e) => e.tag.toLowerCase().includes(filter));
    }

    return entries;
  }, [tagLists, totalImages, sortField, sortDir, searchFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "count" ? "desc" : "asc");
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return "\u2195"; // up-down arrow
    return sortDir === "asc" ? "\u2191" : "\u2193";
  };

  // Summary numbers
  const imagesWithTagged = tagLists.filter((t) => t.length > 0).length;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-medium text-slate-300">
            Tag Overview
          </h3>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>{imagesWithTagged} tagged image{imagesWithTagged !== 1 ? "s" : ""}</span>
            <span>{stats.length} unique tag{stats.length !== 1 ? "s" : ""}</span>
          </div>
        </div>

        {/* Search filter */}
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
          placeholder="Filter tags..."
          className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
        />

        {/* Table */}
        <div className="overflow-x-auto max-h-72 overflow-y-auto border border-slate-700 rounded">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 text-xs text-slate-400 font-medium">#</th>
                <th
                  className="text-left px-3 py-2 text-xs text-slate-400 font-medium cursor-pointer hover:text-slate-200 select-none"
                  onClick={() => handleSort("tag")}
                >
                  Tag {sortIcon("tag")}
                </th>
                <th
                  className="text-right px-3 py-2 text-xs text-slate-400 font-medium cursor-pointer hover:text-slate-200 select-none"
                  onClick={() => handleSort("count")}
                >
                  Count {sortIcon("count")}
                </th>
                <th className="text-right px-3 py-2 text-xs text-slate-400 font-medium">
                  Coverage
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">
                    No tags to display
                  </td>
                </tr>
              ) : (
                stats.map((entry, i) => (
                  <tr
                    key={entry.tag}
                    className="border-t border-slate-700/50 hover:bg-slate-800/50"
                  >
                    <td className="px-3 py-1 text-xs text-slate-500">{i + 1}</td>
                    <td className="px-3 py-1 text-xs text-slate-200">{entry.tag}</td>
                    <td className="px-3 py-1 text-xs text-right text-slate-300">
                      {entry.count}
                    </td>
                    <td className="px-3 py-1 text-xs text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${Math.min(entry.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-slate-400 min-w-[3ch]">
                          {entry.percentage.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {searchFilter.trim() && stats.length === 0 && (
          <p className="text-xs text-slate-500 text-center">
            No tags match &quot;{searchFilter}&quot;
          </p>
        )}
      </div>
    </Card>
  );
}
