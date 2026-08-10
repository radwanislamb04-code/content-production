export type Idea = {
  id: string;
  title: string;
  why_it_works: string;
  tags: string[];
  format: string;
  content_pillar: string;
  status: string;
};

export type Hook = {
  spoken: string;
  formula: string;
  visual: string;
  text_overlay: string;
};

export type ScriptPayload = {
  hooks: Hook[];
  body: string;
  cta: string;
  formatted?: string;
  voiceover_script?: string;
};

export type ScriptResult = {
  id: string;
  type: string;
  status: string;
  content_pillar: string | null;
  title: string;
  idea_id: string;
  script: ScriptPayload;
  created_at: number;
  updated_at: number;
};

export type Shot = {
  shot_number: number;
  duration: string;
  script_portion: string;
  visual_description: string;
  camera_angle: string;
  transition: string;
  image_prompt: string;
  text_overlay: string;
  text_overlay_position: string;
  voiceover: string;
};

export type StoryboardResult = {
  storyboard_id: string;
  script_id: string;
  shot_count: number;
  shots: Shot[];
};

export type VideoPromptItem = {
  shot_number: number;
  duration: string;
  video_prompt: string;
  negative_prompt: string;
  camera_motion: string;
};

export type VideoPromptResult = {
  video_prompt_id: string;
  storyboard_id: string;
  model: string;
  aspect_ratio: string;
  quality: string;
  prompts: VideoPromptItem[];
};

export type LibraryRow = {
  id: string;
  type: string;
  status: string | null;
  content_pillar: string | null;
  title: string;
  content: string | null;
  created_at: number;
  updated_at: number;
};

export type CharacterRow = {
  id: string;
  title: string;
  content: {
    name: string;
    description: string;
    avatar_url: string;
    in_use: boolean;
  } | null;
  created_at: number;
};

export type ActivityRow = {
  id: string;
  module: string;
  action: string;
  detail: string | null;
  created_at: number;
};

export type ProjectRow = {
  id: string;
  title: string;
  module?: string | null;
  status?: string | null;
  stage?: number | null;
  updated_at?: number;
  created_at?: number;
};
