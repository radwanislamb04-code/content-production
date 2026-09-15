-- Seed the curated resource list into the database.
--
-- These 14 sites used to live hardcoded in Resources.tsx (STATIC_SITES), which
-- made them impossible to edit or delete. They are regular rows now, flagged
-- is_custom = 0 so the UI can label them as built-in. Stable ids + INSERT OR
-- IGNORE make this safe to re-run.
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('cobalt', 'Cobalt.tools', 'https://cobalt.tools', 'Clean, ad-free downloader for most social platforms.', 'Video Download', 0, 1735689614000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('savefrom', 'SaveFrom.net', 'https://savefrom.net', 'Multi-site downloader with format options.', 'Video Download', 0, 1735689613000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('google-trends', 'Google Trends', 'https://trends.google.com/trends/', 'Search interest over time by region and topic.', 'Trends', 0, 1735689612000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('exploding-topics', 'Exploding Topics', 'https://explodingtopics.com', 'Emerging topics before they go mainstream.', 'Trends', 0, 1735689611000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('socialblade', 'SocialBlade', 'https://socialblade.com', 'Channel growth stats across platforms.', 'Trends', 0, 1735689610000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('trendtok', 'TrendTok', 'https://trendtok.app', 'TikTok sound and hashtag trend tracking.', 'Trends', 0, 1735689609000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('phlanx', 'Phlanx.com', 'https://phlanx.com', 'Engagement-rate calculator for creators.', 'Creator Research', 0, 1735689608000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('noxinfluencer', 'NoxInfluencer.com', 'https://noxinfluencer.com', 'Influencer analytics and rate estimates.', 'Creator Research', 0, 1735689607000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('hypeauditor', 'HypeAuditor', 'https://hypeauditor.com', 'Audience quality and fraud detection reports.', 'Creator Research', 0, 1735689606000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('fb-creator-marketplace', 'FB Creator Marketplace', 'https://www.facebook.com/creators/marketplace', 'Brand-creator matchmaking inside Meta.', 'Creator Research', 0, 1735689605000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('viralfindr', 'ViralFindr', 'https://viralfindr.com', 'Find viral creator content by niche.', 'Creator Research', 0, 1735689604000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('instagram-transcript-generator', 'Instagram Transcript Generator', 'https://saveto.ai/instagram-transcript-generator/', 'Generate accurate text transcripts from Instagram Reels and videos.', 'Video Download', 0, 1735689603000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('gemini-watermark-remover', 'Gemini Watermark Remover', 'https://geminiwatermarkremover.io/', 'AI-powered watermark remover for Gemini-generated images while preserving image quality.', 'AI Tools', 0, 1735689602000);
INSERT OR IGNORE INTO resources (id, name, url, description, category, is_custom, created_at)
  VALUES ('google-flow', 'Google Flow', 'https://labs.google/fx/tools/flow', 'Experimental AI filmmaking tool for cinematic videos, scenes and creative storytelling workflows.', 'AI Video', 0, 1735689601000);
