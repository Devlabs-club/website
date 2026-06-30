export type BuilderActivityKind = 'push' | 'pr' | 'issue' | 'create' | 'fork' | 'repo';

export type BuilderActivityItem = {
  id: string;
  builderName: string;
  githubUsername: string;
  avatarUrl: string | null;
  kind: BuilderActivityKind;
  action: string;
  detail: string;
  repo: string;
  url: string;
  createdAt: string;
  isPrivate?: boolean;
};

export type BuilderGithubRef = {
  builderId: string;
  name: string;
  githubUsername: string;
  avatarUrl: string | null;
  accessToken?: string | null;
};
