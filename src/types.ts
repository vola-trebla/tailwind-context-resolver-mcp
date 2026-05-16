export interface TokenQueryResult {
  namespace: string;
  tokens: Record<string, string>;
  count: number;
}

export interface ClassValidationResult {
  class_string: string;
  valid_classes: string[];
  invalid_classes: string[];
  possibly_valid_classes: string[];
  warnings: string[];
  config_prefix: string;
}

export interface ConflictResult {
  class_string: string;
  conflicts: Array<{
    classes: string[];
    reason: string;
  }>;
  has_conflicts: boolean;
}

export interface ConfigSummary {
  tailwind_version: string;
  config_path: string;
  prefix: string;
  theme_extensions: string[];
  total_colors: number;
  total_spacing: number;
  plugins: string[];
}
