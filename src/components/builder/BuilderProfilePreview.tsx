import React from "react";
import BuilderProfileIdentityPanel from "./BuilderProfileIdentityPanel";
import BuilderProfileProofPanel from "./BuilderProfileProofPanel";
import { BuilderProfileWorkspace } from "./BuilderProfileWorkspace";

export type BuilderProfileView = {
  id?: string;
  name?: string;
  email?: string | null;
  headline?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  location?: string | null;
  universityOrCompany?: string | null;
  graduationYear?: number | null;
  education?: Array<{
    school?: string | null;
    degree?: string | null;
    field?: string | null;
    dateRange?: string | null;
    startDateLabel?: string | null;
    endDateLabel?: string | null;
    graduationYear?: number | null;
    schoolLogoUrl?: string | null;
    schoolLinkedInUrl?: string | null;
  }>;
  rolePreference?: string[];
  skills?: string[];
  workAuthorization?: string | null;
  preferredWorkType?: string[];
  experiences?: Array<{ title: string; company: string; companyLogoUrl?: string | null; companyLinkedInUrl?: string | null; dateRange?: string; description?: string; skills?: string[] }>;
  projects?: Array<{
    id?: string;
    projectName: string;
    description?: string | null;
    problemSolved?: string | null;
    builderContribution?: string | null;
    techStack?: string[];
    links?: Record<string, string | null>;
    source?: string;
    sourceId?: string | null;
  }>;
  links?: Record<string, string | null>;
  verificationStatus?: string;
  visibilityStatus?: string;
  founderHighlights?: Array<{ title?: string; detail?: string; source?: string }>;
  enrichmentSources?: Array<{ source: string; projectCount?: number }>;
  inferredTechStack?: string[];
  totalProjectCount?: number;
  insightProjects?: Array<{
    id?: string;
    projectName: string;
    description?: string | null;
    builderContribution?: string | null;
    techStack?: string[];
    source?: string;
  }>;
  profileQuality?: {
    overallScore?: number;
    label?: string | null;
    oneLineSummary?: string | null;
    strengths?: Array<{ title: string; detail: string }>;
  };
  githubShowcase?: { featuredCount?: number; additionalProjectCount?: number; reposScanned?: number };
};

export const BuilderProfilePreview: React.FC<{ profile: BuilderProfileView; showHighlights?: boolean }> = ({
  profile,
}) => {
  return (
    <div className="builder-profile-preview font-manrope">
      <BuilderProfileWorkspace
        proof={<BuilderProfileProofPanel profile={profile} />}
        identity={<BuilderProfileIdentityPanel profile={profile} />}
      />
    </div>
  );
};

export default BuilderProfilePreview;
