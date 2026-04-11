"use client";

import { create } from "zustand";

export interface WikiDomain {
  slug: string;
  name: string;
  path: string;
  articleCount: number;
  totalTokens: number;
  lastCompiledAt: string | null;
  hasCore: boolean;
}

export interface ArticleRef {
  slug: string;
  title: string;
  tokens: number;
  tags: string[];
  compiledAt: string;
  confidence?: "extracted" | "inferred" | "ambiguous";
}

export interface WikiArticle {
  slug: string;
  meta: {
    title: string;
    domain: string;
    compiledFrom: string[];
    compiledBy: string;
    compiledAt: string;
    tokens: number;
    tags: string[];
    manuallyEdited: boolean;
    confidence?: "extracted" | "inferred" | "ambiguous";
    sourceUrl?: string;
  };
  content: string;
}

export interface RawFile {
  name: string;
  ext: string;
  sizeBytes: number;
  modifiedAt: string;
  compiled: boolean;
}

type WikiView = "browse" | "article" | "raw";

interface WikiStore {
  // State
  view: WikiView;
  domains: WikiDomain[];
  activeDomain: string | null;
  articles: ArticleRef[];
  activeArticle: WikiArticle | null;
  rawFiles: RawFile[];
  coreContent: string | null;
  compiling: boolean;
  loading: boolean;
  searchQuery: string;
  error: string | null;

  // Actions
  setView: (view: WikiView) => void;
  setDomains: (domains: WikiDomain[]) => void;
  setActiveDomain: (slug: string | null) => void;
  setArticles: (articles: ArticleRef[]) => void;
  setActiveArticle: (article: WikiArticle | null) => void;
  setRawFiles: (files: RawFile[]) => void;
  setCoreContent: (content: string | null) => void;
  setCompiling: (compiling: boolean) => void;
  setLoading: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;
  setError: (error: string | null) => void;
}

export const useWikiStore = create<WikiStore>((set) => ({
  view: "browse",
  domains: [],
  activeDomain: null,
  articles: [],
  activeArticle: null,
  rawFiles: [],
  coreContent: null,
  compiling: false,
  loading: false,
  searchQuery: "",
  error: null,

  setView: (view) => set({ view }),
  setDomains: (domains) => set({ domains }),
  setActiveDomain: (slug) =>
    set({
      activeDomain: slug,
      articles: [],
      activeArticle: null,
      rawFiles: [],
      coreContent: null,
      searchQuery: "",
      view: "browse",
    }),
  setArticles: (articles) => set({ articles }),
  setActiveArticle: (article) => set({ activeArticle: article }),
  setRawFiles: (files) => set({ rawFiles: files }),
  setCoreContent: (content) => set({ coreContent: content }),
  setCompiling: (compiling) => set({ compiling }),
  setLoading: (loading) => set({ loading }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setError: (error) => set({ error }),
}));
