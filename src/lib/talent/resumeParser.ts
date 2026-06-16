import ProjectRecord from '@/models/talent/ProjectRecord';
import {
  extractResumeData,
  mapResumeExtractionToDraft,
} from '@/lib/talent/builderEnrichment/resumeEnricher';

export async function parseAndExtractResume(buffer: Buffer, builderId: string) {
  try {
    const parsed = await extractResumeData(buffer);
    if (!parsed?.extracted) {
      console.log('[resumeParser] No extracted data from resume');
      return null;
    }

    const { profile, projects } = mapResumeExtractionToDraft(parsed.extracted);

    const builder = await BuilderProfile.findById(builderId);
    if (builder) {
      let updated = false;

      if (profile.headline && !builder.headline) {
        builder.headline = String(profile.headline).trim().slice(0, 120);
        updated = true;
      }
      if (profile.bio && !builder.bio) {
        builder.bio = String(profile.bio).trim().slice(0, 2000);
        updated = true;
      }
      if (profile.rolePreference?.length) {
        const existingSkills = new Set((builder.rolePreference || []).map((s: string) => s.trim()));
        profile.rolePreference.forEach((s) => existingSkills.add(s.trim()));
        builder.rolePreference = Array.from(existingSkills);
        updated = true;
      }
      if (profile.links) {
        builder.links = builder.links || {};
        if (profile.links.github && !builder.links.github) {
          builder.links.github = profile.links.github;
          updated = true;
        }
        if (profile.links.linkedin && !builder.links.linkedin) {
          builder.links.linkedin = profile.links.linkedin;
          updated = true;
        }
        if (profile.links.portfolio && !builder.links.portfolio) {
          builder.links.portfolio = profile.links.portfolio;
          updated = true;
        }
      }

      if (updated) await builder.save();
    }

    for (const proj of projects) {
      await ProjectRecord.findOneAndUpdate(
        {
          builderId,
          sourceId: proj.sourceId,
        },
        {
          $setOnInsert: {
            builderId,
            projectName: proj.projectName,
            source: proj.source,
            verificationStatus: proj.verificationStatus || 'imported_unverified',
          },
          $set: {
            description: proj.description || null,
            techStack: proj.techStack || [],
            builderContribution: proj.builderContribution || null,
            'links.github': proj.links?.github || null,
            'links.demo': proj.links?.demo || null,
          },
        },
        { upsert: true, new: true }
      );
    }

    return parsed.extracted;
  } catch (error) {
    console.error('[resumeParser] Error parsing resume:', error);
    return null;
  }
}
