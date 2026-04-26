export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: number;
  title: string;
  slug: string;
  summary?: string;
  contentMd: string;
  contentHtml: string;
  coverUrl?: string;
  status: "draft" | "scheduled" | "published" | "archived";
  tags: string[] | null;
  pinned?: boolean;
  authorId: number;
  author?: User;
  viewCount: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: number;
  postId: number;
  parentId?: number | null;
  authorName: string;
  authorEmail?: string;
  authorWebsite?: string;
  content: string;
  status: "pending" | "approved" | "spam";
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
}

export interface LoginResponse {
  accessToken: string;
  expiresAt: number;
  user: User;
}

export interface EditorialBlock {
  heroTitle: string;
  bodyHtml: string;
}

export interface SiteSettings {
  brand: { name: string; tagline: string };
  footer: { text: string };
  contact: { email: string; github: string };
  seo: { siteTitle: string; siteDescription: string };
  about: EditorialBlock;
  now: EditorialBlock;
  uses: EditorialBlock;
  colophon: EditorialBlock;
  theme: { accent: string; accentDark: string };
}

export interface AdminSiteSettings extends SiteSettings {
  aboutBodyMd: string;
  nowBodyMd: string;
  usesBodyMd: string;
  colophonBodyMd: string;
}

export interface UploadResponse {
  url: string;
  name: string;
  size: number;
}

export interface AuditLogEntry {
  id: number;
  userId: number;
  username: string;
  method: string;
  path: string;
  status: number;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}
