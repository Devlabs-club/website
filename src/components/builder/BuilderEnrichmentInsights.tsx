import BuilderProfileProofPanel from './BuilderProfileProofPanel';
import type { BuilderProfileView } from './BuilderProfilePreview';

/** @deprecated Use BuilderProfileProofPanel directly. Kept for backward compatibility. */
export default function BuilderEnrichmentInsights({ profile }: { profile: BuilderProfileView }) {
  return <BuilderProfileProofPanel profile={profile} />;
}
